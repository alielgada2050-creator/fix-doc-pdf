/* وثيق — assistant (المساعد): summaries, questions, data extraction, translation, letters and task extraction.
   Providers: Claude inside claude.ai (the viewer's own account), or the user's own key for a free-tier provider
   (Google AI Studio, Groq, OpenRouter, Mistral), a local OpenAI-compatible server, or the Wathiq proxy (key stays on the server). */
(function(){
const AI = window.Assist = {};
const {h, $} = U;
AI.PROVIDERS = [
  {id:'claude', name:'Claude', kind:'sample', note:{ar:'يعمل داخل claude.ai بحسابك. يطلب إذنك عند أول استخدام.', en:'Works inside claude.ai with your account. Asks your permission on first use.'}},
  {id:'gemini', name:'Google Gemini (AI Studio)', base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.5-flash', vmodel:'gemini-2.5-flash', keyUrl:'https://aistudio.google.com/apikey', note:{ar:'طبقة مجانية بحدود يومية. في الطبقة المجانية قد تستخدم Google المحتوى لتحسين خدماتها؛ لا ترسل مستندات سرية.', en:'Free tier with daily limits. On the free tier Google may use content to improve its services; do not send confidential documents.'}},
  {id:'groq', name:'Groq', base:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile', vmodel:'meta-llama/llama-4-scout-17b-16e-instruct', keyUrl:'https://console.groq.com/keys', note:{ar:'سريع جدًا، طبقة مجانية بحدود للطلبات في الدقيقة واليوم.', en:'Very fast; free tier with per-minute and daily request limits.'}},
  {id:'openrouter', name:'OpenRouter', base:'https://openrouter.ai/api/v1', model:'meta-llama/llama-3.3-70b-instruct:free', vmodel:'google/gemma-3-27b-it:free', keyUrl:'https://openrouter.ai/keys', note:{ar:'نماذج مجانية بعلامة :free وحدود يومية. بعض المزودين قد يسجّلون الطلبات.', en:'Free models marked :free with daily limits. Some upstream providers may log prompts.'}},
  {id:'mistral', name:'Mistral', base:'https://api.mistral.ai/v1', model:'mistral-small-latest', vmodel:'mistral-small-latest', keyUrl:'https://console.mistral.ai/api-keys', note:{ar:'خطة Experiment مجانية؛ تتطلب التحقق برقم الهاتف وقد تشمل استخدام البيانات للتدريب.', en:'Free Experiment plan; needs phone verification and may include training on data.'}},
  {id:'nvidia', name:'NVIDIA NIM', base:'https://integrate.api.nvidia.com/v1', model:'meta/llama-3.3-70b-instruct', vmodel:'meta/llama-3.2-90b-vision-instruct', keyUrl:'https://build.nvidia.com/', note:{ar:'وصول مجاني للمطورين بحدود للطلبات (يتطلب حسابًا). المتصفح غالبًا يُمنع من الاتصال المباشر (CORS)، فاستخدمه عبر خادم وثيق الوسيط بوضع مفتاحه في server/.env.', en:'Free developer access with request limits (account required). Browsers are usually blocked from calling it directly (CORS), so use it through the Wathiq proxy with the key in server/.env.'}},
  {id:'proxy', name:X('خادم وثيق الوسيط','Wathiq proxy'), base:'', model:'', note:{ar:'المفتاح محفوظ في الخادم (server/.env) ولا يصل للمتصفح.', en:'The key is stored on the server (server/.env) and never reaches the browser.'}},
  {id:'custom', name:X('خادم متوافق مع OpenAI','OpenAI-compatible server'), base:'http://localhost:11434/v1', model:'qwen2.5:7b', vmodel:'qwen2.5vl:7b', note:{ar:'مثل Ollama أو LM Studio على جهازك: بدون إنترنت وبدون مفتاح.', en:'Such as Ollama or LM Studio on your computer: offline and keyless.'}}
];
const cfg = () => { const c = U.store.get('ai', {provider: U.inArtifact() ? 'claude' : 'gemini', models:{}, bases:{}, remember:false}); c.vmodels = c.vmodels || {}; return c; };
const setCfg = c => U.store.set('ai', c);
const keyOf = id => U.session.get('aikey.'+id) || U.store.get('aikey.'+id, '');
const setKey = (id, v, remember) => { U.session.set('aikey.'+id, v); if (remember) U.store.set('aikey.'+id, v); else U.store.del('aikey.'+id); };
const prov = () => AI.PROVIDERS.find(p=>p.id===cfg().provider) || AI.PROVIDERS[0];
let sampleFn; let sampleChecked = false;
async function getSample(){ if (sampleChecked) return sampleFn; sampleChecked = true; try { if (U.inArtifact()) sampleFn = await window.claude.use('sample'); } catch(e){ sampleFn = null; } return sampleFn; }

/* ---------- document context ---------- */
let ctx = null; // {name, text, pages, truncated}
const LIMIT = 60000;
AI.fromDoc = async function(doc, name){
  let text = ''; for (let i=0;i<doc.pages.length;i++){ const lines = M.textLines(await M.getText(doc, doc.pages[i])); text += `\n[${X('صفحة','Page')} ${i+1}]\n` + lines.map(l=>l.text).join('\n'); }
  text = text.trim(); return {name: name||doc.name, text: text.slice(0, LIMIT), pages:doc.pages.length, truncated: text.length > LIMIT, empty: text.replace(/\[[^\]]+\]/g,'').trim().length < 20};
};
AI.fromFile = async function(f){
  const e = U.ext(f.name);
  if (M.isPdf(f) || M.isImage(f)){ const d = await M.fromFiles([f]); let c = await AI.fromDoc(d, f.name);
    if (c.empty && window.OCR){ U.toast(X('المستند ممسوح ضوئيًا؛ جارٍ قراءة النص (OCR) على جهازك…','The document is scanned; reading its text (OCR) on your device…'));
      const text = await OCR.textOfDoc(d, (i, n)=>U.toast(X(`قراءة الصفحة ${i+1} من ${n}…`,`Reading page ${i+1} of ${n}…`)));
      c = {name:f.name, text:text.slice(0, LIMIT), pages:d.pages.length, truncated:text.length > LIMIT, empty: text.replace(/\[[^\]]+\]/g,'').trim().length < 20, ocr:true}; }
    return c; }
  if (e==='docx'){ await U.loadScript(U.LIBS.mammoth); const r = await mammoth.extractRawText({arrayBuffer: await f.arrayBuffer()}); return {name:f.name, text:r.value.slice(0, LIMIT), truncated:r.value.length>LIMIT}; }
  if (['xlsx','xls','csv','ods'].includes(e)){ await U.loadScript(U.LIBS.xlsx); const wb = XLSX.read(await f.arrayBuffer(), {type:'array'}); const s = wb.SheetNames.map(n=>`# ${n}\n`+XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n'); return {name:f.name, text:s.slice(0, LIMIT), truncated:s.length>LIMIT}; }
  const s = await f.text(); return {name:f.name, text:s.slice(0, LIMIT), truncated:s.length>LIMIT};
};

/* ---------- calling a model ---------- */
async function consent(p){
  if (p.kind==='sample' || p.id==='custom' || U.store.get('aiConsent.'+p.id)) return true;
  const ok = await U.ask(X('إرسال إلى مزود خارجي','Send to an external provider'), X(`سيُرسل نص سؤالك ونص المستند المحدد إلى ${p.name} لمعالجته خارج جهازك. ${L(p.note)}`,`Your question and the selected document text will be sent to ${p.name} for processing outside your device. ${L(p.note)}`), X('موافق، أرسل','OK, send'));
  if (ok) U.store.set('aiConsent.'+p.id, true); return ok;
}
AI.call = async function(messages, {onText, signal, json, vision}={}){
  const p = prov(); const c = cfg();
  if (!(await consent(p))) throw Object.assign(new Error(X('أُلغي الإرسال.','Sending canceled.')), {quiet:true});
  if (p.kind==='sample'){
    const sample = await getSample(); if (!sample) throw new Error(X('Claude متاح فقط عند فتح التطبيق داخل claude.ai. اختر مزودًا آخر من الإعدادات.','Claude is available only when the app runs inside claude.ai. Pick another provider in settings.'));
    const images = []; const flat = m => Array.isArray(m.content) ? m.content.map(part=>{ if (part.type==='image_url'){ if (part._blob) images.push(part._blob); return ''; } return part.text||''; }).join('\n') : m.content;
    const input = messages.filter(m=>m.role!=='system').map(m=>({role:m.role, content:flat(m)}));
    const sys = messages.find(m=>m.role==='system'); if (sys) input[0] = {role:'user', content: sys.content + '\n\n' + input[0].content};
    const so = {onText: onText ? ({text})=>onText(text) : undefined, signal, modelTier:'default', cache:false};
    if (images.length){ let lim = null; try { lim = sample.limits ? await sample.limits() : null; } catch(e){} if (!lim || !lim.images) throw new Error(X('قراءة الصور غير متاحة لـ Claude في هذه الصفحة. اختر Gemini أو مزودًا آخر يدعم الصور من إعدادات المساعد.','Image reading is not available to Claude on this page. Pick Gemini or another provider with vision in assistant settings.')); so.images = images; }
    try { const r = await sample(input, so); return r.text; }
    catch(e){ const map = {not_granted:X('لم يُسمح باستخدام Claude لهذه الصفحة.','Claude was not allowed for this page.'), rate_limited:X('طلبات كثيرة؛ انتظر قليلًا ثم حاول.','Too many requests; wait a moment and try again.')}; throw Object.assign(new Error(map[e.code] || e.message || e.code), {text:e.text}); }
  }
  let base = (c.bases[p.id] || p.base || '').replace(/\/$/, ''); const model = vision ? (c.vmodels[p.id] || p.vmodel || c.models[p.id] || p.model) : (c.models[p.id] || p.model); const headers = {'Content-Type':'application/json'};
  if (p.id==='proxy'){ base = (U.store.get('cloudCfg', {}).odooProxyUrl || (window.WATHIQ_CONFIG||{}).odooProxyUrl || '').replace(/\/$/, '') + '/api/ai'; headers.Authorization = 'Bearer ' + (U.session.get('odooTok') || (window.Auth && Auth.token && Auth.token()) || ''); }
  else { const k = keyOf(p.id); if (!k && p.id!=='custom') throw new Error(X(`أدخل مفتاح ${p.name} في إعدادات المساعد.`,`Enter your ${p.name} key in assistant settings.`)); if (k) headers.Authorization = 'Bearer '+k; }
  if (p.id==='openrouter'){ headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Wathiq PDF'; }
  if (!base) throw new Error(X('أدخل عنوان الخادم في الإعدادات.','Enter the server URL in settings.'));
  const body = {model, messages: messages.map(m=>Array.isArray(m.content) ? {role:m.role, content:m.content.map(({_blob, ...part})=>part)} : m), temperature: json ? 0.1 : 0.4, stream: !!onText && !json};
  if (json && ['gemini','groq','openrouter','mistral','proxy','nvidia'].includes(p.id) && !(vision && ['openrouter','nvidia'].includes(p.id))) body.response_format = {type:'json_object'};
  let r;
  try { r = await fetch(base+'/chat/completions', {method:'POST', headers, body:JSON.stringify(body), signal}); }
  catch(e){ if (e.name==='AbortError') throw e; throw new Error(U.inArtifact() ? X('بيئة claude.ai تمنع الاتصال بالمزودات الخارجية؛ استخدم Claude هنا، أو افتح التطبيق من نطاقك الخاص.','claude.ai blocks connections to outside providers; use Claude here, or open the app from your own domain.') : X(`تعذّر الاتصال بـ ${p.name}. تحقق من الإنترنت، أو استخدم الخادم الوسيط إن كان المزود يمنع الطلبات من المتصفح.`,`Could not reach ${p.name}. Check your connection, or use the proxy if the provider blocks browser requests.`)); }
  if (!r.ok){ let m = r.status+' '+r.statusText; try { const j = await r.json(); m = (j.error && (j.error.message||j.error)) || j.message || m; } catch(e){} if (r.status===401||r.status===403) m = X('المفتاح غير صحيح أو لا يملك صلاحية. ','Invalid key or no permission. ')+m; if (r.status===429) m = X('تجاوزت حد الطبقة المجانية مؤقتًا. ','Free-tier limit reached for now. ')+m; throw new Error(m); }
  if (!body.stream){ const j = await r.json(); return j.choices?.[0]?.message?.content || ''; }
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '', text = '';
  for (;;){ const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream:true}); let i;
    while ((i = buf.indexOf('\n')) >= 0){ const line = buf.slice(0, i).trim(); buf = buf.slice(i+1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d==='[DONE]') continue;
      try { const j = JSON.parse(d); const delta = j.choices?.[0]?.delta?.content; if (delta){ text += delta; onText(text); } } catch(e){} } }
  return text;
};
AI.json = async function(messages, opts){
  const txt = await AI.call(messages, Object.assign({}, opts, {json:true}));
  const m = txt.replace(/```(?:json)?/gi, '').trim(); const s = m.indexOf('{') >= 0 && (m.indexOf('[')<0 || m.indexOf('{') < m.indexOf('[')) ? m.slice(m.indexOf('{'), m.lastIndexOf('}')+1) : m.slice(m.indexOf('['), m.lastIndexOf(']')+1);
  try { return JSON.parse(s); } catch(e){ throw new Error(X('لم يُرجع النموذج بيانات منظمة صالحة. حاول مرة أخرى.','The model did not return valid structured data. Try again.')); }
};

/* image + text request to a vision-capable model (OCR correction, reading photos) */
const toDataUrl = b => new Promise((ok, bad)=>{ const r = new FileReader(); r.onload = ()=>ok(r.result); r.onerror = bad; r.readAsDataURL(b); });
AI.vision = async function(prompt, blobs, opts={}){
  const parts = [{type:'text', text:prompt}]; for (const b of blobs) parts.push({type:'image_url', image_url:{url: await toDataUrl(b)}, _blob:b});
  const msgs = [{role:'user', content:parts}];
  return opts.json ? AI.json(msgs, Object.assign({}, opts, {vision:true})) : AI.call(msgs, Object.assign({}, opts, {vision:true}));
};
AI.providerName = () => prov().name;

/* ---------- prompts ---------- */
const outLang = () => X('اكتب الإجابة بالعربية الفصحى الواضحة.','Answer in clear English.');
const sys = () => ({role:'system', content: `${X('أنت مساعد مستندات داخل تطبيق وثيق PDF، تساعد موظفي المكاتب والجهات في فهم المستندات والمعاملات.','You are a document assistant inside Wathiq PDF, helping office staff understand documents and transactions.')} ${outLang()} ${X('اعتمد فقط على نص المستند المرفق، وإذا لم تجد المعلومة فقل ذلك صراحة. اذكر رقم الصفحة عند الاقتباس.','Rely only on the attached document text; if the information is not there, say so. Cite page numbers when quoting.')}`});
const docBlock = () => ctx ? `\n\n<document name="${ctx.name}">\n${ctx.text}\n</document>${ctx.truncated ? X('\n(النص مقتطع لطوله)','\n(text truncated)') : ''}` : '';
AI.ACTIONS = [
  {id:'sum', label:{ar:'لخّص المستند', en:'Summarize'}, prompt:()=>X('لخّص المستند في فقرة قصيرة ثم 5 نقاط رئيسية، واذكر الأرقام والتواريخ والجهات المهمة.','Summarize the document in a short paragraph, then 5 key points, including important numbers, dates and parties.')},
  {id:'table', label:{ar:'استخرج البيانات كجدول', en:'Extract data as table'}, json:true, prompt:()=>X('استخرج البيانات الجدولية أو الحقول المتكررة من المستند. أعد JSON فقط بالشكل {"columns":["..."],"rows":[["..."]]} بنفس لغة المستند.','Extract tabular data or repeated fields from the document. Return only JSON shaped {"columns":["..."],"rows":[["..."]]} in the document language.')},
  {id:'tasks', label:{ar:'استخرج المهام والمواعيد', en:'Extract tasks & deadlines'}, json:true, prompt:()=>X(`استخرج المهام المطلوبة والمواعيد من المستند. أعد JSON فقط بالشكل {"tasks":[{"title":"","assignee":"","dept":"","due":"YYYY-MM-DD أو فارغ","priority":"high|med|low","notes":""}]}. تاريخ اليوم ${new Date().toISOString().slice(0,10)}.`,`Extract required tasks and deadlines. Return only JSON shaped {"tasks":[{"title":"","assignee":"","dept":"","due":"YYYY-MM-DD or empty","priority":"high|med|low","notes":""}]}. Today is ${new Date().toISOString().slice(0,10)}.`)},
  {id:'tr', label:{ar:'ترجم', en:'Translate'}, prompt:()=>X('ترجم المستند كاملًا إلى الإنجليزية إن كان عربيًا، أو إلى العربية إن كان بلغة أخرى، مع الحفاظ على العناوين والفقرات والأرقام.','Translate the whole document into Arabic if it is not Arabic, otherwise into English, keeping headings, paragraphs and numbers.')},
  {id:'reply', label:{ar:'صِغ خطاب رد', en:'Draft a reply letter'}, prompt:()=>X('صِغ خطاب رد رسمي على هذا المستند: الافتتاحية، الموضوع، الإشارة إلى رقم المعاملة إن وُجد، النقاط المطلوبة، الخاتمة، ومكان التوقيع. اترك الأسماء غير المعروفة بين قوسين مربعين.','Draft a formal reply letter to this document: opening, subject, reference number if any, requested points, closing and signature block. Leave unknown names in square brackets.')},
  {id:'memo', label:{ar:'مذكرة اعتماد', en:'Approval memo'}, prompt:()=>X('اكتب مذكرة مختصرة لرفع هذا المستند للاعتماد: الموضوع، الخلفية، المطلوب اعتماده، المبررات، المخاطر أو الملاحظات، والتوصية.','Write a short memo to submit this document for approval: subject, background, what is to be approved, justification, risks or notes, recommendation.')},
  {id:'check', label:{ar:'راجع الأخطاء', en:'Proofread'}, prompt:()=>X('راجع المستند لغويًا وإملائيًا ومنطقيًا. اعرض جدولًا نصيًا: الموضع، النص الحالي، التصحيح المقترح، السبب. ثم اذكر أي تعارض في الأرقام أو التواريخ.','Proofread the document for language, spelling and logic. List: location, current text, suggested fix, reason. Then note any conflicting numbers or dates.')}
];

/* ---------- chat state & view ---------- */
let history = []; let ctl = null;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s+(.+)$/gm, '<b>$1</b>');
function msgEl(m){
  const el = h('div', {class:'msg '+(m.role==='user'?'u':'a'), dir:'auto'});
  if (m.role==='user'){ el.textContent = m.show || m.content; return el; }
  const body = h('div', {html: rich(m.content||'') || X('جارٍ التفكير…','Thinking…')}); el.append(body);
  if (m.table){ const tw = h('div', {class:'tbl-wrap', style:{marginTop:'8px'}}, h('table', {class:'reg', style:{minWidth:'0'}}, h('thead', null, h('tr', null, m.table.columns.map(c=>h('th', null, String(c))))), h('tbody', null, m.table.rows.slice(0,200).map(r=>h('tr', null, r.map(v=>h('td', null, String(v??'')))))))); body.replaceChildren(tw); }
  if (m.tasks){ body.replaceChildren(h('ol', {style:{margin:0, paddingInlineStart:'20px'}}, m.tasks.map(tk=>h('li', null, h('b', null, tk.title), [tk.assignee, tk.due, tk.dept].filter(Boolean).length ? ' — '+[tk.assignee, tk.due, tk.dept].filter(Boolean).join(' · ') : '')))); }
  if (m.done){
    const acts = h('div', {class:'acts'});
    if (m.table) acts.append(h('button', {class:'btn', onclick:async()=>{ await U.loadScript(U.LIBS.xlsx); const ws = XLSX.utils.aoa_to_sheet([m.table.columns, ...m.table.rows]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data'); U.saveFile(U.baseName(ctx?.name||'data')+'-data.xlsx', new Blob([XLSX.write(wb, {type:'array', bookType:'xlsx'})])); }}, X('حفظ Excel','Save Excel')));
    if (m.tasks) acts.append(h('button', {class:'btn primary', onclick:async e=>{ e.target.disabled = true; let docRef = null; if (ctx && ctx.file) docRef = await DB.saveDoc(ctx.file.name, new Uint8Array(await ctx.file.arrayBuffer()));
      for (const tk of m.tasks) await Tasks.create({title:tk.title, assignee:tk.assignee||'', dept:tk.dept||'', due:/^\d{4}-\d{2}-\d{2}$/.test(tk.due||'')?tk.due:'', priority:['high','med','low'].includes(tk.priority)?tk.priority:'med', desc:tk.notes||'', docRef});
      U.toast(X(`أُضيفت ${m.tasks.length} مهمة.`,`Added ${m.tasks.length} tasks.`), 'ok'); }}, X('أضف إلى المهام','Add to tasks')));
    if (!m.table && !m.tasks){
      acts.append(h('button', {class:'btn', onclick:async()=>{ try { await navigator.clipboard.writeText(m.content); U.toast(t('copied'),'ok'); } catch(e){ const s = getSelection(), r = document.createRange(); r.selectNodeContents(body); s.removeAllRanges(); s.addRange(r); } }}, t('copy')),
        h('button', {class:'btn', onclick:async()=>U.saveFile(U.baseName(ctx?.name||'wathiq')+'-'+X('مساعد','assistant')+'.docx', await Tools.buildDocx(m.content.split('\n').map(l=>({type:'p', text:l.replace(/\*\*/g,'').replace(/^#+\s*/,''), bold:/^#+\s|^\*\*.*\*\*$/.test(l)}))))}, 'Word'),
        h('button', {class:'btn', onclick:async()=>U.saveFile(U.baseName(ctx?.name||'wathiq')+'-'+X('مساعد','assistant')+'.pdf', new Blob([await Tools.htmlToPdf(`<div dir="auto" style="white-space:pre-wrap;font-size:14px;line-height:1.9">${rich(m.content)}</div>`)], {type:'application/pdf'}))}, 'PDF'));
    }
    el.append(acts);
  }
  return el;
}
let chatEl, ctxEl;
function renderChat(){ if (!chatEl) return; chatEl.replaceChildren(...history.filter(m=>!m.hidden).map(msgEl)); if (!history.length) chatEl.append(h('p', {class:'note'}, X('اختر مستندًا ثم اضغط أحد الإجراءات السريعة، أو اكتب سؤالك.','Pick a document, then tap a quick action or type your question.'))); chatEl.lastChild?.scrollIntoView({block:'nearest'}); }
function renderCtx(){ if (!ctxEl) return; ctxEl.replaceChildren(ctx ? h('div', {class:'fitem'}, h('span', {class:'nm'}, ctx.name), h('span', {class:'sz'}, (ctx.pages ? ctx.pages+' '+X('صفحة','pages')+' · ' : '') + ctx.text.length.toLocaleString()+' '+X('حرف','chars')), h('button', {class:'ibtn', 'aria-label':t('remove'), onclick:()=>{ ctx = null; renderCtx(); }, html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'})) : h('span', {class:'note'}, X('لا يوجد مستند محدد؛ يمكنك السؤال بشكل عام.','No document selected; you can still ask general questions.')));
  if (ctx && ctx.ocr && !ctx.empty) ctxEl.append(h('p', {class:'note'}, X('النص مقروء بالتعرف الضوئي (OCR) وقد يحتوي أخطاء؛ للمراجعة الدقيقة استخدم «استخراج النصوص والبيانات».','This text was read by OCR and may contain errors; for careful review use “Extract text & data”.')));
  if (ctx && ctx.empty) ctxEl.append(h('p', {class:'callout'}, X('لا يحتوي هذا المستند على نص قابل للقراءة (قد يكون ممسوحًا). شغّل أداة OCR أولًا ثم أعد اختياره.','This document has no readable text (it may be scanned). Run OCR first, then select it again.'), ' ', h('button', {class:'btn', onclick:()=>Tools.open('ocr', ctx.file?[ctx.file]:undefined)}, 'OCR')));
  if (ctx && ctx.truncated) ctxEl.append(h('p', {class:'note'}, X(`سيُرسل أول ${LIMIT.toLocaleString()} حرف فقط.`,`Only the first ${LIMIT.toLocaleString()} characters will be sent.`))); }

AI.ask = async function(content, opt={}){
  if (ctl) return;
  const msgs = [sys()]; const turns = history.filter(m=>!m.local).slice(-8);
  const needDoc = ctx && !turns.some(m=>m.role==='user' && m.content.includes(`<document name="${ctx.name}"`));
  const userMsg = {role:'user', content: needDoc ? content + docBlock() : content, show: opt.show || content};
  history.push(userMsg); const ans = {role:'assistant', content:''}; history.push(ans); renderChat();
  const live = chatEl.lastChild;
  ctl = new AbortController(); setBusy(true);
  try {
    const conv = [...msgs, ...turns.map(m=>({role:m.role, content:m.content})), {role:'user', content:userMsg.content}];
    if (opt.json){ const j = await AI.json(conv, {signal:ctl.signal}); ans.content = JSON.stringify(j);
      if (opt.kind==='table'){ if (!j.columns || !j.rows) throw new Error(X('لم يُعثر على بيانات جدولية.','No tabular data found.')); ans.table = j; ans.content = X(`جدول من ${j.rows.length} صف.`,`Table with ${j.rows.length} rows.`); }
      if (opt.kind==='tasks'){ const list = j.tasks || (Array.isArray(j) ? j : []); if (!list.length) throw new Error(X('لم تُعثر على مهام في المستند.','No tasks found in the document.')); ans.tasks = list; ans.content = X(`${list.length} مهمة مقترحة.`,`${list.length} suggested tasks.`); } }
    else ans.content = await AI.call(conv, {signal:ctl.signal, onText: txt=>{ ans.content = txt; const b = live.firstChild; if (b) b.innerHTML = rich(txt); }});
    ans.done = true;
  } catch(e){ if (e.name==='AbortError'){ ans.content = (ans.content||'') + X('\n(أُوقف)','\n(stopped)'); ans.done = true; } else if (e.quiet){ history.splice(-2); } else { ans.content = (e.text ? e.text+'\n\n' : '') + '⚠ ' + e.message; ans.local = true; userMsg.local = true; } }
  finally { ctl = null; setBusy(false); renderChat(); }
};
let sendBtn, stopBtn;
function setBusy(b){ if (sendBtn) sendBtn.hidden = b; if (stopBtn) stopBtn.hidden = !b; document.querySelectorAll('[data-qa]').forEach(x=>x.disabled = b); }

AI.settings = function(){
  const c = cfg(); const body = h('div', {style:{display:'flex', flexDirection:'column', gap:'12px'}});
  const sel = h('select', {class:'field', id:'aiP'}, AI.PROVIDERS.map(p=>h('option', {value:p.id, selected:p.id===c.provider}, p.name)));
  const det = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}});
  const draw = ()=>{ const p = AI.PROVIDERS.find(x=>x.id===sel.value); det.innerHTML = ''; det.append(h('p', {class:'callout info'}, L(p.note)));
    if (p.kind==='sample'){ if (!U.inArtifact()) det.append(h('p', {class:'callout'}, X('غير متاح خارج claude.ai.','Not available outside claude.ai.'))); return; }
    if (U.inArtifact() && p.id!=='claude') det.append(h('p', {class:'callout'}, X('داخل claude.ai يُمنع الاتصال بهذا المزود. يعمل عند فتح التطبيق من نطاقك (انظر README).','Inside claude.ai this provider is blocked. It works when the app runs from your own domain (see README).')));
    if (!['proxy'].includes(p.id)){ const b = h('input', {class:'field', id:'aiB', dir:'ltr', value:c.bases[p.id]||p.base, style:{width:'100%'}}); det.append(h('label', {class:'note', for:'aiB'}, X('عنوان الواجهة (OpenAI-compatible)','API base URL (OpenAI-compatible)')), b); b.onchange = ()=>{ c.bases[p.id] = b.value.trim(); }; }
    const md = h('input', {class:'field', id:'aiM', dir:'ltr', value:c.models[p.id]||p.model, placeholder:X('اسم النموذج','Model name'), style:{width:'100%'}}); md.onchange = ()=>{ c.models[p.id] = md.value.trim(); };
    det.append(h('label', {class:'note', for:'aiM'}, X('النموذج','Model')), md);
    const vm = h('input', {class:'field', id:'aiV', dir:'ltr', value:c.vmodels[p.id]||p.vmodel||'', placeholder:p.id==='proxy' ? X('يحدده الخادم (AI_VISION_MODEL)','Set on the server (AI_VISION_MODEL)') : X('نموذج يقرأ الصور','A model that reads images'), style:{width:'100%'}}); vm.onchange = ()=>{ c.vmodels[p.id] = vm.value.trim(); };
    det.append(h('label', {class:'note', for:'aiV'}, X('نموذج الرؤية (لقراءة الصور وتصحيح OCR)','Vision model (reading images, OCR correction)')), vm);
    if (!['proxy','custom'].includes(p.id) || p.id==='custom'){ const k = h('input', {class:'field', id:'aiK', type:'password', dir:'ltr', autocomplete:'off', value:keyOf(p.id), placeholder: p.id==='custom' ? X('اختياري','Optional') : 'API key', style:{width:'100%'}});
      const rem = h('input', {type:'checkbox', id:'aiR'}); rem.checked = !!U.store.get('aikey.'+p.id, '');
      det.append(h('label', {class:'note', for:'aiK'}, X('المفتاح','API key')), k, h('label', {class:'row note'}, rem, X('تذكّر المفتاح على هذا الجهاز (وإلا يُحذف عند إغلاق المتصفح)','Remember the key on this device (otherwise cleared when the browser closes)')));
      if (p.keyUrl) det.append(h('a', {href:p.keyUrl, target:'_blank', rel:'noopener', class:'note'}, X('احصل على مفتاح مجاني','Get a free key')+' ↗'));
      det.append(h('p', {class:'note'}, X('المفتاح يبقى في متصفحك ويُرسل مباشرة إلى المزود فقط. لا تشاركه، وإن ظهر في مكان عام فألغِه من لوحة المزود.','The key stays in your browser and goes only to the provider. Do not share it; if it ever leaks, revoke it in the provider console.')));
      det._save = ()=>setKey(p.id, k.value.trim(), rem.checked); }
    else det.append(h('p', {class:'note'}, X('يستخدم عنوان الخادم الوسيط ورمزه من قسم السحابة ← Odoo، ومتغيرات AI_BASE_URL وAI_API_KEY وAI_MODEL في server/.env.','Uses the proxy URL and token from Cloud → Odoo, and AI_BASE_URL, AI_API_KEY, AI_MODEL in server/.env.')));
  };
  sel.onchange = draw; draw();
  body.append(h('label', {class:'note', for:'aiP'}, X('المزود','Provider')), sel, det);
  U.modal(X('إعدادات المساعد','Assistant settings'), body, [{label:t('cancel')}, {label:X('حفظ','Save'), kind:'primary', onClick:cl=>{ c.provider = sel.value; det._save && det._save(); setCfg(c); cl(); AI.render(); U.toast(X('حُفظت الإعدادات.','Settings saved.'), 'ok'); }}]);
};

AI.load = async function(f, act){
  try { ctx = await AI.fromFile(f); ctx.file = f; } catch(e){ return U.toast(t('error',{e:e.message}),'err'); }
  await AI.render();
  const a = act && AI.ACTIONS.find(x=>x.id===act); if (a && !(prov().kind==='sample' && !sampleFn)) AI.ask(a.prompt(), {json:a.json, kind:a.id, show:L(a.label)+' — '+ctx.name});
};
AI.render = async function(){
  const w = $('#aiWrap'); if (!w) return; const p = prov();
  if (p.kind==='sample') await getSample();
  const unavailable = p.kind==='sample' && !sampleFn;
  ctxEl = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}}); chatEl = h('div', {class:'chat', 'aria-live':'polite'});
  const pickDoc = h('div', {class:'row'},
    E.doc ? h('button', {class:'btn', onclick:async()=>{ ctx = await AI.fromDoc(E.doc); ctx.file = new File([await E.currentBytes()], E.doc.name, {type:'application/pdf'}); renderCtx(); }}, X('المستند المفتوح في المحرر','Document open in editor')) : null,
    h('button', {class:'btn', onclick:async()=>{ const [f] = await U.pickFiles('application/pdf,image/*,.docx,.xlsx,.csv,.txt,.md'); if (!f) return; try { ctx = await AI.fromFile(f); ctx.file = f; renderCtx(); } catch(e){ U.toast(t('error',{e:e.message}),'err'); } }}, X('اختر ملفًا','Choose a file')),
    h('button', {class:'btn', onclick:async()=>{ const all = (await DB.all('approvals')).slice(0, 30); if (!all.length) return U.toast(X('لا توجد طلبات اعتماد.','No approval requests.'));
      const m = U.modal(X('من سجل المعاملات','From transactions'), h('div', {class:'clist'}, all.map(a=>h('button', {onclick:async()=>{ m.close(); const f = await DB.docFile(a.doc); ctx = await AI.fromFile(f); ctx.file = f; ctx.name = a.no+' — '+a.title; renderCtx(); }}, `${a.no} — ${a.title}`))), []); }}, X('من المعاملات','From transactions')));
  const qa = h('div', {class:'row'}, AI.ACTIONS.map(a=>h('button', {class:'chip', 'data-qa':a.id, disabled:unavailable, onclick:()=>{ if (!ctx) return U.toast(X('اختر مستندًا أولًا.','Pick a document first.')); AI.ask(a.prompt(), {json:a.json, kind:a.id, show:L(a.label)+' — '+ctx.name, withDoc:true}); }}, L(a.label))));
  const ta = h('textarea', {class:'field', id:'aiIn', dir:'auto', placeholder:X('اسأل عن المستند… مثال: ما المبلغ الإجمالي؟ من الجهة المسؤولة؟','Ask about the document… e.g. What is the total? Who is responsible?'), disabled:unavailable});
  ta.addEventListener('keydown', e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendBtn.click(); } });
  sendBtn = h('button', {class:'btn primary', disabled:unavailable, onclick:()=>{ const v = ta.value.trim(); if (!v) return; ta.value = ''; AI.ask(v, {withDoc: !!ctx && !history.some(m=>m.role==='user' && !m.local && m.content.includes('<document'))}); }}, X('إرسال','Send'));
  stopBtn = h('button', {class:'btn', hidden:true, onclick:()=>ctl && ctl.abort()}, X('إيقاف','Stop'));
  w.replaceChildren(
    h('div', {class:'row', style:{justifyContent:'space-between', alignItems:'flex-end'}}, h('div', null, h('h1', {class:'ptitle'}, t('nav_ai')), h('p', {class:'psub', style:{margin:0}}, X('لخّص، اسأل، استخرج الجداول والمهام، ترجم، وصِغ الخطابات من مستنداتك.','Summarize, ask, extract tables and tasks, translate and draft letters from your documents.'))),
      h('div', {class:'row'}, h('span', {class:'pill s-review'}, p.name + (p.kind!=='sample' && (cfg().models[p.id]||p.model) ? ' · '+(cfg().models[p.id]||p.model) : '')), h('button', {class:'btn', onclick:AI.settings}, t('settings')), history.length ? h('button', {class:'btn', onclick:()=>{ history = []; renderChat(); }}, X('محادثة جديدة','New chat')) : null)),
    unavailable ? h('p', {class:'callout', style:{marginTop:'12px'}}, X('Claude متاح عند فتح التطبيق داخل claude.ai. خارج ذلك اختر مزودًا مجانيًا من الإعدادات (Gemini أو Groq أو OpenRouter) أو خادمًا محليًا مثل Ollama.','Claude is available when the app runs inside claude.ai. Otherwise pick a free provider in settings (Gemini, Groq or OpenRouter) or a local server such as Ollama.')) : null,
    h('div', {class:'panel', style:{margin:'16px 0', display:'flex', flexDirection:'column', gap:'10px'}}, h('b', null, X('المستند','Document')), pickDoc, ctxEl, qa),
    chatEl, h('div', {class:'composer'}, ta, sendBtn, stopBtn),
    h('p', {class:'note'}, X('إجابات النماذج قد تخطئ؛ راجع الأرقام والأسماء قبل اعتمادها. ', 'Model answers can be wrong; check numbers and names before relying on them. ') + (p.kind==='sample' ? X('تُرسل الطلبات إلى Claude عبر حسابك.','Requests go to Claude through your account.') : p.id==='custom' ? X('تُرسل الطلبات إلى الخادم الذي حددته.','Requests go to the server you set.') : X(`تُرسل الطلبات إلى ${p.name} عند الضغط على إرسال فقط.`,`Requests go to ${p.name} only when you press Send.`))));
  renderCtx(); renderChat();
};
})();
