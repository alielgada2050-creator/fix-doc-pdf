/* وثيق — document model: loading, rendering, text, export (pdf.js for reading, pdf-lib for writing) */
(function(){
if (!window.PDFLib) return;
const M = window.M = {};
const { PDFDocument, degrees, rgb, PDFName, PDFString, PDFHexString, PDFArray, PDFNumber, PDFBool, StandardFonts } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* free pdf.js memory of a document that is no longer shown */
M.destroyDoc = function(doc){ if (!doc || !doc.sources) return; for (const s of doc.sources){ try { s && s.pdf && s.pdf.destroy && s.pdf.destroy(); } catch(e){} } };
M.imgs = {};            // id -> HTMLImageElement (for overlays)
M.imgSrc = {};          // id -> dataURL
M.addImage = async function(dataURL){ const id = 'img_'+U.uid(); M.imgSrc[id] = dataURL; M.imgs[id] = await U.loadImage(dataURL); return id; };

/* ---------- loading ---------- */
async function openPdfjs(bytes, password){
  /* one shared pdf.js worker thread for every document: parsing and rendering stay off the main thread */
  if (!M._worker){ try { M._worker = new pdfjsLib.PDFWorker({name:'wathiq'}); } catch(e){ M._worker = null; } }
  const task = pdfjsLib.getDocument({data: bytes.slice(), password: password||undefined, isEvalSupported:false, disableFontFace:false, useSystemFonts:true, worker: M._worker || undefined});
  return task.promise;
}
M.loadPdfBytes = async function(bytes, name, askPw=true){
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let password = null;
  for (let tries=0; tries<4; tries++){
    try { const pdf = await openPdfjs(bytes, password); return {bytes, pdf, password, name}; }
    catch(e){
      if (e && e.name==='PasswordException' && askPw){
        password = await U.askPassword((name? name+' — ' : '') + (e.code===2 ? t('wrong_pw') : t('need_pw')));
        if (password==null) throw new Error(t('need_pw'));
      } else throw e;
    }
  }
  throw new Error(t('wrong_pw'));
};
M.imageToPdfBytes = async function(file, fit){
  const url = typeof file==='string' ? file : await U.readDataURL(file);
  const img = await U.loadImage(url);
  const d = await PDFDocument.create();
  // re-encode through canvas so any browser-readable format (webp, gif, bmp, heic on Safari) works
  const c = U.canvas(img.naturalWidth, img.naturalHeight); const ctx = c.getContext('2d');
  const isPng = /^data:image\/(png|webp|gif)/.test(url);
  if (!isPng){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height); }
  ctx.drawImage(img, 0, 0);
  const bytes = U.dataURLtoBytes(c.toDataURL(isPng?'image/png':'image/jpeg', 0.92));
  const em = isPng ? await d.embedPng(bytes) : await d.embedJpg(bytes);
  let pw = img.naturalWidth*0.75, ph = img.naturalHeight*0.75;
  const margin = (fit && fit.margin) || 0;
  let W, H;
  if (fit && fit.size && fit.size!=='image'){
    const A4 = [595.28, 841.89], LT = [612, 792];
    let base = fit.size==='letter' ? LT : A4;
    const land = fit.orient==='landscape' || (fit.orient==='auto' && pw>ph);
    [W, H] = land ? [base[1], base[0]] : base;
    const s = Math.min((W-2*margin)/pw, (H-2*margin)/ph); pw*=s; ph*=s;
  } else {
    const s = Math.min(1, 1400/Math.max(pw, ph)); pw*=s; ph*=s; W = pw+2*margin; H = ph+2*margin;
  }
  const p = d.addPage([W, H]);
  p.drawImage(em, {x:(W-pw)/2, y:(H-ph)/2, width:pw, height:ph});
  return new Uint8Array(await d.save());
};
M.isPdf = f => (f.type==='application/pdf') || U.ext(f.name)==='pdf';
M.isImage = f => /^image\//.test(f.type) || ['jpg','jpeg','png','webp','gif','bmp'].includes(U.ext(f.name));

M.Doc = class {
  constructor(name){ this.name = name || 'document.pdf'; this.sources = []; this.pages = []; this.dirty = false; this.textCache = {}; }
  async addSource(src){ this.sources.push(src); const s = this.sources.length-1; const out = [];
    for (let i=1;i<=src.pdf.numPages;i++){
      const pg = await src.pdf.getPage(i); const v = pg.view; // cropbox [x0,y0,x1,y1]
      out.push({id:U.uid(), s, i:i-1, baseRot:pg.rotate||0, rot:0, w:v[2]-v[0], h:v[3]-v[1], ox:v[0], oy:v[1], objs:[]});
    }
    return out;
  }
  async addFile(file, at){
    let src;
    if (M.isPdf(file)) src = await M.loadPdfBytes(await U.readBuf(file), file.name);
    else if (M.isImage(file)) src = await M.loadPdfBytes(await M.imageToPdfBytes(file), file.name, false);
    else throw new Error((file.name||'')+' — PDF / image');
    const pages = await this.addSource(src);
    if (at==null) this.pages.push(...pages); else this.pages.splice(at, 0, ...pages);
    return pages;
  }
};
M.R = p => (((p.baseRot||0)+(p.rot||0))%360+360)%360;
M.dispSize = p => M.R(p)%180 ? [p.h, p.w] : [p.w, p.h];
M.fromFiles = async function(files, name){
  const d = new M.Doc(name || files[0].name.replace(/\.[^.]+$/, '')+'.pdf');
  for (const f of files) await d.addFile(f);
  return d;
};
M.fromBytes = async function(bytes, name){
  const d = new M.Doc(name);
  const src = await M.loadPdfBytes(bytes, name);
  d.pages.push(...await d.addSource(src)); return d;
};

/* ---------- rendering ---------- */
M.renderPage = async function(doc, page, scale, canvas, opts={}){
  const R = M.R(page); const [dw, dh] = M.dispSize(page);
  const c = canvas || U.canvas(dw*scale, dh*scale);
  c.width = Math.max(1, Math.round(dw*scale)); c.height = Math.max(1, Math.round(dh*scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
  if (page.s==null) return c;
  const pg = await doc.sources[page.s].pdf.getPage(page.i+1);
  const vp = pg.getViewport({scale, rotation:R});
  const task = pg.render({canvasContext:ctx, viewport:vp, intent: opts.print?'print':'display', annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS});
  if (opts.onTask) opts.onTask(task);
  await task.promise;
  return c;
};

/* ---------- text with normalized display rectangles ---------- */
/* text of a page: the real text layer, or OCR lines attached by the OCR studio / editor when the page has none */
M.getText = async function(doc, page){
  const items = await M.layerText(doc, page);
  if (!items.length && page.ocrItems && page.ocrItems.rot===M.R(page)) return page.ocrItems.items;
  return items;
};
M.layerText = async function(doc, page){
  const key = page.s+':'+page.i+':'+M.R(page);
  if (page.s==null) return [];
  if (doc.textCache[key]) return doc.textCache[key];
  const pg = await doc.sources[page.s].pdf.getPage(page.i+1);
  const vp = pg.getViewport({scale:1, rotation:M.R(page)});
  const tc = await pg.getTextContent({disableNormalization:true});
  const items = [];
  for (const it of tc.items){
    if (!it.str || !it.str.trim()) continue;
    it.str = it.str.normalize('NFKC');
    const [a,b,c,d,e,f] = it.transform; const ul = Math.hypot(a,b)||1, vl = Math.hypot(c,d)||1;
    const ux = a/ul*it.width, uy = b/ul*it.width; const h = it.height || vl; const vx = c/vl*h, vy = d/vl*h;
    const pts = [[e - vx*0.22, f - vy*0.22],[e+ux - vx*0.22, f+uy - vy*0.22],[e+vx*0.92, f+vy*0.92],[e+ux+vx*0.92, f+uy+vy*0.92]].map(p=>vp.convertToViewportPoint(p[0], p[1]));
    const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    items.push({i:items.length, str:it.str, x:x0/vp.width, y:y0/vp.height, w:(x1-x0)/vp.width, h:(y1-y0)/vp.height, size:h, font: tc.styles[it.fontName]?.fontFamily || '', fontName: it.fontName, dir: it.dir});
  }
  doc.textCache[key] = items; return items;
};
/* group text into lines / rows (handles RTL by sorting right-to-left when Arabic dominates) */
M.textLines = function(items){
  const rows = [];
  const sorted = items.slice().sort((p,q)=>(p.y+p.h/2)-(q.y+q.h/2));
  for (const it of sorted){
    const cy = it.y + it.h/2; let row = rows.find(r=>Math.abs(r.cy-cy) < Math.max(r.h, it.h)*0.5);
    if (!row){ row = {cy, h:it.h, items:[]}; rows.push(row); }
    row.items.push(it); row.cy = (row.cy*(row.items.length-1)+cy)/row.items.length;
  }
  rows.sort((a,b)=>a.cy-b.cy);
  for (const r of rows){
    const ar = r.items.filter(i=>U.isAr(i.str)).length > r.items.length/2;
    r.rtl = ar; r.items.sort((a,b)=> ar ? (b.x+b.w)-(a.x+a.w) : a.x-b.x);
    let txt = ''; let prev = null;
    for (const it of r.items){
      if (prev){ const gap = ar ? (prev.x - (it.x+it.w)) : (it.x - (prev.x+prev.w)); if (gap > it.h*0.15 && !txt.endsWith(' ') && !it.str.startsWith(' ')) txt += ' '; }
      txt += it.str; prev = it;
    }
    r.text = txt.replace(/\s+/g,' ').trim();
  }
  return rows;
};
/* split a row into cells by large horizontal gaps (for Excel export) */
M.rowCells = function(row){
  const cells = []; let cur = null; let prev = null;
  for (const it of row.items){
    const gap = prev ? (row.rtl ? (prev.x - (it.x+it.w)) : (it.x - (prev.x+prev.w))) : 0;
    if (!cur || gap > Math.max(0.012, it.h*0.9)){ cur = {text:it.str, x: row.rtl ? it.x+it.w : it.x}; cells.push(cur); }
    else cur.text += (gap > it.h*0.15 ? ' ' : '') + it.str;
    prev = it;
  }
  cells.forEach(c=>c.text = c.text.replace(/\s+/g,' ').trim());
  return cells;
};

/* ---------- overlay object rendering (shared by editor & export) ---------- */
M.FONTS = ['IBM Plex Sans Arabic','Cairo','Tajawal','Amiri','Noto Naskh Arabic','Aref Ruqaa','Reem Kufi','Great Vibes','Dancing Script','Arial','Times New Roman','Courier New'];
M.drawObj = function(ctx, o, W, H, k, forExport){
  // W,H: page px; k: px per pt
  const x = o.x*W, y = o.y*H, w = o.w*W, h = o.h*H;
  ctx.save();
  ctx.globalAlpha = o.opacity ?? 1;
  if (o.rotate){ ctx.translate(x+w/2, y+h/2); ctx.rotate(o.rotate*Math.PI/180); ctx.translate(-(x+w/2), -(y+h/2)); }
  const sw = (o.strokeW ?? 2)*k;
  switch(o.type){
    case 'text': {
      if (o.bg){ ctx.fillStyle = o.bgColor || '#fff'; ctx.fillRect(x - 1*k, y - 1*k, w + 2*k, h + 2*k); }
      U.drawTextBlock(ctx, o.text, {x, y, w, h, font:U.fontStack(o.font||'IBM Plex Sans Arabic'), sizePx:(o.size||12)*k, color:o.color||'#000', bold:o.bold, italic:o.italic, align:o.align||'start'});
      break; }
    case 'highlight': ctx.globalAlpha = (o.opacity ?? 1)*0.38; ctx.fillStyle = o.color||'#ffd400'; ctx.fillRect(x,y,w,h); break;
    case 'underline': ctx.strokeStyle = o.color||'#d00'; ctx.lineWidth = Math.max(1, (o.strokeW||1.2)*k); ctx.beginPath(); ctx.moveTo(x, y+h-ctx.lineWidth/2); ctx.lineTo(x+w, y+h-ctx.lineWidth/2); ctx.stroke(); break;
    case 'strike': ctx.strokeStyle = o.color||'#d00'; ctx.lineWidth = Math.max(1, (o.strokeW||1.2)*k); ctx.beginPath(); ctx.moveTo(x, y+h/2); ctx.lineTo(x+w, y+h/2); ctx.stroke(); break;
    case 'whiteout': ctx.fillStyle = o.fill || '#fff'; ctx.fillRect(x,y,w,h); break;
    case 'redact': if (!forExport){ ctx.fillStyle = '#000'; ctx.globalAlpha = 0.85; ctx.fillRect(x,y,w,h); } break;
    case 'rect': case 'ellipse': {
      ctx.beginPath();
      if (o.type==='rect') ctx.rect(x+sw/2, y+sw/2, Math.max(0,w-sw), Math.max(0,h-sw)); else ctx.ellipse(x+w/2, y+h/2, Math.max(0,w/2-sw/2), Math.max(0,h/2-sw/2), 0, 0, Math.PI*2);
      if (o.fill && o.fill!=='none'){ ctx.fillStyle = o.fill; ctx.fill(); }
      if (sw>0){ ctx.strokeStyle = o.color||'#d00'; ctx.lineWidth = sw; ctx.stroke(); }
      break; }
    case 'line': case 'arrow': case 'pen': {
      const pts = (o.pts||[]).map(p=>[x+p[0]*w, y+p[1]*h]); if (pts.length<2) break;
      ctx.strokeStyle = o.color||'#d00'; ctx.lineWidth = sw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...pts[0]);
      if (o.type==='pen' && pts.length>2){ for (let i=1;i<pts.length-1;i++){ const mx=(pts[i][0]+pts[i+1][0])/2, my=(pts[i][1]+pts[i+1][1])/2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } ctx.lineTo(...pts[pts.length-1]); }
      else for (let i=1;i<pts.length;i++) ctx.lineTo(...pts[i]);
      ctx.stroke();
      if (o.type==='arrow'){ const [a,b] = [pts[pts.length-2], pts[pts.length-1]]; const ang = Math.atan2(b[1]-a[1], b[0]-a[0]); const L = Math.max(8*k, sw*4);
        ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0]-L*Math.cos(ang-0.45), b[1]-L*Math.sin(ang-0.45)); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0]-L*Math.cos(ang+0.45), b[1]-L*Math.sin(ang+0.45)); ctx.stroke(); }
      break; }
    case 'image': case 'sign': case 'stamp': {
      const im = M.imgs[o.img]; if (im){ if (o.flipH){ ctx.translate(x+w, y); ctx.scale(-1,1); ctx.drawImage(im, 0, 0, w, h); } else ctx.drawImage(im, x, y, w, h); }
      break; }
    case 'note': if (!forExport){ ctx.fillStyle = o.color||'#f5b400'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x,y,w,h,3*k) : ctx.rect(x,y,w,h); ctx.fill(); ctx.fillStyle='#fff'; ctx.fillRect(x+w*0.22,y+h*0.32,w*0.56,h*0.08); ctx.fillRect(x+w*0.22,y+h*0.52,w*0.4,h*0.08);} break;
  }
  ctx.restore();
};
M.RASTER_TYPES = new Set(['text','highlight','underline','strike','whiteout','rect','ellipse','line','arrow','pen','image','sign','stamp']);

/* display-normalized (u right, v down) -> PDF user space of the unrotated cropbox */
M.toPdf = function(page, u, v){
  const R = M.R(page), W = page.w, H = page.h; let x, y;
  if (R===0){ x=u*W; y=(1-v)*H; } else if (R===90){ x=v*W; y=u*H; } else if (R===180){ x=(1-u)*W; y=v*H; } else { x=(1-v)*W; y=(1-u)*H; }
  return [x + (page.ox||0), y + (page.oy||0)];
};
M.rectToPdf = function(page, o){
  const a = M.toPdf(page, o.x, o.y), b = M.toPdf(page, o.x+o.w, o.y+o.h);
  return {x:Math.min(a[0],b[0]), y:Math.min(a[1],b[1]), w:Math.abs(a[0]-b[0]), h:Math.abs(a[1]-b[1])};
};

/* ---------- export ---------- */
async function loadLib(src){
  try { return await PDFDocument.load(src.bytes, {password: src.password || undefined, updateMetadata:false}); }
  catch(e){ return await PDFDocument.load(src.bytes, {ignoreEncryption:true, updateMetadata:false}); }
}
M.exportPdf = async function(doc, task, opts={}){
  task = task || new U.Task();
  const pages = doc.pages;
  const libs = [];
  for (const s of doc.sources) libs.push(await loadLib(s));
  task.check();
  const identity = doc.sources.length===1 && pages.length===libs[0].getPageCount() && pages.every((p,k)=>p.s===0 && p.i===k);
  let out;
  if (identity && !opts.rebuild){ out = libs[0]; }
  else {
    out = await PDFDocument.create();
    const used = new Set();
    for (let k=0;k<pages.length;k++){
      const p = pages[k]; task.check();
      if (p.s==null){ out.addPage([p.w, p.h]); continue; }
      const key = p.s+':'+p.i;
      const [cp] = await out.copyPages(libs[p.s], [p.i]);
      out.addPage(cp); used.add(key);
      task.prog(0.25*k/pages.length);
    }
    if (doc.sources.length===1 && !opts.dropMeta){ const l = libs[0]; try { out.setTitle(l.getTitle()||''); out.setAuthor(l.getAuthor()||''); } catch(e){} }
  }
  const redactPages = [];
  for (let k=0;k<pages.length;k++){
    const p = pages[k]; task.check(); task.prog(0.25 + 0.65*k/pages.length);
    let pdfPage = out.getPage(k);
    let R = M.R(p); let geo = {w:p.w, h:p.h, ox:p.ox||0, oy:p.oy||0, baseRot:p.baseRot, rot:p.rot};
    pdfPage.setRotation(degrees(R));
    const objs = p.objs||[];
    if (objs.some(o=>o.type==='redact' || o.purge)){
      // rasterize page, burn black boxes: original content under the boxes is gone from the file
      const scale = opts.redactScale || 2.2;
      const c = await M.renderPage(doc, p, scale, null, {print:true});
      const ctx = c.getContext('2d'); ctx.fillStyle = '#000';
      for (const o of objs) if (o.type==='redact') ctx.fillRect(o.x*c.width - 1, o.y*c.height - 1, o.w*c.width + 2, o.h*c.height + 2);
      const jpg = await out.embedJpg(U.dataURLtoBytes(c.toDataURL('image/jpeg', 0.9)));
      const [dw, dh] = M.dispSize(p);
      out.removePage(k); const np = out.insertPage(k, [dw, dh]); np.drawImage(jpg, {x:0, y:0, width:dw, height:dh});
      pdfPage = np; R = 0; geo = {w:dw, h:dh, ox:0, oy:0, baseRot:0, rot:0}; redactPages.push(k+1);
    }
    const gp = Object.assign({}, p, geo);
    const vec = opts.raster ? [] : objs.filter(o=>o.type==='text' && !o.noText && M.canVector(o));
    const ras = objs.filter(o=>M.RASTER_TYPES.has(o.type) && !vec.includes(o));
    const hiddenText = opts.raster ? [] : ras.filter(o=>o.type==='text' && !o.rotate && !o.noText);
    if (ras.length){
      const [dw, dh] = M.dispSize(gp);
      const k2 = Math.min(opts.overlayScale || 3, 4200/Math.max(dw, dh));
      const c = U.canvas(dw*k2, dh*k2); const ctx = c.getContext('2d');
      for (const o of ras) M.drawObj(ctx, o, c.width, c.height, k2, true);
      // crop to used area to keep files small
      const bb = M.objsBBox(ras, c.width, c.height);
      if (bb){
        const cc = U.canvas(bb.w, bb.h); cc.getContext('2d').drawImage(c, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
        const png = await out.embedPng(U.dataURLtoBytes(cc.toDataURL('image/png')));
        const nr = {x:bb.x/c.width, y:bb.y/c.height, w:bb.w/c.width, h:bb.h/c.height};
        M.drawImageDisplayRect(pdfPage, gp, png, nr);
      }
    }
    // OCR lines become an invisible text layer so the saved file is searchable (never on pages with redaction or purge)
    const ocrHidden = (!opts.raster && p.ocrItems && p.ocrItems.rot===M.R(p) && !objs.some(o=>o.type==='redact' || o.purge) && !(await M.layerText(doc, p)).length) ? M.ocrHiddenObjs(p, gp) : [];
    hiddenText.push(...ocrHidden);
    if (vec.length || hiddenText.length){
      const VF = await M.vecFonts(out);
      for (const o of vec) await M.drawVectorText(pdfPage, gp, o, VF, false);
      for (const o of hiddenText) await M.drawVectorText(pdfPage, gp, o, VF, true);
    }
    for (const o of objs){
      if (o.type==='link' && o.url) M.addLinkAnnot(out, pdfPage, gp, o);
      if (o.type==='note' && o.text) M.addNoteAnnot(out, pdfPage, gp, o);
      if (o.type==='field' || o.type==='check'){
        const form = out.getForm(); const r = M.rectToPdf(gp, o);
        const name = (o.name || (o.type==='check'?'check':'field')+'_'+o.id).replace(/[.\s]/g,'_');
        try {
          if (o.type==='check'){ const f = form.createCheckBox(name); f.addToPage(pdfPage, {x:r.x, y:r.y, width:r.w, height:r.h, borderWidth:1}); }
          else { const f = form.createTextField(name); f.addToPage(pdfPage, {x:r.x, y:r.y, width:r.w, height:r.h, borderWidth:1, rotate:degrees(R)}); if (o.multiline) f.enableMultiline(); }
        } catch(e){ console.warn('field', e); }
      }
    }
  }
  try { out.setProducer('Wathiq PDF'); out.setCreator('Wathiq PDF'); out.setModificationDate(new Date()); } catch(e){}
  if (opts.after) await opts.after(out);
  task.prog(0.95);
  // redaction: the replaced pages are only unlinked by pdf-lib, so drop every object no longer reachable (old content streams, fonts, images)
  if (redactPages.length){ try { M.gcPdf(out); } catch(e){ console.warn('gc', e); } }
  const saveOpts = {useObjectStreams: opts.objectStreams !== false};
  if (opts.encrypt) out.encrypt(opts.encrypt);
  const bytes = await out.save(saveOpts);
  task.prog(1);
  return {bytes: new Uint8Array(bytes), redactPages};
};
/* ---------- real (vector) text: embedded IBM Plex Sans Arabic with shaping, split into bidi runs ---------- */
const fontBytes = {};
async function fetchFont(name){ if (!fontBytes[name]){ fontBytes[name] = fetch(new URL('fonts/'+name, location.href).href).then(r=>{ if (!r.ok) throw new Error('font '+name); return r.arrayBuffer(); }); } return fontBytes[name]; }
M.VECTOR_FONTS = {'IBM Plex Sans Arabic':'plex', 'Arial':'helv', 'Times New Roman':'times', 'Courier New':'courier'};
M.canVector = o => !o.rotate && !o.italic && !!M.VECTOR_FONTS[o.font||'IBM Plex Sans Arabic'] && String(o.text||'').trim().length > 0;
/* lam-alef ligature glyphs map to two characters; many readers (pdf.js among them) reverse those inside RTL text and
   produce "ال" instead of "لا". Mapping the ligature to its single presentation-form character keeps extraction correct. */
const LAM_ALEF = {0x627:0xFEFB, 0x623:0xFEF7, 0x625:0xFEF9, 0x622:0xFEF5};
const REV = new WeakSet();
M.fixLigatureMapping = function(pdfFont){
  try { const fk = pdfFont.embedder && pdfFont.embedder.font; if (!fk || fk._wqFix) return; const orig = fk.layout.bind(fk);
    fk.layout = (...args) => { const run = orig(...args); for (const g of run.glyphs){ const cp = g.codePoints; if (cp && cp.length===2 && cp[0]===0x644 && LAM_ALEF[cp[1]]) g.codePoints = [LAM_ALEF[cp[1]]];
      /* other Arabic letter ligatures (e.g. ضر، بي): viewers reverse RTL text after reading, so store the letters reversed */
      else if (cp && cp.length>=2 && !REV.has(g) && cp.every(c=>(c>=0x621 && c<=0x64A) || (c>=0x671 && c<=0x6D3))){ g.codePoints = cp.slice().reverse(); REV.add(g); } } return run; };
    fk._wqFix = true; } catch(e){}
};
M.vecFonts = async function(out){
  if (out._vf) return out._vf;
  await U.loadScript(U.LIBS.fontkit); out.registerFontkit(window.fontkit);
  const [r, b] = await Promise.all([fetchFont('IBMPlexSansArabic-Regular.ttf'), fetchFont('IBMPlexSansArabic-Bold.ttf')]);
  const S = PDFLib.StandardFonts; const vf = {plex:[await out.embedFont(r, {subset:false}), await out.embedFont(b, {subset:false})], std:{}};
  vf.plex.forEach(M.fixLigatureMapping);
  vf.get = async (key, bold) => { if (key==='plex') return vf.plex[bold?1:0];
    const name = {helv:bold?S.HelveticaBold:S.Helvetica, times:bold?S.TimesRomanBold:S.TimesRoman, courier:bold?S.CourierBold:S.Courier}[key];
    return vf.std[name] = vf.std[name] || await out.embedFont(name); };
  out._vf = vf; return vf;
};
const isArCh = c => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(c);
const isLtrCh = c => /[A-Za-z0-9À-ɏ]/.test(c);
/* split one line into runs of one direction; spaces at run edges become neutral gaps */
M.bidiRuns = function(line){
  const runs = []; let cur = null;
  for (const ch of line){ const t = isArCh(ch) ? 'r' : isLtrCh(ch) ? 'l' : 'n';
    if (!cur){ cur = {t, s:ch}; runs.push(cur); continue; }
    if (t==='n' || t===cur.t || cur.t==='n'){ cur.s += ch; if (cur.t==='n' && t!=='n') cur.t = t; }
    else { cur = {t, s:ch}; runs.push(cur); } }
  const out = []; for (const r of runs){ const m = r.s.match(/^(\s*)([\s\S]*?)(\s*)$/); if (m[1]) out.push({t:'n', s:m[1]}); if (m[2]) out.push({t:r.t==='n'?'n':r.t, s:m[2]}); if (m[3]) out.push({t:'n', s:m[3]}); }
  return out;
};
const firstStrongRtl = s => { for (const ch of s){ if (isArCh(ch)) return true; if (/[A-Za-z]/.test(ch)) return false; } return false; };
let emRatio = {};
function ascentRatio(fontCss){ if (emRatio[fontCss]) return emRatio[fontCss]; const c = U.canvas(4,4).getContext('2d'); c.font = '100px '+fontCss; c.textBaseline = 'alphabetic'; const m = c.measureText('Hاg'); emRatio[fontCss] = (m.emHeightAscent && m.emHeightAscent > 20) ? m.emHeightAscent/100 : 0.88; return emRatio[fontCss]; }
function wrapLines(ctx, text, maxW){ const out = []; for (const ln of String(text||'').split('\n')){ if (!maxW){ out.push(ln); continue; } const words = ln.split(/(\s+)/); let cur = ''; for (const wd of words){ const tst = cur + wd; if (ctx.measureText(tst).width > maxW && cur.trim()){ out.push(cur.trimEnd()); cur = wd.trimStart(); } else cur = tst; } out.push(cur); } return out; }
/* remove unreachable objects; old Page objects are never followed (struct tree, outlines or links may still point to them) */
M.gcPdf = function(out){
  const {PDFRef, PDFDict, PDFArray, PDFName} = PDFLib; const ctx = out.context;
  const live = new Set(out.getPages().map(pg=>pg.ref.toString())); const seen = new Set();
  const cat = out.catalog; try { cat.delete(PDFName.of('StructTreeRoot')); cat.delete(PDFName.of('MarkInfo')); } catch(e){}
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length){ const o = stack.pop(); if (!o) continue;
    if (o instanceof PDFRef){ const k = o.toString(); if (seen.has(k)) continue; const v = ctx.lookup(o);
      if (v instanceof PDFDict){ const ty = v.get(PDFName.of('Type')); if (ty && ty.toString()==='/Page' && !live.has(k)) continue; }
      seen.add(k); if (v) stack.push(v); continue; }
    if (o instanceof PDFDict){ for (const [, v] of o.entries()) stack.push(v); }
    else if (o instanceof PDFArray){ for (let i=0; i<o.size(); i++) stack.push(o.get(i)); }
    else if (o && o.dict instanceof PDFDict) stack.push(o.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.toString())) ctx.delete(ref);
};
M.ocrHiddenObjs = function(p, gp){
  const [dw, dh] = M.dispSize(gp); const font = 'IBM Plex Sans Arabic';
  return p.ocrItems.items.filter(it=>!p.objs.some(o=>o.srcKey===p.id+':'+it.i)).map(it=>{
    let size = Math.max(3, it.h*dh*0.78); const w = it.w*dw; const mw = U.measureTextBlock(it.str, U.fontStack(font), size, false).w;
    if (mw > w*0.98 && mw > 0) size = Math.max(2, size*w*0.98/mw);
    return {type:'text', text:it.str, x:it.x, y:it.y, w:it.w + 4/dw, h:Math.max(it.h, size*1.3/dh), size, font, align:'center', noText:false};
  });
};
M.drawVectorText = async function(pdfPage, page, o, VF, invisible){
  const [dw, dh] = M.dispSize(page); const R = M.R(page);
  const key = invisible ? 'plex' : M.VECTOR_FONTS[o.font||'IBM Plex Sans Arabic'];
  const size = o.size || 12; const lh = size*1.25; const css = `${o.bold?'700 ':'400 '}${size}px ${U.fontStack(o.font||'IBM Plex Sans Arabic')}`;
  const ctx = U.canvas(4,4).getContext('2d'); ctx.font = css;
  const x = o.x*dw, y = o.y*dh, w = o.w*dw, hh = o.h*dh;
  const lines = wrapLines(ctx, o.text, w);
  let font = await VF.get(key, o.bold);
  if (key!=='plex'){ try { lines.forEach(l=>font.encodeText(l)); } catch(e){ font = await VF.get('plex', o.bold); } }
  // Latin and digit runs use the matching standard font: renders identically in every viewer
  const latin = key==='plex' ? await VF.get(/times|serif|naskh|amiri/i.test(o.font||'') ? 'times' : 'helv', o.bold) : null;
  const col = U.hexToRgb(o.color||'#000000').map(v=>v/255); const color = PDFLib.rgb(col[0], col[1], col[2]);
  const opacity = invisible ? 0 : (o.opacity ?? 1);
  if (o.bg && !invisible){ const r = M.rectToPdf(page, {x:o.x-1/dw, y:o.y-1/dh, w:o.w+2/dw, h:o.h+2/dh}); const bc = U.hexToRgb(o.bgColor||'#ffffff').map(v=>v/255); pdfPage.drawRectangle({x:r.x, y:r.y, width:r.w, height:r.h, color:PDFLib.rgb(bc[0], bc[1], bc[2]), opacity:o.opacity ?? 1}); }
  const asc = ascentRatio(U.fontStack(o.font||'IBM Plex Sans Arabic'));
  const rtlPara = firstStrongRtl(o.text||'');
  lines.forEach((ln, i)=>{
    const line = ln.replace(/\s+$/,''); if (!line.trim()) return;
    const runs = M.bidiRuns(line); runs.forEach(r=>{ r.f = font; if (r.t!=='r' && latin){ try { latin.encodeText(r.s); r.f = latin; } catch(e){} } }); const widths = runs.map(r=>r.f.widthOfTextAtSize(r.s, size)); const lw = widths.reduce((a,b)=>a+b, 0);
    const al = o.align || 'start'; const physical = al==='center' ? 'center' : (al==='start') === rtlPara ? 'right' : 'left';
    let x0 = physical==='center' ? x + (w-lw)/2 : physical==='right' ? x + w - lw : x;
    const base = y + size*0.08 + i*lh + size*asc;
    if (base > y + hh + size) return;
    // visual order: in an RTL paragraph runs flow right-to-left, in LTR left-to-right
    let cursor = rtlPara ? x0 + lw : x0;
    runs.forEach((r, k)=>{ const rw = widths[k]; if (rtlPara) cursor -= rw; const px = cursor; if (!rtlPara) cursor += rw;
      if (r.t==='n' && !r.s.trim()) return;
      const [ax, ay] = M.toPdf(page, px/dw, base/dh);
      pdfPage.drawText(r.s, {x:ax, y:ay, size, font:r.f, color, opacity, rotate:PDFLib.degrees(R)}); });
  });
};

M.objsBBox = function(objs, W, H){
  let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  for (const o of objs){ const pad = 0.02; const cx=o.x+o.w/2, cy=o.y+o.h/2; const r = o.rotate ? Math.hypot(o.w, o.h)/2 + pad : 0;
    const a = r ? [cx-r, cy-r, cx+r, cy+r] : [o.x-pad, o.y-pad, o.x+o.w+pad, o.y+o.h+pad];
    x0=Math.min(x0,a[0]); y0=Math.min(y0,a[1]); x1=Math.max(x1,a[2]); y1=Math.max(y1,a[3]); }
  if (!isFinite(x0)) return null;
  x0=Math.max(0,x0); y0=Math.max(0,y0); x1=Math.min(1,x1); y1=Math.min(1,y1);
  if (x1<=x0 || y1<=y0) return null;
  return {x:Math.floor(x0*W), y:Math.floor(y0*H), w:Math.max(1,Math.ceil((x1-x0)*W)), h:Math.max(1,Math.ceil((y1-y0)*H))};
};
/* draw an image so that it covers display-normalized rect nr on a (possibly rotated) page */
M.drawImageDisplayRect = function(pdfPage, page, img, nr){
  const R = M.R(page); const [dw, dh] = M.dispSize(page);
  const iw = nr.w*dw, ih = nr.h*dh; // size in display points
  // anchor = display bottom-left corner of the rect, mapped to PDF space
  const [ax, ay] = M.toPdf(page, nr.x, nr.y+nr.h);
  pdfPage.drawImage(img, {x:ax, y:ay, width:iw, height:ih, rotate:degrees(R)});
};
M.addLinkAnnot = function(out, pdfPage, page, o){
  const r = M.rectToPdf(page, o); const ctx = out.context;
  let url = o.url.trim(); if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
  const annot = ctx.obj({Type:'Annot', Subtype:'Link', Rect:[r.x, r.y, r.x+r.w, r.y+r.h], Border:[0,0,0], A:{Type:'Action', S:'URI', URI: PDFString.of(url)}});
  const ref = ctx.register(annot); appendAnnot(pdfPage, ref, ctx);
};
M.addNoteAnnot = function(out, pdfPage, page, o){
  const r = M.rectToPdf(page, o); const ctx = out.context; const col = U.hexToRgb(o.color||'#f5b400').map(v=>v/255);
  const annot = ctx.obj({Type:'Annot', Subtype:'Text', Rect:[r.x, r.y, r.x+Math.max(r.w,18), r.y+Math.max(r.h,18)], Contents: PDFHexString.fromText(o.text), T: PDFHexString.fromText(o.author||'Wathiq'), Name:'Comment', C:col, Open:false, F:4});
  const ref = ctx.register(annot); appendAnnot(pdfPage, ref, ctx);
};
function appendAnnot(pdfPage, ref, ctx){
  let annots = pdfPage.node.lookup(PDFName.of('Annots'));
  if (annots instanceof PDFArray) annots.push(ref); else pdfPage.node.set(PDFName.of('Annots'), ctx.obj([ref]));
}

/* rasterize document pages (used by compress and redaction-style flattening) */
M.rasterizeToPdf = async function(doc, opts, task){
  const out = await PDFDocument.create(); const dpi = opts.dpi || 120; const q = opts.quality || 0.7;
  for (let k=0;k<doc.pages.length;k++){
    task && task.check(); task && task.prog(k/doc.pages.length);
    const p = doc.pages[k]; const c = await M.renderPage(doc, p, dpi/72, null, {print:true});
    if (opts.gray){ const ctx = c.getContext('2d'); const id = ctx.getImageData(0,0,c.width,c.height); const d = id.data; for (let i=0;i<d.length;i+=4){ const g = d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11; d[i]=d[i+1]=d[i+2]=g; } ctx.putImageData(id,0,0); }
    const jpg = await out.embedJpg(U.dataURLtoBytes(c.toDataURL('image/jpeg', q)));
    const [dw, dh] = M.dispSize(p); const pg = out.addPage([dw, dh]); pg.drawImage(jpg, {x:0,y:0,width:dw,height:dh});
  }
  return new Uint8Array(await out.save({useObjectStreams:true}));
};

/* sample document: Arabic transaction-tracking table (mirrors the reference screenshot's content type) */
M.sampleBytes = async function(){
  await U.ensureFonts(['Cairo','IBM Plex Sans Arabic']);
  const W = 842, H = 595, k = 2; const c = U.canvas(W*k, H*k); const ctx = c.getContext('2d');
  ctx.scale(k,k); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#ffd966'; ctx.fillRect(24, 24, W-48, 34);
  U.drawTextBlock(ctx, 'موقف المعاملات والمشاريع المسندة غير المجدولة حتى تاريخ 2026-11-08', {x:24, y:31, w:W-48, h:30, font:'"Cairo",sans-serif', sizePx:15, bold:true, color:'#1b1b1b', align:'center'});
  const cols = ['خطوات العمل','رقم الأساس','رقم المعاملة','الحي','حالة الطلب','ملاحظات','طول الحفر','وقت البداية المتوقع','المراقب'];
  const cw = [92, 82, 92, 70, 92, 120, 64, 110, 72]; const total = cw.reduce((a,b)=>a+b,0); const sc = (W-48)/total;
  const rows = [
    ['تعزيز ثليم','46904897','—','العود','التأكد من الرخصة','استكمال الأعمال يوم الأحد','200m','السبت 07-11-2026','أبو أيمن'],
    ['R6377','261054488','—','الفيصلية','التأكد من الرخصة','لا يوجد ملاحظات','220m','السبت - الأحد','اشتباك'],
    ['تطفية - R6072','261053036','—','الضباط','تم إصدار الرخصة','هام جدًا: التطفية يوم الأحد','حفر للتطفية','السبت 07-11-2026','قاليداس'],
    ['R5430','251034606','—','طيبة','التأكد من الرخصة','لا يوجد ملاحظات','350m','الأحد - الاثنين','قاليداس'],
    ['تطفية - R5579','261037250','—','المناخ','التأكد من الرخصة','الإغلاق في نفس اليوم','حفر للتطفية','الأحد 08-11-2026','مصطفى'],
    ['R6288','261118299','—','البرية','التأكد من الرخصة','لا يوجد ملاحظات','150m','الاثنين - الثلاثاء','أبو أيمن']
  ];
  let y = 70; const rh = 40;
  const drawRow = (cells, head, fill)=>{ let x = W-24; cells.forEach((tx, i)=>{ const w = cw[i]*sc; x -= w;
      ctx.fillStyle = head ? '#dbe7f3' : (fill && i===0 ? '#fff36b' : (i===7 ? '#fde5d6' : '#f7f7f7')); ctx.fillRect(x, y, w, rh);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, rh);
      U.drawTextBlock(ctx, tx, {x:x+3, y:y+(head?13:9), w:w-6, h:rh, font:'"Cairo",sans-serif', sizePx: head?10:10, bold:true, color:'#111', align:'center'}); }); y += rh; };
  y += 0; drawRow(cols, true); rows.forEach(r=>drawRow(r, false, true));
  U.drawTextBlock(ctx, 'ملف تجريبي من وثيق — جرّب: تعديل نص موجود، التوقيع، الختم، التظليل، الحجب، ثم احفظ.', {x:24, y:H-40, w:W-48, h:20, font:'"IBM Plex Sans Arabic",sans-serif', sizePx:11, color:'#0e5e57', align:'center'});
  const d = await PDFDocument.create(); d.setTitle('Wathiq sample'); const p = d.addPage([W, H]);
  const png = await d.embedPng(U.dataURLtoBytes(c.toDataURL('image/png'))); p.drawImage(png, {x:0,y:0,width:W,height:H});
  // a real text layer (Latin) so search & "edit existing text" can be tried
  const f = await d.embedFont(StandardFonts.Helvetica);
  p.drawText('Invoice No. 2026-1108   Total: 4,250.00 SAR   Status: Pending review', {x:40, y:22, size:10, font:f, color:rgb(0.15,0.15,0.15)});
  const p2 = d.addPage([595, 842]);
  p2.drawText('Wathiq PDF - page 2', {x:60, y:780, size:22, font:f, color:rgb(0.05,0.37,0.34)});
  ['Use the Pages panel to reorder, rotate, duplicate or delete pages.','Search finds text on pages that contain a text layer.','Run OCR on scanned pages to make them searchable.','Signature images are visual signatures, not certified digital signatures.'].forEach((s,i)=>p2.drawText('- '+s, {x:60, y:730-i*24, size:12, font:f}));
  return new Uint8Array(await d.save());
};
})();
