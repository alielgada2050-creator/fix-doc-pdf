/* وثيق — tool hub: every tool runs locally and returns files */
(function(){
const T = window.Tools = {};
const {h, $, $$} = U;
const { PDFDocument, degrees, rgb, StandardFonts, PDFName } = PDFLib;
const PDF = 'application/pdf,.pdf';
const IMG = 'image/*';
const res = (name, data, mime) => ({name, blob: data instanceof Blob ? data : new Blob([data], {type:mime||'application/pdf'})});
const base = f => U.baseName(f.name);
const sfx = (ar, en) => LANG==='ar' ? ar : en;

T.GROUPS = [
  ['organize', {ar:'تنظيم', en:'Organize'}], ['optimize', {ar:'تحسين', en:'Optimize'}], ['to', {ar:'تحويل إلى PDF', en:'Convert to PDF'}],
  ['from', {ar:'تحويل من PDF', en:'Convert from PDF'}], ['edit', {ar:'تحرير وتوقيع', en:'Edit & sign'}], ['security', {ar:'الأمان', en:'Security'}], ['ai', {ar:'الذكاء الاصطناعي', en:'AI tools'}], ['files', {ar:'الصور والملفات', en:'Images & files'}]
];

/* ---------- helpers ---------- */
T.parseRanges = function(str, n){
  const groups = [];
  for (const part of String(str||'').split(/[,،;]/)){
    const p = part.trim().replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)); if (!p) continue;
    const m = p.match(/^(\d*)\s*-\s*(\d*)$/);
    let a, b; if (m){ a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(p)){ a = b = +p; } else throw new Error(sfx('صيغة النطاق غير صحيحة: ','Invalid range: ')+p);
    a = Math.max(1, a); b = Math.min(n, b); const g = []; for (let i=a;i<=b;i++) g.push(i-1); if (g.length) groups.push(g);
  }
  return groups;
};
async function docOf(file){ return file._doc || M.fromFiles([file]); }
async function pdfOf(doc, task, opts){ return (await M.exportPdf(doc, task, opts)).bytes; }
function subDoc(doc, idxs, name){ const d = new M.Doc(name); d.sources = doc.sources; d.pages = idxs.map(i=>JSON.parse(JSON.stringify(doc.pages[i]))); return d; }
async function zipOf(items, name){ const z = new JSZip(); const used = {}; for (const it of items){ let n = it.name; if (used[n]){ n = U.baseName(n)+'-'+(++used[n])+'.'+U.ext(n);} else used[n]=1; z.file(n, it.blob); } return res(name, await z.generateAsync({type:'blob', compression:'DEFLATE'}), 'application/zip'); }
async function libLoad(file, pw){ const b = new Uint8Array(await file.arrayBuffer()); try { return await PDFDocument.load(b, {password:pw||undefined}); } catch(e){ if (/encrypt/i.test(e.message) && !pw){ const p = await U.askPassword(file.name); if (p==null) throw e; return PDFDocument.load(b, {password:p}); } throw e; } }
function sanitizeHtml(html){
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,link,meta,base,form,input,button,textarea,select,audio,video,source,track,portal,image,use,foreignObject').forEach(e=>e.remove());
  const remote = v => /^\s*(javascript:|vbscript:|data:text\/html|https?:|\/\/)/i.test(v);
  d.querySelectorAll('*').forEach(e=>{ for (const a of [...e.attributes]){ const n = a.name.toLowerCase(), v = a.value;
    if (n.startsWith('on') || n==='srcset' || n==='poster' || n==='background' || n==='formaction' || n==='xlink:href' || n==='ping') e.removeAttribute(a.name);
    else if ((n==='src' || n==='href') && (e.tagName!=='A' || remote(v)) && !(n==='src' && /^data:image\//i.test(v))) e.removeAttribute(a.name);
    else if (n==='style' && /url\s*\(|expression\s*\(|@import/i.test(v)) e.removeAttribute(a.name); } });
  // document CSS: no imports or remote resources, and scoped to the render box so it cannot restyle the app
  const css = [...d.querySelectorAll('style')].map(x=>x.textContent).join('\n').replace(/@import[^;]*;?/gi, '').replace(/url\s*\(\s*(['"]?)(?!data:image\/)[^)]*\1\s*\)/gi, 'none');
  d.querySelectorAll('style').forEach(x=>x.remove());
  return {body:d.body.innerHTML, style: css ? `@scope (.wq-r) {\n${css}\n}` : ''};
}
/* render HTML to a paginated PDF (browser layout → canvas → PDF pages). Layout fidelity is approximate. */
T.htmlToPdf = async function(html, opts={}, task){
  await U.loadScript(U.LIBS.html2canvas); await U.ensureFonts(['IBM Plex Sans Arabic','Amiri','Cairo']);
  const land = opts.orient==='landscape'; const pageW = land ? 1123 : 794; const pageH = land ? 794 : 1123; const pad = opts.pad ?? 48;
  const host = h('div', {style:{position:'fixed', left:'-20000px', top:'0', width:pageW+'px', background:'#fff', color:'#111', padding:pad+'px', fontFamily:'"IBM Plex Sans Arabic", Arial, sans-serif', fontSize:'14px', lineHeight:'1.6', boxSizing:'border-box'}});
  const {body, style} = sanitizeHtml(html);
  host.innerHTML = `<style>${style}\n.wq-r table{border-collapse:collapse;max-width:100%} .wq-r td,.wq-r th{border:1px solid #999;padding:4px 6px;vertical-align:top} .wq-r img{max-width:100%;height:auto} .wq-r pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit}</style><div class="wq-r">${body}</div>`;
  host.dir = U.isAr(host.textContent.slice(0, 2000)) ? 'rtl' : 'ltr';
  document.body.append(host);
  try {
    if (opts.fitWidth){ const sw = host.scrollWidth; if (sw > pageW){ host.style.width = sw+'px'; } }
    await U.sleep(60);
    const totalW = host.offsetWidth; const scaleToPage = totalW / pageW; const pageHpx = pageH*scaleToPage;
    // break candidates at block bottoms
    const hb = host.getBoundingClientRect().top; const cands = new Set([0]);
    host.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,tr,pre,img,blockquote,table,div,br,hr').forEach(e=>{ const r = e.getBoundingClientRect(); cands.add(Math.round(r.bottom - hb)); });
    const sorted = [...cands].sort((a,b)=>a-b); const total = host.scrollHeight; const breaks = [0];
    while (breaks[breaks.length-1] + pageHpx < total){
      const start = breaks[breaks.length-1]; const lim = start + pageHpx - pad*scaleToPage*0.5;
      let best = sorted.filter(y=>y>start+pageHpx*0.5 && y<=lim).pop(); if (!best) best = Math.floor(start + pageHpx - pad*scaleToPage*0.5);
      breaks.push(best);
    }
    task && task.prog(0.3);
    const scale = Math.min(2, 2400/totalW);
    const canvas = await html2canvas(host, {scale, backgroundColor:'#fff', logging:false, useCORS:false, windowWidth: totalW});
    task && task.check();
    const out = await PDFDocument.create(); const ptW = land ? 841.89 : 595.28, ptH = land ? 595.28 : 841.89;
    for (let i=0;i<breaks.length;i++){
      const y0 = breaks[i], y1 = Math.min(total, breaks[i+1] ?? total); if (y1 - y0 < 4) continue;
      const sliceTop = i===0 ? 0 : pad*scaleToPage*0.5; // small top margin on continuation pages
      const c = U.canvas(canvas.width, Math.round(pageHpx*scale)); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(canvas, 0, y0*scale, canvas.width, (y1-y0)*scale, 0, sliceTop*scale, canvas.width, (y1-y0)*scale);
      const jpg = await out.embedJpg(U.dataURLtoBytes(c.toDataURL('image/jpeg', 0.9)));
      const pg = out.addPage([ptW, ptH]); pg.drawImage(jpg, {x:0, y:0, width:ptW, height:ptH});
      task && task.prog(0.3 + 0.6*i/breaks.length);
    }
    return new Uint8Array(await out.save());
  } finally { host.remove(); }
};
/* minimal DOCX writer (paragraphs, page breaks, images) */
T.buildDocx = async function(blocks, landscape){
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const z = new JSZip(); const rels = []; let body = ''; let n = 0;
  for (const b of blocks){
    if (b.type==='br') body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    else if (b.type==='p'){
      const rtl = b.rtl ?? U.isAr(b.text);
      body += `<w:p><w:pPr>${rtl?'<w:bidi/>':''}<w:jc w:val="${rtl?'right':'left'}"/>${b.size?'':''}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${rtl?'<w:rtl/>':''}${b.bold?'<w:b/><w:bCs/>':''}<w:sz w:val="${(b.size||11)*2}"/><w:szCs w:val="${(b.size||11)*2}"/></w:rPr><w:t xml:space="preserve">${esc(b.text)}</w:t></w:r></w:p>`;
    } else if (b.type==='img'){
      n++; const rid = 'rIdImg'+n; z.file(`word/media/image${n}.${b.ext||'png'}`, b.data); rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.${b.ext||'png'}"/>`);
      body += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${b.cx}" cy="${b.cy}"/><wp:docPr id="${n}" name="Page ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${b.cx}" cy="${b.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }
  }
  const pg = landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const margin = blocks.some(b=>b.type==='img') ? 360 : 1134;
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr>${pg}<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
};
/* OCR with Tesseract.js (runs in a web worker inside the browser) */
/* Sandboxed previews cannot fetch .gz files, so the language data also ships as a script and is placed in the
   OCR worker's IndexedDB cache (same keys Tesseract.js uses), letting the worker start without any network fetch. */
function idb(mode, key, val){ return new Promise((res, rej)=>{ const r = indexedDB.open('keyval-store'); r.onupgradeneeded = ()=>r.result.createObjectStore('keyval');
  r.onsuccess = ()=>{ const db = r.result; const tx = db.transaction('keyval', mode); const st = tx.objectStore('keyval'); const q = mode==='readonly' ? st.get(key) : st.put(val, key); tx.oncomplete = ()=>{ db.close(); res(q.result); }; tx.onerror = ()=>rej(tx.error); }; r.onerror = ()=>rej(r.error); }); }
async function preloadLangs(langs, task){
  for (const l of langs.split('+')){
    const key = `./${l}.traineddata`;
    try { if (await idb('readonly', key)) continue; } catch(e){ return; }
    task && task.prog(null, (LANG==='ar'?'تحميل بيانات اللغة ':'Loading language data ')+l);
    await U.loadScript(new URL(((window.WATHIQ_CONFIG||{}).tessdataPath||'tessdata/')+l+'.traineddata.js', location.href).href);
    const b64 = window.__WQ_TESS[l]; const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
    await idb('readwrite', key, a); delete window.__WQ_TESS[l];
  }
}
const cfg0 = () => window.WATHIQ_CONFIG || {};
T.ocrWorker = async function(langs, task){
  await U.loadScript(U.LIBS.tesseract);
  if (U.inArtifact() && cfg0().tessdataPath !== 'cdn') await preloadLangs(langs, task);
  const cfg = window.WATHIQ_CONFIG || {};
  const langPath = new URL(cfg.tessdataPath || 'tessdata/', location.href).href.replace(/\/$/, '');
  /* tessdataPath 'cdn' (standalone HTML / APK without bundled data) uses Tesseract.js' default language CDN */
  const lp = cfg.tessdataPath === 'cdn' ? {} : {langPath, gzip:true};
  return Tesseract.createWorker(langs, 1, {
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    ...lp, cacheMethod: 'write',
    logger: m => { if (task && m.status && typeof m.progress==='number') task.prog(null, m.status+' '+Math.round(m.progress*100)+'%'); }
  });
};

/* ---------- tool definitions ---------- */
const N = (ar, en) => ({ar, en});
T.list = [
  /* organize */
  {id:'merge', g:'organize', ico:'merge', n:N('دمج PDF','Merge PDF'), d:N('اجمع عدة ملفات PDF وصور في ملف واحد بالترتيب الذي تريده.','Combine PDFs and images into one file in your order.'), accept:PDF+','+IMG, multi:true, min:2,
    run: async (files, o, task)=>{ const d = new M.Doc(); for (let i=0;i<files.length;i++){ task.check(); task.prog(i/files.length*0.5); await d.addFile(files[i]); } return [res(sfx('مدمج','merged')+'.pdf', await pdfOf(d, task, {rebuild:true}))]; }},
  {id:'split', g:'organize', ico:'split', n:N('تقسيم PDF','Split PDF'), d:N('افصل كل صفحة، أو كل مجموعة صفحات، في ملف مستقل.','Split every page or page ranges into separate files.'), accept:PDF,
    opts:[{id:'mode', type:'select', label:N('الطريقة','Mode'), def:'ranges', choices:[['ranges',N('حسب النطاقات','By ranges')],['each',N('كل صفحة ملف','Every page')],['every',N('كل عدد ثابت من الصفحات','Every N pages')]]},
      {id:'ranges', type:'text', label:N('النطاقات (مثال: 1-3, 4-6, 7-)','Ranges (e.g. 1-3, 4-6, 7-)'), def:'1-2, 3-', show:o=>o.mode==='ranges'},
      {id:'n', type:'number', label:N('عدد الصفحات في كل ملف','Pages per file'), def:2, min:1, show:o=>o.mode==='every'},
      {id:'zip', type:'check', label:N('ضع الملفات في ZIP واحد','Put files in one ZIP'), def:true}],
    run: async ([f], o, task)=>{ const d = await docOf(f); const n = d.pages.length; let groups;
      if (o.mode==='each') groups = d.pages.map((_,i)=>[i]); else if (o.mode==='every'){ groups=[]; for (let i=0;i<n;i+=+o.n) groups.push([...Array(Math.min(+o.n, n-i)).keys()].map(k=>k+i)); } else groups = T.parseRanges(o.ranges, n);
      if (!groups.length) throw new Error(sfx('لا توجد صفحات ضمن النطاق.','No pages in range.'));
      const out = []; for (let i=0;i<groups.length;i++){ task.check(); task.prog(i/groups.length); const g = groups[i]; out.push(res(`${base(f)}-${g[0]+1}${g.length>1?'-'+(g[g.length-1]+1):''}.pdf`, await pdfOf(subDoc(d, g), new U.Task(), {rebuild:true}))); }
      return o.zip && out.length>1 ? [await zipOf(out, base(f)+'-split.zip')] : out; }},
  {id:'remove', g:'organize', ico:'remove', n:N('حذف صفحات','Remove pages'), d:N('احذف الصفحات التي لا تحتاجها.','Delete the pages you don’t need.'), accept:PDF,
    opts:[{id:'ranges', type:'text', label:N('الصفحات المراد حذفها (مثال: 2, 5-7)','Pages to remove (e.g. 2, 5-7)'), def:'1'}],
    run: async ([f], o, task)=>{ const d = await docOf(f); const rm = new Set(T.parseRanges(o.ranges, d.pages.length).flat()); const keep = d.pages.map((_,i)=>i).filter(i=>!rm.has(i)); if (!keep.length) throw new Error(sfx('لا يمكن حذف كل الصفحات.','Cannot remove every page.')); return [res(base(f)+sfx('-محذوف','-removed')+'.pdf', await pdfOf(subDoc(d, keep), task, {rebuild:true}))]; }},
  {id:'extract', g:'organize', ico:'extract', n:N('استخراج صفحات','Extract pages'), d:N('أنشئ ملفًا جديدًا من صفحات مختارة.','Make a new file from chosen pages.'), accept:PDF,
    opts:[{id:'ranges', type:'text', label:N('الصفحات (مثال: 1, 3-4)','Pages (e.g. 1, 3-4)'), def:'1'}],
    run: async ([f], o, task)=>{ const d = await docOf(f); const idx = T.parseRanges(o.ranges, d.pages.length).flat(); if (!idx.length) throw new Error(sfx('لا توجد صفحات ضمن النطاق.','No pages in range.')); return [res(base(f)+sfx('-مستخرج','-extract')+'.pdf', await pdfOf(subDoc(d, idx), task, {rebuild:true}))]; }},
  {id:'organize', g:'organize', ico:'organize', n:N('ترتيب الصفحات','Organize pages'), d:N('اسحب الصفحات لإعادة ترتيبها، دوّر، كرّر، أدرج صفحات فارغة.','Drag to reorder, rotate, duplicate, insert blank pages.'), accept:PDF+','+IMG, editor:'pages'},
  {id:'rotate', g:'organize', ico:'rotate', n:N('تدوير PDF','Rotate PDF'), d:N('دوّر كل الصفحات أو صفحات محددة.','Rotate all pages or selected pages.'), accept:PDF, multi:true,
    opts:[{id:'deg', type:'select', label:N('الزاوية','Angle'), def:'90', choices:[['90',N('90° يمينًا','90° right')],['270',N('90° يسارًا','90° left')],['180',N('180°','180°')]]}, {id:'ranges', type:'text', label:N('الصفحات (فارغ = الكل)','Pages (empty = all)'), def:''}],
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ const d = await docOf(f); const idx = o.ranges.trim() ? T.parseRanges(o.ranges, d.pages.length).flat() : d.pages.map((_,i)=>i); idx.forEach(i=>d.pages[i].rot = ((d.pages[i].rot||0) + +o.deg)%360); out.push(res(base(f)+sfx('-مدور','-rotated')+'.pdf', await pdfOf(d, task))); } return out; }},
  {id:'crop', g:'organize', ico:'crop', n:N('قص الهوامش','Crop PDF'), d:N('قص هوامش الصفحات بالمليمتر (يُعدّل منطقة العرض دون حذف المحتوى).','Trim page margins in mm (adjusts the visible area).'), accept:PDF,
    opts:[{id:'t', type:'number', label:N('أعلى (مم)','Top (mm)'), def:10, min:0},{id:'b', type:'number', label:N('أسفل (مم)','Bottom (mm)'), def:10, min:0},{id:'l', type:'number', label:N('يسار (مم)','Left (mm)'), def:10, min:0},{id:'r', type:'number', label:N('يمين (مم)','Right (mm)'), def:10, min:0}],
    run: async ([f], o)=>{ const lib = await libLoad(f); const k = 72/25.4; for (const p of lib.getPages()){ const b = p.getCropBox(); const nw = b.width - (+o.l + +o.r)*k, nh = b.height - (+o.t + +o.b)*k; if (nw<20||nh<20) throw new Error(sfx('الهوامش أكبر من الصفحة.','Margins exceed the page.')); p.setCropBox(b.x + +o.l*k, b.y + +o.b*k, nw, nh); p.setMediaBox(b.x + +o.l*k, b.y + +o.b*k, nw, nh); } return [res(base(f)+sfx('-مقصوص','-cropped')+'.pdf', await lib.save())]; }},
  /* optimize */
  {id:'compress', g:'optimize', ico:'compress', n:N('ضغط PDF','Compress PDF'), d:N('قلّل حجم الملف مع اختيار مستوى الجودة.','Reduce file size with a chosen quality level.'), accept:PDF, multi:true,
    opts:[{id:'level', type:'select', label:N('المستوى','Level'), def:'medium', choices:[['lossless',N('خفيف — بدون فقد (يحافظ على النص)','Light — lossless (keeps text)')],['medium',N('متوسط — 120 نقطة/بوصة','Medium — 120 dpi')],['strong',N('قوي — 85 نقطة/بوصة','Strong — 85 dpi')],['gray',N('قوي رمادي — أصغر حجم','Strong grayscale — smallest')]]},
      {id:'_n', type:'note', label:N('المستويات المتوسط والقوي تحوّل الصفحات إلى صور، فيصبح النص غير قابل للتحديد. استخدم OCR بعدها إن احتجت البحث.','Medium and strong turn pages into images, so text is no longer selectable. Run OCR afterwards if you need search.')}],
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ const d = await docOf(f); let bytes;
      if (o.level==='lossless') bytes = await pdfOf(d, task, {rebuild:true});
      else bytes = await M.rasterizeToPdf(d, {dpi: o.level==='medium'?120:85, quality: o.level==='medium'?0.72:0.55, gray:o.level==='gray'}, task);
      const before = f.size, after = bytes.length; const r = res(base(f)+sfx('-مضغوط','-compressed')+'.pdf', bytes);
      r.note = `${U.fmtSize(before)} → ${U.fmtSize(after)} (${after<before?'-':'+'}${Math.abs(Math.round((1-after/before)*100))}%)`; if (after>=before) r.note += sfx(' — الملف الأصلي مضغوط بالفعل',' — the original is already compact');
      out.push(r); } return out; }},
  {id:'repair', g:'optimize', ico:'repair', n:N('إصلاح PDF','Repair PDF'), d:N('أعد بناء ملف تالف جزئيًا لاستعادة ما يمكن قراءته.','Rebuild a partly damaged file to recover what can be read.'), accept:PDF,
    run: async ([f], o, task)=>{ const b = new Uint8Array(await f.arrayBuffer());
      try { const lib = await PDFDocument.load(b, {ignoreEncryption:true, throwOnInvalidObject:false}); const out = await PDFDocument.create(); const pages = await out.copyPages(lib, lib.getPageIndices()); pages.forEach(p=>out.addPage(p)); return [res(base(f)+sfx('-مصلح','-repaired')+'.pdf', await out.save())]; }
      catch(e){ const d = await M.fromBytes(b, f.name); return [res(base(f)+sfx('-مصلح','-repaired')+'.pdf', await M.rasterizeToPdf(d, {dpi:150, quality:0.85}, task))]; } }},
  {id:'ocrdata', g:'optimize', ico:'ocr', n:N('استخراج النصوص والبيانات','Extract text & data'), d:N('اقرأ النص والتواريخ والمبالغ والآيبان والجداول من أي PDF أو صورة، مع فحص الجودة والتصدير إلى Excel.','Read text, dates, amounts, IBANs and tables from any PDF or image, with a quality check and Excel export.'), accept:PDF+','+IMG, multi:true, studio:true},
  {id:'ocrcheck', g:'optimize', ico:'inspect', n:N('فحص عميق للنصوص','Deep text check'), d:N('قارن النص المخفي بما يظهر في الصفحة لكشف النص غير المرئي أو التالف، وراجع الكلمات ضعيفة القراءة.','Compare the hidden text with what the page shows to catch invisible or broken text, and review weakly read words.'), accept:PDF+','+IMG, multi:true, studio:'deep'},
  {id:'ocredit', g:'edit', ico:'edit', n:N('تعديل نص المسح الضوئي','Edit scanned text'), d:N('تعرّف على نص الصور والصفحات الممسوحة ثم عدّل الكلمات في مكانها.','Recognise the text of photos and scanned pages, then edit words in place.'), accept:PDF+','+IMG, editor:'ocr'},
  {id:'ocr', g:'optimize', ico:'ocr', n:N('OCR — التعرف على النص','OCR — text recognition'), d:N('حوّل المسح الضوئي والصور إلى PDF قابل للبحث أو نص، بالعربية والإنجليزية.','Turn scans and photos into searchable PDF or text, Arabic and English.'), accept:PDF+','+IMG, multi:true,
    opts:[{id:'lang', type:'select', label:N('اللغة','Language'), def:'ara+eng', choices:[['ara+eng',N('العربية + الإنجليزية','Arabic + English')],['ara',N('العربية','Arabic')],['eng',N('الإنجليزية','English')]]},
      {id:'out', type:'select', label:N('الناتج','Output'), def:'pdf', choices:[['pdf',N('PDF قابل للبحث','Searchable PDF')],['txt',N('ملف نصي','Text file')],['docx',N('Word (نص)','Word (text)')]]},
      {id:'dpi', type:'select', label:N('الدقة','Resolution'), def:'200', choices:[['150','150 dpi'],['200','200 dpi'],['300',N('300 dpi (أبطأ وأدق)','300 dpi (slower, more accurate)')]]},
      {id:'_n', type:'note', label:N('الدقة تختلف حسب وضوح الصورة ونوع الخط. أول تشغيل يحمّل بيانات اللغة (≈ 4.6 ميجابايت).','Accuracy varies with image clarity and font. The first run loads language data (≈ 4.6 MB).')}],
    run: async (files, o, task)=>{
      const worker = await T.ocrWorker(o.lang, task); task.onCancel = ()=>worker.terminate();
      try {
        const d = new M.Doc(); for (const f of files) await d.addFile(f);
        const outPdf = o.out==='pdf' ? await PDFDocument.create() : null; const texts = [];
        for (let i=0;i<d.pages.length;i++){
          task.check(); task.prog(i/d.pages.length, `${t('page')} ${i+1}/${d.pages.length}`);
          const p = d.pages[i]; const c = await M.renderPage(d, p, +o.dpi/72, null, {print:true});
          const {data} = await worker.recognize(c, {}, {text:true, pdf: !!outPdf});
          texts.push(data.text||'');
          if (outPdf){ const one = await PDFDocument.load(new Uint8Array(data.pdf)); const [pg] = await outPdf.copyPages(one, [0]); const [dw, dh] = M.dispSize(p); const s = pg.getSize(); pg.scale(dw/s.width, dh/s.height); outPdf.addPage(pg); }
        }
        const nm = files.length===1 ? base(files[0]) : 'ocr';
        if (o.out==='pdf') return [res(nm+sfx('-قابل-للبحث','-searchable')+'.pdf', await outPdf.save())];
        if (o.out==='txt') return [res(nm+'.txt', texts.map((x,i)=>`--- ${t('page')} ${i+1} ---\n${x.trim()}`).join('\n\n'), 'text/plain;charset=utf-8')];
        const blocks = []; texts.forEach((x,i)=>{ if (i) blocks.push({type:'br'}); x.split('\n').forEach(l=>blocks.push({type:'p', text:l})); });
        return [res(nm+'.docx', await T.buildDocx(blocks))];
      } finally { try { await worker.terminate(); } catch(e){} }
    }},
  /* convert to PDF */
  {id:'img2pdf', g:'to', ico:'img2pdf', n:N('صور إلى PDF','Images to PDF'), d:N('JPG وPNG وWebP وغيرها إلى PDF مع اختيار الحجم والهوامش.','JPG, PNG, WebP and more to PDF with size and margins.'), accept:IMG, multi:true,
    opts:[{id:'size', type:'select', label:N('حجم الصفحة','Page size'), def:'a4', choices:[['a4','A4'],['letter','Letter'],['image',N('مثل الصورة','Same as image')]]},{id:'orient', type:'select', label:N('الاتجاه','Orientation'), def:'auto', choices:[['auto',N('تلقائي','Auto')],['portrait',N('عمودي','Portrait')],['landscape',N('أفقي','Landscape')]]},{id:'margin', type:'number', label:N('الهامش (نقطة)','Margin (pt)'), def:20, min:0},{id:'single', type:'check', label:N('ملف واحد لكل الصور','One file for all images'), def:true}],
    run: async (files, o, task)=>{ const parts=[]; for (let i=0;i<files.length;i++){ task.check(); task.prog(i/files.length); parts.push(await M.imageToPdfBytes(files[i], {size:o.size, orient:o.orient, margin:+o.margin})); }
      if (!o.single) return parts.map((b,i)=>res(base(files[i])+'.pdf', b));
      const out = await PDFDocument.create(); for (const b of parts){ const l = await PDFDocument.load(b); (await out.copyPages(l, l.getPageIndices())).forEach(p=>out.addPage(p)); } return [res(sfx('صور','images')+'.pdf', await out.save())]; }},
  {id:'word2pdf', g:'to', ico:'word', n:N('Word إلى PDF','Word to PDF'), d:N('حوّل ملفات DOCX إلى PDF مع النصوص العربية والجداول والصور.','Convert DOCX to PDF with Arabic text, tables and images.'), accept:'.docx', multi:true,
    opts:[{id:'_n', type:'note', label:N('التحويل يتم في المتصفح؛ الترويسات والتذييلات والتنسيقات المعقدة قد تختلف عن Word. ملفات .doc القديمة غير مدعومة؛ احفظها بصيغة .docx أولًا.','Runs in the browser; headers, footers and complex layouts may differ from Word. Old .doc files are not supported; save as .docx first.')}],
    run: async (files, o, task)=>{ await U.loadScript(U.LIBS.mammoth); const out=[]; for (const f of files){ task.check(); const r = await mammoth.convertToHtml({arrayBuffer: await f.arrayBuffer()}); out.push(res(base(f)+'.pdf', await T.htmlToPdf(r.value, {}, task))); } return out; }},
  {id:'excel2pdf', g:'to', ico:'excel', n:N('Excel إلى PDF','Excel to PDF'), d:N('حوّل جداول XLSX وCSV إلى PDF، كل ورقة في صفحات.','Convert XLSX and CSV sheets to PDF.'), accept:'.xlsx,.xls,.csv,.ods', multi:true,
    opts:[{id:'orient', type:'select', label:N('الاتجاه','Orientation'), def:'landscape', choices:[['landscape',N('أفقي','Landscape')],['portrait',N('عمودي','Portrait')]]}],
    run: async (files, o, task)=>{ await U.loadScript(U.LIBS.xlsx); const out=[]; for (const f of files){ const wb = XLSX.read(await f.arrayBuffer(), {type:'array', cellDates:true}); let html=''; wb.SheetNames.forEach((sn,i)=>{ html += `<h3>${sn.replace(/</g,'&lt;')}</h3>` + XLSX.utils.sheet_to_html(wb.Sheets[sn], {header:'', footer:''}); });
      out.push(res(base(f)+'.pdf', await T.htmlToPdf(`<style>table{font-size:11px} td{white-space:nowrap}</style>`+html, {orient:o.orient, fitWidth:true, pad:28}, task))); } return out; }},
  {id:'text2pdf', g:'to', ico:'html', n:N('نص / HTML / Markdown إلى PDF','Text / HTML / Markdown to PDF'), d:N('حوّل الملفات النصية وصفحات HTML المحفوظة إلى PDF.','Convert text files and saved HTML pages to PDF.'), accept:'.txt,.html,.htm,.md,.json,.xml', multi:true,
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ const s = await f.text(); const e = U.ext(f.name); let html;
      if (e==='html'||e==='htm') html = s; else if (e==='md') html = T.mdToHtml(s); else html = `<pre>${s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`;
      out.push(res(base(f)+'.pdf', await T.htmlToPdf(html, {}, task))); } return out; }},
  /* convert from PDF */
  {id:'pdf2img', g:'from', ico:'pdf2img', n:N('PDF إلى صور','PDF to images'), d:N('حوّل كل صفحة إلى JPG أو PNG أو WebP.','Turn each page into JPG, PNG or WebP.'), accept:PDF,
    opts:[{id:'fmt', type:'select', label:N('الصيغة','Format'), def:'jpg', choices:[['jpg','JPG'],['png','PNG'],['webp','WebP']]},{id:'dpi', type:'select', label:N('الدقة','Resolution'), def:'150', choices:[['96','96 dpi'],['150','150 dpi'],['200','200 dpi'],['300','300 dpi']]},{id:'ranges', type:'text', label:N('الصفحات (فارغ = الكل)','Pages (empty = all)'), def:''}],
    run: async ([f], o, task)=>{ const d = await docOf(f); const idx = o.ranges.trim() ? T.parseRanges(o.ranges, d.pages.length).flat() : d.pages.map((_,i)=>i); const out=[]; const mime = {jpg:'image/jpeg', png:'image/png', webp:'image/webp'}[o.fmt];
      for (const i of idx){ task.check(); task.prog(out.length/idx.length); const c = await M.renderPage(d, d.pages[i], +o.dpi/72, null, {print:true}); out.push(res(`${base(f)}-${i+1}.${o.fmt}`, await U.canvasBlob(c, mime, 0.9), mime)); }
      return out.length>1 ? [await zipOf(out, base(f)+'-images.zip')] : out; }},
  {id:'pdf2word', g:'from', ico:'word', n:N('PDF إلى Word','PDF to Word'), d:N('استخرج النص إلى DOCX قابل للتحرير، أو صور الصفحات بشكلها.','Extract text into editable DOCX, or page images as-is.'), accept:PDF,
    opts:[{id:'mode', type:'select', label:N('الطريقة','Mode'), def:'text', choices:[['text',N('نص قابل للتحرير','Editable text')],['image',N('صور الصفحات (مطابق للشكل، غير قابل للتحرير)','Page images (same look, not editable)')]]},
      {id:'_n', type:'note', label:N('وضع النص يحافظ على الأسطر والاتجاه، لا على الأعمدة والتنسيق الدقيق. للصفحات الممسوحة استخدم OCR بإخراج Word.','Text mode keeps lines and direction, not exact columns or styling. For scanned pages use OCR with Word output.')}],
    run: async ([f], o, task)=>{ const d = await docOf(f); const blocks=[];
      for (let i=0;i<d.pages.length;i++){ task.check(); task.prog(i/d.pages.length); if (i) blocks.push({type:'br'}); const p = d.pages[i];
        if (o.mode==='image'){ const c = await M.renderPage(d, p, 150/72, null, {print:true}); const [dw, dh] = M.dispSize(p); const maxW = 7.0*914400, maxH = 10.2*914400; const s = Math.min(maxW/(dw/72*914400), maxH/(dh/72*914400)); blocks.push({type:'img', ext:'jpeg', data:U.dataURLtoBytes(c.toDataURL('image/jpeg', 0.85)), cx:Math.round(dw/72*914400*s), cy:Math.round(dh/72*914400*s)}); }
        else { const lines = M.textLines(await M.getText(d, p)); if (!lines.length) blocks.push({type:'p', text: sfx('[لا يوجد نص في هذه الصفحة — قد تكون ممسوحة ضوئيًا]','[No text on this page — it may be scanned]')}); lines.forEach(l=>blocks.push({type:'p', text:l.text, rtl:l.rtl})); } }
      return [res(base(f)+'.docx', await T.buildDocx(blocks))]; }},
  {id:'pdf2excel', g:'from', ico:'excel', n:N('PDF إلى Excel','PDF to Excel'), d:N('استخرج الجداول والنصوص إلى XLSX، كل صفحة في ورقة.','Extract tables and text to XLSX, one sheet per page.'), accept:PDF,
    opts:[{id:'_n', type:'note', label:N('يقسّم الأعمدة حسب المسافات بين النصوص؛ راجع الأعمدة المدمجة أو المقسومة.','Columns are split by gaps between text; review merged or split columns.')}],
    run: async ([f], o, task)=>{ await U.loadScript(U.LIBS.xlsx); const d = await docOf(f); const wb = XLSX.utils.book_new();
      for (let i=0;i<d.pages.length;i++){ task.check(); task.prog(i/d.pages.length); const rows = M.textLines(await M.getText(d, d.pages[i]));
        // build column anchors from all cells on the page
        const cellsRows = rows.map(r=>M.rowCells(r)); const xs = []; cellsRows.flat().forEach(c=>{ if (!xs.some(x=>Math.abs(x-c.x)<0.02)) xs.push(c.x); });
        const rtl = rows.filter(r=>r.rtl).length > rows.length/2; xs.sort((a,b)=> rtl ? b-a : a-b);
        const aoa = cellsRows.map(cs=>{ const row = []; cs.forEach(c=>{ let k = xs.findIndex(x=>Math.abs(x-c.x)<0.02); if (k<0) k = row.length; while (row[k]!=null) k++; row[k] = /^-?[\d,]+(\.\d+)?$/.test(c.text) ? +c.text.replace(/,/g,'') : c.text; }); for (let j=0;j<row.length;j++) if (row[j]==null) row[j]=''; return row; });
        const ws = XLSX.utils.aoa_to_sheet(aoa.length?aoa:[['']]); if (rtl) ws['!views'] = [{RTL:true}]; XLSX.utils.book_append_sheet(wb, ws, `${t('page')} ${i+1}`.slice(0,31)); if (rtl){ wb.Workbook = wb.Workbook || {Views:[{RTL:true}]}; } }
      const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'}); return [res(base(f)+'.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')]; }},
  {id:'pdf2ppt', g:'from', ico:'ppt', n:N('PDF إلى PowerPoint','PDF to PowerPoint'), d:N('كل صفحة تصبح شريحة (صورة عالية الدقة).','Each page becomes a slide (high-resolution image).'), accept:PDF,
    opts:[{id:'_n', type:'note', label:N('الشرائح صور للصفحات؛ النص غير قابل للتحرير داخل PowerPoint.','Slides are page images; text is not editable in PowerPoint.')}],
    run: async ([f], o, task)=>{ await U.loadScript(U.LIBS.pptx); const d = await docOf(f); const pres = new PptxGenJS(); const [w0, h0] = M.dispSize(d.pages[0]);
      pres.defineLayout({name:'PDF', width:10, height:10*h0/w0}); pres.layout = 'PDF'; pres.rtlMode = LANG==='ar';
      for (let i=0;i<d.pages.length;i++){ task.check(); task.prog(i/d.pages.length); const p = d.pages[i]; const [dw, dh] = M.dispSize(p); const c = await M.renderPage(d, p, 150/72, null, {print:true}); const s = pres.addSlide(); const W = 10, H = 10*h0/w0; const sc = Math.min(W/dw, H/dh); s.addImage({data:c.toDataURL('image/jpeg',0.88), x:(W-dw*sc)/2, y:(H-dh*sc)/2, w:dw*sc, h:dh*sc}); }
      const blob = await pres.write({outputType:'blob'}); return [res(base(f)+'.pptx', blob, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')]; }},
  {id:'pdf2txt', g:'from', ico:'md', n:N('PDF إلى نص / Markdown','PDF to text / Markdown'), d:N('استخرج النص بترتيب القراءة.','Extract text in reading order.'), accept:PDF,
    opts:[{id:'fmt', type:'select', label:N('الصيغة','Format'), def:'md', choices:[['md','Markdown'],['txt',N('نص','Text')]]}],
    run: async ([f], o, task)=>{ const d = await docOf(f); let s=''; for (let i=0;i<d.pages.length;i++){ task.prog(i/d.pages.length); const lines = M.textLines(await M.getText(d, d.pages[i])); const maxH = Math.max(0, ...lines.map(l=>l.h));
      s += o.fmt==='md' ? `\n\n<!-- ${t('page')} ${i+1} -->\n\n` : `\n\n--- ${t('page')} ${i+1} ---\n\n`; lines.forEach(l=>{ s += (o.fmt==='md' && l.h > maxH*0.85 && lines.length>3 && l.text.length<90 ? '## ' : '') + l.text + (o.fmt==='md'?'\n\n':'\n'); }); }
      return [res(base(f)+'.'+o.fmt, s.trim(), o.fmt==='md'?'text/markdown;charset=utf-8':'text/plain;charset=utf-8')]; }},
  /* edit */
  {id:'edit', g:'edit', ico:'edit', n:N('تحرير PDF','Edit PDF'), d:N('أضف نصوصًا وصورًا وأشكالًا وتعليقات وروابط، وعدّل النص بالتغطية.','Add text, images, shapes, comments and links; edit text by covering.'), accept:PDF+','+IMG, editor:'edit'},
  {id:'sign', g:'edit', ico:'sign', n:N('توقيع PDF','Sign PDF'), d:N('وقّع بالرسم أو الكتابة أو صورة توقيعك، وأضف الأختام.','Sign by drawing, typing or an image; add stamps.'), accept:PDF+','+IMG, editor:'sign'},
  {id:'forms', g:'edit', ico:'form', n:N('النماذج','PDF forms'), d:N('عبّئ الحقول الموجودة أو أنشئ حقولًا قابلة للتعبئة.','Fill existing fields or create fillable fields.'), accept:PDF, editor:'forms'},
  {id:'numbers', g:'edit', ico:'number', n:N('ترقيم الصفحات','Page numbers'), d:N('أضف أرقام الصفحات بالموضع والصيغة التي تريدها.','Add page numbers in your position and format.'), accept:PDF, multi:true,
    opts:[{id:'pos', type:'select', label:N('الموضع','Position'), def:'bc', choices:[['bc',N('أسفل الوسط','Bottom center')],['br',N('أسفل اليمين','Bottom right')],['bl',N('أسفل اليسار','Bottom left')],['tc',N('أعلى الوسط','Top center')],['tr',N('أعلى اليمين','Top right')],['tl',N('أعلى اليسار','Top left')]]},
      {id:'fmt', type:'select', label:N('الصيغة','Format'), def:'n', choices:[['n','1'],['nt','1 / 10'],['ar',N('صفحة 1 من 10','Page 1 of 10')],['en','Page 1 of 10']]},
      {id:'digits', type:'select', label:N('الأرقام','Digits'), def:'latin', choices:[['latin','1 2 3'],['arabic','١ ٢ ٣']]},
      {id:'start', type:'number', label:N('ابدأ من','Start at'), def:1, min:0},{id:'size', type:'number', label:N('حجم الخط','Font size'), def:11, min:5},{id:'skip', type:'check', label:N('تخطّ الصفحة الأولى','Skip first page'), def:false}],
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ const d = await docOf(f); const tot = d.pages.length - (o.skip?1:0) + (+o.start-1);
      d.pages.forEach((p,i)=>{ if (o.skip && i===0) return; const n = i + +o.start - (o.skip?1:0); let s = {n:`${n}`, nt:`${n} / ${tot}`, ar:`صفحة ${n} من ${tot}`, en:`Page ${n} of ${tot}`}[o.fmt]; if (o.digits==='arabic') s = U.arDigits(s);
        const [dw, dh] = M.dispSize(p); const sz = +o.size; const w = Math.min(0.5, (s.length*sz*0.62+12)/dw), hh = sz*1.4/dh; const mx = 28/dw, my = 22/dh;
        const x = o.pos[1]==='c' ? 0.5-w/2 : o.pos[1]==='r' ? 1-mx-w : mx; const y = o.pos[0]==='b' ? 1-my-hh : my;
        p.objs.push({type:'text', text:s, x, y, w, h:hh, size:sz, font:'IBM Plex Sans Arabic', color:'#222222', align:'center'}); });
      out.push(res(base(f)+sfx('-مرقم','-numbered')+'.pdf', await pdfOf(d, task))); } return out; }},
  {id:'watermark', g:'edit', ico:'watermark', n:N('علامة مائية','Watermark'), d:N('اختم الصفحات بنص أو صورة بشفافية ودوران.','Stamp pages with text or an image, with opacity and rotation.'), accept:PDF, multi:true,
    opts:[{id:'kind', type:'select', label:N('النوع','Type'), def:'text', choices:[['text',N('نص','Text')],['image',N('صورة','Image')]]},
      {id:'text', type:'text', label:N('النص','Text'), def: 'سري — CONFIDENTIAL', show:o=>o.kind==='text'},
      {id:'img', type:'file', label:N('الصورة','Image'), accept:IMG, show:o=>o.kind==='image'},
      {id:'color', type:'color', label:N('اللون','Color'), def:'#b42318', show:o=>o.kind==='text'},
      {id:'size', type:'number', label:N('حجم الخط','Font size'), def:54, min:8, show:o=>o.kind==='text'},
      {id:'opacity', type:'range', label:N('الشفافية','Opacity'), def:0.22, min:0.05, max:1, step:0.05},
      {id:'angle', type:'number', label:N('الزاوية','Angle'), def:-35},
      {id:'layout', type:'select', label:N('التوزيع','Layout'), def:'center', choices:[['center',N('في المنتصف','Center')],['tile',N('متكرر','Tiled')]]}],
    run: async (files, o, task)=>{ let imgId = null; if (o.kind==='image'){ if (!o.img) throw new Error(sfx('اختر صورة العلامة.','Choose a watermark image.')); imgId = await M.addImage(await U.readDataURL(o.img)); }
      await U.ensureFonts(['Cairo']); const out=[];
      for (const f of files){ const d = await docOf(f);
        for (const p of d.pages){ const [dw, dh] = M.dispSize(p); let w, hh;
          if (imgId){ const im = M.imgs[imgId]; w = 0.4; hh = w*dw*(im.height/im.width)/dh; } else { const m = U.measureTextBlock(o.text, U.fontStack('Cairo'), +o.size, true); w = Math.min(1.2, (m.w+10)/dw); hh = (m.h+6)/dh; }
          const mk = (cx, cy)=> imgId ? {type:'image', img:imgId, x:cx-w/2, y:cy-hh/2, w, h:hh, opacity:+o.opacity, rotate:+o.angle} : {type:'text', text:o.text, x:cx-w/2, y:cy-hh/2, w, h:hh, size:+o.size, font:'Cairo', bold:true, color:o.color, align:'center', opacity:+o.opacity, rotate:+o.angle};
          if (o.layout==='tile'){ for (let cy=0.15; cy<1; cy+=0.33) for (let cx=0.25; cx<1; cx+=0.5) p.objs.push(mk(cx, cy)); } else p.objs.push(mk(0.5, 0.5)); }
        out.push(res(base(f)+sfx('-علامة-مائية','-watermarked')+'.pdf', await pdfOf(d, task, {overlayScale:1.6}))); } return out; }},
  {id:'redact', g:'edit', ico:'redact', n:N('حجب المعلومات','Redact PDF'), d:N('أزل النصوص والصور الحساسة نهائيًا من الملف.','Permanently remove sensitive text and images.'), accept:PDF, editor:'redact'},
  {id:'compare', g:'edit', ico:'compare', n:N('مقارنة ملفين','Compare PDFs'), d:N('اعرض الأسطر المضافة والمحذوفة بين نسختين.','Show added and removed lines between two versions.'), accept:PDF, multi:true, min:2, max:2,
    run: async (files, o, task)=>{ const get = async f=>{ const d = await docOf(f); const L=[]; for (let i=0;i<d.pages.length;i++){ (M.textLines(await M.getText(d, d.pages[i]))).forEach(l=>L.push({p:i+1, s:l.text})); } return L; };
      const A = await get(files[0]); task.prog(0.4); const B = await get(files[1]); task.prog(0.7);
      const a = A.slice(0, 4000), b = B.slice(0, 4000); const n = a.length, m = b.length; const dp = Array.from({length:n+1}, ()=>new Uint16Array(m+1));
      for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) dp[i][j] = a[i].s===b[j].s ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
      const rows=[]; let i=0,j=0, add=0, del=0; while (i<n || j<m){ if (i<n && j<m && a[i].s===b[j].s){ rows.push(['=', a[i].p, a[i].s]); i++; j++; } else if (j<m && (i>=n || dp[i][j+1] >= dp[i+1][j])){ rows.push(['+', b[j].p, b[j].s]); j++; add++; } else { rows.push(['-', a[i].p, a[i].s]); i++; del++; } }
      const esc = s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const html = `<!doctype html><meta charset="utf-8"><title>${esc(sfx('مقارنة','Comparison'))}</title><body dir="auto" style="font-family:system-ui,Tahoma;max-width:900px;margin:24px auto;padding:0 16px"><h1>${esc(files[0].name)} ↔ ${esc(files[1].name)}</h1><p>+${add} / −${del}</p>${rows.map(r=>`<div style="padding:2px 8px;border-radius:4px;${r[0]==='+'?'background:#dff3e6':r[0]==='-'?'background:#fde4e1;text-decoration:line-through':''}"><small style="color:#888">${r[0]} p${r[1]}</small> ${esc(r[2])}</div>`).join('')}</body>`;
      const r = res(sfx('مقارنة','comparison')+'.html', html, 'text/html;charset=utf-8'); r.note = `+${add} / −${del}`; return [r]; }},
  /* security */
  {id:'protect', g:'security', ico:'lock', n:N('حماية بكلمة مرور','Protect PDF'), d:N('شفّر الملف بكلمة مرور وحدد صلاحيات الطباعة والنسخ.','Encrypt with a password and set print/copy permissions.'), accept:PDF,
    opts:[{id:'pw', type:'password', label:N('كلمة مرور الفتح','Open password'), def:''},{id:'pw2', type:'password', label:N('تأكيد كلمة المرور','Confirm password'), def:''},{id:'owner', type:'password', label:N('كلمة مرور المالك (اختياري)','Owner password (optional)'), def:''},
      {id:'print', type:'check', label:N('السماح بالطباعة','Allow printing'), def:true},{id:'copy', type:'check', label:N('السماح بنسخ النص','Allow copying'), def:false},{id:'modify', type:'check', label:N('السماح بالتعديل','Allow editing'), def:false},
      {id:'_n', type:'note', label:N('تشفير AES. احتفظ بكلمة المرور؛ لا يمكن استعادتها.','AES encryption. Keep the password; it cannot be recovered.')}],
    run: async ([f], o)=>{ if (!o.pw) throw new Error(sfx('أدخل كلمة مرور.','Enter a password.')); if (o.pw!==o.pw2) throw new Error(sfx('كلمتا المرور غير متطابقتين.','Passwords do not match.'));
      const lib = await libLoad(f); lib.encrypt({userPassword:o.pw, ownerPassword:o.owner||o.pw+'#owner', permissions:{printing:o.print?'highResolution':false, copying:!!o.copy, modifying:!!o.modify, annotating:!!o.modify, fillingForms:true, contentAccessibility:true, documentAssembly:!!o.modify}});
      return [res(base(f)+sfx('-محمي','-protected')+'.pdf', await lib.save())]; }},
  {id:'unlock', g:'security', ico:'unlock', n:N('إزالة كلمة المرور','Unlock PDF'), d:N('احفظ نسخة بدون حماية باستخدام كلمة المرور الصحيحة.','Save an unprotected copy using the correct password.'), accept:PDF,
    opts:[{id:'pw', type:'password', label:N('كلمة المرور','Password'), def:''},{id:'_n', type:'note', label:N('يعمل فقط إذا كنت تعرف كلمة المرور؛ لا يتم كسر الحماية.','Works only with the correct password; protection is not cracked.')}],
    run: async ([f], o)=>{ const lib = await libLoad(f, o.pw); return [res(base(f)+sfx('-مفتوح','-unlocked')+'.pdf', await lib.save())]; }},
  {id:'meta', g:'security', ico:'meta', n:N('البيانات الوصفية','Metadata'), d:N('أزل بيانات المؤلف والبرنامج والتواريخ أو عدّلها.','Remove or edit author, software and dates.'), accept:PDF, multi:true,
    opts:[{id:'mode', type:'select', label:N('الإجراء','Action'), def:'strip', choices:[['strip',N('إزالة كل البيانات الوصفية','Remove all metadata')],['edit',N('تعديل','Edit')]]},
      {id:'title', type:'text', label:N('العنوان','Title'), def:'', show:o=>o.mode==='edit'},{id:'author', type:'text', label:N('المؤلف','Author'), def:'', show:o=>o.mode==='edit'},{id:'subject', type:'text', label:N('الموضوع','Subject'), def:'', show:o=>o.mode==='edit'},{id:'keywords', type:'text', label:N('الكلمات المفتاحية','Keywords'), def:'', show:o=>o.mode==='edit'}],
    run: async (files, o)=>{ const out=[]; for (const f of files){ const lib = await libLoad(f);
      if (o.mode==='strip'){ lib.setTitle(''); lib.setAuthor(''); lib.setSubject(''); lib.setKeywords([]); lib.setCreator(''); lib.setProducer(''); const info = lib.context.trailerInfo.Info; if (info) lib.context.trailerInfo.Info = undefined; lib.catalog.delete(PDFName.of('Metadata')); out.push(res(base(f)+sfx('-بدون-بيانات','-clean')+'.pdf', await lib.save({updateMetadata:false}))); }
      else { if (o.title) lib.setTitle(o.title); if (o.author) lib.setAuthor(o.author); if (o.subject) lib.setSubject(o.subject); if (o.keywords) lib.setKeywords(o.keywords.split(/[,،]/).map(s=>s.trim())); out.push(res(f.name, await lib.save())); } }
      return out; }},
  /* files */
  {id:'imgconv', g:'files', ico:'imgconv', n:N('تحويل صيغ الصور','Convert images'), d:N('JPG ↔ PNG ↔ WebP مع تغيير الحجم والجودة.','JPG ↔ PNG ↔ WebP with resize and quality.'), accept:IMG, multi:true,
    opts:[{id:'fmt', type:'select', label:N('إلى','To'), def:'png', choices:[['png','PNG'],['jpg','JPG'],['webp','WebP']]},{id:'scale', type:'number', label:N('الحجم %','Size %'), def:100, min:5, max:400},{id:'q', type:'range', label:N('الجودة','Quality'), def:0.9, min:0.3, max:1, step:0.05}],
    run: async (files, o, task)=>{ const mime = {png:'image/png', jpg:'image/jpeg', webp:'image/webp'}[o.fmt]; const out=[]; for (const f of files){ task.check(); const im = await U.loadImage(await U.readDataURL(f)); const c = U.canvas(im.naturalWidth*o.scale/100, im.naturalHeight*o.scale/100); const ctx = c.getContext('2d'); if (o.fmt==='jpg'){ ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); } ctx.drawImage(im, 0, 0, c.width, c.height); out.push(res(base(f)+'.'+o.fmt, await U.canvasBlob(c, mime, +o.q), mime)); }
      return out.length>3 ? [await zipOf(out, sfx('صور','images')+'.zip')] : out; }},
  {id:'removebg', g:'files', ico:'bg', n:N('إزالة خلفية التوقيع/الختم','Remove signature/stamp background'), d:N('اجعل خلفية التواقيع والأختام والشعارات المصوّرة شفافة.','Make photographed signature, stamp and logo backgrounds transparent.'), accept:IMG, multi:true,
    opts:[{id:'thr', type:'range', label:N('الحساسية','Sensitivity'), def:38, min:0, max:100, step:1},{id:'clean', type:'check', label:N('تعميق لون الحبر','Deepen ink'), def:true},
      {id:'_n', type:'note', label:N('محلي وسريع، مخصص للخلفيات الفاتحة أو أحادية اللون. الخلفيات المعقدة تحتاج نموذج ذكاء اصطناعي غير مدمج.','Local and fast, for light or single-colour backgrounds. Complex backgrounds need an AI model that is not built in.')}],
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ task.check(); const im = await U.loadImage(await U.readDataURL(f)); const c = U.removeBackground(im, {threshold:+o.thr, clean:o.clean, maxSide:2400}); out.push(res(base(f)+sfx('-شفاف','-transparent')+'.png', await U.canvasBlob(c), 'image/png')); } return out; }},
  {id:'zip', g:'files', ico:'zip', n:N('ضغط ملفات ZIP','Create ZIP'), d:N('اجمع أي ملفات في أرشيف ZIP واحد.','Bundle any files into one ZIP archive.'), accept:'', multi:true,
    run: async (files, o, task)=>[await zipOf(files.map(f=>({name:f.name, blob:f})), (files.length===1?base(files[0]):sfx('ملفات','files'))+'.zip')]},
  {id:'unzip', g:'files', ico:'unzip', n:N('فك ضغط ZIP','Extract ZIP'), d:N('استخرج محتويات أرشيف ZIP واحفظ ما تحتاجه.','Extract a ZIP archive and save what you need.'), accept:'.zip,application/zip',
    run: async ([f], o, task)=>{ const z = await JSZip.loadAsync(await f.arrayBuffer()); const out=[]; const entries = Object.values(z.files).filter(e=>!e.dir); for (let i=0;i<entries.length;i++){ task.check(); task.prog(i/entries.length); const e = entries[i]; out.push(res(e.name.split('/').pop(), await e.async('blob'), '')); } if (!out.length) throw new Error(sfx('الأرشيف فارغ.','Archive is empty.')); return out; }}
];

/* ---------- extra tools (iLovePDF parity) ---------- */
const SRGB_ICC = 'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACwAIABYAEQAYYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c';
/* adaptive threshold for document scans (integral image, window ~ 1/40 of width) */
function scanFilter(c, mode){
  const ctx = c.getContext('2d'); const id = ctx.getImageData(0,0,c.width,c.height); const d = id.data; const W = c.width, H = c.height;
  if (mode==='color'){ // auto-levels per channel (2nd–98th percentile)
    for (let ch=0; ch<3; ch++){ const hist = new Uint32Array(256); for (let i=ch;i<d.length;i+=4) hist[d[i]]++; const tot = W*H; let lo=0, hi=255, acc=0; for (let v=0;v<256;v++){ acc+=hist[v]; if (acc>tot*0.02){ lo=v; break; } } acc=0; for (let v=255;v>=0;v--){ acc+=hist[v]; if (acc>tot*0.02){ hi=v; break; } } const sc = 255/Math.max(1,hi-lo); for (let i=ch;i<d.length;i+=4) d[i] = Math.max(0, Math.min(255, (d[i]-lo)*sc)); }
    ctx.putImageData(id,0,0); return c; }
  const g = new Float32Array(W*H); for (let i=0,k=0;i<d.length;i+=4,k++) g[k] = d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
  if (mode==='gray'){ let lo=255, hi=0; for (const v of g){ if (v<lo) lo=v; if (v>hi) hi=v; } const sc = 255/Math.max(1,hi-lo); for (let k=0,i=0;k<g.length;k++,i+=4){ const v = (g[k]-lo)*sc; d[i]=d[i+1]=d[i+2]=v; } ctx.putImageData(id,0,0); return c; }
  const I = new Float64Array((W+1)*(H+1)); for (let y=1;y<=H;y++){ let row=0; for (let x=1;x<=W;x++){ row += g[(y-1)*W+(x-1)]; I[y*(W+1)+x] = I[(y-1)*(W+1)+x] + row; } }
  const r = Math.max(8, Math.round(W/40)); const C = 12;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const x0=Math.max(0,x-r), x1=Math.min(W,x+r+1), y0=Math.max(0,y-r), y1=Math.min(H,y+r+1); const area=(x1-x0)*(y1-y0);
    const sum = I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0]; const v = g[y*W+x] < sum/area - C ? 0 : 255; const i=(y*W+x)*4; d[i]=d[i+1]=d[i+2]=v; }
  ctx.putImageData(id,0,0); return c;
}
const emu = v => (+v||0)/12700; // EMU → points
async function pptxToPdf(file, task){
  const z = await JSZip.loadAsync(await file.arrayBuffer()); const P = new DOMParser();
  const xml = async path => { const f = z.file(path); return f ? P.parseFromString(await f.async('text'), 'application/xml') : null; };
  const pres = await xml('ppt/presentation.xml'); if (!pres) throw new Error(sfx('ليس ملف PowerPoint صالحًا (.pptx).','Not a valid PowerPoint (.pptx) file.'));
  const sz = pres.getElementsByTagName('p:sldSz')[0]; const SW = emu(sz.getAttribute('cx')), SH = emu(sz.getAttribute('cy'));
  const prels = await xml('ppt/_rels/presentation.xml.rels'); const relMap = {}; [...prels.getElementsByTagName('Relationship')].forEach(r=>relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const ids = [...pres.getElementsByTagName('p:sldId')].map(e=>e.getAttribute('r:id'));
  const out = await PDFDocument.create(); await U.ensureFonts(['IBM Plex Sans Arabic','Readex Pro']);
  const K = Math.min(2.4, 2400/SW);
  for (let n=0;n<ids.length;n++){
    task.check(); task.prog(n/ids.length);
    const path = 'ppt/' + relMap[ids[n]].replace(/^\.\.\//,'').replace(/^\/?ppt\//,''); const doc = await xml(path); if (!doc) continue;
    const srels = await xml(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')); const media = {}; if (srels) [...srels.getElementsByTagName('Relationship')].forEach(r=>media[r.getAttribute('Id')] = r.getAttribute('Target'));
    const c = U.canvas(SW*K, SH*K); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height);
    const bg = doc.querySelector('bg srgbClr, bg solidFill srgbClr'); if (bg){ x.fillStyle = '#'+bg.getAttribute('val'); x.fillRect(0,0,c.width,c.height); }
    const walk = async (node, tr) => {
      for (const el of [...node.children]){
        const tag = el.tagName;
        if (tag==='p:grpSp'){ const xf = el.getElementsByTagName('a:xfrm')[0]; let t2 = tr;
          if (xf){ const off = xf.getElementsByTagName('a:off')[0], ext = xf.getElementsByTagName('a:ext')[0], co = xf.getElementsByTagName('a:chOff')[0], ce = xf.getElementsByTagName('a:chExt')[0];
            if (off && ext && co && ce){ const sx = (+ext.getAttribute('cx')||1)/(+ce.getAttribute('cx')||1), sy = (+ext.getAttribute('cy')||1)/(+ce.getAttribute('cy')||1);
              t2 = {ox: tr.ox + tr.sx*(emu(off.getAttribute('x')) - emu(co.getAttribute('x'))*sx), oy: tr.oy + tr.sy*(emu(off.getAttribute('y')) - emu(co.getAttribute('y'))*sy), sx: tr.sx*sx, sy: tr.sy*sy}; } }
          await walk(el, t2); continue; }
        if (tag!=='p:sp' && tag!=='p:pic') continue;
        const xf = el.getElementsByTagName('a:xfrm')[0]; if (!xf) continue; const off = xf.getElementsByTagName('a:off')[0], ext = xf.getElementsByTagName('a:ext')[0]; if (!off || !ext) continue;
        const bx = (tr.ox + tr.sx*emu(off.getAttribute('x')))*K, by = (tr.oy + tr.sy*emu(off.getAttribute('y')))*K, bw = tr.sx*emu(ext.getAttribute('cx'))*K, bh = tr.sy*emu(ext.getAttribute('cy'))*K;
        if (tag==='p:pic'){ const blip = el.getElementsByTagName('a:blip')[0]; const rid = blip && blip.getAttribute('r:embed'); const tgt = rid && media[rid];
          if (tgt){ const mp = 'ppt/' + tgt.replace(/^\.\.\//,''); const f = z.file(mp); if (f && /\.(png|jpe?g|gif|bmp|webp)$/i.test(mp)){ try { const url = URL.createObjectURL(await f.async('blob')); const im = await U.loadImage(url); x.drawImage(im, bx, by, bw, bh); URL.revokeObjectURL(url); } catch(e){} } }
          continue; }
        const spPr = el.getElementsByTagName('p:spPr')[0]; const fill = spPr && [...spPr.children].find(e=>e.tagName==='a:solidFill'); const fc = fill && fill.getElementsByTagName('a:srgbClr')[0];
        if (fc){ x.fillStyle = '#'+fc.getAttribute('val'); x.fillRect(bx, by, bw, bh); }
        const ln = spPr && spPr.getElementsByTagName('a:ln')[0]; const lc = ln && ln.getElementsByTagName('a:srgbClr')[0]; if (lc){ x.strokeStyle = '#'+lc.getAttribute('val'); x.lineWidth = Math.max(1, emu(ln.getAttribute('w')||12700)*K); x.strokeRect(bx, by, bw, bh); }
        const tb = el.getElementsByTagName('p:txBody')[0]; if (!tb) continue;
        const isTitle = !!el.querySelector('ph[type="title"], ph[type="ctrTitle"]');
        let cy = by + 6*K;
        for (const para of [...tb.getElementsByTagName('a:p')]){
          const runs = [...para.getElementsByTagName('a:r')]; const text = runs.map(r=>r.getElementsByTagName('a:t')[0]?.textContent||'').join('');
          const rp = runs[0] && runs[0].getElementsByTagName('a:rPr')[0]; const sz = rp && rp.getAttribute('sz') ? +rp.getAttribute('sz')/100 : (isTitle ? 36 : 20);
          const col = rp && rp.getElementsByTagName('a:srgbClr')[0]; const algn = (para.getElementsByTagName('a:pPr')[0]||{getAttribute:()=>null}).getAttribute('algn');
          const bullet = !isTitle && para.getElementsByTagName('a:buNone').length===0 && text && !/^ctr|r$/.test(algn||'') ? '• ' : '';
          if (!text){ cy += sz*K*0.6; continue; }
          const hgt = U.drawTextBlock(x, bullet+text, {x:bx+6*K, y:cy, w:bw-12*K, h:bh, font:'"IBM Plex Sans Arabic","Readex Pro",sans-serif', sizePx:sz*K, bold: isTitle || (rp && rp.getAttribute('b')==='1'), color: col ? '#'+col.getAttribute('val') : '#1a1a1a', align: algn==='ctr' ? 'center' : algn==='r' ? 'end' : 'start'});
          cy += hgt + sz*K*0.25; if (cy > by + bh + 40*K) break;
        }
      }
    };
    const tree = doc.getElementsByTagName('p:spTree')[0]; if (tree) await walk(tree, {ox:0, oy:0, sx:1, sy:1});
    const jpg = await out.embedJpg(U.dataURLtoBytes(c.toDataURL('image/jpeg', 0.9))); const pg = out.addPage([SW, SH]); pg.drawImage(jpg, {x:0, y:0, width:SW, height:SH});
  }
  if (!out.getPageCount()) throw new Error(sfx('لا توجد شرائح.','No slides found.'));
  return new Uint8Array(await out.save());
}
async function toPdfA(file, o, task){
  let lib;
  if (o.mode==='raster'){ const d = await docOf(file); lib = await PDFDocument.load(await M.rasterizeToPdf(d, {dpi:200, quality:0.9}, task)); }
  else lib = await libLoad(file);
  const ctx = lib.context; const now = new Date(); const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const title = (lib.getTitle && lib.getTitle()) || base(file); lib.setTitle(title); lib.setProducer('Wathiq PDF'); lib.setCreator('Wathiq PDF'); lib.setCreationDate(now); lib.setModificationDate(now);
  const esc = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:CreatorTool>Wathiq PDF</xmp:CreatorTool><pdf:Producer>Wathiq PDF</pdf:Producer></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const meta = ctx.stream(new TextEncoder().encode(xmp), {Type:'Metadata', Subtype:'XML'}); lib.catalog.set(PDFName.of('Metadata'), ctx.register(meta));
  const icc = ctx.flateStream(Uint8Array.from(atob(SRGB_ICC), c=>c.charCodeAt(0)), {N:3});
  const intent = ctx.obj({Type:'OutputIntent', S:'GTS_PDFA1', OutputConditionIdentifier:PDFLib.PDFString.of('sRGB IEC61966-2.1'), Info:PDFLib.PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile:ctx.register(icc)});
  lib.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]));
  const idh = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
  ctx.trailerInfo.ID = ctx.obj([PDFLib.PDFHexString.of(idh), PDFLib.PDFHexString.of(idh)]);
  return new Uint8Array(await lib.save({useObjectStreams:false}));
}
T.list.push(
  {id:'scan', g:'to', ico:'ocr', capture:true, n:N('مسح ضوئي إلى PDF','Scan to PDF'), d:N('صوّر المستندات بالكاميرا أو اختر الصور، مع تحسين الوضوح والأبيض والأسود وOCR.','Photograph documents or pick images, with clarity, black & white and OCR.'), accept:IMG, multi:true,
    opts:[{id:'mode', type:'select', label:N('التحسين','Enhance'), def:'bw', choices:[['bw',N('مستند أبيض وأسود (أوضح للنص)','Black & white document (sharpest text)')],['gray',N('رمادي','Grayscale')],['color',N('ألوان محسّنة','Enhanced colour')]]},
      {id:'size', type:'select', label:N('حجم الصفحة','Page size'), def:'a4', choices:[['a4','A4'],['letter','Letter'],['image',N('مثل الصورة','Same as image')]]},
      {id:'ocr', type:'check', label:N('اجعل النص قابلًا للبحث (OCR عربي + إنجليزي)','Make text searchable (Arabic + English OCR)'), def:false}],
    run: async (files, o, task)=>{ const out = await PDFDocument.create();
      for (let i=0;i<files.length;i++){ task.check(); task.prog(i/files.length*0.5, `${t('page')} ${i+1}/${files.length}`);
        const im = await U.loadImage(await U.readDataURL(files[i])); const sc = Math.min(1, 2400/Math.max(im.naturalWidth, im.naturalHeight)); const c = U.canvas(im.naturalWidth*sc, im.naturalHeight*sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        scanFilter(c, o.mode); const b = await M.imageToPdfBytes(c.toDataURL(o.mode==='bw'?'image/png':'image/jpeg', 0.88), {size:o.size, orient:'auto', margin:0});
        const l = await PDFDocument.load(b); (await out.copyPages(l, [0])).forEach(p=>out.addPage(p)); }
      let bytes = new Uint8Array(await out.save()); const name = sfx('مسح','scan')+'-'+new Date().toISOString().slice(0,10)+'.pdf';
      if (o.ocr){ const r = await T.list.find(x=>x.id==='ocr').run([new File([bytes], name, {type:'application/pdf'})], {lang:'ara+eng', out:'pdf', dpi:'200'}, task); return [res(name, r[0].blob)]; }
      return [res(name, bytes)]; }},
  {id:'ppt2pdf', g:'to', ico:'ppt', n:N('PowerPoint إلى PDF','PowerPoint to PDF'), d:N('حوّل عروض PPTX إلى PDF، شريحة لكل صفحة.','Convert PPTX presentations to PDF, one slide per page.'), accept:'.pptx', multi:true,
    opts:[{id:'_n', type:'note', label:N('تحويل تقريبي داخل المتصفح: النصوص والصور والأشكال البسيطة والخلفيات. الرسوم البيانية وSmartArt والتأثيرات لا تظهر. للتطابق الكامل افتح الملف من OneDrive واختر → PDF.','Approximate in-browser conversion: text, images, simple shapes and backgrounds. Charts, SmartArt and effects do not appear. For an exact match open the file from OneDrive and choose → PDF.')}],
    run: async (files, o, task)=>{ const out=[]; for (const f of files){ if (U.ext(f.name)!=='pptx') throw new Error(sfx('احفظ الملف بصيغة .pptx أولًا.','Save the file as .pptx first.')); out.push(res(base(f)+'.pdf', await pptxToPdf(f, task))); } return out; }},
  {id:'pdfa', g:'optimize', ico:'zip', n:N('PDF إلى PDF/A','PDF to PDF/A'), d:N('نسخة أرشيفية طويلة الأمد بملف تعريف ألوان وبيانات وصفية قياسية.','A long-term archival copy with a colour profile and standard metadata.'), accept:PDF,
    opts:[{id:'mode', type:'select', label:N('الطريقة','Method'), def:'raster', choices:[['raster',N('أرشيف صور (الأضمن للتوافق؛ النص غير قابل للتحديد)','Image archive (safest compliance; text not selectable)')],['keep',N('الإبقاء على النص (قد لا يجتاز التحقق إن كانت الخطوط غير مضمّنة)','Keep text (may fail validation if fonts are not embedded)')]]},
      {id:'_n', type:'note', label:N('يضيف تعريف PDF/A-2b وملف ألوان sRGB. لم يُتحقق منه بمدقق رسمي مثل veraPDF؛ تحقق منه إن كان مطلوبًا رسميًا.','Adds PDF/A-2b identification and an sRGB profile. Not checked by an official validator such as veraPDF; validate it if formally required.')}],
    run: async ([f], o, task)=>[res(base(f)+'-PDFA.pdf', await toPdfA(f, o, task))]},
  {id:'summarize', g:'ai', ico:'note', n:N('تلخيص PDF','Summarize PDF'), d:N('ملخص ونقاط رئيسية بالأرقام والتواريخ والجهات.','A summary and key points with numbers, dates and parties.'), accept:PDF+',.docx,.txt', ai:'sum'},
  {id:'translate', g:'ai', ico:'html', n:N('ترجمة PDF','Translate PDF'), d:N('ترجمة بين العربية والإنجليزية مع حفظها Word أو PDF.','Translate between Arabic and English and save as Word or PDF.'), accept:PDF+',.docx,.txt', ai:'tr'},
  {id:'chatpdf', g:'ai', ico:'note', n:N('اسأل المستند','Chat with PDF'), d:N('اسأل عن أي معلومة في المستند واحصل على إجابة مع رقم الصفحة.','Ask about anything in the document and get answers with page numbers.'), accept:PDF+',.docx,.txt', ai:'chat'},
  {id:'aitable', g:'ai', ico:'excel', n:N('استخراج الجداول بالذكاء','AI table extraction'), d:N('حوّل الجداول والحقول إلى Excel حتى من النصوص غير المنتظمة.','Turn tables and fields into Excel, even from irregular text.'), accept:PDF+',.docx,.txt', ai:'table'},
  {id:'proofread', g:'ai', ico:'edit', n:N('تدقيق وتصحيح النص','Proofread & fix text'), d:N('اكتشف الأخطاء الإملائية بالعربية والإنجليزية وصحّحها داخل الملف.','Find Arabic and English spelling errors and fix them inside the file.'), accept:PDF, editor:'proof'}
);
T.mdToHtml = function(md){
  const esc = s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return md.split(/\n{2,}/).map(b=>{ b = esc(b.trim()); let m;
    if ((m = b.match(/^(#{1,6})\s+(.*)/))) return `<h${m[1].length}>${m[2]}</h${m[1].length}>`;
    if (/^[-*]\s/.test(b)) return '<ul>'+b.split('\n').map(l=>`<li>${l.replace(/^[-*]\s+/,'')}</li>`).join('')+'</ul>';
    if (/^```/.test(b)) return `<pre>${b.replace(/^```\w*\n?|```$/g,'')}</pre>`;
    return '<p>'+b.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/\n/g,'<br>')+'</p>'; }).join('\n');
};

T.optsForm = function(tool, o, optWrap, pre){ pre = pre||'op_'; const renderOpts = ()=>T.optsForm(tool, o, optWrap, pre); optWrap.innerHTML = '';
    for (const op of (tool.opts||[])){
      if (op.show && !op.show(o)) continue; const id = pre+op.id; let inp;
      if (op.type==='note'){ optWrap.append(h('p', {class:'callout'}, L(op.label))); continue; }
      if (op.type==='select'){ inp = h('select', {class:'field', id}, op.choices.map(c=>h('option', {value:c[0], selected:String(o[op.id])===c[0]}, L(c[1])))); inp.onchange = ()=>{ o[op.id] = inp.value; renderOpts(); }; }
      else if (op.type==='check'){ inp = h('input', {type:'checkbox', id}); inp.checked = !!o[op.id]; inp.onchange = ()=>o[op.id] = inp.checked; optWrap.append(h('label', {class:'row'}, inp, L(op.label))); continue; }
      else if (op.type==='range'){ const v = h('span', {class:'note'}, String(o[op.id])); inp = h('input', {type:'range', id, min:op.min, max:op.max, step:op.step, value:o[op.id]}); inp.oninput = ()=>{ o[op.id] = +inp.value; v.textContent = inp.value; }; optWrap.append(h('div', {class:'row'}, h('label', {for:id}, L(op.label)), inp, v)); continue; }
      else if (op.type==='file'){ inp = h('button', {class:'btn', id}, o[op.id] ? o[op.id].name : t('add_files')); inp.onclick = async ()=>{ const [f] = await U.pickFiles(op.accept); if (f){ o[op.id] = f; renderOpts(); } }; }
      else { inp = h('input', {class:'field', id, type: op.type==='number'?'number':op.type==='password'?'password':op.type==='color'?'color':'text', value:o[op.id]??'', dir:'auto', min:op.min, max:op.max, style:{width: op.type==='text'||op.type==='password' ? '100%' : null}}); if (op.type==='password') inp.autocomplete = 'new-password'; inp.oninput = ()=>o[op.id] = inp.value; }
      optWrap.append(h('div', {style:{display:'flex', flexDirection:'column', gap:'4px'}}, h('label', {for:id, class:'note'}, L(op.label)), inp));
    }
};

/* ---------- hub UI ---------- */
let filter = 'all';
T.renderHub = function(){
  const f = $('#filters'); f.querySelectorAll('.chip').forEach(c=>c.remove());
  const mk = (k, lab)=>{ const b = h('button', {class:'chip', 'aria-pressed':String(filter===k), onclick:()=>{ filter = k; T.renderHub(); }}, lab); f.insertBefore(b, $('#toolSearch')); };
  mk('all', t('all')); T.GROUPS.forEach(([k,l])=>mk(k, L(l)));
  const q = ($('#toolSearch').value||'').trim().toLowerCase(); const grid = $('#toolGrid'); grid.innerHTML = '';
  const colors = {organize:['#e3effd','#1d5fb8'], optimize:['#e5f4ea','#1d7a3e'], to:['#fff1dc','#a15c00'], from:['#f1e8fb','#6b3fa0'], edit:['#d9eeeb','#0e5e57'], security:['#fde4e1','#b42318'], files:['#eceff3','#3b4a5a']};
  for (const [g, gl] of T.GROUPS){
    if (filter!=='all' && filter!==g) continue;
    const tools = T.list.filter(x=>x.g===g && (!q || (L(x.n)+' '+L(x.d)+' '+x.n.en+' '+x.n.ar).toLowerCase().includes(q)));
    if (!tools.length) continue;
    grid.append(h('h2', {class:'group-h'}, L(gl)));
    const wrap = h('div', {class:'tools'});
    tools.forEach(x=>wrap.append(h('button', {class:'tool', 'data-g':g, onclick:()=>T.open(x.id)},
      h('span', {class:'ti', html:U.ico(x.ico)}), h('span', null, h('b', null, L(x.n)), h('span', null, L(x.d))))));
    grid.append(wrap);
  }
};

T.open = async function(id, preset){
  const tool = T.list.find(x=>x.id===id); if (!tool) return;
  if (tool.ai){ let f = preset && preset[0]; if (!f){ [f] = await U.pickFiles(tool.accept); if (!f) return; } App.go('ai'); await Assist.load(f, tool.ai==='chat' ? null : tool.ai); return; }
  if (tool.studio){ await OCR.studio(preset, tool.studio==='deep' ? {mode:'deep'} : null); return; }
  if (tool.editor){
    let files = preset;
    if (!files){ if (E.doc && await U.ask(L(tool.n), t('current_doc')+'?', t('current_doc'))) files = null; else { files = await U.pickFiles(tool.accept, true); if (!files.length) return; } }
    if (files) await App.openFiles(files);
    if (!E.doc) return;
    if (tool.editor==='pages'){ if (innerWidth<=860) E.toggleDrawer('#thumbs'); else $('#thumbs').hidden = false; U.toast(t('thumb_hint')); }
    if (tool.editor==='sign') E.setTool('sign');
    if (tool.editor==='redact') E.setTool('redact');
    if (tool.editor==='forms') E.formsDialog();
    if (tool.editor==='proof') E.showProps('text');
    if (tool.editor==='ocr') await OCR.editorPage(true);
    return;
  }
  let files = preset ? [...preset] : [];
  const o = {}; (tool.opts||[]).forEach(op=>{ if (op.type!=='note') o[op.id] = op.def; });
  const list = h('div', {class:'flist'}); const optWrap = h('div', {style:{display:'flex', flexDirection:'column', gap:'10px'}});
  const prog = h('div', {class:'prog', hidden:true}, h('i')); const progLab = h('div', {class:'note', hidden:true});
  const results = h('div', {class:'flist'});
  const drop = h('div', {class:'drop', style:{minHeight:'110px'}}, h('b', null, t('add_files')), h('small', null, (tool.accept||'*').replace(/application\/pdf,|image\/\*/g, m=>m.includes('pdf')?'PDF ':'Images ')));
  drop.addEventListener('click', async ()=>{ const fs = await U.pickFiles(tool.accept, tool.multi); addFiles(fs); });
  drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', ()=>drop.classList.remove('over'));
  drop.addEventListener('drop', e=>{ e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  const camBtn = tool.capture ? h('button', {class:'btn', onclick:async()=>{ addFiles(await U.pickFiles('image/*', true, true)); }}, X('التقاط بالكاميرا','Use camera')) : null;
  const useCur = E.doc && /pdf/.test(tool.accept) ? h('button', {class:'btn', onclick:async ()=>{ const bytes = await E.currentBytes(); const f = new File([bytes], E.doc.name, {type:'application/pdf'}); addFiles([f]); }}, t('current_doc')) : null;
  function addFiles(fs){ if (!tool.multi) files = fs.slice(0,1); else files.push(...fs); if (tool.max) files = files.slice(0, tool.max); renderList(); }
  function renderList(){ list.innerHTML = ''; files.forEach((f,i)=>list.append(h('div', {class:'fitem'}, h('span', {class:'nm', title:f.name}, f.name), h('span', {class:'sz'}, U.fmtSize(f.size)),
    tool.multi ? h('button', {class:'ibtn', 'aria-label':t('move_up'), onclick:()=>{ if (i>0){ [files[i-1], files[i]] = [files[i], files[i-1]]; renderList(); } }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>'}) : null,
    h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ files.splice(i,1); renderList(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'})))); }
  function renderOpts(){ T.optsForm(tool, o, optWrap); }
  let task = null;
  const m = U.modal(L(tool.n), [h('p', {class:'note'}, L(tool.d)), drop, camBtn, useCur, list, optWrap, prog, progLab, results], [
    {label:t('cancel'), onClick:(close)=>{ if (task){ task.canceled = true; task.onCancel && task.onCancel(); } close(); }},
    {label:t('run'), kind:'primary', id:'runBtn', onClick: async (close, btn)=>{
      if (files.length < (tool.min||1)) return U.toast(tool.min>1 ? (LANG==='ar' ? `أضف ${tool.min} ملفات على الأقل.` : `Add at least ${tool.min} files.`) : t('no_files'));
      btn.disabled = true; prog.hidden = false; progLab.hidden = false; progLab.textContent = t('processing'); results.innerHTML = '';
      task = new U.Task((p, lab)=>{ if (p!=null) prog.firstChild.style.width = Math.round(p*100)+'%'; if (lab) progLab.textContent = lab; });
      try {
        const out = await tool.run(files, o, task);
        prog.firstChild.style.width = '100%'; progLab.textContent = t('done');
        results.append(h('h3', {style:{margin:'4px 0 0', fontSize:'14px'}}, t('results')));
        out.forEach(r=>{ const isPdf = /\.pdf$/i.test(r.name);
          results.append(h('div', {class:'fitem'}, h('span', {class:'nm', title:r.name}, r.name), h('span', {class:'sz'}, r.note || U.fmtSize(r.blob.size)),
            isPdf ? h('button', {class:'btn', onclick:async ()=>{ close(); await App.openFiles([new File([r.blob], r.name, {type:'application/pdf'})]); }}, t('open_in_editor')) : null,
            h('button', {class:'btn primary', onclick:()=>U.saveFile(r.name, r.blob)}, t('download')))); });
        if (out.length===1) U.saveFile(out[0].name, out[0].blob);
      } catch(e){ if (!e.canceled){ console.error(e); U.toast(t('error', {e:e.message||e}), 'err'); progLab.textContent = t('error', {e:e.message||e}); } }
      finally { btn.disabled = false; task = null; }
    }}], {sticky:true});
  renderList(); renderOpts();
};
})();
