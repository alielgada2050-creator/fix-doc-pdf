/* وثيق — text editor (محرر النصوص): edit words and lines in place, find & replace across the document with
   Arabic-aware matching, style matching (text colour, background, weight, family), local and AI proofreading. */
(function(){
const TX = window.TextEdit = {};
const {h, $} = U;

/* ---------- Arabic-aware normalisation with an index map back to the original string ---------- */
const TASHKEEL = /[ً-ٰٟۖ-ۭـ]/;
TX.norm = function(s, o){
  const out = []; const map = [];
  for (let i=0;i<s.length;i++){ let c = s[i];
    if (o.loose){ if (TASHKEEL.test(c)) continue; if ('أإآٱ'.includes(c)) c = 'ا'; else if (c==='ى') c = 'ي'; else if (c==='ة') c = 'ه'; else if (c==='ؤ') c = 'و'; else if (c==='ئ') c = 'ي'; else if ('٠١٢٣٤٥٦٧٨٩'.includes(c)) c = String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)); }
    if (!o.matchCase) c = c.toLowerCase();
    out.push(c); map.push(i); }
  map.push(s.length);
  return {s: out.join(''), map};
};
const isWordCh = c => !!c && /[\p{L}\p{N}_]/u.test(c);
TX.matches = function(str, query, o){
  if (!query) return [];
  const A = TX.norm(str, o), Q = TX.norm(query, o).s; const res = []; let from = 0;
  while (Q && (from = A.s.indexOf(Q, from)) >= 0){
    const end = from + Q.length;
    if (!o.whole || (!isWordCh(A.s[from-1]) && !isWordCh(A.s[end]))) res.push([A.map[from], A.map[end]]);
    from = end;
  }
  return res;
};
TX.replaceIn = function(str, query, repl, o){ const ms = TX.matches(str, query, o); let out = str; for (let i=ms.length-1;i>=0;i--) out = out.slice(0, ms[i][0]) + repl + out.slice(ms[i][1]); return {text:out, n:ms.length}; };

/* ---------- current text of an item (respecting earlier edits) ---------- */
const keyOf = (p, it) => `${p.id}:${it.i}`;
TX.overlayFor = (p, it) => p.objs.find(o=>o.srcKey===keyOf(p, it));
TX.currentText = (p, it) => { const o = TX.overlayFor(p, it); return o ? o.text : it.str; };

/* ---------- style sampling from the rendered page ---------- */
const realFontName = async (doc, p, it) => { try { const pg = await doc.sources[p.s].pdf.getPage(p.i+1); if (pg.commonObjs.has(it.fontName)){ const f = pg.commonObjs.get(it.fontName); return (f && (f.name || f.loadedName)) || ''; } } catch(e){} return ''; };
TX.sample = async function(doc, p, it){
  const [dw] = M.dispSize(p); const sc = Math.min(4, 1800/dw);
  const c = await M.renderPage(doc, p, sc, null, {print:true}); const ctx = c.getContext('2d');
  const x = Math.max(0, Math.floor(it.x*c.width)-2), y = Math.max(0, Math.floor(it.y*c.height)-2);
  const w = Math.min(c.width-x, Math.ceil(it.w*c.width)+4), hh = Math.min(c.height-y, Math.ceil(it.h*c.height)+4);
  const d = ctx.getImageData(x, y, Math.max(1,w), Math.max(1,hh)).data; const W = Math.max(1,w), H = Math.max(1,hh);
  // background: most common quantised colour on the region border
  const counts = new Map(); const q = v => v>>4;
  const add = (px, py) => { const k = (py*W+px)*4; const key = (q(d[k])<<8)|(q(d[k+1])<<4)|q(d[k+2]); counts.set(key, (counts.get(key)||0)+1); };
  for (let i=0;i<W;i++){ add(i,0); add(i,H-1); } for (let j=0;j<H;j++){ add(0,j); add(W-1,j); }
  let best = 0, bk = 0xFFF; counts.forEach((n,k)=>{ if (n>best){ best = n; bk = k; } });
  const acc = [0,0,0]; let na = 0; const take = (px, py) => { const k = (py*W+px)*4; if (((q(d[k])<<8)|(q(d[k+1])<<4)|q(d[k+2])) === bk){ acc[0]+=d[k]; acc[1]+=d[k+1]; acc[2]+=d[k+2]; na++; } };
  for (let i=0;i<W;i++){ take(i,0); take(i,H-1); } for (let j=0;j<H;j++){ take(0,j); take(W-1,j); }
  const bg = na ? acc.map(v=>Math.round(v/na)) : [255,255,255]; if (bg.every(v=>v>=246)) bg.fill(255);
  // text colour: average of the pixels farthest from the background
  const dist = []; for (let k=0;k<d.length;k+=4){ const dd = Math.abs(d[k]-bg[0])+Math.abs(d[k+1]-bg[1])+Math.abs(d[k+2]-bg[2]); if (dd>90) dist.push([dd, k]); }
  dist.sort((a,b)=>b[0]-a[0]); const top = dist.slice(0, Math.max(1, Math.floor(dist.length*0.25)));
  let fg = [17,17,17]; if (top.length && dist.length){ fg = [0,0,0]; top.forEach(([,k])=>{ fg[0]+=d[k]; fg[1]+=d[k+1]; fg[2]+=d[k+2]; }); fg = fg.map(v=>Math.round(v/top.length)); }
  const ink = dist.length / (W*H);
  const name = (await realFontName(doc, p, it)) + ' ' + (it.font||'');
  const hex = a => '#'+a.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
  return {bg:hex(bg), fg:hex(fg), bold: /bold|black|heavy|semibold|demi/i.test(name) || ink > 0.34, serif: /times|serif|naskh|amiri|georgia|minion|garamond|traditional/i.test(name) && !/sans/i.test(name), mono: /courier|mono/i.test(name), fontName:name.trim()};
};

/* ---------- replace one text item with new text (or update an earlier replacement) ---------- */
TX.replaceItem = async function(p, it, text, opts={}){
  const doc = E.doc; const [dw, dh] = M.dispSize(p);
  let o = TX.overlayFor(p, it);
  if (!o && text===it.str && !opts.keep) return null;
  if (o && text===it.str && !opts.keep){ if (!opts.noSnap) E.snap(); p.objs = p.objs.filter(x=>x!==o); E.renderOverlay(p); E.renderThumbSoon(p); return null; }
  if (!opts.noSnap) E.snap();
  const st = opts.style || await TX.sample(doc, p, it);
  const ar = U.isAr(text) || U.isAr(it.str);
  const font = ar ? 'IBM Plex Sans Arabic' : st.mono ? 'Courier New' : st.serif ? 'Times New Roman' : 'Arial';
  let size = o ? o.size : Math.max(4, Math.round(it.h*dh*0.74*2)/2);
  // width: grow toward the reading direction if the new text is longer; shrink the font if it would leave the page
  const m = () => U.measureTextBlock(text, U.fontStack(font), size, st.bold).w/dw + 6/dw;
  let w = Math.max(it.w + 0.004, m());
  const rtl = (it.dir==='rtl') || ar;
  let x = rtl ? (it.x + it.w + 0.002) - w : it.x - 0.002;
  while ((x < 0.005 || x + w > 0.995) && size > 5){ size -= 0.5; w = Math.max(it.w + 0.004, m()); x = rtl ? (it.x + it.w + 0.002) - w : it.x - 0.002; }
  const hh = Math.max(it.h + 0.004, size*1.3/dh);
  const cover = {x:Math.min(x, it.x-0.002), y:it.y - 0.002, w:Math.max(x+w, it.x+it.w+0.002) - Math.min(x, it.x-0.002), h:hh};
  const patch = {type:'text', text, x:cover.x, y:cover.y, w:cover.w, h:cover.h, font, size, color:st.fg, bold:st.bold, italic:false, align:'start', bg:true, bgColor:st.bg, srcKey:keyOf(p, it), orig:it.str, fromEdit:true, purge:!!opts.purge || (o && o.purge)};
  if (o) Object.assign(o, patch); else { o = Object.assign({id:U.uid()}, patch); p.objs.push(o); }
  E.renderOverlay(p); E.renderThumbSoon(p);
  return o;
};

/* ---------- document-wide search ---------- */
TX.findAll = async function(query, o){
  const hits = []; if (!E.doc || !query) return hits;
  for (const p of E.doc.pages){ for (const it of await M.getText(E.doc, p)){ const cur = TX.currentText(p, it); const ms = TX.matches(cur, query, o); if (ms.length) hits.push({p, it, n:ms.length, cur}); } }
  return hits;
};
TX.replaceAll = async function(query, repl, o, onProg){
  const hits = await TX.findAll(query, o); if (!hits.length) return 0;
  E.snap(); let n = 0; const styles = {};
  for (let k=0;k<hits.length;k++){ const {p, it, cur} = hits[k]; onProg && onProg(k/hits.length);
    const r = TX.replaceIn(cur, query, repl, o); n += r.n;
    await TX.replaceItem(p, it, r.text, {noSnap:true, keep:true, purge:o.purge}); }
  E.renderThumbs(); return n;
};

/* ---------- proofreading ---------- */
const AR_FIX = {'إنشاء الله':'إن شاء الله','انشاء الله':'إن شاء الله','ان شاء الله':'إن شاء الله','إنشاءالله':'إن شاء الله','لاكن':'لكن','لاكنه':'لكنه','لاكنها':'لكنها','هاذا':'هذا','هاذه':'هذه','هاذي':'هذه','ذالك':'ذلك','هاكذا':'هكذا','هكذى':'هكذا','مسؤل':'مسؤول','مسؤلية':'مسؤولية','شيئ':'شيء','شئ':'شيء',
  'إستلام':'استلام','إستخدام':'استخدام','إعتماد':'اعتماد','إجتماع':'اجتماع','إنتهاء':'انتهاء','إبتداء':'ابتداء','إستكمال':'استكمال','إتصال':'اتصال','إختيار':'اختيار','إرتفاع':'ارتفاع','إستفسار':'استفسار','إنتظار':'انتظار','إحتياج':'احتياج','إلتزام':'التزام','إستثمار':'استثمار','إقتراح':'اقتراح','إعتذار':'اعتذار','إمتحان':'امتحان','إستقبال':'استقبال','إستمارة':'استمارة','إستعلام':'استعلام','إشتراك':'اشتراك','إنتقال':'انتقال','إستبدال':'استبدال','إستئناف':'استئناف','إختبار':'اختبار','إتفاقية':'اتفاقية','إتفاق':'اتفاق','إعتبار':'اعتبار','إنطلاق':'انطلاق','إستشارة':'استشارة',
  'الى':'إلى','إلي':'إلى','الأن':'الآن','الان':'الآن','التى':'التي','الذى':'الذي','فى':'في','أنشاء':'إنشاء','ألف مبروك':'ألف مبروك','إبن':'ابن','إسم':'اسم','إثنين':'اثنين','الإثنين':'الاثنين','إثنان':'اثنان','أمرأة':'امرأة','إمرأة':'امرأة','مائه':'مائة','الساعه':'الساعة','الحكومه':'الحكومة'};
const EN_FIX = {teh:'the',recieve:'receive',recieved:'received',adress:'address',occured:'occurred',seperate:'separate',definately:'definitely',accomodate:'accommodate',acheive:'achieve',beleive:'believe',calender:'calendar',comittee:'committee',concious:'conscious',enviroment:'environment',existance:'existence',goverment:'government',guage:'gauge',independant:'independent',maintainance:'maintenance',neccessary:'necessary',noticable:'noticeable',occurence:'occurrence',persue:'pursue',posession:'possession',prefered:'preferred',publically:'publicly',reciept:'receipt',recomend:'recommend',refered:'referred',succesful:'successful',tommorow:'tomorrow',untill:'until',wich:'which',wierd:'weird',thier:'their',truely:'truly',buisness:'business',managment:'management',paymnet:'payment',invioce:'invoice',ammount:'amount',agreemnt:'agreement',aproved:'approved',adn:'and',taht:'that'};
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const AR_RE = new RegExp('(^|[^\\p{L}])(' + Object.keys(AR_FIX).sort((a,b)=>b.length-a.length).map(escRe).join('|') + ')(?=$|[^\\p{L}])', 'gu');
TX.localIssues = function(text){
  const out = []; if (!text) return out; let m;
  AR_RE.lastIndex = 0; while ((m = AR_RE.exec(text))){ const w = m[2]; if (AR_FIX[w] !== w) out.push({wrong:w, fix:AR_FIX[w], reason:X('خطأ إملائي شائع','Common spelling error')}); }
  for (const w of text.match(/[A-Za-z]+/g)||[]){ const f = EN_FIX[w.toLowerCase()]; if (f) out.push({wrong:w, fix: w[0]===w[0].toUpperCase() ? f[0].toUpperCase()+f.slice(1) : f, reason:X('خطأ إملائي','Spelling')}); }
  const rep = /(^|\s)([\p{L}]{2,})\s+\2(?=\s|$)/gu; while ((m = rep.exec(text))) out.push({wrong:`${m[2]} ${m[2]}`, fix:m[2], reason:X('كلمة مكررة','Repeated word')});
  if (/\S {2,}\S/.test(text)) out.push({wrong:(text.match(/\S {2,}\S/)||[''])[0], fix:(text.match(/\S {2,}\S/)||[''])[0].replace(/ {2,}/g,' '), reason:X('مسافات زائدة','Extra spaces')});
  const sp = text.match(/\S\s+[،؛:.!?؟,;](?=\s|$)/); if (sp) out.push({wrong:sp[0], fix:sp[0].replace(/\s+([،؛:.!?؟,;])/, '$1'), reason:X('مسافة قبل علامة الترقيم','Space before punctuation')});
  const mix = text.match(/[0-9]+[٠-٩]+|[٠-٩]+[0-9]+/); if (mix) out.push({wrong:mix[0], fix:mix[0].replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)), reason:X('أرقام مختلطة','Mixed digit systems')});
  return out;
};
TX.scanLocal = async function(){
  const issues = [];
  for (const p of E.doc.pages) for (const it of await M.getText(E.doc, p)){ const cur = TX.currentText(p, it); for (const is of TX.localIssues(cur)) issues.push(Object.assign({p, it, src:'local'}, is)); }
  return issues;
};
TX.scanAI = async function(){
  const lines = []; const refs = {};
  for (let pi=0; pi<E.doc.pages.length; pi++){ const p = E.doc.pages[pi]; for (const it of await M.getText(E.doc, p)){ const cur = TX.currentText(p, it); if (cur.trim().length < 3) continue; const id = `${pi+1}.${it.i}`; refs[id] = {p, it}; lines.push(`${id}\t${cur}`); } }
  if (!lines.length) throw new Error(X('لا يوجد نص قابل للقراءة. شغّل OCR أولًا للصفحات الممسوحة.','No readable text. Run OCR first for scanned pages.'));
  const body = lines.join('\n').slice(0, 40000);
  const prompt = X(`أنت مدقق لغوي محترف للعربية والإنجليزية. كل سطر أدناه يبدأ بمعرّف ثم علامة تبويب ثم النص. اعثر على الأخطاء الإملائية والنحوية وأخطاء الكتابة الواضحة فقط، دون إعادة صياغة أسلوبية، ولا تغيّر الأرقام أو الأسماء أو الرموز.
أعد JSON فقط: {"fixes":[{"id":"المعرف","wrong":"الكلمة أو العبارة كما وردت حرفيًا","fix":"التصحيح","reason":"سبب مختصر"}]}`,
`You are a professional Arabic and English proofreader. Each line below starts with an id, a tab, then text. Find only clear spelling, grammar and typing errors, no stylistic rewrites; never change numbers, names or codes.
Return only JSON: {"fixes":[{"id":"the id","wrong":"exact wrong word or phrase as written","fix":"correction","reason":"short reason"}]}`) + '\n\n' + body;
  const j = await Assist.json([{role:'user', content:prompt}]);
  return (j.fixes||[]).map(f=>{ const r = refs[String(f.id)]; if (!r || !f.wrong || f.wrong===f.fix) return null; const cur = TX.currentText(r.p, r.it); if (!cur.includes(f.wrong)) return null; return Object.assign({src:'ai'}, r, {wrong:f.wrong, fix:f.fix||'', reason:f.reason||''}); }).filter(Boolean);
};
TX.applyIssue = async function(is, noSnap){ const cur = TX.currentText(is.p, is.it); const i = cur.indexOf(is.wrong); if (i<0) return false; await TX.replaceItem(is.p, is.it, cur.slice(0,i) + is.fix + cur.slice(i+is.wrong.length), {noSnap}); return true; };

/* ---------- panel UI (inside the properties panel, "Text" tab) ---------- */
let state = {find:'', repl:'', matchCase:false, whole:false, loose:true, purge:false, issues:null, busy:false};
TX.render = async function(P){
  const doc = E.doc; if (!doc) return;
  const p = doc.pages[E.cur] || doc.pages[0];
  const opt = () => ({matchCase:state.matchCase, whole:state.whole, loose:state.loose, purge:state.purge});
  // find & replace
  const f = h('input', {class:'field', id:'txF', dir:'auto', value:state.find, placeholder:X('ابحث عن…','Find…'), style:{width:'100%'}});
  const r = h('input', {class:'field', id:'txR', dir:'auto', value:state.repl, placeholder:X('استبدل بـ…','Replace with…'), style:{width:'100%'}});
  const count = h('span', {class:'note'});
  f.oninput = ()=>{ state.find = f.value; clearTimeout(f._t); f._t = setTimeout(upd, 250); }; r.oninput = ()=>state.repl = r.value;
  const upd = async ()=>{ const hits = await TX.findAll(state.find, opt()); const n = hits.reduce((a,x)=>a+x.n,0); count.textContent = state.find ? X(`${n} نتيجة في ${new Set(hits.map(x=>x.p.id)).size} صفحة`,`${n} matches on ${new Set(hits.map(x=>x.p.id)).size} page(s)`) : '';
    E.matches = hits.map(x=>({p:x.p, it:x.it})); E.mi = -1; E.drawMatches(); };
  const ck = (k, label) => { const c = h('input', {type:'checkbox'}); c.checked = state[k]; c.onchange = ()=>{ state[k] = c.checked; upd(); }; return h('label', {class:'row note'}, c, label); };
  const g1 = h('div', {class:'pgrp'}, h('h3', null, X('بحث واستبدال','Find & replace')), f, r,
    h('div', {class:'row'}, ck('matchCase', X('مطابقة حالة الأحرف','Match case')), ck('whole', X('كلمة كاملة','Whole word')), ck('loose', X('تجاهل التشكيل والهمزات','Ignore diacritics & hamza forms'))),
    count,
    h('div', {class:'row'}, h('button', {class:'btn', onclick:()=>{ upd().then(()=>E.nextMatch(1)); }}, X('التالي','Next')),
      h('button', {class:'btn primary', onclick:async e=>{ if (!state.find) return U.toast(X('اكتب الكلمة المطلوبة.','Type what to find.')); e.target.disabled = true; try { const n = await TX.replaceAll(state.find, state.repl, opt()); U.toast(n ? X(`استُبدلت ${n} مرة.`,`Replaced ${n} time(s).`) : X('لا توجد نتائج.','No matches.'), n?'ok':''); await upd(); TX.renderList(); } finally { e.target.disabled = false; } }}, X('استبدال الكل','Replace all'))));
  // page text list
  const list = h('div', {id:'txList', style:{display:'flex', flexDirection:'column', gap:'6px'}});
  const g2 = h('div', {class:'pgrp'}, h('h3', null, X(`نصوص الصفحة ${E.cur+1}`,`Text on page ${E.cur+1}`)), h('p', {class:'note'}, X('عدّل أي سطر ثم اضغط Enter. يُغطّى النص الأصلي بلون الخلفية نفسه ويُكتب الجديد بخط ولون مطابقين.','Edit any line and press Enter. The original is covered with its own background colour and the new text is written in a matching font and colour.')), list);
  // proofreading
  const res = h('div', {style:{display:'flex', flexDirection:'column', gap:'6px'}});
  const runScan = async (kind, btn) => { btn.disabled = true; res.replaceChildren(h('p', {class:'note'}, X('جارٍ التدقيق…','Checking…')));
    try { state.issues = kind==='ai' ? await TX.scanAI() : await TX.scanLocal(); renderIssues(); } catch(e){ if (!e.quiet) res.replaceChildren(h('p', {class:'callout'}, e.message)); else res.replaceChildren(); } finally { btn.disabled = false; } };
  const renderIssues = ()=>{ const is = state.issues||[]; res.replaceChildren();
    if (!is.length){ res.append(h('p', {class:'note', style:{color:'var(--ok)'}}, X('لم تُعثر على أخطاء.','No issues found.'))); return; }
    res.append(h('div', {class:'row'}, h('span', {class:'note'}, X(`${is.length} ملاحظة`,`${is.length} issue(s)`)), h('button', {class:'btn primary', onclick:async e=>{ e.target.disabled = true; E.snap(); let n = 0; for (const x of is.slice()) if (await TX.applyIssue(x, true)) n++; state.issues = []; renderIssues(); E.renderThumbs(); TX.renderList(); U.toast(X(`طُبّق ${n} تصحيح.`,`Applied ${n} fix(es).`), 'ok'); }}, X('تطبيق الكل','Apply all'))));
    is.slice(0, 120).forEach((x, i)=>res.append(h('div', {class:'fitem', style:{flexWrap:'wrap'}},
      h('span', {class:'pill'}, `${X('ص','p')}${E.doc.pages.indexOf(x.p)+1}`), h('s', {dir:'auto', style:{color:'var(--err)'}}, x.wrong), '→', h('b', {dir:'auto', style:{color:'var(--ok)'}}, x.fix),
      h('span', {class:'note', style:{flex:'1 1 100%'}}, x.reason + (x.src==='ai' ? ' · AI' : '')),
      h('button', {class:'btn', onclick:async()=>{ await TX.applyIssue(x); state.issues.splice(state.issues.indexOf(x),1); renderIssues(); TX.renderList(); }}, X('تطبيق','Apply')),
      h('button', {class:'btn', onclick:()=>{ state.issues.splice(state.issues.indexOf(x),1); renderIssues(); }}, X('تجاهل','Ignore'))))); };
  const g3 = h('div', {class:'pgrp'}, h('h3', null, X('التدقيق الإملائي','Proofreading')),
    h('div', {class:'row'}, h('button', {class:'btn', onclick:e=>runScan('local', e.target)}, X('تدقيق سريع','Quick check')), h('button', {class:'btn', onclick:e=>runScan('ai', e.target)}, X('تدقيق بالذكاء الاصطناعي','AI proofread'))),
    h('p', {class:'note'}, X('السريع يعمل على جهازك بقواعد للأخطاء الشائعة بالعربية والإنجليزية. الذكي يرسل نص المستند إلى مزود المساعد المختار.','Quick check runs on your device with common Arabic/English rules. AI proofread sends the document text to the assistant provider you chose.')), res);
  const purge = h('input', {type:'checkbox'}); purge.checked = state.purge; purge.onchange = ()=>{ state.purge = purge.checked; };
  const g4 = h('div', {class:'pgrp'}, h('label', {class:'row note'}, purge, X('حذف النص الأصلي نهائيًا عند الحفظ','Remove the original text permanently on save')),
    h('p', {class:'note'}, X('بدون هذا الخيار يبقى النص الأصلي تحت الغطاء داخل الملف (يمكن نسخه). مع الخيار تتحول الصفحة المعدلة إلى صورة، ويبقى النص الجديد حقيقيًا قابلًا للبحث.','Without this, the original stays under the cover inside the file (it can be copied). With it, the edited page becomes an image and the new text stays real and searchable.')));
  P.append(g1, g2, g3, g4);
  if (state.issues) renderIssues();
  TX.renderList();
};
TX.renderList = async function(){
  const list = document.getElementById('txList'); if (!list || !E.doc) return;
  const p = E.doc.pages[E.cur] || E.doc.pages[0]; const items = await M.getText(E.doc, p);
  list.replaceChildren();
  if (!items.length){ list.append(h('button', {class:'btn primary', onclick:()=>OCR.editorPage(false)}, X('اقرأ نص هذه الصفحة (OCR) لتعديله','Read this page’s text (OCR) to edit it')), h('p', {class:'callout'}, X('لا يوجد نص قابل للتحرير في هذه الصفحة (قد تكون ممسوحة). شغّل OCR أولًا، أو استخدم «إضافة نص».','No editable text on this page (it may be scanned). Run OCR first, or use “Add text”.'))); return; }
  for (const it of items.slice(0, 400)){
    const o = TX.overlayFor(p, it); const inp = h('input', {class:'field', dir:'auto', value:o ? o.text : it.str, style:{flex:1, minWidth:0}, title:it.str});
    const commit = async ()=>{ if (inp.value === (o ? o.text : it.str)) return; await TX.replaceItem(p, it, inp.value); TX.renderList(); };
    inp.addEventListener('keydown', e=>{ e.stopPropagation(); if (e.key==='Enter'){ e.preventDefault(); commit(); } });
    inp.addEventListener('change', commit);
    inp.addEventListener('focus', ()=>{ E.matches = [{p, it}]; E.mi = 0; E.drawMatches(); const el = E.pageEl(p.id); if (el){ const v = $('#viewer'); const top = el.offsetTop + it.y*el.offsetHeight; if (top < v.scrollTop || top > v.scrollTop + v.clientHeight - 60) v.scrollTo({top: top - 120, behavior:'smooth'}); } });
    list.append(h('div', {class:'row', style:{flexWrap:'nowrap'}}, inp, o ? h('button', {class:'ibtn', title:X('استعادة الأصل','Restore original'), 'aria-label':X('استعادة الأصل','Restore original'), onclick:async()=>{ await TX.replaceItem(p, it, it.str); TX.renderList(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>'}) : null));
  }
};
})();
