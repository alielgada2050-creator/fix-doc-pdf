/* وثيق — automation (الأتمتة): saved recipes that chain tools and run on a batch of files, locally. */
(function(){
const A = window.Auto = {};
const {h, $} = U;
/* tools that can sit in a chain. 'in' = what they accept, 'out' = what they produce */
const CHAIN = {
  img2pdf:{in:'img', out:'pdf'}, word2pdf:{in:'docx', out:'pdf'}, excel2pdf:{in:'sheet', out:'pdf'}, text2pdf:{in:'text', out:'pdf'},
  merge:{in:'pdf', out:'pdf', all:true}, remove:{in:'pdf', out:'pdf'}, extract:{in:'pdf', out:'pdf'}, rotate:{in:'pdf', out:'pdf'}, crop:{in:'pdf', out:'pdf'},
  repair:{in:'pdf', out:'pdf'}, ocr:{in:'pdf', out:'pdf'}, compress:{in:'pdf', out:'pdf'}, numbers:{in:'pdf', out:'pdf'}, watermark:{in:'pdf', out:'pdf'},
  meta:{in:'pdf', out:'pdf'}, protect:{in:'pdf', out:'pdf', last:true}, pdf2img:{in:'pdf', out:'file', last:true}, pdf2word:{in:'pdf', out:'file', last:true},
  pdf2excel:{in:'pdf', out:'file', last:true}, pdf2txt:{in:'pdf', out:'file', last:true}, approval:{in:'pdf', out:'pdf', last:true, virtual:true}
};
const tool = id => id==='approval' ? {id:'approval', n:{ar:'إرسال للاعتماد', en:'Send for approval'}, opts:[{id:'chain', type:'text', label:{ar:'المعتمدون بالترتيب، مفصولون بفاصلة', en:'Approvers in order, comma separated'}, def:''}, {id:'dept', type:'text', label:{ar:'الجهة', en:'Department'}, def:''}]} : Tools.list.find(x=>x.id===id);
const defaults = id => { const o = {}; (tool(id).opts||[]).forEach(op=>{ if (op.type!=='note') o[op.id] = op.def; }); return o; };
const PRESETS = [
  {id:'p_send', name:{ar:'تجهيز ملف للإرسال', en:'Prepare to send'}, desc:{ar:'دمج، ترقيم الصفحات، ضغط بدون فقد، إزالة البيانات الوصفية.', en:'Merge, number pages, lossless compress, strip metadata.'}, mode:'combine', steps:[['merge'],['numbers',{fmt:'ar'}],['compress',{level:'lossless'}],['meta',{mode:'strip'}]]},
  {id:'p_scan', name:{ar:'أرشفة الممسوحات', en:'Archive scans'}, desc:{ar:'صور أو PDF ممسوح ← نص قابل للبحث بالعربية والإنجليزية ← ضغط.', en:'Scans → searchable Arabic/English text → compress.'}, mode:'each', steps:[['ocr',{lang:'ara+eng', out:'pdf', dpi:'200'}],['compress',{level:'lossless'}]]},
  {id:'p_conf', name:{ar:'مستند سري', en:'Confidential copy'}, desc:{ar:'علامة مائية «سري» متكررة ثم حماية بكلمة مرور.', en:'Tiled “confidential” watermark, then password protection.'}, mode:'each', steps:[['watermark',{layout:'tile'}],['protect',{print:true}]]},
  {id:'p_route', name:{ar:'ممسوح إلى طلب اعتماد', en:'Scan to approval'}, desc:{ar:'صور ← PDF ← ترقيم ← إرسال للاعتماد مع إنشاء مهمة تلقائيًا.', en:'Images → PDF → page numbers → send for approval with a task.'}, mode:'combine', steps:[['img2pdf'],['numbers'],['approval']]},
  {id:'p_light', name:{ar:'تصغير للمراسلة', en:'Shrink for messaging'}, desc:{ar:'ضغط قوي مناسب لواتساب والبريد.', en:'Strong compression for WhatsApp and email.'}, mode:'each', steps:[['compress',{level:'strong'}]]}
];
const toRecipe = p => ({id:p.id, preset:true, name:L(p.name), desc:L(p.desc), mode:p.mode, naming:'{name}', steps:p.steps.map(([id, o])=>({tool:id, opts:Object.assign(defaults(id), o||{})}))});

/* passwords are typed at run time and never stored with a recipe (IndexedDB, backups, sync) */
A.noSecrets = r => { const c = JSON.parse(JSON.stringify(r)); (c.steps||[]).forEach(s=>{ Object.keys(s.opts||{}).forEach(k=>{ if (/pw|pass/i.test(k)) delete s.opts[k]; }); }); return c; };
A.validate = function(r, forRun){
  if (!r.steps.length) return X('أضف خطوة واحدة على الأقل.','Add at least one step.');
  for (let i=0;i<r.steps.length;i++){ const c = CHAIN[r.steps[i].tool]; if (!c) return X('خطوة غير مدعومة.','Unsupported step.');
    if (c.last && i<r.steps.length-1) return X(`«${L(tool(r.steps[i].tool).n)}» يجب أن تكون الخطوة الأخيرة.`,`“${L(tool(r.steps[i].tool).n)}” must be the last step.`);
    if (i>0 && c.in!=='pdf') return X(`«${L(tool(r.steps[i].tool).n)}» يجب أن تكون الخطوة الأولى.`,`“${L(tool(r.steps[i].tool).n)}” must be the first step.`); }
  if (forRun && r.steps.some(s=>s.tool==='protect' && !s.opts.pw)) return X('أدخل كلمة المرور في خطوة الحماية.','Enter the password in the protect step.');
  return null;
};
const rename = (pattern, name, n, ext) => (pattern||'{name}').replace(/\{name\}/g, U.baseName(name)).replace(/\{date\}/g, new Date().toISOString().slice(0,10)).replace(/\{n\}/g, String(n).padStart(2,'0')) + '.' + ext;

/* run a recipe; returns [{name, blob}] */
A.run = async function(r, files, task){
  const err = A.validate(r, true); if (err) throw new Error(err);
  const groups = r.mode==='combine' ? [files] : files.map(f=>[f]);
  const out = []; let gi = 0;
  for (const g of groups){
    let cur = g;
    for (let si=0; si<r.steps.length; si++){
      task.check(); const st = r.steps[si]; const tl = tool(st.tool); const c = CHAIN[st.tool];
      task.prog((gi + si/r.steps.length)/groups.length, `${gi+1}/${groups.length} · ${L(tl.n)}`);
      if (st.tool==='approval'){
        const names = String(st.opts.chain||'').split(/[,،]/).map(s=>s.trim()).filter(Boolean); if (!names.length) throw new Error(X('اكتب أسماء المعتمدين في خطوة الاعتماد.','Enter approver names in the approval step.'));
        for (const f of cur){ const ap = await Flow.create(f, {title:U.baseName(f.name), dept:st.opts.dept, steps:names.map(n=>({name:n})), priority:'med'}); out.push({name:f.name, blob:f, note:ap.no}); }
        cur = []; break;
      }
      const res = [];
      const sub = new U.Task(); Object.defineProperty(sub, 'canceled', {get:()=>task.canceled, set:()=>{}});
      if (c.all || (r.mode==='combine' && tl.multi && cur.length>1)) res.push(...await tl.run(cur, Object.assign({}, st.opts), sub));
      else for (const f of cur){ task.check(); res.push(...await tl.run([f], Object.assign({}, st.opts), sub)); }
      cur = res.map(x=>new File([x.blob], x.name, {type:x.blob.type}));
    }
    cur.forEach((f, k)=>{ const ext = U.ext(f.name)||'pdf'; let nm = rename(r.naming, (g.length===1?g[0]:f).name, out.length+1, ext); let n = 1; while (out.some(o=>o.name===nm)) nm = rename(r.naming, (g.length===1?g[0]:f).name, out.length+1, ext).replace(/(\.[^.]+)$/, `-${++n}$1`); out.push({name:nm, blob:f}); });
    gi++;
  }
  task.prog(1);
  return out;
};

/* ---------- editor ---------- */
A.edit = function(r){
  r = r ? JSON.parse(JSON.stringify(r)) : {id:'rc_'+U.uid(), name:X('وصفة جديدة','New recipe'), mode:'each', naming:'{name}', steps:[]};
  if (r.preset){ r.id = 'rc_'+U.uid(); r.preset = false; r.name += X(' (نسختي)',' (my copy)'); }
  const list = h('div', {class:'steps'});
  const render = ()=>{ list.innerHTML = '';
    r.steps.forEach((st, i)=>{ const tl = tool(st.tool); const ow = h('div', {class:'sopts', style:{display:'flex', flexDirection:'column', gap:'8px'}}); Tools.optsForm(tl, st.opts, ow, `s${i}_`);
      const det = h('details', {class:'sopts'}, h('summary', {class:'note', style:{cursor:'pointer'}}, X('الإعدادات','Settings')), ow);
      list.append(h('div', {class:'step'}, h('b', null, L(tl.n)), h('div', {class:'row'},
        h('button', {class:'ibtn', 'aria-label':t('move_up'), disabled:i===0, onclick:()=>{ [r.steps[i-1], r.steps[i]] = [r.steps[i], r.steps[i-1]]; render(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>'}),
        h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ r.steps.splice(i,1); render(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'})), (tl.opts||[]).length ? det : null)); });
    if (!r.steps.length) list.append(h('p', {class:'note'}, X('أضف الخطوات بالترتيب الذي تريد تنفيذه.','Add steps in the order they should run.')));
  };
  render();
  const add = h('select', {class:'field', 'aria-label':X('إضافة خطوة','Add step')}, h('option', {value:''}, X('+ إضافة خطوة…','+ Add step…')), Object.keys(CHAIN).map(id=>h('option', {value:id}, L(tool(id).n))));
  add.onchange = ()=>{ if (add.value){ r.steps.push({tool:add.value, opts:defaults(add.value)}); add.value=''; render(); } };
  const nm = h('input', {class:'field', id:'rcN', dir:'auto', value:r.name, style:{width:'100%'}});
  const md = h('select', {class:'field', id:'rcM'}, h('option', {value:'each', selected:r.mode==='each'}, X('كل ملف على حدة','Each file separately')), h('option', {value:'combine', selected:r.mode==='combine'}, X('كل الملفات معًا (تُدمج أولًا)','All files together (merged first)')));
  const nmg = h('input', {class:'field', id:'rcF', dir:'ltr', value:r.naming||'{name}'});
  U.modal(X('وصفة أتمتة','Automation recipe'), [h('label', {class:'note', for:'rcN'}, X('الاسم','Name')), nm, h('div', {class:'row'}, h('label', {class:'note', for:'rcM'}, X('طريقة التشغيل','Run mode')), md, h('label', {class:'note', for:'rcF'}, X('تسمية الناتج','Output name')), nmg),
    h('p', {class:'note'}, X('الرموز المتاحة في الاسم: {name} اسم الملف، {date} التاريخ، {n} الرقم التسلسلي.','Name tokens: {name} file name, {date} date, {n} sequence number.')), list, add],
    [{label:t('cancel')}, {label:X('حفظ الوصفة','Save recipe'), kind:'primary', onClick:async c=>{ r.name = nm.value.trim()||r.name; r.mode = md.value; r.naming = nmg.value.trim()||'{name}'; r.steps.forEach(s=>{ for (const k in s.opts) if (s.opts[k] instanceof File) delete s.opts[k]; });
      const e = A.validate(r); if (e) return U.toast(e, 'err'); await DB.put('recipes', A.noSecrets(r)); c(); A.render(); U.toast(X('حُفظت الوصفة.','Recipe saved.'), 'ok'); }}], {wide:true, sticky:true});
};

/* ---------- run dialog ---------- */
A.runDialog = function(r){
  let files = []; let task = null;
  const list = h('div', {class:'flist'}); const prog = h('div', {class:'prog', hidden:true}, h('i')); const lab = h('div', {class:'note'}); const results = h('div', {class:'flist'});
  const renderList = ()=>{ list.innerHTML=''; files.forEach((f,i)=>list.append(h('div', {class:'fitem'}, h('span', {class:'nm'}, f.name), h('span', {class:'sz'}, U.fmtSize(f.size)), h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ files.splice(i,1); renderList(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'})))); };
  const drop = h('div', {class:'drop', style:{minHeight:'100px'}}, h('b', null, t('add_files')), h('small', null, X('يمكنك إضافة عدة ملفات دفعة واحدة','You can add many files at once')));
  drop.onclick = async ()=>{ files.push(...await U.pickFiles('', true)); renderList(); };
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', ()=>drop.classList.remove('over'));
  drop.addEventListener('drop', e=>{ e.preventDefault(); drop.classList.remove('over'); files.push(...e.dataTransfer.files); renderList(); });
  const flow = h('p', {class:'note'}, r.steps.map(s=>L(tool(s.tool).n)).join(X('  ←  ','  →  ')));
  const need = r.steps.filter(s=>['protect','approval','watermark'].includes(s.tool));
  const needWrap = need.length ? h('details', {open: need.some(s=>s.tool!=='watermark')}, h('summary', {class:'note', style:{cursor:'pointer'}}, X('إعدادات قبل التشغيل','Settings before running')),
    ...need.map((s,i)=>{ const w = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px', padding:'8px 0'}}); Tools.optsForm(tool(s.tool), s.opts, w, `r${i}_`); return h('div', null, h('b', null, L(tool(s.tool).n)), w); })) : null;
  U.modal(r.name, [flow, needWrap, drop, E.doc ? h('button', {class:'btn', onclick:async()=>{ files.push(new File([await E.currentBytes()], E.doc.name, {type:'application/pdf'})); renderList(); }}, t('current_doc')) : null, list, prog, lab, results],
    [{label:t('cancel'), onClick:c=>{ if (task) task.canceled = true; c(); }}, {label:t('run'), kind:'primary', onClick:async (c, btn)=>{
      if (!files.length) return U.toast(t('no_files'));
      btn.disabled = true; prog.hidden = false; results.innerHTML = ''; task = new U.Task((p, l)=>{ if (p!=null) prog.firstChild.style.width = Math.round(p*100)+'%'; if (l) lab.textContent = l; });
      const t0 = performance.now();
      try { const out = await A.run(r, files, task); lab.textContent = X(`اكتمل: ${out.length} ملف في ${((performance.now()-t0)/1000).toFixed(1)} ث`,`Done: ${out.length} file(s) in ${((performance.now()-t0)/1000).toFixed(1)}s`);
        r.runs = (r.runs||0)+1; r.lastRun = Date.now(); if (!r.preset) DB.put('recipes', A.noSecrets(r));
        out.forEach(x=>results.append(h('div', {class:'fitem'}, h('span', {class:'nm'}, x.name), h('span', {class:'sz'}, x.note || U.fmtSize(x.blob.size)), x.note ? h('button', {class:'btn', onclick:()=>{ c(); App.go('work'); Work.tab('approvals'); }}, X('عرض الطلبات','View requests')) : h('button', {class:'btn primary', onclick:()=>U.saveFile(x.name, x.blob)}, t('download')))));
        const dl = out.filter(x=>!x.note);
        if (dl.length>1) results.append(h('button', {class:'btn primary', onclick:async()=>{ const z = new JSZip(); dl.forEach(x=>z.file(x.name, x.blob)); U.saveFile(U.baseName(r.name)+'.zip', await z.generateAsync({type:'blob'})); }}, X('تنزيل الكل ZIP','Download all as ZIP')));
        else if (dl.length===1) U.saveFile(dl[0].name, dl[0].blob);
      } catch(e){ if (!e.canceled){ console.error(e); lab.textContent = t('error',{e:e.message}); U.toast(t('error',{e:e.message}), 'err'); } }
      finally { btn.disabled = false; task = null; }
    }}], {wide:true, sticky:true});
};

/* ---------- view ---------- */
A.render = async function(){
  const w = $('#autoWrap'); if (!w) return;
  const mine = (await DB.all('recipes')).sort((a,b)=>(b.lastRun||0)-(a.lastRun||0));
  const card = (r, preset) => h('div', {class:'recipe'}, h('b', {style:{fontSize:'15px'}}, r.name), r.desc ? h('span', {class:'note'}, r.desc) : null,
    h('div', {class:'flow'}, r.steps.map(s=>L(tool(s.tool).n)).join(X(' ← ',' → '))),
    h('div', {class:'note'}, (r.mode==='combine' ? X('الملفات معًا','Files together') : X('كل ملف على حدة','Each file')) + (r.runs ? X(` · شُغّلت ${r.runs} مرة`,` · ran ${r.runs}×`) : '')),
    h('div', {class:'row'}, h('button', {class:'btn primary', onclick:()=>A.runDialog(r)}, t('run')), h('button', {class:'btn', onclick:()=>A.edit(r)}, preset ? X('نسخ وتعديل','Copy & edit') : X('تعديل','Edit')),
      preset ? null : h('button', {class:'btn danger', onclick:async()=>{ await DB.del('recipes', r.id); A.render(); }}, t('del'))));
  w.replaceChildren(...[h('h1', {class:'ptitle'}, t('nav_auto')),
    h('p', {class:'psub'}, X('اجمع عدة أدوات في وصفة واحدة وشغّلها على عشرات الملفات دفعة واحدة. كل شيء يُعالج على جهازك.','Chain several tools into one recipe and run it on many files at once. Everything is processed on your device.')),
    h('div', {class:'toolbar'}, h('button', {class:'btn primary', onclick:()=>A.edit()}, X('وصفة جديدة','New recipe'))),
    mine.length ? h('h2', {class:'group-h'}, X('وصفاتي','My recipes')) : null, mine.length ? h('div', {class:'recipes'}, mine.map(r=>card(r, false))) : null,
    h('h2', {class:'group-h'}, X('وصفات جاهزة','Ready-made recipes')), h('div', {class:'recipes'}, PRESETS.map(p=>card(toRecipe(p), true)))].filter(Boolean));
};
A.presets = () => PRESETS.map(toRecipe);
})();
