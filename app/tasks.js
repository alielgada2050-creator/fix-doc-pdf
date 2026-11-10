/* وثيق — tasks (المهام): board + follow-up register, linked to documents and approvals; export to Excel / PDF / calendar. */
(function(){
const T = window.Tasks = {};
const {h, $} = U;
const COLS = {todo:['جديدة','To do'], doing:['قيد التنفيذ','In progress'], review:['بانتظار الاعتماد','Awaiting approval'], done:['مكتملة','Done']};
T.st = k => X(...(COLS[k]||[k,k]));
const today = () => { const d = new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const late = tk => tk.status!=='done' && tk.due && tk.due < today();

T.save = async tk => { tk.updated = Date.now(); await DB.put('tasks', tk); return tk; };
T.create = async o => T.save(Object.assign({id:'tk_'+U.uid()+Date.now().toString(36), no: await DB.nextNo('TK'), created:Date.now(), status:'todo', priority:'med', checklist:[]}, o));
T.syncApproval = async function(ap){
  const all = await DB.all('tasks'); let tk = all.find(x=>x.approvalId===ap.id);
  const cur = Flow.current(ap).map(i=>ap.steps[i].name).join('، ');
  const status = {review:'review', approved:'done', rejected:'done', returned:'doing', draft:'todo'}[ap.status] || 'todo';
  const patch = {title: X('اعتماد: ','Approve: ')+ap.title, assignee: ap.status==='returned' ? ap.createdBy : (cur || ap.createdBy), status, due:ap.due, priority:ap.priority, dept:ap.dept, approvalId:ap.id, approvalNo:ap.no,
    desc: ap.status==='rejected' ? X('رُفض الطلب.','Request rejected.') : ap.status==='approved' ? X('اكتمل الاعتماد.','Approval complete.') : (ap.note||'')};
  if (tk) Object.assign(tk, patch); else tk = Object.assign({id:'tk_'+U.uid()+Date.now().toString(36), no: await DB.nextNo('TK'), created:Date.now(), checklist:[]}, patch);
  await T.save(tk);
};
T.removeForApproval = async id => { for (const tk of await DB.all('tasks')) if (tk.approvalId===id) await DB.del('tasks', tk.id); };

/* ---------- edit dialog ---------- */
T.edit = async function(tk){
  const isNew = !tk; tk = tk ? JSON.parse(JSON.stringify(tk)) : {title:'', status:'todo', priority:'med', checklist:[], assignee:Flow.me()};
  const f = (id, v, ph, type) => h('input', {class:'field', id, dir:type?'ltr':'auto', type:type||'text', value:v||'', placeholder:ph||'', style:{width:'100%'}});
  const title = f('tkT', tk.title, X('ماذا يجب إنجازه؟','What needs doing?')); const asg = f('tkA', tk.assignee, X('المسؤول','Assignee')); const dept = f('tkD', tk.dept, X('الجهة / الحي / المشروع','Department / area / project'));
  const due = f('tkDue', tk.due, '', 'date'); const ref = f('tkR', tk.ref, X('رقم معاملة خارجي (اختياري)','External reference (optional)'));
  const st = h('select', {class:'field', id:'tkS'}, Object.keys(COLS).map(k=>h('option', {value:k, selected:k===tk.status}, T.st(k))));
  const pr = h('select', {class:'field', id:'tkP'}, ['high','med','low'].map(k=>h('option', {value:k, selected:k===tk.priority}, Flow.pr(k))));
  const desc = h('textarea', {class:'field', id:'tkN', dir:'auto', placeholder:X('ملاحظات','Notes')}); desc.value = tk.desc||'';
  const cl = h('div', {style:{display:'flex', flexDirection:'column', gap:'4px'}});
  const renderCl = ()=>{ cl.innerHTML=''; tk.checklist.forEach((c,i)=>{ const cb = h('input', {type:'checkbox'}); cb.checked = c.done; cb.onchange = ()=>c.done = cb.checked; const ti = h('input', {class:'field', dir:'auto', value:c.t, style:{flex:1}}); ti.oninput = ()=>c.t = ti.value;
    cl.append(h('div', {class:'row'}, cb, ti, h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ tk.checklist.splice(i,1); renderCl(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'}))); }); };
  renderCl();
  const lab = (k, el) => h('div', {style:{display:'flex', flexDirection:'column', gap:'4px', flex:'1 1 160px'}}, h('label', {class:'note', for:el.id}, k), el);
  const docRow = h('div', {class:'row'});
  const renderDoc = ()=>{ docRow.innerHTML=''; if (tk.docRef) docRow.append(h('span', {class:'pill'}, tk.docRef.name), h('button', {class:'btn', onclick:async()=>{ m.close(); App.openFiles([await DB.docFile(tk.docRef)], true); }}, t('open')), h('button', {class:'btn', onclick:()=>{ tk.docRef = null; renderDoc(); }}, t('remove')));
    else docRow.append(h('button', {class:'btn', onclick:async()=>{ const [fl] = await U.pickFiles('application/pdf,image/*'); if (!fl) return; tk.docRef = await DB.saveDoc(fl.name, new Uint8Array(await fl.arrayBuffer())); renderDoc(); }}, X('إرفاق مستند','Attach document')),
      E.doc ? h('button', {class:'btn', onclick:async()=>{ tk.docRef = await DB.saveDoc(E.doc.name, await E.currentBytes()); renderDoc(); }}, X('إرفاق المستند المفتوح','Attach open document')) : null); };
  renderDoc();
  const body = [lab(X('العنوان','Title'), title), h('div', {class:'row'}, lab(X('المسؤول','Assignee'), asg), lab(X('الجهة','Department'), dept)),
    h('div', {class:'row'}, lab(X('الحالة','Status'), st), lab(X('الأولوية','Priority'), pr), lab(X('الاستحقاق','Due'), due), lab(X('مرجع','Reference'), ref)),
    lab(X('ملاحظات','Notes'), desc), h('b', null, X('قائمة التحقق','Checklist')), cl, h('button', {class:'btn', onclick:()=>{ tk.checklist.push({t:'', done:false}); renderCl(); }}, X('إضافة بند','Add item')),
    h('b', null, X('المستند المرتبط','Linked document')), docRow,
    tk.approvalNo ? h('p', {class:'callout info'}, X(`مرتبطة بطلب الاعتماد ${tk.approvalNo}؛ تتحدث حالتها تلقائيًا.`,`Linked to approval ${tk.approvalNo}; its status updates automatically.`), ' ', h('button', {class:'btn', onclick:()=>{ m.close(); Work.tab('approvals'); Flow.detail(tk.approvalId); }}, X('فتح الطلب','Open request'))) : null];
  const btns = [{label:t('cancel')}];
  if (!isNew) btns.push({label:t('del'), kind:'danger', onClick:async c=>{ await DB.del('tasks', tk.id); c(); Work.refresh(); }});
  btns.push({label:X('حفظ','Save'), kind:'primary', onClick:async c=>{
    if (!title.value.trim()) return U.toast(X('اكتب عنوان المهمة.','Enter a task title.'));
    Object.assign(tk, {title:title.value.trim(), assignee:asg.value.trim(), dept:dept.value.trim(), status:st.value, priority:pr.value, due:due.value, ref:ref.value.trim(), desc:desc.value.trim(), checklist:tk.checklist.filter(x=>x.t.trim())});
    if (isNew) await T.create(tk); else await T.save(tk); c(); Work.refresh(); U.toast(X('حُفظت المهمة.','Task saved.'), 'ok'); }});
  const m = U.modal(isNew ? X('مهمة جديدة','New task') : (tk.no||X('مهمة','Task')), body, btns, {wide:true, sticky:true});
};

/* ---------- filters ---------- */
let q = '', who = '', onlyLate = false;
const match = tk => (!q || (tk.title+' '+(tk.dept||'')+' '+(tk.no||'')+' '+(tk.ref||'')+' '+(tk.desc||'')).toLowerCase().includes(q.toLowerCase())) && (!who || tk.assignee===who) && (!onlyLate || late(tk));
function filterBar(all){
  const people = [...new Set(all.map(x=>x.assignee).filter(Boolean))].sort();
  const s = h('input', {class:'field', type:'search', dir:'auto', value:q, placeholder:X('بحث','Search'), style:{flex:'1 1 180px', maxWidth:'280px'}}); s.oninput = ()=>{ q = s.value; clearTimeout(s._t); s._t = setTimeout(()=>Work.refresh(true), 250); };
  const p = h('select', {class:'field', 'aria-label':X('المسؤول','Assignee')}, h('option', {value:''}, X('كل المسؤولين','All assignees')), people.map(x=>h('option', {value:x, selected:x===who}, x))); p.onchange = ()=>{ who = p.value; Work.refresh(); };
  const l = h('input', {type:'checkbox'}); l.checked = onlyLate; l.onchange = ()=>{ onlyLate = l.checked; Work.refresh(); };
  return h('div', {class:'toolbar'}, h('button', {class:'btn primary', onclick:()=>T.edit()}, X('مهمة جديدة','New task')), s, p, h('label', {class:'row note'}, l, X('المتأخرة فقط','Overdue only')),
    h('span', {class:'spacer'}),
    h('button', {class:'btn', onclick:()=>T.exportXlsx()}, 'Excel'), h('button', {class:'btn', onclick:()=>T.exportPdf()}, 'PDF'), h('button', {class:'btn', onclick:()=>T.exportIcs()}, X('تقويم','Calendar')), h('button', {class:'btn', onclick:()=>T.importFile()}, X('استيراد','Import')));
}
function stats(all){
  const c = k => all.filter(x=>x.status===k).length;
  return h('div', {class:'stats'}, ...[[all.length, X('كل المهام','All tasks')], [c('todo')+c('doing'), X('مفتوحة','Open')], [c('review'), X('بانتظار الاعتماد','Awaiting approval')], [all.filter(late).length, X('متأخرة','Overdue')], [c('done'), X('مكتملة','Done')]].map(([n,l])=>h('div', null, h('b', null, String(n)), h('span', null, l))));
}

/* ---------- board ---------- */
T.renderBoard = async function(wrap){
  const all = await DB.all('tasks'); const rows = all.filter(match);
  const board = h('div', {class:'board'});
  for (const k of Object.keys(COLS)){
    const items = rows.filter(x=>x.status===k).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999') || ({high:0,med:1,low:2}[a.priority]-({high:0,med:1,low:2}[b.priority])));
    const col = h('div', {class:'col', 'data-st':k}, h('h3', null, T.st(k), h('span', null, String(items.length))));
    col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('over'); }); col.addEventListener('dragleave', ()=>col.classList.remove('over'));
    col.addEventListener('drop', async e=>{ e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/task'); const tk = all.find(x=>x.id===id); if (tk && tk.status!==k){ tk.status = k; await T.save(tk); Work.refresh(); } });
    for (const tk of items){
      const done = tk.checklist.filter(c=>c.done).length;
      const mv = h('select', {class:'field', 'aria-label':X('نقل إلى','Move to'), style:{minHeight:'30px', padding:'2px 6px', fontSize:'12px'}, onclick:e=>e.stopPropagation()}, Object.keys(COLS).map(c=>h('option', {value:c, selected:c===k}, T.st(c))));
      mv.onchange = async e=>{ e.stopPropagation(); tk.status = mv.value; await T.save(tk); Work.refresh(); };
      const card = h('div', {class:'tcard'+(late(tk)?' late':''), draggable:'true', tabindex:'0', onclick:()=>T.edit(tk), onkeydown:e=>{ if (e.key==='Enter') T.edit(tk); }},
        h('b', null, tk.title),
        h('div', {class:'meta'}, tk.assignee ? h('span', null, tk.assignee) : null, tk.due ? h('span', {class:'num', style:{color:late(tk)?'var(--err)':''}}, tk.due) : null, h('span', {class:'prio-'+tk.priority}, Flow.pr(tk.priority)),
          tk.checklist.length ? h('span', {class:'num'}, `${done}/${tk.checklist.length}`) : null, tk.approvalNo ? h('span', {class:'pill s-review'}, tk.approvalNo) : null, tk.docRef ? h('span', {html:U.ico('extract'), style:{width:'16px', height:'16px', display:'inline-block'}}) : null),
        tk.dept ? h('div', {class:'meta'}, tk.dept) : null, mv);
      card.addEventListener('dragstart', e=>e.dataTransfer.setData('text/task', tk.id));
      col.append(card);
    }
    if (!items.length) col.append(h('p', {class:'note', style:{margin:'4px 2px'}}, k==='todo' ? X('أضف مهمة جديدة أو اسحب بطاقة إلى هنا.','Add a task or drag a card here.') : '—'));
    board.append(col);
  }
  wrap.append(stats(all), filterBar(all), board);
};

/* ---------- register (follow-up table, styled after paper registers) ---------- */
const COLMAP = [['no', X('الرقم','No.')], ['title', X('المهمة / المعاملة','Task / transaction')], ['dept', X('الجهة','Department')], ['status', X('الحالة','Status')], ['assignee', X('المسؤول','Assignee')], ['due', X('الاستحقاق','Due')], ['priority', X('الأولوية','Priority')], ['desc', X('ملاحظات','Notes')]];
T.renderTable = async function(wrap){
  const all = await DB.all('tasks'); const rows = all.filter(match).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const cols = COLMAP.map(([k,l])=>[k, l]);
  const tbl = h('div', {class:'tbl-wrap'}, h('table', {class:'reg'}, h('thead', null, h('tr', null, cols.map(([,l])=>h('th', null, l)))),
    h('tbody', null, rows.length ? rows.map(tk=>h('tr', {class:'click', tabindex:'0', onclick:()=>T.edit(tk)},
      h('td', null, h('span', {class:'num'}, tk.no||'—')), h('td', null, h('b', null, tk.title), tk.approvalNo ? h('div', {class:'note num'}, tk.approvalNo) : null), h('td', null, tk.dept||'—'),
      h('td', null, h('span', {class:'pill s-'+(late(tk)?'late':tk.status)}, late(tk) ? X('متأخرة','Overdue') : T.st(tk.status))), h('td', null, tk.assignee||'—'),
      h('td', null, h('span', {class:'num'}, tk.due||'—')), h('td', {class:'prio-'+tk.priority}, Flow.pr(tk.priority)), h('td', {style:{maxWidth:'260px'}}, tk.desc||''))) :
      h('tr', null, h('td', {colspan:String(cols.length), style:{textAlign:'center', padding:'28px'}}, X('لا توجد مهام مطابقة.','No matching tasks.'))))));
  wrap.append(stats(all), filterBar(all), tbl);
};

/* ---------- export / import ---------- */
async function rowsForExport(){ return (await DB.all('tasks')).filter(match).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).map(tk=>({no:tk.no||'', title:tk.title, dept:tk.dept||'', status: late(tk) ? X('متأخرة','Overdue') : T.st(tk.status), assignee:tk.assignee||'', due:tk.due||'', priority:Flow.pr(tk.priority), desc:tk.desc||''})); }
T.exportXlsx = async function(){
  await U.loadScript(U.LIBS.xlsx); const rows = await rowsForExport();
  const ws = XLSX.utils.aoa_to_sheet([COLMAP.map(c=>c[1]), ...rows.map(r=>COLMAP.map(c=>r[c[0]]))]); ws['!cols'] = [10,40,20,16,18,12,10,40].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, X('المهام','Tasks')); if (LANG==='ar') wb.Workbook = {Views:[{RTL:true}]};
  await U.saveFile(X('سجل-المتابعة','follow-up')+'-'+today()+'.xlsx', new Blob([XLSX.write(wb, {type:'array', bookType:'xlsx'})], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
};
T.exportPdf = async function(){
  const rows = await rowsForExport(); const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const color = s => /متأخرة|Overdue/.test(s) ? '#fde4e1' : /مكتملة|Done/.test(s) ? '#dcf1e3' : /بانتظار|Awaiting/.test(s) ? '#e2e7f7' : '#ffffff';
  const html = `<div dir="${LANG==='ar'?'rtl':'ltr'}" style="font-family:'Readex Pro',sans-serif"><h2 style="margin:0 0 4px;background:#ffd966;padding:8px;text-align:center">${esc(X('سجل متابعة المهام والمعاملات','Task & transaction follow-up register'))} — ${new Date().toISOString().slice(0,10)}</h2>
    <p style="margin:0 0 10px;color:#555">${esc(X('عدد البنود','Items'))}: ${rows.length}</p>
    <table style="width:100%;font-size:11px"><thead><tr>${COLMAP.map(c=>`<th style="background:#dbe7f3">${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${COLMAP.map(c=>`<td style="background:${c[0]==='status'?color(r.status):c[0]==='no'?'#fff36b':'#fff'};font-weight:${c[0]==='title'?700:400}">${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const bytes = await Tools.htmlToPdf(html, {orient:'landscape', pad:28}); await U.saveFile(X('سجل-المتابعة','follow-up')+'.pdf', new Blob([bytes], {type:'application/pdf'}));
};
T.exportIcs = async function(){
  const items = (await DB.all('tasks')).filter(match).filter(x=>x.due && x.status!=='done');
  if (!items.length) return U.toast(X('لا توجد مهام مفتوحة لها تاريخ استحقاق.','No open tasks with a due date.'));
  const esc = s => String(s||'').replace(/[\\,;]/g, m=>'\\'+m).replace(/\n/g,'\\n'); const stamp = new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  const ev = items.map(tk=>{ const d = tk.due.replace(/-/g,''); const n = new Date(tk.due+'T00:00'); n.setDate(n.getDate()+1); const d2 = n.toISOString().slice(0,10).replace(/-/g,'');
    return ['BEGIN:VEVENT', `UID:${tk.id}@wathiq`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(tk.title)}`, `DESCRIPTION:${esc([tk.no, tk.assignee, tk.dept, tk.desc].filter(Boolean).join(' — '))}`, 'BEGIN:VALARM', 'TRIGGER:-PT9H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(tk.title)}`, 'END:VALARM', 'END:VEVENT'].join('\r\n'); });
  await U.saveFile('wathiq-tasks.ics', new Blob([['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wathiq PDF//AR','CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n')], {type:'text/calendar'}));
};
T.importFile = async function(){
  const [f] = await U.pickFiles('.xlsx,.xls,.csv'); if (!f) return; await U.loadScript(U.LIBS.xlsx);
  const wb = U.ext(f.name)==='csv' ? XLSX.read((await f.text()).replace(/^\uFEFF/, ''), {type:'string', raw:true}) : XLSX.read(await f.arrayBuffer(), {type:'array', cellDates:true}); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
  const pick = (r, keys) => { for (const k of Object.keys(r)) if (keys.some(x=>k.trim().toLowerCase().includes(x))) return String(r[k] instanceof Date ? new Date(r[k].getTime()-r[k].getTimezoneOffset()*60000).toISOString().slice(0,10) : r[k]).trim(); return ''; };
  const stMap = v => /done|مكتمل|منجز|تم/i.test(v) ? 'done' : /progress|تنفيذ|جار/i.test(v) ? 'doing' : /اعتماد|review|approv/i.test(v) ? 'review' : 'todo';
  const prMap = v => /عاجل|high|urgent|هام/i.test(v) ? 'high' : /low|منخفض/i.test(v) ? 'low' : 'med';
  let n = 0;
  for (const r of rows){ const title = pick(r, ['title','task','المهمة','العنوان','الموضوع','خطوات العمل','رقم الأساس']); if (!title) continue;
    await T.create({title, assignee:pick(r, ['assignee','owner','المسؤول','المراقب','المكلف']), dept:pick(r, ['dept','department','الجهة','الحي','القسم','المشروع']), status:stMap(pick(r, ['status','الحالة','حالة الطلب'])), priority:prMap(pick(r, ['priority','الأولوية','ملاحظات'])),
      due:(pick(r, ['due','date','الاستحقاق','التاريخ','وقت البداية','الموعد']).match(/\d{4}-\d{2}-\d{2}/)||[''])[0] || (()=>{ const m = pick(r, ['due','date','التاريخ','وقت البداية']).match(/(\d{2})-(\d{2})-(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; })(),
      ref:pick(r, ['ref','رقم المعاملة','المرجع']), desc:pick(r, ['notes','desc','ملاحظات','الوصف'])}); n++; }
  U.toast(X(`استُورد ${n} بند.`,`Imported ${n} items.`), n?'ok':'err'); Work.refresh();
};

/* ---------- Work view (tabs) ---------- */
const Work = window.Work = {};
let tab = 'approvals';
Work.tab = k => { tab = k; Work.refresh(); };
Work.refresh = async function(keepFocus){
  const w = $('#workWrap'); if (!w || !$('#work').classList.contains('on')) return;
  const focusId = keepFocus && document.activeElement && document.activeElement.type==='search' ? true : false; const caret = focusId ? document.activeElement.selectionStart : 0;
  const box = h('div');
  const head = h('div', {class:'row', style:{justifyContent:'space-between', alignItems:'flex-end', marginBottom:'14px'}},
    h('div', null, h('h1', {class:'ptitle'}, t('nav_work')), h('p', {class:'psub', style:{margin:0}}, X('اعتماد المستندات بالتسلسل، ومتابعة المهام ومواعيدها، في سجل واحد على جهازك.','Route documents for approval and follow tasks and deadlines, in one register on your device.'))),
    h('div', {class:'seg', role:'tablist'}, ...[['approvals', X('الاعتمادات','Approvals')], ['board', X('لوحة المهام','Task board')], ['table', X('سجل المتابعة','Register')]].map(([k,l])=>h('button', {role:'tab', 'aria-pressed':String(tab===k), onclick:()=>Work.tab(k)}, l))));
  box.append(head);
  try { if (tab==='approvals') await Flow.render(box); else if (tab==='board') await T.renderBoard(box); else await T.renderTable(box); }
  catch(e){ console.error(e); box.append(h('p', {class:'callout'}, t('error',{e:e.message}))); }
  box.append(h('div', {class:'row', style:{marginTop:'26px', borderTop:'1px solid var(--line)', paddingTop:'14px'}},
    h('span', {class:'note', style:{flex:'1 1 260px'}}, DB.isMemory() ? X('التخزين الدائم غير متاح في هذا المتصفح؛ البيانات ستُفقد عند الإغلاق. استخدم النسخة الاحتياطية.','Persistent storage is unavailable in this browser; data will be lost on close. Use backup.') : X('البيانات محفوظة في هذا المتصفح فقط. خذ نسخة احتياطية بانتظام.','Data is kept in this browser only. Back it up regularly.')),
    h('button', {class:'btn', onclick:async()=>U.saveFile('wathiq-backup-'+new Date().toISOString().slice(0,10)+'.json', await DB.backup())}, X('نسخة احتياطية','Back up')),
    h('button', {class:'btn', onclick:async()=>{ const [f] = await U.pickFiles('.json,application/json'); if (!f) return; try { const n = await DB.restore(f); U.toast(X(`استُعيد ${n} عنصر.`,`Restored ${n} items.`), 'ok'); Work.refresh(); } catch(e){ U.toast(e.message, 'err'); } }}, X('استعادة','Restore'))));
  w.replaceChildren(box);
  if (focusId){ const s = w.querySelector('input[type=search]'); if (s){ s.focus(); try { s.setSelectionRange(caret, caret); } catch(e){} } }
};
DB.on('tasks', ()=>{ clearTimeout(Work._t); Work._t = setTimeout(()=>Work.refresh(), 60); });
})();
