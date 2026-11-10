/* وثيق — local database (IndexedDB): documents, approvals, tasks, recipes. Everything stays on this device. */
(function(){
const S = window.DB = {};
const NAME = 'wathiq', VER = 1, STORES = ['docs','approvals','tasks','recipes','meta'];
let dbp = null; const mem = {}; STORES.forEach(s=>mem[s] = new Map());
let useMem = false;
function open(){
  if (dbp) return dbp;
  dbp = new Promise((res)=>{
    let r; try { r = indexedDB.open(NAME, VER); } catch(e){ useMem = true; return res(null); }
    r.onupgradeneeded = ()=>{ const db = r.result; STORES.forEach(s=>{ if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, {keyPath:'id'}); }); };
    r.onsuccess = ()=>res(r.result);
    r.onerror = ()=>{ useMem = true; res(null); };
    r.onblocked = ()=>{ useMem = true; res(null); };
  });
  return dbp;
}
function tx(store, mode, fn){
  return open().then(db=>{
    if (!db || useMem) return fn(null);
    return new Promise((res, rej)=>{ const t = db.transaction(store, mode); const os = t.objectStore(store); let out; const q = fn(os); if (q) q.onsuccess = ()=>{ out = q.result; }; t.oncomplete = ()=>res(out); t.onerror = ()=>rej(t.error); t.onabort = ()=>rej(t.error); });
  });
}
S.put = (store, obj)=>tx(store, 'readwrite', os=> os ? os.put(obj) : (mem[store].set(obj.id, structuredClone(obj)), null)).then(()=>{ S.emit(store); return obj; });
S.get = (store, id)=>tx(store, 'readonly', os=> os ? os.get(id) : null).then(v=> useMem ? structuredClone(mem[store].get(id)) : v);
S.all = (store)=>tx(store, 'readonly', os=> os ? os.getAll() : null).then(v=> useMem ? [...mem[store].values()].map(x=>structuredClone(x)) : (v||[]));
S.del = (store, id)=>tx(store, 'readwrite', os=> os ? os.delete(id) : (mem[store].delete(id), null)).then(()=>S.emit(store));
S.persistent = async ()=>{ try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch(e){ return false; } };
S.usage = async ()=>{ try { return await navigator.storage.estimate(); } catch(e){ return null; } };
const subs = {};
S.on = (store, fn)=>{ (subs[store] = subs[store] || []).push(fn); };
S.emit = store=>{ (subs[store]||[]).forEach(f=>{ try { f(); } catch(e){ console.warn(e); } }); };
S.isMemory = ()=>useMem;
/* sequential reference numbers per year: WQ-2026-0001 */
let seqQ = Promise.resolve();
/* serialised so two documents created at the same moment never share a number */
S.nextNo = function(prefix){ const run = seqQ.then(()=>nextNo(prefix)); seqQ = run.catch(()=>{}); return run; };
const nextNo = async function(prefix){
  const y = new Date().getFullYear(); const key = 'seq-'+prefix+'-'+y; const m = await S.get('meta', key) || {id:key, n:0};
  m.n++; await S.put('meta', m); return `${prefix}-${y}-${String(m.n).padStart(4,'0')}`;
};
/* store a document's bytes once; returns a small reference */
S.saveDoc = async function(name, bytes){
  const id = 'd_'+U.uid()+Date.now().toString(36);
  await S.put('docs', {id, name, size:bytes.length, bytes:new Uint8Array(bytes), at:Date.now()}); return {id, name, size:bytes.length};
};
S.docFile = async function(ref){ const d = await S.get('docs', ref.id); if (!d) throw new Error(X('المستند غير موجود على هذا الجهاز.','The document is not on this device.')); return new File([d.bytes], d.name, {type:'application/pdf'}); };
/* backup / restore everything as one JSON file (documents base64) */
S.backup = async function(){
  const out = {app:'wathiq', v:1, at:new Date().toISOString()};
  for (const st of ['approvals','tasks','recipes']) out[st] = await S.all(st);
  const docs = await S.all('docs'); out.docs = docs.map(d=>{ let s=''; const b = d.bytes; for (let i=0;i<b.length;i+=0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i+0x8000)); return Object.assign({}, d, {bytes:btoa(s)}); });
  return new Blob([JSON.stringify(out)], {type:'application/json'});
};
S.restore = async function(file){
  const j = JSON.parse(await file.text()); if (j.app!=='wathiq') throw new Error(X('ليس ملف نسخة احتياطية من وثيق.','Not a Wathiq backup file.'));
  let n = 0;
  for (const st of ['approvals','tasks','recipes']) for (const o of (j[st]||[])){ await S.put(st, o); n++; }
  for (const d of (j.docs||[])){ const bin = atob(d.bytes); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); await S.put('docs', Object.assign({}, d, {bytes:a})); n++; }
  return n;
};
})();
