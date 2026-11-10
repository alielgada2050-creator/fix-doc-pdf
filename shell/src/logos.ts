export type OrgLogo = { id: string; name: string | { ar: string; en: string }; src: string; show?: boolean; onDocs?: boolean }
declare global { interface Window { WATHIQ_CONFIG?: any; App?: any; U?: any; LANG?: string } }
const KEY = 'wq.orgLogos'
export const defaults = (): OrgLogo[] => ((window.WATHIQ_CONFIG || {}).orgLogos || []).map((l: any, i: number) => ({ id: 'cfg' + i, show: true, onDocs: true, ...l }))
export const readLogos = (): OrgLogo[] => { try { const v = localStorage.getItem(KEY); if (v) { const a = JSON.parse(v); if (Array.isArray(a)) return a } } catch {} return defaults() }
export const writeLogos = (a: OrgLogo[] | null) => { try { if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY) } catch {} window.dispatchEvent(new Event('wq:logos')) }
export const nameOf = (l: OrgLogo, lang: string) => typeof l.name === 'string' ? l.name : (l.name?.[lang as 'ar'|'en'] || l.name?.ar || '')
/* shrink an uploaded logo to 160 px height PNG (keeps transparency) */
export async function fileToLogo(f: File): Promise<string> {
  const url = URL.createObjectURL(f)
  try {
    const im = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    const h = Math.min(160, im.naturalHeight), w = Math.round(im.naturalWidth * h / im.naturalHeight)
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(im, 0, 0, w, h)
    return c.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
