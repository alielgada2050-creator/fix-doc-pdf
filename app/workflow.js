/* وثيق — approvals (الاعتمادات): routing chains, signatures & seals, content fingerprints, device-key signing,
   portable approval packages (the PDF carries its own trail), issued copies with a certificate page + QR, verification. */
(function(){
const W = window.Flow = {};
const {h, $, $$} = U;
const STATUS = {draft:['مسودة','Draft'], review:['قيد الاعتماد','In review'], approved:['معتمد','Approved'], rejected:['مرفوض','Rejected'], returned:['معاد للتعديل','Returned']};
const PRIO = {high:['عاجل','Urgent'], med:['متوسط','Normal'], low:['منخفض','Low']};
W.st = k => X(...(STATUS[k]||[k,k]));
W.pr = k => X(...(PRIO[k]||[k,k]));
const fmtDate = ts => ts ? new Date(ts).toLocaleString(LANG==='ar'?'ar-SA-u-ca-gregory-nu-latn':'en-GB', {dateStyle:'medium', timeStyle:'short'}) : '—';
const fmtDay = d => d ? new Date(d+'T00:00').toLocaleDateString(LANG==='ar'?'ar-SA-u-ca-gregory-nu-latn':'en-GB', {dateStyle:'medium'}) : '—';
W.fmtDate = fmtDate; W.fmtDay = fmtDay;
const localISO = ts => { const d = ts ? new Date(ts) : new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString(); };
const today = () => localISO().slice(0,10);
const stampTime = ts => localISO(ts).slice(0,16).replace('T',' ');
W.today = today;
W.isLate = (due, status) => !!due && due < today() && !['approved','rejected','done'].includes(status);

/* ---------- crypto ---------- */
const hex = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
W.sha256 = async data => hex(await crypto.subtle.digest('SHA-256', typeof data==='string' ? new TextEncoder().encode(data) : data));
const b64 = buf => { let s=''; const a = new Uint8Array(buf); for (let i=0;i<a.length;i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
/* one ECDSA P-256 key per device; the private key never leaves IndexedDB */
W.deviceKey = async function(){
  let k = await DB.get('meta', 'devkey');
  if (!k){
    const pair = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, false, ['sign','verify']);
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    const id = (await W.sha256(spki)).slice(0,16).toUpperCase().match(/.{4}/g).join('-');
    k = {id:'devkey', keyId:id, pub:b64(spki), priv:pair.privateKey, created:Date.now()};
    await DB.put('meta', k);
  }
  return k;
};
const stepPayload = (ap, i, s) => [ap.id, ap.no, ap.version||1, i, s.name, s.status, s.at, ap.fp && ap.fp.text, s.comment||''].join('|');
W.signStep = async function(ap, i){
  const k = await W.deviceKey(); const s = ap.steps[i];
  const sig = await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, k.priv, new TextEncoder().encode(stepPayload(ap, i, s)));
  s.proof = {keyId:k.keyId, pub:k.pub, sig:b64(sig), alg:'ECDSA-P256-SHA256'};
};
W.verifyStep = async function(ap, i){
  const s = ap.steps[i]; if (!s.proof) return null;
  try { const key = await crypto.subtle.importKey('spki', unb64(s.proof.pub), {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
    return await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, unb64(s.proof.sig), new TextEncoder().encode(stepPayload(ap, i, s))); } catch(e){ return false; }
};

/* ---------- content fingerprint: text hash + coarse visual hash per page ---------- */
W.fingerprint = async function(doc, upto){
  const n = upto ?? doc.pages.length; const pages = []; let text = '';
  for (let i=0;i<n;i++){
    const p = doc.pages[i]; const [dw, dh] = M.dispSize(p);
    const items = await M.getText(doc, p); text += `#${i}:${Math.round(dw)}x${Math.round(dh)}:` + items.map(x=>x.str).join('').replace(/\s+/g,'') + '\n';
    const c = await M.renderPage(doc, p, 96/dw, null, {print:true});
    const g = U.canvas(16,16); const gx = g.getContext('2d'); gx.drawImage(c, 0, 0, 16, 16);
    const d = gx.getImageData(0,0,16,16).data; const v = []; for (let k=0;k<d.length;k+=4) v.push(d[k]*0.3+d[k+1]*0.59+d[k+2]*0.11);
    const mean = v.reduce((a,b)=>a+b,0)/v.length; let bits = ''; v.forEach(x=>bits += x>mean?'1':'0');
    pages.push({w:Math.round(dw), h:Math.round(dh), ah:bits.match(/.{4}/g).map(b=>parseInt(b,2).toString(16)).join('')});
  }
  return {text: await W.sha256(text), pages, n};
};
const hamming = (a, b) => { let d = 0; for (let i=0;i<Math.min(a.length,b.length);i++){ let x = parseInt(a[i],16) ^ parseInt(b[i],16); while (x){ d += x&1; x >>= 1; } } return d + Math.abs(a.length-b.length)*4; };
W.compare = function(rec, cur, tol=14){
  if (!rec || !cur) return {ok:false, reason:'missing'};
  if (rec.n !== cur.n) return {ok:false, reason:'pages', text:false};
  const textSame = rec.text === cur.text; const worst = Math.max(0, ...rec.pages.map((p,i)=>hamming(p.ah, cur.pages[i]?.ah||'')));
  return {ok: textSame && worst <= tol, text:textSame, visual:worst};
};
W.fpShort = fp => fp ? fp.text.slice(0,12).toUpperCase().match(/.{4}/g).join('-') : '—';

/* ---------- records ---------- */
W.current = ap => ap.status!=='review' ? [] : ap.mode==='parallel' ? ap.steps.map((s,i)=>i).filter(i=>ap.steps[i].status==='pending') : [ap.steps.findIndex(s=>s.status==='pending')].filter(i=>i>=0);
W.log = (ap, by, action, comment) => { (ap.history = ap.history||[]).push({at:Date.now(), by, action, comment:comment||''}); ap.updated = Date.now(); };
W.me = () => U.store.get('me', '');
W.save = async ap => { ap.updated = ap.updated || Date.now(); await DB.put('approvals', ap); await Tasks.syncApproval(ap); return ap; };

W.create = async function(file, o){
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await M.fromBytes(bytes, file.name); const fp = await W.fingerprint(doc);
  const ref = await DB.saveDoc(file.name, bytes);
  const ap = {id:'ap_'+U.uid()+Date.now().toString(36), no: await DB.nextNo('WQ'), title:o.title, dept:o.dept||'', priority:o.priority||'med', due:o.due||'', mode:o.mode||'sequential',
    note:o.note||'', createdBy:o.by||W.me(), created:Date.now(), doc:ref, fp, version:1, status:'review',
    steps:o.steps.map(s=>({name:s.name, role:s.role||'', status:'pending'})), history:[]};
  W.log(ap, ap.createdBy, 'create', o.note);
  U.store.set('me', ap.createdBy);
  return W.save(ap);
};

W.act = async function(ap, idx, action, o){
  const s = ap.steps[idx]; if (!s || s.status!=='pending' || !W.current(ap).includes(idx)) throw new Error(X('هذه الخطوة ليست الحالية.','This step is not the current one.'));
  // integrity check before acting
  const file = await DB.docFile(ap.doc); const doc = await M.fromBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  const cmp = W.compare(ap.fp, await W.fingerprint(doc));
  if (!cmp.ok) throw new Error(X('محتوى المستند تغيّر منذ إرساله للاعتماد. أعد إرساله كنسخة جديدة.','The document content changed since it was sent. Resubmit it as a new version.'));
  s.status = action; s.at = Date.now(); s.comment = o.comment||''; s.actor = o.actor || s.name; if (o.sig) s.sig = o.sig; s.seal = !!o.seal;
  await W.signStep(ap, idx);
  W.log(ap, s.actor, action, s.comment);
  if (action==='rejected') ap.status = 'rejected';
  else if (action==='returned') ap.status = 'returned';
  else if (ap.steps.every(x=>x.status==='approved')) ap.status = 'approved';
  return W.save(ap);
};
W.resubmit = async function(ap, file, comment){
  const bytes = new Uint8Array(await file.arrayBuffer()); const doc = await M.fromBytes(bytes, file.name);
  ap.fp = await W.fingerprint(doc); ap.doc = await DB.saveDoc(file.name, bytes); ap.version = (ap.version||1)+1;
  ap.steps.forEach(s=>{ s.status='pending'; delete s.at; delete s.comment; delete s.sig; delete s.proof; delete s.actor; delete s.seal; });
  ap.status = 'review'; W.log(ap, W.me()||ap.createdBy, 'resubmit', comment);
  return W.save(ap);
};

/* ---------- seal / certificate ---------- */
W.seal = async function(lines, color, size=520){
  await U.ensureFonts(['El Messiri','Readex Pro']);
  const c = U.canvas(size, size); const x = c.getContext('2d'); const r = size/2; x.strokeStyle = x.fillStyle = color||'#a3172f';
  x.lineWidth = size*0.028; x.beginPath(); x.arc(r, r, r-size*0.03, 0, Math.PI*2); x.stroke();
  x.lineWidth = size*0.01; x.beginPath(); x.arc(r, r, r*0.66, 0, Math.PI*2); x.stroke();
  // ring text
  const ring = lines.ring || 'WATHIQ  •  APPROVED  •  ';
  x.font = `700 ${size*0.075}px "El Messiri", "Readex Pro", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const chars = [...(ring.repeat(3))].slice(0, 46); const step = (Math.PI*2)/chars.length;
  chars.forEach((ch,i)=>{ x.save(); x.translate(r, r); x.rotate(i*step); x.fillText(ch, 0, -r*0.82); x.restore(); });
  U.drawTextBlock(x, lines.main||'معتمد', {x:r*0.4, y:r*0.66, w:r*1.2, h:r*0.4, font:'"El Messiri","Readex Pro",sans-serif', sizePx:size*0.13, bold:true, color:x.fillStyle, align:'center', dir:'rtl'});
  U.drawTextBlock(x, lines.sub||'', {x:r*0.4, y:r*0.96, w:r*1.2, h:r*0.2, font:'"Readex Pro",sans-serif', sizePx:size*0.055, bold:true, color:x.fillStyle, align:'center', dir:'ltr'});
  U.drawTextBlock(x, lines.date||'', {x:r*0.4, y:r*1.1, w:r*1.2, h:r*0.2, font:'"Readex Pro",sans-serif', sizePx:size*0.05, color:x.fillStyle, align:'center', dir:'ltr'});
  const id = x.getImageData(0,0,size,size); for (let i=3;i<id.data.length;i+=4) if (id.data[i] && Math.random()<0.07) id.data[i] *= 0.6; x.putImageData(id,0,0);
  return c.toDataURL('image/png');
};
async function qrCanvas(text, px){
  await U.loadScript(U.LIBS.qr); const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); const cell = Math.max(2, Math.floor(px/(n+8))); const c = U.canvas((n+8)*cell, (n+8)*cell); const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height); x.fillStyle = '#000';
  for (let r=0;r<n;r++) for (let k=0;k<n;k++) if (q.isDark(r,k)) x.fillRect((k+4)*cell, (r+4)*cell, cell, cell);
  return c;
}
W.qrText = ap => `WATHIQ|${ap.no}|v${ap.version||1}|${ap.fp.text.slice(0,24)}|${ap.status}`;
W.certificate = async function(ap){
  await U.ensureFonts(['El Messiri','Readex Pro']);
  const W0 = 1240, H0 = 1754; const c = U.canvas(W0, H0); const x = c.getContext('2d'); const ar = true;
  const F = (sz, b) => ({font:'"Readex Pro","IBM Plex Sans Arabic",sans-serif', sizePx:sz, bold:b, color:'#171b2f'});
  x.fillStyle = '#fff'; x.fillRect(0,0,W0,H0);
  x.strokeStyle = '#1f3a8a'; x.lineWidth = 3; x.strokeRect(50,50,W0-100,H0-100); x.lineWidth = 1; x.strokeRect(62,62,W0-124,H0-124);
  let top = 100;
  const logos = U.orgLogos().filter(l=>l.onDocs!==false && l.src);
  if (logos.length){ let lx = W0-100; const LH = 74;
    for (const l of logos){ try { const im = await U.loadImage(l.src); const lw = Math.min(260, im.width*LH/im.height); lx -= lw; if (lx < 100) break; x.drawImage(im, lx, 84, lw, LH); lx -= 36; } catch(e){} }
    x.strokeStyle = '#d8dbe7'; x.beginPath(); x.moveTo(100, 176); x.lineTo(W0-100, 176); x.stroke(); top = 196; }
  U.drawTextBlock(x, 'سجل الاعتماد — Approval record', Object.assign({x:90, y:top, w:W0-180, h:60, align:'center', dir:'rtl'}, F(44, true), {font:'"El Messiri","Readex Pro",sans-serif', color:'#1f3a8a'}));
  let y = top + 90;
  const row = (k, v, dirv) => { U.drawTextBlock(x, k, Object.assign({x:W0-460, y, w:370, h:40, align:'start', dir:'rtl'}, F(24, true), {color:'#5a6180'}));
    U.drawTextBlock(x, String(v||'—'), Object.assign({x:110, y, w:W0-590, h:40, align:'start', dir:dirv||'rtl'}, F(25, false))); y += 50; };
  row('رقم المعاملة', ap.no, 'ltr'); row('الموضوع', ap.title); row('الجهة', ap.dept); row('مقدم الطلب', ap.createdBy); row('تاريخ الإنشاء', stampTime(ap.created), 'ltr');
  row('الحالة', W.st(ap.status)+' — '+STATUS[ap.status][1]); row('الإصدار', 'v'+(ap.version||1), 'ltr'); row('بصمة المحتوى', W.fpShort(ap.fp)+'  ('+ap.fp.n+' صفحات)', 'ltr');
  y += 20; x.fillStyle = '#eceef5'; x.fillRect(90, y, W0-180, 52);
  const cols = [['#', 60], ['المعتمد', 300], ['الصفة', 220], ['القرار', 160], ['التاريخ', 260]]; let cx = W0-90;
  cols.forEach(([t, w])=>{ cx -= w; U.drawTextBlock(x, t, Object.assign({x:cx+8, y:y+12, w:w-16, h:30, align:'start', dir:'rtl'}, F(22, true))); });
  y += 52;
  for (let i=0;i<ap.steps.length;i++){
    const s = ap.steps[i]; cx = W0-90; const vals = [String(i+1), s.actor||s.name, s.role, W.st(s.status==='pending'?'review':s.status), s.at?stampTime(s.at):'—'];
    const rowH = s.comment ? 106 : 76;
    cols.forEach(([t,w], k)=>{ cx -= w; U.drawTextBlock(x, vals[k], Object.assign({x:cx+8, y:y+14, w:w-16, h:30, align:'start', dir: k===4?'ltr':'rtl'}, F(21, k===1), k===3 ? {color: s.status==='approved'?'#17703a':s.status==='rejected'?'#b42318':'#9a5b00'} : {})); });
    if (s.comment) U.drawTextBlock(x, '“'+s.comment+'”', Object.assign({x:120, y:y+74, w:W0-240, h:30, align:'start', dir:'rtl'}, F(19, false), {color:'#5a6180'}));
    if (s.proof) U.drawTextBlock(x, 'key '+s.proof.keyId, Object.assign({x:96, y:y+46, w:300, h:24, align:'left', dir:'ltr'}, F(15, false), {color:'#8a90aa'}));
    x.strokeStyle = '#d8dbe7'; x.beginPath(); x.moveTo(90, y+rowH); x.lineTo(W0-90, y+rowH); x.stroke(); y += rowH;
    if (y > H0-520) break;
  }
  const qr = await qrCanvas(W.qrText(ap), 300); x.drawImage(qr, 100, H0-430, 300, 300);
  const sealUrl = await W.seal({main: ap.status==='approved'?'معتمد':W.st(ap.status), sub: ap.no, date: today()}, ap.status==='approved'?'#a3172f':'#9a5b00', 600);
  const si = await U.loadImage(sealUrl); x.globalAlpha = 0.9; x.drawImage(si, W0-430, H0-450, 320, 320); x.globalAlpha = 1;
  U.drawTextBlock(x, 'التحقق: افتح هذا الملف في وثيق ← المعاملات ← تحقق. البصمة تكشف تغيّر النص أو شكل الصفحات بعد الاعتماد. التوقيعات هنا مرئية وموقّعة بمفتاح الجهاز، وليست شهادة رقمية صادرة من جهة ثقة.',
    Object.assign({x:430, y:H0-400, w:W0-900, h:240, align:'start', dir:'rtl', lineHeight:1.6}, F(19, false), {color:'#5a6180'}));
  U.drawTextBlock(x, 'Wathiq PDF · '+stampTime(), Object.assign({x:90, y:H0-100, w:W0-180, h:30, align:'center', dir:'ltr'}, F(17, false), {color:'#8a90aa'}));
  return c.toDataURL('image/png');
};

/* build an editable doc: signatures + seal on the stamp page, certificate page appended, approval JSON attached */
W.buildIssued = async function(ap){
  const file = await DB.docFile(ap.doc); const doc = await M.fromBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  doc.name = U.baseName(ap.doc.name)+'-'+ap.no+'.pdf';
  const pi = ap.stampPage==='first' ? 0 : doc.pages.length-1; const p = doc.pages[pi]; const [dw, dh] = M.dispSize(p);
  const signed = ap.steps.filter(s=>s.status==='approved');
  const perRow = Math.min(4, Math.max(1, signed.length)); const bw = Math.min(0.2, 0.84/(perRow+1)); const bh = 0.07;
  let k = 0;
  for (const s of signed){
    const row = Math.floor(k/perRow), col = k%perRow; const x0 = 0.92 - (col+1)*bw - col*0.01; const y0 = 0.8 - row*(bh+0.05);
    if (s.sig){ const id = await M.addImage(s.sig); const im = M.imgs[id]; let w = bw, hh = w*dw*(im.height/im.width)/dh; if (hh > bh){ hh = bh; w = hh*dh*(im.width/im.height)/dw; }
      p.objs.push({id:U.uid(), type:'sign', img:id, x:x0+(bw-w)/2, y:y0+bh-hh, w, h:hh, keepRatio:true}); }
    p.objs.push({id:U.uid(), type:'text', text:`${s.actor||s.name}${s.role?'\n'+s.role:''}\n${localISO(s.at).slice(0,10)}`, x:x0, y:y0+bh+0.004, w:bw, h:0.045, size:7.5, font:'Readex Pro', color:'#1f3a8a', align:'center', noText:true});
    k++;
  }
  if (signed.some(s=>s.seal) || ap.status==='approved'){
    const id = await M.addImage(await W.seal({main:'معتمد', sub:ap.no, date:today()}, '#a3172f'));
    const sw = 0.15, sh = sw*dw/dh; p.objs.push({id:U.uid(), type:'stamp', img:id, x:0.06, y:0.78, w:sw, h:sh, keepRatio:true, opacity:0.92, rotate:-8});
  }
  const cert = await M.addImage(await W.certificate(ap));
  doc.pages.push({id:U.uid(), s:null, i:0, baseRot:0, rot:0, w:595.28, h:841.89, ox:0, oy:0, objs:[{id:U.uid(), type:'image', img:cert, x:0, y:0, w:1, h:1, keepRatio:true}]});
  const rec = JSON.parse(JSON.stringify(ap)); delete rec.doc; rec.issued = Date.now(); rec.contentPages = ap.fp.n;
  doc.after = async out => { await out.attach(new TextEncoder().encode(JSON.stringify(rec)), 'wathiq-approval.json', {mimeType:'application/json', description:'Wathiq approval record'});
    out.setSubject(`${ap.no} — ${ap.title}`); out.setKeywords(['WathiqApproval', ap.no, W.fpShort(ap.fp)]); };
  return doc;
};
W.issue = async function(ap){
  const doc = await W.buildIssued(ap); await U.ensureFonts(['Readex Pro']);
  const {bytes} = await M.exportPdf(doc, new U.Task(), {after:doc.after, overlayScale:2.2});
  W.log(ap, W.me()||ap.createdBy, 'issued'); await W.save(ap);
  return new File([bytes], doc.name, {type:'application/pdf'});
};
/* portable package: the untouched document + the live workflow JSON as an attachment */
W.package = async function(ap){
  const file = await DB.docFile(ap.doc); const lib = await PDFLib.PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {ignoreEncryption:true});
  const rec = JSON.parse(JSON.stringify(ap)); delete rec.doc;
  // drop earlier embedded workflow files so the package carries exactly one current record
  try { const names = lib.catalog.lookup(PDFLib.PDFName.of('Names')); if (names) names.delete(PDFLib.PDFName.of('EmbeddedFiles')); } catch(e){}
  await lib.attach(new TextEncoder().encode(JSON.stringify(rec)), 'wathiq-workflow.json', {mimeType:'application/json', description:'Wathiq approval workflow', modificationDate:new Date()});
  return new File([await lib.save()], `${ap.no}-${U.baseName(ap.doc.name).replace(/^WQ-\d{4}-\d{4}-/,'')}.pdf`, {type:'application/pdf'});
};
async function attachmentsOf(src){ try { const a = await src.pdf.getAttachments(); return a || {}; } catch(e){ return {}; } }
const pickJson = (atts, name) => { const ks = Object.keys(atts).filter(k=>atts[k].filename===name || k===name); if (!ks.length) return null; // last one wins (newest)
  try { return JSON.parse(new TextDecoder().decode(atts[ks[ks.length-1]].content)); } catch(e){ return null; } };

/* called by App.openFiles for every opened PDF */
W.inspect = async function(doc, file){
  if (!doc || doc.sources.length!==1) return false;
  const atts = await attachmentsOf(doc.sources[0]);
  const wf = pickJson(atts, 'wathiq-workflow.json'); const issued = pickJson(atts, 'wathiq-approval.json');
  if (issued){ if (await U.ask(X('مستند معتمد','Approved document'), X(`هذا ملف معتمد برقم ${issued.no}. هل تريد التحقق منه؟`,`This is approved document ${issued.no}. Verify it?`), X('تحقق','Verify'))) await W.verifyDialog(doc, issued); return true; }
  if (wf){ if (await U.ask(X('حزمة اعتماد','Approval package'), X(`هذا الملف يحمل طلب الاعتماد ${wf.no} (${W.st(wf.status)}). استيراده إلى سجل المعاملات؟`,`This file carries approval request ${wf.no} (${W.st(wf.status)}). Import it into Transactions?`), X('استيراد','Import'))) await W.importPackage(doc, wf); return true; }
  return false;
};
W.importPackage = async function(doc, wf){
  const fp = await W.fingerprint(doc); const cmp = W.compare(wf.fp, fp);
  const bytes = doc.sources[0].bytes; const existing = await DB.get('approvals', wf.id);
  let ap = wf;
  if (existing && (existing.history||[]).length > (wf.history||[]).length && (existing.version||1) >= (wf.version||1)){ U.toast(X('لديك نسخة أحدث من هذا الطلب؛ تم الإبقاء عليها.','You already have a newer copy of this request; it was kept.')); ap = existing; }
  else { ap.doc = await DB.saveDoc(doc.name, bytes); W.log(ap, W.me()||'—', 'imported'); await W.save(ap); }
  if (!cmp.ok) U.toast(X('تنبيه: محتوى المستند لا يطابق البصمة المسجلة في الطلب.','Warning: the document content does not match the request fingerprint.'), 'err');
  else U.toast(X('تم الاستيراد. المحتوى مطابق للبصمة.','Imported. Content matches the fingerprint.'), 'ok');
  App.go('work'); Work.tab('approvals'); W.detail(ap.id);
};
W.verify = async function(doc, rec){
  rec = rec || pickJson(await attachmentsOf(doc.sources[0]), 'wathiq-approval.json') || pickJson(await attachmentsOf(doc.sources[0]), 'wathiq-workflow.json');
  if (!rec) return {found:false};
  const n = rec.contentPages || rec.fp.n; const cur = await W.fingerprint(doc, Math.min(n, doc.pages.length));
  const cmp = W.compare(rec.fp, cur, rec.issued ? 40 : 14);
  const steps = []; for (let i=0;i<rec.steps.length;i++) steps.push(await W.verifyStep(rec, i));
  return {found:true, rec, cmp, steps, extraPages: doc.pages.length - n - (rec.issued?1:0)};
};
W.verifyDialog = async function(doc, rec){
  const r = await W.verify(doc, rec);
  if (!r.found){ U.modal(X('التحقق','Verify'), h('p', null, X('لا يحتوي الملف على سجل اعتماد من وثيق.','This file carries no Wathiq approval record.')), [{label:t('close')}]); return r; }
  const good = r.cmp.ok && r.steps.every(v=>v!==false) && r.extraPages<=0;
  const body = h('div', {style:{display:'flex', flexDirection:'column', gap:'12px'}},
    h('div', {class:'row'}, h('span', {class:'mark'+(good?' ok':'')}, good ? X('سليم','Intact') : X('يحتاج مراجعة','Needs review')), h('b', {class:'num'}, r.rec.no), h('span', null, r.rec.title)),
    h('dl', {class:'kv'},
      h('dt', null, X('نص المستند','Document text')), h('dd', null, r.cmp.text ? X('مطابق للبصمة','Matches the fingerprint') : X('مختلف عن المعتمد','Differs from the approved text')),
      h('dt', null, X('شكل الصفحات','Page appearance')), h('dd', null, r.cmp.reason==='pages' ? X('عدد الصفحات مختلف','Page count differs') : (r.cmp.visual <= (r.rec.issued?40:14) ? X('مطابق (مع الأختام)','Matches (with stamps)') : X('تغيّر بشكل ملحوظ','Changed noticeably'))),
      h('dt', null, X('توقيعات الأجهزة','Device signatures')), h('dd', null, r.steps.map((v,i)=>`${i+1}: ${v===null?'—':v?'✓':'✗'}`).join('  ')),
      h('dt', null, X('البصمة','Fingerprint')), h('dd', {class:'num'}, W.fpShort(r.rec.fp)),
      h('dt', null, X('الحالة','Status')), h('dd', null, W.st(r.rec.status))),
    h('ol', {class:'chain'}, r.rec.steps.map((s,i)=>h('li', {class:'st-'+s.status}, h('span', {class:'dot'}, String(i+1)), h('div', {class:'who'}, h('b', null, s.actor||s.name), h('span', null, [s.role, s.at?fmtDate(s.at):''].filter(Boolean).join(' — '))), h('span', null, W.st(s.status==='pending'?'review':s.status))))),
    h('p', {class:'callout info'}, X('البصمة تكشف تغيير النص أو الصفحات بعد الاعتماد، والتوقيع بمفتاح الجهاز يكشف تعديل سجل الخطوات. هذا ليس توقيعًا رقميًا معتمدًا من جهة ثقة؛ للأثر القانوني استخدم مزود توقيع إلكتروني مرخّص.','The fingerprint detects text or page changes after approval, and device-key signatures detect edits to the step record. This is not a certificate-based signature from a trust provider; for legal effect use a licensed e-signature provider.')));
  U.modal(X('التحقق من الاعتماد','Verify approval'), body, [{label:t('close'), kind:'primary'}], {wide:true});
  return r;
};

/* ---------- UI: new request ---------- */
W.newDialog = async function(file){
  if (!file){
    if (E.doc){ const bytes = await E.currentBytes(); file = new File([bytes], E.doc.name, {type:'application/pdf'}); }
    else { const [f] = await U.pickFiles('application/pdf,image/*'); if (!f) return; file = M.isPdf(f) ? f : new File([await M.imageToPdfBytes(f)], U.baseName(f.name)+'.pdf', {type:'application/pdf'}); }
  }
  const tpl = U.store.get('chainTpl', [{name:'', role:X('رئيس القسم','Head of section')}, {name:'', role:X('المدير العام','General manager')}]);
  const steps = tpl.map(x=>({...x}));
  const f = id => document.getElementById(id);
  const list = h('div', {style:{display:'flex', flexDirection:'column', gap:'6px'}});
  const renderSteps = ()=>{ list.innerHTML=''; steps.forEach((s,i)=>{ const n = h('input', {class:'field', dir:'auto', value:s.name, placeholder:X('اسم المعتمد','Approver name'), style:{flex:'1 1 140px'}}); n.oninput = ()=>s.name = n.value;
    const r = h('input', {class:'field', dir:'auto', value:s.role, placeholder:X('الصفة','Role'), style:{flex:'1 1 120px'}}); r.oninput = ()=>s.role = r.value;
    list.append(h('div', {class:'row'}, h('span', {class:'pill'}, String(i+1)), n, r, h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ steps.splice(i,1); renderSteps(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'}))); }); };
  renderSteps();
  const body = [
    h('div', {class:'fitem'}, h('span', {class:'nm'}, file.name), h('span', {class:'sz'}, U.fmtSize(file.size))),
    h('label', {class:'note', for:'apT'}, X('الموضوع','Subject')), h('input', {class:'field', id:'apT', dir:'auto', value:U.baseName(file.name), style:{width:'100%'}}),
    h('div', {class:'row'}, h('div', {style:{flex:'1 1 180px', display:'flex', flexDirection:'column', gap:'4px'}}, h('label', {class:'note', for:'apD'}, X('الجهة / القسم','Department')), h('input', {class:'field', id:'apD', dir:'auto', value:U.store.get('lastDept','')})),
      h('div', {style:{flex:'1 1 140px', display:'flex', flexDirection:'column', gap:'4px'}}, h('label', {class:'note', for:'apBy'}, X('مقدم الطلب','Requested by')), h('input', {class:'field', id:'apBy', dir:'auto', value:W.me()}))),
    h('div', {class:'row'},
      h('label', {class:'note', for:'apP'}, X('الأولوية','Priority')), h('select', {class:'field', id:'apP'}, ['high','med','low'].map(k=>h('option', {value:k, selected:k==='med'}, W.pr(k)))),
      h('label', {class:'note', for:'apDue'}, X('الاستحقاق','Due')), h('input', {class:'field', id:'apDue', type:'date'}),
      h('label', {class:'note', for:'apM'}, X('التسلسل','Order')), h('select', {class:'field', id:'apM'}, h('option', {value:'sequential'}, X('متتابع','Sequential')), h('option', {value:'parallel'}, X('متوازٍ (الجميع معًا)','Parallel (all at once)'))),
      h('label', {class:'note', for:'apSP'}, X('صفحة التوقيعات','Signature page')), h('select', {class:'field', id:'apSP'}, h('option', {value:'last'}, X('الأخيرة','Last')), h('option', {value:'first'}, X('الأولى','First')))),
    h('b', null, X('سلسلة الاعتماد','Approval chain')), list,
    h('button', {class:'btn', onclick:()=>{ steps.push({name:'', role:''}); renderSteps(); }}, X('إضافة معتمد','Add approver')),
    h('label', {class:'note', for:'apN'}, X('ملاحظة للمعتمدين (اختياري)','Note to approvers (optional)')), h('textarea', {class:'field', id:'apN', dir:'auto'}),
    h('p', {class:'note'}, X('يُحفظ الطلب ونسخة من المستند على هذا الجهاز. لإرساله لشخص آخر استخدم «إرسال الحزمة» بعد الإنشاء.','The request and a copy of the document are kept on this device. To route it to someone else, use “Send package” after creating it.'))];
  U.modal(X('طلب اعتماد جديد','New approval request'), body, [{label:t('cancel')}, {label:X('إرسال للاعتماد','Send for approval'), kind:'primary', onClick: async (close, btn)=>{
    const valid = steps.filter(s=>s.name.trim());
    if (!f('apT').value.trim()) return U.toast(X('اكتب الموضوع.','Enter a subject.'));
    if (!valid.length) return U.toast(X('أضف معتمدًا واحدًا على الأقل.','Add at least one approver.'));
    btn.disabled = true;
    try {
      U.store.set('chainTpl', valid.map(s=>({name:s.name, role:s.role}))); U.store.set('lastDept', f('apD').value);
      const ap = await W.create(file, {title:f('apT').value.trim(), dept:f('apD').value.trim(), by:f('apBy').value.trim(), priority:f('apP').value, due:f('apDue').value, mode:f('apM').value, note:f('apN').value.trim(), steps:valid});
      ap.stampPage = f('apSP').value; await DB.put('approvals', ap);
      close(); U.toast(X(`أُنشئ الطلب ${ap.no}`,`Created ${ap.no}`), 'ok'); App.go('work'); Work.tab('approvals'); W.detail(ap.id);
    } catch(e){ console.error(e); U.toast(t('error',{e:e.message}),'err'); btn.disabled = false; }
  }}], {wide:true, sticky:true});
};

/* ---------- UI: act on a step ---------- */
W.actDialog = function(ap, idx, action){
  const s = ap.steps[idx]; let sig = null;
  const sigs = U.store.get('sigs', []);
  const sigWrap = h('div', {class:'sigs'});
  const renderSigs = ()=>{ sigWrap.innerHTML=''; [null, ...U.store.get('sigs', [])].forEach(u=>{ const b = h('button', {'aria-pressed':String(sig===u), style:{outline: sig===u ? '2px solid var(--accent)' : ''}, onclick:()=>{ sig = u; renderSigs(); }}, u ? h('img', {src:u, alt:''}) : X('بدون توقيع','No signature')); sigWrap.append(b); });
    sigWrap.append(h('button', {onclick:()=>Sig.open(u=>{ sig = u; renderSigs(); })}, X('توقيع جديد','New signature'))); };
  if (sigs.length) sig = sigs[0];
  renderSigs();
  const actor = h('input', {class:'field', id:'actN', dir:'auto', value:s.name, style:{width:'100%'}});
  const cmt = h('textarea', {class:'field', id:'actC', dir:'auto', placeholder: action==='approved' ? X('ملاحظة (اختياري)','Comment (optional)') : X('السبب (مطلوب)','Reason (required)')});
  const seal = h('input', {type:'checkbox', id:'actS', checked:idx===ap.steps.length-1});
  const label = {approved:X('اعتماد','Approve'), rejected:X('رفض','Reject'), returned:X('إعادة للتعديل','Return for changes')}[action];
  const body = [h('p', null, `${ap.no} — ${ap.title}`), h('label', {class:'note', for:'actN'}, X('الاسم المسجّل','Recorded name')), actor, h('label', {class:'note', for:'actC'}, X('التعليق','Comment')), cmt];
  if (action==='approved') body.push(h('b', null, X('التوقيع','Signature')), sigWrap, h('label', {class:'row'}, seal, X('إضافة الختم الرسمي في النسخة المعتمدة','Add the official seal on the issued copy')));
  body.push(h('p', {class:'note'}, X('يُسجَّل القرار ويوقَّع بمفتاح هذا الجهاز مع بصمة المستند الحالية.','The decision is recorded and signed with this device key together with the current document fingerprint.')));
  U.modal(label, body, [{label:t('cancel')}, {label, kind: action==='approved' ? 'primary' : 'danger', onClick: async (close, btn)=>{
    if (action!=='approved' && !cmt.value.trim()) return U.toast(X('اكتب السبب.','Enter a reason.'));
    btn.disabled = true;
    try { await W.act(ap, idx, action, {actor:actor.value.trim()||s.name, comment:cmt.value.trim(), sig: action==='approved'?sig:null, seal:seal.checked}); close(); U.toast(X('تم تسجيل القرار.','Decision recorded.'), 'ok'); W.detail(ap.id); Work.refresh(); }
    catch(e){ U.toast(e.message, 'err'); btn.disabled = false; }
  }}]);
};

/* ---------- UI: detail ---------- */
let openModal = null;
W.detail = async function(id){
  const ap = await DB.get('approvals', id); if (!ap) return;
  if (openModal) openModal.close();
  const cur = W.current(ap);
  const integ = h('span', {class:'note'}, X('جارٍ فحص البصمة…','Checking fingerprint…'));
  (async()=>{ try { const file = await DB.docFile(ap.doc); const d = await M.fromBytes(new Uint8Array(await file.arrayBuffer()), file.name); const c = W.compare(ap.fp, await W.fingerprint(d)); integ.textContent = c.ok ? X('المحتوى مطابق للبصمة ✓','Content matches ✓') : X('المحتوى لا يطابق البصمة ✗','Content does not match ✗'); integ.style.color = c.ok ? 'var(--ok)' : 'var(--err)'; } catch(e){ integ.textContent = e.message; } })();
  const proofs = h('span', {class:'note'});
  (async()=>{ const r = []; for (let i=0;i<ap.steps.length;i++) r.push(await W.verifyStep(ap, i)); proofs.textContent = r.some(v=>v===false) ? X('سجل الخطوات تم التلاعب به ✗','Step record was altered ✗') : r.some(v=>v) ? X('توقيعات الخطوات سليمة ✓','Step signatures valid ✓') : ''; proofs.style.color = r.some(v=>v===false)?'var(--err)':'var(--ok)'; })();
  const chain = h('ol', {class:'chain'}, ap.steps.map((s,i)=>{
    const isCur = cur.includes(i);
    return h('li', {class: isCur ? 'st-current' : 'st-'+s.status},
      h('span', {class:'dot'}, String(i+1)),
      h('div', {class:'who'}, h('b', null, s.actor||s.name), h('span', null, [s.role, s.at ? fmtDate(s.at) : (isCur ? X('بانتظار القرار','Awaiting decision') : X('لم يصل بعد','Not reached yet'))].filter(Boolean).join(' — '))),
      s.status==='approved' ? h('span', {class:'mark ok'}, X('معتمد','Approved')) : s.status==='rejected' ? h('span', {class:'mark'}, X('مرفوض','Rejected')) : s.status==='returned' ? h('span', {class:'pill s-returned'}, X('معاد','Returned')) :
        isCur ? h('div', {class:'row'}, h('button', {class:'btn primary', onclick:()=>W.actDialog(ap, i, 'approved')}, X('اعتماد','Approve')), h('button', {class:'btn', onclick:()=>W.actDialog(ap, i, 'returned')}, X('إعادة','Return')), h('button', {class:'btn danger', onclick:()=>W.actDialog(ap, i, 'rejected')}, X('رفض','Reject'))) : h('span'),
      s.comment ? h('div', {class:'cmt'}, s.comment) : null,
      s.sig ? h('div', {class:'cmt', style:{background:'#fff'}}, h('img', {src:s.sig, alt:'', style:{maxHeight:'46px'}})) : null);
  }));
  const acts = h('div', {class:'row'},
    h('button', {class:'btn', onclick:async()=>{ m.close(); App.openFiles([await DB.docFile(ap.doc)], true); }}, X('فتح المستند','Open document')),
    h('button', {class:'btn', onclick:async()=>{ const f = await W.package(ap); W.shareFile(f, ap); }}, X('إرسال الحزمة','Send package')),
    ap.status==='approved' ? h('button', {class:'btn primary', onclick:async(e)=>{ e.target.disabled = true; try { const f = await W.issue(ap); await U.saveFile(f.name, f); } catch(er){ U.toast(t('error',{e:er.message}),'err'); } e.target.disabled = false; }}, X('إصدار النسخة المعتمدة','Issue approved copy')) : null,
    ap.status==='approved' ? h('button', {class:'btn', onclick:async()=>{ m.close(); const d = await W.buildIssued(ap); await E.open(d); E.doc.dirty = true; U.toast(X('عدّل مواضع التواقيع ثم اضغط حفظ PDF.','Adjust signature positions, then press Save PDF.')); }}, X('ضبط المواضع في المحرر','Adjust in editor')) : null,
    ['returned','rejected'].includes(ap.status) ? h('button', {class:'btn primary', onclick:async()=>{ let f; if (E.doc && await U.ask(X('إعادة الإرسال','Resubmit'), X('استخدام المستند المفتوح في المحرر كنسخة جديدة؟','Use the document open in the editor as the new version?'), X('نعم','Yes'))) f = new File([await E.currentBytes()], E.doc.name, {type:'application/pdf'}); else [f] = await U.pickFiles('application/pdf'); if (!f) return; await W.resubmit(ap, f, X('نسخة معدلة','Revised version')); U.toast(X('أُعيد الإرسال للاعتماد.','Resubmitted.'),'ok'); W.detail(ap.id); Work.refresh(); }}, X('إعادة الإرسال بنسخة معدلة','Resubmit revised version')) : null,
    h('button', {class:'btn danger', onclick:async()=>{ if (!(await U.ask(t('del'), X(`حذف الطلب ${ap.no} من هذا الجهاز؟`,`Delete ${ap.no} from this device?`), t('del'), 'danger'))) return; await DB.del('approvals', ap.id); await DB.del('docs', ap.doc.id); await Tasks.removeForApproval(ap.id); m.close(); Work.refresh(); }}, t('del')));
  const hist = h('div', {class:'hist'}, (ap.history||[]).slice().reverse().map(e=>h('div', null, `${fmtDate(e.at)} — ${e.by||'—'}: ${({create:X('أنشأ الطلب','created'), approved:X('اعتمد','approved'), rejected:X('رفض','rejected'), returned:X('أعاد للتعديل','returned'), resubmit:X('أعاد الإرسال','resubmitted'), issued:X('أصدر النسخة المعتمدة','issued'), imported:X('استورد الحزمة','imported')})[e.action]||e.action}${e.comment?' — '+e.comment:''}`)));
  const body = h('div', {class:'split2'},
    h('div', {style:{display:'flex', flexDirection:'column', gap:'12px', minWidth:0}},
      h('div', {class:'row'}, h('span', {class:'pill s-'+ap.status}, W.st(ap.status)), h('b', {class:'num'}, ap.no), h('span', {class:'note'}, 'v'+(ap.version||1)), W.isLate(ap.due, ap.status) ? h('span', {class:'pill s-late'}, X('متأخر','Overdue')) : null),
      h('h3', {style:{margin:0, fontFamily:'var(--f-brand)', fontSize:'20px'}}, ap.title),
      ap.note ? h('p', {class:'callout info', style:{margin:0}}, ap.note) : null,
      chain, acts),
    h('div', {class:'panel', style:{display:'flex', flexDirection:'column', gap:'10px'}},
      h('dl', {class:'kv'}, h('dt', null, X('الجهة','Department')), h('dd', null, ap.dept||'—'), h('dt', null, X('مقدم الطلب','Requested by')), h('dd', null, ap.createdBy||'—'),
        h('dt', null, X('الأولوية','Priority')), h('dd', {class:'prio-'+ap.priority}, W.pr(ap.priority)), h('dt', null, X('الاستحقاق','Due')), h('dd', null, fmtDay(ap.due)),
        h('dt', null, X('التسلسل','Order')), h('dd', null, ap.mode==='parallel'?X('متوازٍ','Parallel'):X('متتابع','Sequential')), h('dt', null, X('المستند','Document')), h('dd', null, `${ap.doc.name} · ${U.fmtSize(ap.doc.size)}`),
        h('dt', null, X('البصمة','Fingerprint')), h('dd', {class:'num'}, W.fpShort(ap.fp))),
      integ, proofs, h('b', null, X('السجل','History')), hist));
  const m = openModal = U.modal(`${X('طلب اعتماد','Approval')} ${ap.no}`, body, [], {wide:true, onClose:()=>{ if (openModal===m) openModal = null; }});
  m.dlg.style.width = 'min(1040px,100%)';
};
W.shareFile = async function(f, ap){
  const text = X(`طلب اعتماد ${ap.no}: ${ap.title}. افتح الملف المرفق في وثيق PDF لاتخاذ القرار.`,`Approval request ${ap.no}: ${ap.title}. Open the attached file in Wathiq PDF to decide.`);
  if (!U.inArtifact() && navigator.canShare && navigator.canShare({files:[f]})){ try { await navigator.share({files:[f], title:ap.no, text}); return; } catch(e){ if (e.name==='AbortError') return; } }
  const saved = await U.saveFile(f.name, f);
  if (saved) U.modal(X('إرسال الحزمة','Send package'), [h('p', null, X('حُفظ ملف الحزمة. أرفقه في رسالة للمعتمد التالي:','The package file was saved. Attach it in a message to the next approver:')),
    h('div', {class:'social'}, h('a', {class:'wa', href:'https://wa.me/?text='+encodeURIComponent(text), target:'_blank', rel:'noopener'}, X('واتساب','WhatsApp')), h('a', {class:'tg', href:'https://t.me/share/url?url='+encodeURIComponent('https://wathiq.app')+'&text='+encodeURIComponent(text), target:'_blank', rel:'noopener'}, X('تيليجرام','Telegram')), h('a', {class:'ml', href:'mailto:?subject='+encodeURIComponent(ap.no+' — '+ap.title)+'&body='+encodeURIComponent(text), target:'_blank'}, X('بريد','Email'))),
    h('p', {class:'note'}, X('الرسالة تفتح دون الملف؛ أرفق الملف المحفوظ يدويًا.','The message opens without the file; attach the saved file yourself.'))], [{label:t('close')}]);
};

/* ---------- list view ---------- */
let filter = 'all', query = '';
W.render = async function(wrap){
  const all = (await DB.all('approvals')).sort((a,b)=>(b.updated||b.created)-(a.updated||a.created));
  const cnt = k => all.filter(a=>a.status===k).length;
  const stats = h('div', {class:'stats'}, ...[[all.length, X('كل الطلبات','All requests')], [cnt('review'), X('قيد الاعتماد','In review')], [cnt('approved'), X('معتمدة','Approved')], [cnt('returned')+cnt('rejected'), X('معادة أو مرفوضة','Returned or rejected')], [all.filter(a=>W.isLate(a.due, a.status)).length, X('متأخرة','Overdue')]].map(([n,l])=>h('div', null, h('b', null, String(n)), h('span', null, l))));
  const seg = h('div', {class:'seg', role:'group'}, ...['all','review','approved','returned','rejected'].map(k=>h('button', {'aria-pressed':String(filter===k), onclick:()=>{ filter = k; Work.refresh(); }}, k==='all'?t('all'):W.st(k))));
  const q = h('input', {class:'field', type:'search', dir:'auto', placeholder:X('بحث برقم المعاملة أو الموضوع','Search number or subject'), value:query, style:{flex:'1 1 200px', maxWidth:'320px'}});
  q.addEventListener('input', ()=>{ query = q.value; clearTimeout(q._t); q._t = setTimeout(()=>Work.refresh(true), 250); });
  const bar = h('div', {class:'toolbar'}, h('button', {class:'btn primary', onclick:()=>W.newDialog()}, X('طلب اعتماد جديد','New approval request')),
    h('button', {class:'btn', onclick:async()=>{ const [f] = await U.pickFiles('application/pdf'); if (!f) return; const d = await M.fromFiles([f]); if (!(await W.inspect(d, f))) U.toast(X('الملف لا يحمل طلب اعتماد أو سجل اعتماد.','The file carries no approval request or record.')); }}, X('فتح حزمة / تحقق','Open package / verify')),
    seg, q);
  const rows = all.filter(a=>(filter==='all'||a.status===filter) && (!query || (a.no+' '+a.title+' '+(a.dept||'')).toLowerCase().includes(query.toLowerCase())));
  let table;
  if (!all.length) table = h('div', {class:'empty', style:{height:'auto', padding:'40px 16px'}}, h('span', {html:U.ico('stamp')}), h('b', null, X('لا توجد طلبات اعتماد بعد','No approval requests yet')),
    h('span', null, X('أنشئ طلبًا من مستند: حدّد المعتمدين بالترتيب، ثم يعتمد كل منهم بتوقيعه وختمه، وتُصدر نسخة معتمدة مع سجل يمكن التحقق منه.','Create one from a document: set approvers in order, each approves with signature and seal, then issue an approved copy with a verifiable record.')),
    h('button', {class:'btn primary', onclick:()=>W.newDialog()}, X('طلب اعتماد جديد','New approval request')));
  else table = h('div', {class:'tbl-wrap'}, h('table', {class:'reg'},
    h('thead', null, h('tr', null, ...[X('رقم المعاملة','No.'), X('الموضوع','Subject'), X('الجهة','Department'), X('المرحلة الحالية','Current step'), X('الحالة','Status'), X('الأولوية','Priority'), X('الاستحقاق','Due'), X('آخر تحديث','Updated')].map(x=>h('th', null, x)))),
    h('tbody', null, rows.map(a=>{ const c = W.current(a).map(i=>a.steps[i].name).join('، ');
      return h('tr', {class:'click', tabindex:'0', onclick:()=>W.detail(a.id), onkeydown:e=>{ if (e.key==='Enter') W.detail(a.id); }},
        h('td', null, h('span', {class:'num'}, a.no)), h('td', null, h('b', null, a.title)), h('td', null, a.dept||'—'), h('td', null, c || '—'),
        h('td', null, h('span', {class:'pill s-'+(W.isLate(a.due,a.status)?'late':a.status)}, W.isLate(a.due,a.status) ? X('متأخر','Overdue') : W.st(a.status))),
        h('td', {class:'prio-'+a.priority}, W.pr(a.priority)), h('td', null, h('span', {class:'num'}, a.due||'—')), h('td', null, h('span', {class:'num'}, fmtDate(a.updated||a.created)))); }))));
  wrap.append(stats, bar, table);
};
})();
