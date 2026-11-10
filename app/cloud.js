/* وثيق — cloud connectors (opt-in, user-initiated only). Nothing uploads without an explicit click. */
(function(){
const C = window.Cloud = {};
const {h, $} = U;
const base = window.WATHIQ_CONFIG || {};
C.cfg = () => Object.assign({}, base, U.store.get('cloudCfg', {}));
const state = { g:{token:null, exp:0}, ms:{app:null, account:null}, odoo:{ok:false, info:null} };
const sx = (ar, en) => LANG==='ar' ? ar : en;
const OPENABLE = /\.(pdf|png|jpe?g|webp|gif|bmp)$/i;
const OFFICE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i;

async function openBlob(blob, name){
  const f = new File([blob], name, {type: blob.type || (/\.pdf$/i.test(name)?'application/pdf':'')});
  if (OPENABLE.test(name)) return App.openFiles([f]);
  // other formats: hand them to the matching converter
  const e = U.ext(name); const tool = e==='docx' ? 'word2pdf' : ['xlsx','xls','csv','ods'].includes(e) ? 'excel2pdf' : e==='zip' ? 'unzip' : null;
  if (tool) return Tools.open(tool, [f]);
  return U.saveFile(name, blob);
}
async function currentFile(){ if (!E.doc){ U.toast(t('no_doc_open')); return null; } const bytes = await E.currentBytes(); return new File([bytes], E.doc.name, {type:'application/pdf'}); }

/* ---------- Google Drive ---------- */
C.google = {
  ready: () => !!(C.cfg().googleClientId && C.cfg().googleApiKey),
  connected: () => !!state.g.token && Date.now() < state.g.exp,
  async load(){ await U.loadScript('https://accounts.google.com/gsi/client'); await U.loadScript('https://apis.google.com/js/api.js'); await new Promise(r=>gapi.load('picker', r)); },
  async connect(){
    await this.load();
    return new Promise((res, rej)=>{
      const tc = google.accounts.oauth2.initTokenClient({client_id:C.cfg().googleClientId, scope:'https://www.googleapis.com/auth/drive.file',
        callback: r=>{ if (r.error) return rej(new Error(r.error)); state.g = {token:r.access_token, exp:Date.now()+ (r.expires_in-60)*1000}; U.session.set('g', state.g); res(); },
        error_callback: e=>rej(new Error(e.type||'oauth')) });
      tc.requestAccessToken({prompt: state.g.token ? '' : 'consent'});
    });
  },
  disconnect(){ try { google.accounts.oauth2.revoke(state.g.token); } catch(e){} state.g = {token:null, exp:0}; U.session.del('g'); },
  async pick(){
    if (!this.connected()) await this.connect(); await this.load(); const cfg = C.cfg();
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder().addView(view).setOAuthToken(state.g.token).setDeveloperKey(cfg.googleApiKey).setAppId(cfg.googleAppId||'')
      .setLocale(LANG).setCallback(async data=>{
        if (data.action !== google.picker.Action.PICKED) return;
        const d = data.docs[0]; const isGoogleDoc = /^application\/vnd\.google-apps\./.test(d.mimeType);
        const url = isGoogleDoc ? `https://www.googleapis.com/drive/v3/files/${d.id}/export?mimeType=application/pdf` : `https://www.googleapis.com/drive/v3/files/${d.id}?alt=media`;
        try { const r = await fetch(url, {headers:{Authorization:'Bearer '+state.g.token}}); if (!r.ok) throw new Error(r.status+' '+r.statusText); await openBlob(await r.blob(), isGoogleDoc ? d.name+'.pdf' : d.name); }
        catch(e){ U.toast(t('error',{e:e.message}), 'err'); }
      }).build();
    picker.setVisible(true);
  },
  async upload(){
    const f = await currentFile(); if (!f) return; if (!this.connected()) await this.connect();
    const meta = {name:f.name, mimeType:'application/pdf'}; const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(meta)], {type:'application/json'})); body.append('file', f);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {method:'POST', headers:{Authorization:'Bearer '+state.g.token}, body});
    if (!r.ok) throw new Error(r.status+' '+(await r.text()).slice(0,140)); const j = await r.json(); U.toast(t('uploaded',{f:j.name}), 'ok'); return j;
  }
};

/* ---------- Microsoft OneDrive / SharePoint (Graph) ---------- */
const G = 'https://graph.microsoft.com/v1.0';
C.ms = {
  ready: () => !!C.cfg().msClientId,
  connected: () => !!state.ms.account,
  scopes(){ return ['Files.ReadWrite'].concat(U.store.get('msSites', false) ? ['Sites.Read.All'] : []); },
  async app(){
    if (state.ms.app) return state.ms.app; await U.loadScript(U.LIBS.msal); const cfg = C.cfg();
    const app = new msal.PublicClientApplication({auth:{clientId:cfg.msClientId, authority:`https://login.microsoftonline.com/${cfg.msTenant||'common'}`, redirectUri: location.origin + location.pathname}, cache:{cacheLocation:'sessionStorage'}});
    if (app.initialize) await app.initialize(); state.ms.app = app; const acc = app.getAllAccounts()[0]; if (acc) state.ms.account = acc; return app;
  },
  async connect(){ const app = await this.app(); const r = await app.loginPopup({scopes:this.scopes(), prompt:'select_account'}); state.ms.account = r.account; },
  async token(){ const app = await this.app(); try { return (await app.acquireTokenSilent({scopes:this.scopes(), account:state.ms.account})).accessToken; } catch(e){ return (await app.acquireTokenPopup({scopes:this.scopes()})).accessToken; } },
  async disconnect(){ const app = await this.app(); try { await app.logoutPopup({account:state.ms.account}); } catch(e){} state.ms.account = null; },
  async get(path, raw){ const r = await fetch(path.startsWith('http')?path:G+path, {headers:{Authorization:'Bearer '+await this.token()}}); if (!r.ok) throw new Error(r.status+' '+r.statusText); return raw ? r : r.json(); },
  async list(where){ // where: {drive?, item?} ; returns folders + files
    const p = where && where.item ? `/drives/${where.drive}/items/${where.item}/children` : where && where.drive ? `/drives/${where.drive}/root/children` : '/me/drive/root/children';
    const j = await this.get(p + '?$top=200&$select=id,name,size,folder,file,parentReference'); return j.value;
  },
  async sites(){ const j = await this.get('/me/followedSites?$select=id,displayName,webUrl'); return j.value; },
  async siteDrive(siteId){ return this.get(`/sites/${siteId}/drive?$select=id,name`); },
  async open(it, asPdf){ const d = it.parentReference.driveId; const r = await this.get(`/drives/${d}/items/${it.id}/content${asPdf?'?format=pdf':''}`, true); await openBlob(await r.blob(), asPdf ? U.baseName(it.name)+'.pdf' : it.name); },
  async upload(){
    const f = await currentFile(); if (!f) return; if (!this.connected()) await this.connect(); const tok = await this.token(); const path = `/me/drive/root:/Wathiq/${encodeURIComponent(f.name)}:`;
    if (f.size < 4*1024*1024){ const r = await fetch(G+path+'/content', {method:'PUT', headers:{Authorization:'Bearer '+tok, 'Content-Type':'application/pdf'}, body:f}); if (!r.ok) throw new Error(r.status+' '+r.statusText); }
    else { const s = await (await fetch(G+path+'/createUploadSession', {method:'POST', headers:{Authorization:'Bearer '+tok, 'Content-Type':'application/json'}, body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'rename'}})})).json();
      const chunk = 5*320*1024*4; for (let off=0; off<f.size; off+=chunk){ const end = Math.min(f.size, off+chunk); const r = await fetch(s.uploadUrl, {method:'PUT', headers:{'Content-Range':`bytes ${off}-${end-1}/${f.size}`}, body:f.slice(off,end)}); if (!r.ok && r.status!==202) throw new Error(r.status+' '+r.statusText); } }
    U.toast(t('uploaded',{f:'OneDrive/Wathiq/'+f.name}), 'ok');
  }
};

/* ---------- Odoo via proxy ---------- */
C.odoo = {
  url: () => (U.store.get('cloudCfg', {}).odooProxyUrl || base.odooProxyUrl || '').replace(/\/$/, ''),
  token: () => U.session.get('odooTok') || '',
  ready(){ return !!this.url(); },
  async req(path, opts={}){ const r = await fetch(this.url()+path, Object.assign({}, opts, {headers:Object.assign({'Authorization':'Bearer '+this.token()}, opts.headers||{})})); if (!r.ok){ let m = r.statusText; try { m = (await r.json()).error || m; } catch(e){} throw new Error(r.status+' '+m); } return r; },
  async ping(){ const j = await (await this.req('/api/odoo/ping')).json(); state.odoo = {ok:true, info:j}; return j; },
  async list(q, model, resId){ const p = new URLSearchParams({q:q||'', model:model||'', res_id:resId||''}); return (await (await this.req('/api/odoo/attachments?'+p)).json()).items; },
  async open(it){ const r = await this.req('/api/odoo/attachments/'+it.id); await openBlob(await r.blob(), it.name); },
  async upload(model, resId){ const f = await currentFile(); if (!f) return; const b64 = await new Promise(res=>{ const r = new FileReader(); r.onload = ()=>res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    const j = await (await this.req('/api/odoo/attachments', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:f.name, mimetype:'application/pdf', datas:b64, res_model:model||undefined, res_id:resId?+resId:undefined})})).json();
    U.toast(t('uploaded',{f:'Odoo #'+j.id}), 'ok'); }
};

/* ---------- UI ---------- */
function status(on, needCfg){ return h('span', {class:'status '+(on?'on':needCfg?'cfg':'')}, on ? t('connected') : needCfg ? t('needs_cfg') : t('not_connected')); }
function cfgForm(fields, after){
  const cur = U.store.get('cloudCfg', {}); const ins = {};
  const box = h('details', null, h('summary', {class:'note', style:{cursor:'pointer'}}, t('settings')));
  fields.forEach(([k, lab, ph])=>{ const i = h('input', {class:'field', id:'cf_'+k, dir:'ltr', value: cur[k] ?? base[k] ?? '', placeholder:ph||'', style:{width:'100%'}}); ins[k] = i; box.append(h('label', {for:'cf_'+k, class:'note'}, lab), i); });
  box.append(h('button', {class:'btn', style:{marginTop:'8px'}, onclick:()=>{ const c = U.store.get('cloudCfg', {}); for (const k in ins) c[k] = ins[k].value.trim(); U.store.set('cloudCfg', c); U.toast(t('done'),'ok'); after && after(); }}, t('save_settings')));
  return box;
}
const guard = fn => async (...a) => { try { await fn(...a); } catch(e){ console.error(e); const blocked = /Failed to load|is not defined|NetworkError|Failed to fetch/.test(e.message||''); U.toast(blocked && U.inArtifact() ? t('blocked_env') : t('error',{e:e.message}), 'err'); } finally { C.render(); } };
const logo = (bg, txt) => h('span', {class:'logo', style:{background:bg, color:'#fff', fontWeight:'800', fontSize:'13px'}}, txt);

C.render = function(){
  const w = $('#cloudWrap'); if (!w) return; w.innerHTML = '';
  w.append(h('h1', {style:{fontFamily:'var(--f-brand)', fontSize:'28px', margin:'0 0 6px'}}, t('cloud_t')), h('p', {class:'note', style:{marginTop:0, maxWidth:'70ch'}}, t('cloud_p')));
  if (U.inArtifact()) w.append(h('p', {class:'callout', style:{marginBottom:'14px'}}, t('blocked_env')));
  const cards = h('div', {class:'cards'});
  /* Google */
  const gl = h('div', {class:'clist'});
  cards.append(h('div', {class:'card'}, h('h3', null, logo('#1a73e8','G'), 'Google Drive', h('span', {class:'spacer'}), status(C.google.connected(), !C.google.ready())),
    h('p', {class:'note'}, t('gd_p')),
    h('div', {class:'row'},
      C.google.connected() ? h('button', {class:'btn', onclick:guard(()=>C.google.disconnect())}, t('disconnect')) : h('button', {class:'btn primary', disabled:!C.google.ready(), onclick:guard(()=>C.google.connect())}, t('connect')),
      h('button', {class:'btn', disabled:!C.google.ready(), onclick:guard(()=>C.google.pick())}, t('browse')),
      h('button', {class:'btn', disabled:!C.google.connected(), onclick:guard(()=>C.google.upload())}, t('upload_cur'))),
    gl, cfgForm([['googleClientId', t('client_id'), '….apps.googleusercontent.com'], ['googleApiKey', t('api_key')], ['googleAppId', t('app_id')]], C.render)));
  /* Microsoft */
  const ml = h('div', {class:'clist'});
  const msBrowse = guard(async (where, title)=>{ ml.innerHTML = ''; ml.append(h('p', {class:'note'}, t('processing')));
    const items = await C.ms.list(where); ml.innerHTML = '';
    if (where) ml.append(h('button', {onclick:()=>msBrowse(null)}, '↩ OneDrive'));
    if (!where && U.store.get('msSites', false)){ try { for (const s of await C.ms.sites()) ml.append(h('button', {onclick:guard(async()=>{ const d = await C.ms.siteDrive(s.id); msBrowse({drive:d.id}); })}, '🏢 '+s.displayName)); } catch(e){} }
    for (const it of items){
      if (it.folder) ml.append(h('button', {onclick:()=>msBrowse({drive:it.parentReference.driveId, item:it.id})}, '📁 '+it.name));
      else if (OPENABLE.test(it.name) || OFFICE.test(it.name)) ml.append(h('div', {class:'row'}, h('button', {style:{flex:1}, onclick:guard(()=>C.ms.open(it, false))}, '📄 '+it.name+' · '+U.fmtSize(it.size||0)),
        OFFICE.test(it.name) ? h('button', {class:'btn', title:sx('تحويل إلى PDF عبر Microsoft','Convert to PDF via Microsoft'), onclick:guard(()=>C.ms.open(it, true))}, '→ PDF') : null));
    }
    if (!ml.children.length) ml.append(h('p', {class:'note'}, sx('لا توجد ملفات هنا.','No files here.')));
  });
  const spIn = h('input', {type:'checkbox', checked:U.store.get('msSites', false), onchange:e=>U.store.set('msSites', e.target.checked)});
  cards.append(h('div', {class:'card'}, h('h3', null, logo('#0a64b8','M'), 'OneDrive · SharePoint', h('span', {class:'spacer'}), status(C.ms.connected(), !C.ms.ready())),
    h('p', {class:'note'}, t('od_p')),
    h('div', {class:'row'},
      C.ms.connected() ? h('button', {class:'btn', onclick:guard(()=>C.ms.disconnect())}, t('disconnect')) : h('button', {class:'btn primary', disabled:!C.ms.ready(), onclick:guard(()=>C.ms.connect())}, t('connect')),
      h('button', {class:'btn', disabled:!C.ms.connected(), onclick:()=>msBrowse(null)}, t('browse')),
      h('button', {class:'btn', disabled:!C.ms.connected(), onclick:guard(()=>C.ms.upload())}, t('upload_cur'))),
    h('label', {class:'row note'}, spIn, t('sharepoint')),
    h('p', {class:'note'}, sx('ملفات Word وExcel وPowerPoint يمكن تحويلها إلى PDF عبر خدمة Microsoft عند فتحها من هنا (تُعالج على خوادم Microsoft).','Word, Excel and PowerPoint files can be converted to PDF by Microsoft when opened from here (processed on Microsoft servers).')),
    ml, cfgForm([['msClientId', t('client_id')], ['msTenant', t('tenant'), 'common']], ()=>{ state.ms.app = null; C.render(); })));
  /* iCloud */
  cards.append(h('div', {class:'card'}, h('h3', null, logo('#555','☁'), 'iCloud Drive', h('span', {class:'spacer'}), h('span', {class:'status'}, sx('عبر منتقي النظام','Via system picker'))),
    h('p', {class:'note'}, t('icloud_p')), h('div', {class:'row'}, h('button', {class:'btn primary', onclick:App.openPicker}, t('open_from_files')))));
  /* Odoo */
  const ol = h('div', {class:'clist'});
  const tokIn = h('input', {class:'field', type:'password', id:'odTok', dir:'ltr', value:C.odoo.token(), placeholder:t('proxy_token'), style:{width:'100%'}, autocomplete:'off'});
  const qIn = h('input', {class:'field', id:'odQ', dir:'auto', placeholder:sx('بحث في المرفقات','Search attachments'), style:{flex:1, minWidth:'120px'}});
  const modelIn = h('input', {class:'field', id:'odM', dir:'ltr', placeholder:'res.partner', style:{width:'130px'}}); const ridIn = h('input', {class:'field', id:'odR', dir:'ltr', type:'number', placeholder:'ID', style:{width:'90px'}});
  const odList = guard(async ()=>{ U.session.set('odooTok', tokIn.value); ol.innerHTML = ''; const items = await C.odoo.list(qIn.value, modelIn.value, ridIn.value);
    items.forEach(it=>ol.append(h('button', {onclick:guard(()=>C.odoo.open(it))}, '📄 '+it.name+(it.res_model?` · ${it.res_model}#${it.res_id}`:'')+' · '+U.fmtSize(it.file_size||0))));
    if (!items.length) ol.append(h('p', {class:'note'}, sx('لا توجد مرفقات مطابقة.','No matching attachments.'))); });
  cards.append(h('div', {class:'card'}, h('h3', null, logo('#714B67','O'), 'Odoo', h('span', {class:'spacer'}), status(state.odoo.ok, !C.odoo.ready())),
    h('p', {class:'note'}, t('odoo_p')),
    state.odoo.info ? h('p', {class:'note'}, `Odoo ${state.odoo.info.server_version||''} · ${state.odoo.info.db||''} · ${state.odoo.info.mode||''}`) : null,
    tokIn,
    h('div', {class:'row'}, h('button', {class:'btn primary', disabled:!C.odoo.ready(), onclick:guard(async()=>{ U.session.set('odooTok', tokIn.value); await C.odoo.ping(); U.toast(t('connected'),'ok'); })}, t('connect'))),
    h('div', {class:'row'}, qIn, modelIn, ridIn, h('button', {class:'btn', disabled:!C.odoo.ready(), onclick:odList}, t('browse'))),
    h('button', {class:'btn', disabled:!state.odoo.ok, onclick:guard(()=>{ U.session.set('odooTok', tokIn.value); return C.odoo.upload(modelIn.value, ridIn.value); })}, t('upload_cur')),
    ol, cfgForm([['odooProxyUrl', t('proxy_url'), 'https://…/odoo-proxy']], C.render)));
  /* future */
  cards.append(h('div', {class:'card', style:{opacity:.75}}, h('h3', null, 'Dropbox · Box', h('span', {class:'spacer'}), h('span', {class:'status'}, t('soon'))), h('p', {class:'note'}, t('future_p'))));
  w.append(cards);
};
C.init = function(){ const g = U.session.get('g'); if (g && g.token && Date.now() < g.exp) state.g = g; };
})();
