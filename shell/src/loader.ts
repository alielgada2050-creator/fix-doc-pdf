import { SCRIPTS, INLINE } from './legacy/markup'
/* loads the PDF libraries and the Wathiq engine (plain scripts) in order, after React has rendered the views */
const W = window as any
/* standalone build: engine files are embedded in window.__WQ_INLINE and run as classic scripts */
const runInline = (src: string) => { const s = document.createElement('script'); s.textContent = W.__WQ_INLINE[src] + '\n//# sourceURL=' + src; document.body.appendChild(s) }
const load = (src: string) => W.__WQ_INLINE && W.__WQ_INLINE[src] != null ? Promise.resolve(runInline(src)) : new Promise<void>((ok, bad) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => ok(); s.onerror = () => bad(new Error(src)); document.body.appendChild(s) })
let started = false
const link = (rel: string, href: string, type?: string) => { const l = document.createElement('link'); l.rel = rel; l.href = href; if (type) l.type = type; document.head.appendChild(l) }
export async function boot(){
  if (started) return; started = true
  link('preconnect', 'https://fonts.gstatic.com'); link('stylesheet', 'https://fonts.googleapis.com/css2?family=Alexandria:wght@500;600;700&family=Readex+Pro:wght@400;500;600;700&family=El+Messiri:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap')
  const later = () => link('stylesheet', 'https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;700&family=Cairo:wght@400;700&family=Amiri:wght@400;700&family=Tajawal:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Great+Vibes&family=Dancing+Script:wght@600&display=swap')
  ;(W.requestIdleCallback || ((f: () => void) => setTimeout(f, 2500)))(later); link('icon', (W.__WQ_FILES && W.__WQ_FILES['icons/icon.svg']) || 'icons/icon.svg', 'image/svg+xml'); if (!W.claude && !W.__WQ_INLINE) link('manifest', 'manifest.webmanifest')
  const remote = SCRIPTS.filter(s => /^https?:/.test(s)), local = SCRIPTS.filter(s => !/^https?:/.test(s))
  if (!W.__WQ_INLINE) local.forEach(s => { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'script'; l.href = s; document.head.appendChild(l) })
  try { await Promise.all(remote.map(load)) } catch (e) { console.warn('library failed', e) }
  INLINE.forEach(code => { try { new Function(code)() } catch (e) { console.warn(e) } })
  // engine files download in parallel (preloaded below) and still run in order (async=false)
  await Promise.all(local.map(s => load(s).catch(e => console.error('engine file failed', e))))
}
