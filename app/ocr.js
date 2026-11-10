/* وثيق — OCR studio: read text and data from any PDF or image, check it in depth, edit it.
   Runs locally with Tesseract.js (Arabic + English). Optional AI correction sends a page image to the
   provider chosen in the assistant settings (free tiers: Gemini, Groq, OpenRouter, Mistral, NVIDIA NIM,
   a local model, or the Wathiq proxy) only after the user presses the button and agrees. */
(function(){
const OCR = window.OCR = {};
const {h, $} = U;

/* ---------- text helpers ---------- */
const AR_DIG = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٫':'.','٬':','};
OCR.latinDigits = s => String(s||'').replace(/[٠-٩۰-۹٫٬]/g, c=>AR_DIG[c]);
OCR.norm = s => OCR.latinDigits(s).normalize('NFKC').replace(/[ً-ْٰـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').toLowerCase();
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;
const clean = s => String(s||'').replace(BIDI, '').replace(/\s+/g,' ').trim();
const isArText = s => (String(s).match(/[؀-ۿ]/g)||[]).length > (String(s).match(/[A-Za-z]/g)||[]).length;

/* ---------- image preparation ---------- */
/* grayscale + auto-levels (1st–99th percentile); optional adaptive threshold (Bradley) for shadows and uneven light */
OCR.prep = function(src, {enhance=true, binarize=false, minWidth=1800}={}){
  const up = src.width < minWidth ? Math.min(3, minWidth/src.width) : 1;
  const c = U.canvas(src.width*up, src.height*up); const ctx = c.getContext('2d', {willReadFrequently:true});
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
  if (!enhance && !binarize) return c;
  const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data, n = c.width*c.height;
  const g = new Uint8ClampedArray(n); const hist = new Uint32Array(256);
  for (let i=0, k=0; i<n; i++, k+=4){ const v = (d[k]*299 + d[k+1]*587 + d[k+2]*114)/1000; g[i] = v; hist[g[i]]++; }
  let lo = 0, hi = 255, acc = 0; for (let v=0; v<256; v++){ acc += hist[v]; if (acc > n*0.01){ lo = v; break; } }
  acc = 0; for (let v=255; v>=0; v--){ acc += hist[v]; if (acc > n*0.01){ hi = v; break; } }
  const span = Math.max(1, hi-lo); for (let i=0; i<n; i++) g[i] = Math.max(0, Math.min(255, (g[i]-lo)*255/span));
  if (binarize){
    const W = c.width, H = c.height, S = Math.max(15, Math.round(W/40)|1), T = 0.15; const I = new Float64Array((W+1)*(H+1));
    for (let y=1; y<=H; y++){ let row = 0; for (let x=1; x<=W; x++){ row += g[(y-1)*W + x-1]; I[y*(W+1)+x] = I[(y-1)*(W+1)+x] + row; } }
    const out = new Uint8ClampedArray(n);
    for (let y=0; y<H; y++){ const y0 = Math.max(0, y-S), y1 = Math.min(H-1, y+S);
      for (let x=0; x<W; x++){ const x0 = Math.max(0, x-S), x1 = Math.min(W-1, x+S); const cnt = (x1-x0+1)*(y1-y0+1);
        const sum = I[(y1+1)*(W+1)+x1+1] - I[y0*(W+1)+x1+1] - I[(y1+1)*(W+1)+x0] + I[y0*(W+1)+x0];
        out[y*W+x] = g[y*W+x]*cnt <= sum*(1-T) ? 0 : 255; } }
    g.set(out);
  }
  for (let i=0, k=0; i<n; i++, k+=4){ d[k] = d[k+1] = d[k+2] = g[i]; d[k+3] = 255; }
  ctx.putImageData(im, 0, 0); return c;
};

/* ---------- recognition ---------- */
const WK = {};
let idleT = 0; const touch = () => { clearTimeout(idleT); idleT = setTimeout(()=>OCR.release(), 90000); };
/* workers are reused while OCR is active and freed after 90 s idle (each holds the language model in memory) */
OCR.worker = async function(lang, task){ touch(); if (!WK[lang]) WK[lang] = Tools.ocrWorker(lang, task); try { return await WK[lang]; } catch(e){ delete WK[lang]; throw e; } };
OCR.release = async function(){ for (const k of Object.keys(WK)){ try { (await WK[k]).terminate(); } catch(e){} delete WK[k]; } };
const bboxN = (b, cw, ch) => ({x:b.x0/cw, y:b.y0/ch, w:(b.x1-b.x0)/cw, h:(b.y1-b.y0)/ch});
function flatten(data){
  let lines = [], words = [];
  if (data.blocks && data.blocks.length){ for (const b of data.blocks) for (const p of (b.paragraphs||[])) for (const l of (p.lines||[])){ lines.push(l); for (const w of (l.words||[])) words.push(w); } }
  if (!lines.length && data.lines) lines = data.lines; if (!words.length && data.words) words = data.words;
  return {lines, words};
}
/* OCR one page of a model document. Returns lines/words with page-normalised boxes (0..1) and confidences. */
OCR.page = async function(doc, p, {lang='ara+eng', dpi=220, enhance=true, binarize=false, task}={}){
  const worker = await OCR.worker(lang, task);
  const src = await M.renderPage(doc, p, dpi/72, null, {print:true});
  const c = OCR.prep(src, {enhance, binarize});
  const {data} = await worker.recognize(c, {}, {text:true, blocks:true});
  const {lines, words} = flatten(data);
  const [dw, dh] = M.dispSize(p);
  const L = lines.map((l, k)=>{ const t = clean(l.text); return t ? Object.assign({str:t, conf:Math.round(l.confidence||0), k}, bboxN(l.bbox, c.width, c.height)) : null; }).filter(Boolean);
  const Wd = words.map(w=>Object.assign({str:clean(w.text), conf:Math.round(w.confidence||0)}, bboxN(w.bbox, c.width, c.height))).filter(w=>w.str);
  // second pass: lines that are Latin/digits inside a mixed Arabic+English page (IBANs, e-mails, codes) are re-read with the English model
  if (/ara/.test(lang) && /eng/.test(lang)){
    for (const l of L){ const ar = (l.str.match(/[\u0600-\u06FF]/g)||[]).length, la = (l.str.match(/[A-Za-z0-9@]/g)||[]).length;
      if (!(ar <= 3 && la >= 6 && (ar > 0 || /[A-Za-z]/.test(l.str) && l.conf < 85))) continue;
      try { const ew = await OCR.worker('eng', task); const pad = 6;
        const rect = {left:Math.max(0, Math.floor(l.x*c.width)-pad), top:Math.max(0, Math.floor(l.y*c.height)-pad), width:Math.min(c.width, Math.ceil(l.w*c.width)+2*pad), height:Math.min(c.height, Math.ceil(l.h*c.height)+2*pad)};
        const r2 = (await ew.recognize(c, {rectangle:rect}, {text:true, blocks:true})).data; const t2 = clean(r2.text);
        if (t2 && (r2.confidence||0) >= l.conf - 5){
          const inLine = w => { const cx = w.x + w.w/2, cy = w.y + w.h/2; return cx>=l.x && cx<=l.x+l.w && cy>=l.y && cy<=l.y+l.h; };
          for (let k=Wd.length-1; k>=0; k--) if (inLine(Wd[k])) Wd.splice(k, 1);
          flatten(r2).words.forEach(w=>{ const tx = clean(w.text); if (tx) Wd.push(Object.assign({str:tx, conf:Math.round(w.confidence||0), latin:true}, bboxN(w.bbox, c.width, c.height))); });
          l.str = t2; l.conf = Math.round(r2.confidence||l.conf); l.refined = true; } } catch(e){ console.warn('ocr refine', e); }
    }
  }
  const conf = Wd.length ? Math.round(Wd.reduce((a,w)=>a+w.conf*w.str.length, 0)/Math.max(1, Wd.reduce((a,w)=>a+w.str.length, 0))) : 0;
  touch();
  return {lines:L, words:Wd, text:L.map(l=>l.str).join('\n'), conf, srcW:src.width, srcH:src.height, dw, dh, rtl:isArText(data.text||'')};
};
/* attach OCR lines to a page so search, the text editor and export treat them like real text */
OCR.attach = function(p, r, lang){
  const [, dh] = M.dispSize(p);
  p.ocrItems = {rot:M.R(p), lang, conf:r.conf, items:r.lines.map((l, k)=>({i:100000+k, str:l.str, x:l.x, y:l.y, w:l.w, h:l.h, size:l.h*dh*0.78, font:'', fontName:'', dir:isArText(l.str)?'rtl':'ltr', ocr:true, conf:l.conf}))};
};
/* plain text of a whole document, OCR-ing pages that have no text layer (used by the assistant) */
OCR.textOfDoc = async function(doc, onProg, lang='ara+eng'){
  let out = '';
  for (let i=0; i<doc.pages.length; i++){ const p = doc.pages[i]; let items = await M.getText(doc, p);
    if (!items.length){ onProg && onProg(i, doc.pages.length); const r = await OCR.page(doc, p, {lang}); OCR.attach(p, r, lang); items = p.ocrItems.items; }
    out += `\n[${X('صفحة','Page')} ${i+1}]\n` + M.textLines(items).map(l=>l.text).join('\n'); }
  return out.trim();
};

/* ---------- data detection ---------- */
const mod97 = s => { const r = (s.slice(4)+s.slice(0,4)).toUpperCase().replace(/[A-Z]/g, c=>c.charCodeAt(0)-55); let m = 0; for (const ch of r) m = (m*10 + +ch) % 97; return m===1; };
const pad2 = n => String(n).padStart(2,'0');
const TYPES = {
  date:{ar:'تاريخ', en:'Date'}, hijri:{ar:'تاريخ هجري', en:'Hijri date'}, amount:{ar:'مبلغ', en:'Amount'}, percent:{ar:'نسبة', en:'Percent'}, email:{ar:'بريد', en:'Email'},
  phone:{ar:'هاتف', en:'Phone'}, url:{ar:'رابط', en:'Link'}, iban:{ar:'آيبان', en:'IBAN'}, vat:{ar:'رقم ضريبي', en:'VAT no.'}, natid:{ar:'هوية/إقامة', en:'ID/Iqama'},
  cr:{ar:'سجل تجاري', en:'CR no.'}, ref:{ar:'رقم مرجعي', en:'Reference'}, field:{ar:'حقل', en:'Field'}
};
OCR.TYPES = TYPES;
OCR.entities = function(text, page){
  const out = []; const T = OCR.latinDigits(String(text||'').replace(BIDI,'')); const seen = new Set();
  const add = (type, value, norm, extra) => { const k = type+'|'+(norm||value); if (seen.has(k)) return; seen.add(k); out.push(Object.assign({type, value:value.trim(), norm:norm||value.trim(), page}, extra)); };
  let m;
  const R = (re, fn) => { re.lastIndex = 0; while ((m = re.exec(T))) fn(m); };
  R(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m=>add('email', m[0], m[0].toLowerCase()));
  R(/\bhttps?:\/\/[^\s<>"'،]+|\bwww\.[^\s<>"'،]+/gi, m=>add('url', m[0]));
  R(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, m=>{ const s = m[0].replace(/\s/g,''); if (s.length>=15 && s.length<=34) add('iban', m[0], s, {valid:mod97(s)}); });
  // IBAN whose country letters were misread (common in Arabic lines): label + 2 check digits + 20 digits, kept only if the checksum passes
  R(/(?:IBAN|آيبان|الآيبان|ايبان|الحساب)[^\n\d]{0,12}(\d{2}(?:\s?\d{4}){5})(?!\d)/gi, m=>{ const s = 'SA'+m[1].replace(/\s/g,''); if (!seen.has('iban|'+s) && mod97(s)) add('iban', m[0], s, {valid:true, fixed:true}); });
  R(/(?<![\d+])(?:\+?966|00966|0)?5\d{8}(?!\d)/g, m=>add('phone', m[0], '+966'+m[0].replace(/^(\+?966|00966|0)/,'')));
  R(/(?<!\d)(?:\+|00)(?!966)\d{8,14}(?!\d)/g, m=>add('phone', m[0], '+'+m[0].replace(/^(\+|00)/,'')));
  R(/(?<!\d)3\d{13}3(?!\d)/g, m=>add('vat', m[0]));
  R(/(?:سجل\s*تجاري|السجل\s*التجاري|C\.?\s?R\.?\s*(?:No\.?)?)\s*[:#.]?\s*(\d{10})(?!\d)/gi, m=>add('cr', m[1]));
  R(/(?<!\d)[12]\d{9}(?!\d)/g, m=>{ if (!seen.has('cr|'+m[0])) add('natid', m[0]); });
  R(/(?<!\d)((?:19|20)\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])(?!\d)/g, m=>add('date', m[0], `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`));
  R(/(?<!\d)(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.]((?:19|20)\d{2})(?!\d)/g, m=>add('date', m[0], `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`));
  R(/(?<!\d)(?:(1[34]\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|30)|(0?[1-9]|[12]\d|30)[-/.](0?[1-9]|1[0-2])[-/.](1[34]\d{2}))(?!\d)\s*(?:هـ|ه)?/g, m=>{ const y = m[1]||m[6], mo = m[2]||m[5], d = m[3]||m[4]; add('hijri', m[0], `${y}-${pad2(mo)}-${pad2(d)}`); });
  const CUR = '(?:ر\\.?\\s?س\\.?|ريال(?:اً|ًا)?|SAR|SR|USD|EUR|AED|درهم|جنيه|دولار|\\$|€)';
  R(new RegExp(`(?:(${CUR})\\s?)?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)\\s?(${CUR})?`, 'g'), m=>{ if (!m[1] && !m[3]) return; const cur = (m[1]||m[3]).replace(/\s/g,''); const v = +m[2].replace(/,/g,''); if (!isFinite(v)) return;
    const code = /ر\.?س|ريال|SAR|SR/i.test(cur) ? 'SAR' : /\$|USD|دولار/.test(cur) ? 'USD' : /€|EUR/.test(cur) ? 'EUR' : /AED|درهم/.test(cur) ? 'AED' : /جنيه/.test(cur) ? 'EGP' : cur; add('amount', m[0], `${v} ${code}`, {num:v, currency:code}); });
  // totals written without a readable currency: keyword + number on the same line
  for (const line of T.split('\n')){ const mm = line.match(/(الإجمالي|الاجمالي|المجموع|المبلغ|الصافي|الضريبة|الخصم|Total|Subtotal|Amount|VAT|Net|Balance)[^\d\n]{0,20}?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2})|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2})[^\d\n]{0,12}?(الإجمالي|الاجمالي|المجموع|المبلغ|الصافي|الضريبة|الخصم)/i);
    if (mm){ const num = +(mm[2]||mm[3]).replace(/,/g,''); if (isFinite(num) && !out.some(e=>e.type==='amount' && e.num===num)) add('amount', line.trim(), String(num), {num, currency:'', label:mm[1]||mm[4]}); } }
  R(/(\d+(?:\.\d+)?)\s?[%٪]/g, m=>add('percent', m[0], m[1]+'%'));
  R(/(?:رقم\s+(?:المعاملة|الخطاب|القيد|الفاتورة|العقد|الطلب|المرجع|الصادر|الوارد)|المرجع|الرقم|Ref(?:erence)?\.?|Invoice\s*(?:No\.?|#)|Order\s*(?:No\.?|#))\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,})/gi, m=>add('ref', m[0], m[1]));
  // label: value lines
  for (const line of String(text).replace(BIDI,'').split('\n')){ const mm = line.match(/^\s*([^:：\d][^:：]{1,40}?)\s*[:：]\s*(.{1,120}?)\s*$/); if (mm && mm[1].trim().split(/\s+/).length<=5 && /[\p{L}\p{N}]/u.test(mm[2])) add('field', mm[2], mm[2].trim(), {label:mm[1].trim()}); }
  return out;
};

/* ---------- tables from word boxes ---------- */
OCR.tables = function(words, rtl){
  if (!words || words.length < 6) return [];
  const hs = words.map(w=>w.h).sort((a,b)=>a-b); const mh = hs[Math.floor(hs.length/2)] || 0.01;
  const rows = []; for (const w of words.slice().sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2))){ const cy = w.y+w.h/2; let r = rows.find(r=>Math.abs(r.cy-cy) < mh*0.6); if (!r){ r = {cy, ws:[]}; rows.push(r); } r.ws.push(w); }
  rows.sort((a,b)=>a.cy-b.cy);
  const gapMin = mh*1.6;
  const cellsOf = r => { const ws = r.ws.slice().sort((a,b)=>rtl ? (b.x+b.w)-(a.x+a.w) : a.x-b.x); const cells = []; let cur = null, edge = 0;
    for (const w of ws){ const gap = rtl ? edge - (w.x+w.w) : w.x - edge; if (!cur || gap > gapMin){ cur = {t:[], x0:w.x, x1:w.x+w.w}; cells.push(cur); } cur.t.push(w.str); cur.x0 = Math.min(cur.x0, w.x); cur.x1 = Math.max(cur.x1, w.x+w.w); edge = rtl ? w.x : w.x+w.w; }
    return cells.map(c=>({text:c.t.join(' '), cx:(c.x0+c.x1)/2})); };
  rows.forEach(r=>r.cells = cellsOf(r));
  const tables = []; let run = [];
  const flush = () => { if (run.length >= 3){ const anchor = run.reduce((a,r)=>r.cells.length>a.cells.length?r:a, run[0]).cells.map(c=>c.cx);
      const grid = run.map(r=>{ const row = anchor.map(()=>''); r.cells.forEach(c=>{ let bi = 0, bd = 9; anchor.forEach((ax,i)=>{ const dd = Math.abs(ax-c.cx); if (dd<bd){ bd = dd; bi = i; } }); row[bi] = row[bi] ? row[bi]+' '+c.text : c.text; }); return row; });
      tables.push({columns:grid[0].map((c,i)=>c||`${X('عمود','Col')} ${i+1}`), rows:grid.slice(1)}); } run = []; };
  for (const r of rows){ if (r.cells.length >= 2 && (!run.length || Math.abs(r.cells.length - run[run.length-1].cells.length) <= 1)) run.push(r); else { flush(); if (r.cells.length >= 2) run.push(r); } }
  flush(); return tables;
};

/* ---------- deep check ---------- */
const bigrams = s => { const t = OCR.norm(s).replace(/\s+/g,''); const m = new Map(); for (let i=0;i<t.length-1;i++){ const b = t.slice(i,i+2); m.set(b, (m.get(b)||0)+1); } return m; };
OCR.similarity = function(a, b){ const A = bigrams(a), B = bigrams(b); let inter = 0, na = 0, nb = 0; A.forEach(v=>na+=v); B.forEach(v=>nb+=v); A.forEach((v,k)=>{ inter += Math.min(v, B.get(k)||0); }); return na+nb ? 2*inter/(na+nb) : 1; };
const wordSet = s => new Set(OCR.norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3));
OCR.check = function(pg){
  const issues = [];
  const low = pg.words.filter(w=>w.conf < 60);
  if (pg.words.length && pg.conf < 70) issues.push({sev:'high', msg:X(`ثقة القراءة منخفضة (${pg.conf}%). جرّب دقة 300 أو «تحسين قوي» أو التصحيح بالذكاء.`,`Low reading confidence (${pg.conf}%). Try 300 dpi, strong enhancement, or AI correction.`)});
  if (low.length) issues.push({sev: low.length > pg.words.length*0.15 ? 'high' : 'med', msg:X(`${low.length} كلمة بثقة أقل من 60% — مظللة بالأحمر في المعاينة.`,`${low.length} word(s) below 60% confidence — shaded red in the preview.`)});
  const mixed = pg.words.filter(w=>/[؀-ۿ]/.test(w.str) && /[A-Za-z]/.test(w.str));
  if (mixed.length) issues.push({sev:'med', msg:X(`${mixed.length} كلمة تخلط حروفًا عربية ولاتينية (غالبًا خطأ قراءة): `,`${mixed.length} word(s) mix Arabic and Latin letters (usually misreads): `) + mixed.slice(0,6).map(w=>w.str).join('، ')});
  if (/[٠-٩]/.test(pg.text) && /\d/.test(pg.text.replace(/[٠-٩]/g,''))) issues.push({sev:'low', msg:X('الأرقام مكتوبة بالنظامين العربي والهندي معًا؛ وُحّدت في «البيانات».','Digits appear in both Arabic-Indic and Latin forms; they are unified under Data.')});
  if (pg.srcW && pg.srcW < 1000) issues.push({sev:'med', msg:X('دقة الصورة منخفضة؛ النتائج أفضل مع صورة أوضح أو مسح 300 dpi.','The image resolution is low; a sharper photo or 300 dpi scan reads better.')});
  if (pg.layer != null){
    if (!pg.layer.trim()) issues.push({sev:'low', msg:X('لا توجد طبقة نص أصلية؛ النص كله من OCR.','No original text layer; all text comes from OCR.')});
    else { const s = OCR.similarity(pg.layer, pg.text); pg.layerSim = Math.round(s*100);
      const A = wordSet(pg.layer), B = wordSet(pg.text); const onlyLayer = [...A].filter(w=>!B.has(w)); const onlyImg = [...B].filter(w=>!A.has(w));
      if (s < 0.6) issues.push({sev:'high', msg:X(`طبقة النص المخفية لا تطابق ما يظهر في الصفحة (تطابق ${pg.layerSim}%). قد تحتوي نصًا غير مرئي أو ترميز خط تالفًا.`,`The hidden text layer does not match what the page shows (${pg.layerSim}% match). It may hold invisible text or a broken font encoding.`), detail:{onlyLayer:onlyLayer.slice(0,30), onlyImg:onlyImg.slice(0,30)}});
      else issues.push({sev:'ok', msg:X(`طبقة النص تطابق المحتوى المرئي (${pg.layerSim}%).`,`The text layer matches the visible content (${pg.layerSim}%).`), detail: onlyLayer.length ? {onlyLayer:onlyLayer.slice(0,20)} : null}); }
  }
  if (!issues.length) issues.push({sev:'ok', msg:X('لم تُرصد مشكلات واضحة.','No obvious problems found.')});
  return issues;
};

/* ---------- AI correction (vision) ---------- */
OCR.aiFix = async function(pg, doc, signal){
  const src = await M.renderPage(doc, doc.pages[pg.idx], 1.6, null, {print:true});
  const k = Math.min(1, 1600/Math.max(src.width, src.height)); const c = U.canvas(src.width*k, src.height*k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r=>c.toBlob(r, 'image/jpeg', 0.85));
  const prompt = X(
    `هذه صورة صفحة ومعها نص قرأه برنامج OCR وقد يحتوي أخطاء. اقرأ الصورة بعناية وأعد JSON فقط بالشكل:
{"text":"النص الصحيح كاملًا بنفس ترتيب الأسطر","fields":[{"label":"","value":""}],"tables":[{"title":"","columns":[],"rows":[[]]}],"notes":["ملاحظات عن أجزاء غير واضحة"]}
لا تخترع نصًا غير موجود في الصورة، وضع [غير واضح] مكان ما لا يُقرأ. حافظ على الأرقام كما هي.
نص OCR:
${pg.text.slice(0, 12000)}`,
    `This is a page image plus text read by OCR that may contain errors. Read the image carefully and return JSON only:
{"text":"the full correct text in the same line order","fields":[{"label":"","value":""}],"tables":[{"title":"","columns":[],"rows":[[]]}],"notes":["notes about unclear parts"]}
Do not invent text that is not in the image; write [unclear] where it can't be read. Keep numbers exactly.
OCR text:
${pg.text.slice(0, 12000)}`);
  return Assist.vision(prompt, [blob], {json:true, signal});
};

/* ---------- run over files ---------- */
OCR.run = async function(files, o, task){
  const doc = new M.Doc(); for (const f of files) await doc.addFile(f);
  doc.name = files.length===1 ? files[0].name : 'ocr.pdf';
  const pages = [];
  for (let i=0; i<doc.pages.length; i++){
    task.check(); task.prog(i/doc.pages.length, `${t('page')} ${i+1}/${doc.pages.length}`);
    const p = doc.pages[i]; const layerItems = await M.getText(doc, p); const layer = layerItems.length ? M.textLines(layerItems).map(l=>l.text).join('\n') : (p.s==null ? null : '');
    let pg;
    if (layerItems.length && o.mode==='auto'){ pg = {idx:i, text:layer, lines:M.textLines(layerItems).map(l=>({str:l.text, conf:100, x:Math.min(...l.items.map(x=>x.x)), y:Math.min(...l.items.map(x=>x.y)), w:0, h:0})), words:layerItems.map(it=>({str:it.str, conf:100, x:it.x, y:it.y, w:it.w, h:it.h})), conf:100, fromLayer:true, rtl:isArText(layer)}; }
    else { const r = await OCR.page(doc, p, {lang:o.lang, dpi:+o.dpi, enhance:o.prep!=='none', binarize:o.prep==='strong', task}); pg = Object.assign({idx:i, layer}, r); OCR.attach(p, r, o.lang); }
    pg.entities = OCR.entities(pg.text, i+1); pg.tables = OCR.tables(pg.words, pg.rtl); pg.issues = pg.fromLayer ? [{sev:'ok', msg:X('نص أصلي من طبقة النص (بدون OCR). اختر «فحص عميق» لمقارنته بما يظهر.','Original text from the text layer (no OCR). Choose “Deep check” to compare it with what is shown.')}] : OCR.check(pg);
    pages.push(pg);
  }
  task.prog(1); return {doc, pages, files};
};

/* ---------- exports ---------- */
const allEntities = R => R.pages.flatMap(p=>p.entities);
OCR.toXlsx = async function(R){
  await U.loadScript(U.LIBS.xlsx); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[X('الصفحة','Page'), X('النص','Text'), X('الثقة %','Confidence %')], ...R.pages.map(p=>[p.idx+1, p.text, p.conf])]), X('النص','Text'));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[X('النوع','Type'), X('الحقل','Label'), X('القيمة كما وردت','Value as read'), X('القيمة الموحدة','Normalised'), X('الصفحة','Page'), X('ملاحظة','Note')], ...allEntities(R).map(e=>[L(TYPES[e.type]), e.label||'', e.value, e.norm, e.page, e.valid===false ? X('رقم تحقق غير صحيح','Checksum fails') : ''])]), X('البيانات','Data'));
  let n = 0; R.pages.forEach(p=>p.tables.forEach(tb=>{ n++; XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tb.columns, ...tb.rows]), (X('جدول','Table')+' '+n+' p'+(p.idx+1)).slice(0,31)); }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[X('الصفحة','Page'), X('الكلمة','Word'), X('الثقة %','Confidence %')], ...R.pages.flatMap(p=>p.words.filter(w=>w.conf<75).map(w=>[p.idx+1, w.str, w.conf]))]), X('كلمات للمراجعة','Words to review'));
  const out = XLSX.write(wb, {bookType:'xlsx', type:'array'}); return new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
};
OCR.toJson = R => new Blob([JSON.stringify({file:R.doc.name, pages:R.pages.map(p=>({page:p.idx+1, confidence:p.conf, fromTextLayer:!!p.fromLayer, text:p.text, entities:p.entities, tables:p.tables, issues:p.issues.map(i=>({severity:i.sev, message:i.msg})), aiCorrected:!!p.ai}))}, null, 2)], {type:'application/json'});
OCR.toTxt = R => new Blob([R.pages.map(p=>`--- ${t('page')} ${p.idx+1} ---\n${p.text}`).join('\n\n')], {type:'text/plain;charset=utf-8'});

/* ---------- studio UI ---------- */
const sevCls = {high:'s-rejected', med:'s-review', low:'s-draft', ok:'s-approved'};
OCR.studio = async function(preset, over){
  let files = preset; if (!files){ files = await U.pickFiles('application/pdf,image/*,.pdf', true); if (!files.length) return; }
  files = files.filter(f=>M.isPdf(f) || M.isImage(f)); if (!files.length) return U.toast(X('اختر ملف PDF أو صورة.','Choose a PDF or an image.'), 'err');
  const o = Object.assign({lang:'ara+eng', dpi:'220', prep:'auto', mode:'auto'}, U.store.get('ocrStudio', {}), over||{});
  let R = null, tab = 'text', cur = 0, task = null;
  const body = h('div', {class:'ocrs'});
  const m = U.modal(X('استخراج النصوص والبيانات','Extract text & data')+' — '+files.map(f=>f.name).join('، '), body, [], {xl:true, sticky:true, onClose:()=>{ task && (task.canceled = true); setTimeout(()=>OCR.release(), 1500); }});
  const sel = (id, label, val, choices) => { const s = h('select', {class:'field', id}, choices.map(([v,l])=>h('option', {value:v, selected:v===val}, l))); return [h('label', {class:'note', for:id}, label), s]; };
  const [lL, sLang] = sel('osLang', X('اللغة','Language'), o.lang, [['ara+eng',X('عربي + إنجليزي','Arabic + English')],['ara',X('عربي','Arabic')],['eng',X('إنجليزي','English')]]);
  const [lD, sDpi] = sel('osDpi', X('الدقة','Resolution'), o.dpi, [['160',X('سريع','Fast')],['220',X('متوازن','Balanced')],['300',X('دقيق (أبطأ)','Accurate (slower)')]]);
  const [lP, sPrep] = sel('osPrep', X('تحسين الصورة','Image clean-up'), o.prep, [['auto',X('تلقائي (تباين)','Auto (contrast)')],['strong',X('قوي (ظلال وإضاءة غير متساوية)','Strong (shadows, uneven light)')],['none',X('بدون','None')]]);
  const [lM, sMode] = sel('osMode', X('صفحات بها نص أصلي','Pages with real text'), o.mode, [['auto',X('استخدم النص الأصلي','Use the original text')],['deep',X('فحص عميق: OCR ومقارنة','Deep check: OCR and compare')]]);
  const prog = h('div', {class:'prog', hidden:true}, h('i')); const progL = h('span', {class:'note'});
  const run = h('button', {class:'btn primary'}, X('ابدأ القراءة','Start reading'));
  const stop = h('button', {class:'btn', hidden:true, onclick:()=>{ task && (task.canceled = true); }}, X('إيقاف','Stop'));
  const ctrls = h('div', {class:'ocrs-ctrl'}, h('div', null, lL, sLang), h('div', null, lD, sDpi), h('div', null, lP, sPrep), h('div', null, lM, sMode), h('div', {class:'row', style:{alignSelf:'end'}}, run, stop));
  const tabs = h('div', {class:'seg', role:'tablist'}); const pane = h('div', {class:'ocrs-pane'});
  const acts = h('div', {class:'row ocrs-acts', hidden:true});
  body.append(ctrls, h('div', {class:'row'}, prog, progL), tabs, pane, acts);
  pane.append(h('p', {class:'callout info'}, X('القراءة تتم على جهازك. اختر «فحص عميق» لقراءة الصفحات التي فيها نص أصلي أيضًا ومقارنتها بما يظهر، لاكتشاف النص المخفي أو التالف.','Reading runs on your device. Choose “Deep check” to also read pages that have real text and compare them with what is shown, to catch hidden or broken text.')));

  const pageSel = () => R.pages.length > 1 ? h('select', {class:'field', 'aria-label':t('page'), onchange:e=>{ cur = +e.target.value; draw(); }}, R.pages.map((p,i)=>h('option', {value:i, selected:i===cur}, `${t('page')} ${p.idx+1}${p.ai?' ✓AI':''}`))) : null;
  function draw(){
    if (!R) return; const pg = R.pages[cur];
    const T = [['text',X('النص','Text')],['data',X('البيانات','Data')+` (${allEntities(R).length})`],['tables',X('الجداول','Tables')+` (${R.pages.reduce((a,p)=>a+p.tables.length,0)})`],['quality',X('الفحص','Check')],['view',X('المعاينة','Preview')]];
    tabs.replaceChildren(...T.map(([k,l])=>h('button', {role:'tab', 'aria-pressed':String(tab===k), 'aria-selected':String(tab===k), onclick:()=>{ tab = k; draw(); }}, l)));
    pane.replaceChildren();
    if (tab==='text'){
      const ta = h('textarea', {class:'field', dir:'auto', style:{width:'100%', minHeight:'46vh', lineHeight:'1.9'}, 'aria-label':X('النص المستخرج','Extracted text')}, pg.text);
      ta.addEventListener('input', ()=>{ pg.text = ta.value; pg.edited = true; pg.entities = OCR.entities(pg.text, pg.idx+1); });
      pane.append(h('div', {class:'row', style:{justifyContent:'space-between'}}, h('div', {class:'row'}, pageSel(), h('span', {class:'pill '+(pg.conf>=85?'s-approved':pg.conf>=65?'s-review':'s-rejected')}, pg.fromLayer ? X('نص أصلي','Real text') : X(`ثقة ${pg.conf}%`,`Confidence ${pg.conf}%`)), pg.ai ? h('span', {class:'pill s-approved'}, X('مصحّح بالذكاء','AI-corrected')) : null),
        h('div', {class:'row'}, h('button', {class:'btn', onclick:async()=>{ try { await navigator.clipboard.writeText(ta.value); U.toast(t('copied'),'ok'); } catch(e){ ta.select(); } }}, X('نسخ','Copy')), aiBtn(pg))), ta,
        pg.aiOrig ? h('details', null, h('summary', {class:'note'}, X('نص OCR قبل التصحيح','OCR text before correction')), h('pre', {dir:'auto', style:{whiteSpace:'pre-wrap', fontSize:'12px'}}, pg.aiOrig)) : null,
        pg.aiNotes && pg.aiNotes.length ? h('p', {class:'callout'}, pg.aiNotes.join(' • ')) : null);
    }
    if (tab==='data'){
      const ents = allEntities(R); const types = [...new Set(ents.map(e=>e.type))]; let f = pane._f || 'all';
      const chips = h('div', {class:'row'}, [['all',X('الكل','All')], ...types.map(k=>[k, L(TYPES[k])])].map(([k,l])=>h('button', {class:'chip', 'aria-pressed':String(f===k), onclick:()=>{ pane._f = k; draw(); }}, l)));
      const list = ents.filter(e=>f==='all' || e.type===f);
      pane.append(chips, list.length ? h('div', {class:'tbl-wrap'}, h('table', {class:'reg'}, h('thead', null, h('tr', null, [X('النوع','Type'), X('الحقل','Label'), X('القيمة','Value'), X('الموحدة','Normalised'), X('ص','P')].map(x=>h('th', null, x)))),
        h('tbody', null, list.map(e=>h('tr', null, h('td', null, L(TYPES[e.type])), h('td', {dir:'auto'}, e.label||''), h('td', {dir:'auto'}, e.value), h('td', {dir:'ltr'}, e.norm + (e.valid===false ? ' ⚠' : e.valid ? ' ✓' : '')), h('td', null, String(e.page))))))) : h('p', {class:'note'}, X('لم تُرصد بيانات منظمة. صحّح النص أو استخدم التصحيح بالذكاء ثم أعد المحاولة.','No structured data found. Fix the text or use AI correction, then try again.')),
        h('p', {class:'note'}, X('رُصدت البيانات بقواعد محلية (تواريخ ميلادية وهجرية، مبالغ وعملات، آيبان مع التحقق، رقم ضريبي، جوال، بريد، أرقام مرجعية، وحقول «اسم: قيمة»). راجعها قبل اعتمادها.','Detected with local rules (Gregorian and Hijri dates, amounts and currencies, IBAN with checksum, VAT no., mobile, email, reference numbers and “label: value” fields). Review before relying on them.')));
    }
    if (tab==='tables'){
      const all = R.pages.flatMap(p=>p.tables.map(tb=>({p, tb})));
      if (!all.length) pane.append(h('p', {class:'note'}, X('لم تُرصد جداول. الجداول تُكتشف من محاذاة الأعمدة؛ للجداول غير المنتظمة استخدم التصحيح بالذكاء.','No tables found. Tables are detected from column alignment; for irregular ones use AI correction.')));
      all.forEach(({p, tb}, i)=>pane.append(h('b', null, `${X('جدول','Table')} ${i+1} — ${t('page')} ${p.idx+1}${tb.title ? ' — '+tb.title : ''}`), h('div', {class:'tbl-wrap'}, h('table', {class:'reg'}, h('thead', null, h('tr', null, tb.columns.map(c=>h('th', {dir:'auto'}, String(c))))), h('tbody', null, tb.rows.slice(0, 300).map(r=>h('tr', null, r.map(c=>h('td', {dir:'auto'}, String(c==null?'':c))))))))));
    }
    if (tab==='quality'){
      pane.append(h('div', {class:'row'}, pageSel()));
      R.pages.forEach(p=>{ if (R.pages.length>1 && p!==pg) return;
        pane.append(h('div', {class:'flist'}, p.issues.map(i=>h('div', {class:'fitem', style:{alignItems:'flex-start', whiteSpace:'normal'}}, h('span', {class:'pill '+sevCls[i.sev]}, {high:X('مهم','Important'), med:X('متوسط','Medium'), low:X('ملاحظة','Note'), ok:X('سليم','OK')}[i.sev]),
          h('div', {style:{flex:1, minWidth:0}}, h('div', {dir:'auto'}, i.msg), i.detail ? h('div', {class:'note', dir:'auto'}, (i.detail.onlyLayer && i.detail.onlyLayer.length ? X('في الطبقة فقط: ','Only in the layer: ')+i.detail.onlyLayer.join('، ') : '') + (i.detail.onlyImg && i.detail.onlyImg.length ? X(' — في الصورة فقط: ',' — Only in the image: ')+i.detail.onlyImg.join('، ') : '')) : null)))));
        const low = p.words.filter(w=>w.conf<75).slice(0, 80);
        if (low.length) pane.append(h('b', null, X('كلمات تحتاج مراجعة','Words to review')), h('div', {class:'row'}, low.map(w=>h('span', {class:'chip', dir:'auto', title:w.conf+'%', style:{borderColor: w.conf<60?'var(--stamp)':'var(--warn)'}}, `${w.str} · ${w.conf}%`))));
      });
    }
    if (tab==='view'){
      const box = h('div', {class:'ocrs-view'}); pane.append(h('div', {class:'row'}, pageSel(), h('span', {class:'note'}, X('أخضر: ثقة عالية • برتقالي: متوسطة • أحمر: منخفضة','Green: high confidence • Orange: medium • Red: low'))), box);
      (async()=>{ const p = R.doc.pages[pg.idx]; const c = await M.renderPage(R.doc, p, Math.min(2, 1100/M.dispSize(p)[0]), null, {print:true}); const ctx = c.getContext('2d');
        for (const w of pg.words){ if (!w.w) continue; ctx.fillStyle = w.conf>=85 ? 'rgba(0,160,100,.18)' : w.conf>=60 ? 'rgba(255,150,0,.28)' : 'rgba(230,20,70,.32)'; ctx.fillRect(w.x*c.width, w.y*c.height, w.w*c.width, w.h*c.height); }
        c.style.maxWidth = '100%'; c.style.height = 'auto'; box.replaceChildren(c); })();
    }
    acts.hidden = false;
  }
  function aiBtn(pg){
    return h('button', {class:'btn', onclick:async e=>{ const b = e.target; b.disabled = true; const old = b.textContent; b.textContent = X('جارٍ التصحيح…','Correcting…');
      try { const j = await OCR.aiFix(pg, R.doc); if (!j || typeof j.text !== 'string') throw new Error(X('لم يُرجع النموذج نصًا.','The model returned no text.'));
        pg.aiOrig = pg.aiOrig || pg.text; pg.text = j.text; pg.ai = true; pg.aiNotes = (j.notes||[]).filter(Boolean).slice(0, 6);
        pg.entities = OCR.entities(pg.text, pg.idx+1).concat((j.fields||[]).filter(f=>f && f.value).map(f=>({type:'field', label:String(f.label||''), value:String(f.value), norm:String(f.value), page:pg.idx+1, ai:true})));
        (j.tables||[]).forEach(tb=>{ if (tb && Array.isArray(tb.columns) && Array.isArray(tb.rows) && tb.rows.length) pg.tables.push({title:(tb.title||'')+' (AI)', columns:tb.columns, rows:tb.rows}); });
        U.toast(X('صُحّح نص الصفحة. راجعه قبل الحفظ.','Page text corrected. Review it before saving.'), 'ok'); draw(); }
      catch(err){ if (!err.quiet) U.toast(t('error',{e:err.message}), 'err'); b.disabled = false; b.textContent = old; } }}, X('تصحيح بالذكاء الاصطناعي','Correct with AI'));
  }
  const base = U.baseName(files[0].name);
  acts.append(
    h('button', {class:'btn primary', onclick:async()=>U.saveFile(base+'-'+X('بيانات','data')+'.xlsx', await OCR.toXlsx(R))}, 'Excel'),
    h('button', {class:'btn', onclick:()=>U.saveFile(base+'.json', OCR.toJson(R))}, 'JSON'),
    h('button', {class:'btn', onclick:()=>U.saveFile(base+'.txt', OCR.toTxt(R))}, X('نص','Text')),
    h('button', {class:'btn', onclick:async()=>{ const blocks = []; R.pages.forEach((p,i)=>{ if (i) blocks.push({type:'br'}); p.text.split('\n').forEach(l=>blocks.push({type:'p', text:l})); }); U.saveFile(base+'.docx', await Tools.buildDocx(blocks)); }}, 'Word'),
    h('button', {class:'btn', onclick:async()=>{ try { const {bytes} = await M.exportPdf(R.doc, new U.Task(), {rebuild:true}); U.saveFile(base+X('-قابل-للبحث','-searchable')+'.pdf', bytes); } catch(e){ U.toast(t('error',{e:e.message}),'err'); } }}, X('PDF قابل للبحث','Searchable PDF')),
    h('button', {class:'btn', onclick:async()=>{ m.close(); await E.open(R.doc); E.showProps('text'); U.toast(X('النصوص المقروءة صارت قابلة للتعديل في «محرر النصوص».','The read text is now editable in the Text editor.'), 'ok'); }}, X('عدّل النص في المحرر','Edit the text in the editor')));
  run.onclick = async ()=>{
    Object.assign(o, {lang:sLang.value, dpi:sDpi.value, prep:sPrep.value, mode:sMode.value}); U.store.set('ocrStudio', o);
    run.disabled = true; stop.hidden = false; prog.hidden = false; acts.hidden = true;
    task = new U.Task((p, l)=>{ if (p!=null) prog.firstChild.style.width = Math.round(p*100)+'%'; if (l) progL.textContent = l; });
    try { R = await OCR.run(files, o, task); cur = 0; tab = 'text'; progL.textContent = X(`انتهت القراءة: ${R.pages.length} صفحة.`,`Done: ${R.pages.length} page(s).`); draw(); }
    catch(e){ progL.textContent = ''; if (!e.canceled) U.toast(t('error',{e:e.message}), 'err'); }
    finally { run.disabled = false; stop.hidden = true; prog.hidden = true; task = null; }
  };
};

/* ---------- editor: make a scanned page editable ---------- */
OCR.editorPage = async function(all){
  if (!E.doc) return U.toast(t('no_doc_open'));
  const lang = (U.store.get('ocrStudio', {}).lang) || 'ara+eng';
  const pages = all ? E.doc.pages : [E.doc.pages[E.cur] || E.doc.pages[0]];
  U.toast(X('جارٍ التعرف على النص…','Recognising text…'));
  let n = 0, skipped = 0;
  for (const p of pages){ const layer = await M.layerText(E.doc, p); if (layer.length){ skipped++; continue; }
    const r = await OCR.page(E.doc, p, {lang, dpi:240}); OCR.attach(p, r, lang); n += r.lines.length; }
  E.showProps('text'); TextEdit.renderList && TextEdit.renderList();
  U.toast(n ? X(`قُرئ ${n} سطرًا. اضغط على أي سطر في «محرر النصوص» لتعديله.`,`Read ${n} line(s). Click any line in the Text editor to edit it.`) : skipped ? X('هذه الصفحة فيها نص أصلي قابل للتعديل مباشرة.','This page already has real text you can edit directly.') : X('لم يُعثر على نص.','No text found.'), n ? 'ok' : '');
};
})();
