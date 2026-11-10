import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ArrowUp, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { OrgLogo, defaults, fileToLogo, nameOf, readLogos, writeLogos } from './logos'
import { useLang } from './i18n'

export default function LogoManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useLang()
  const [list, setList] = useState<OrgLogo[]>([])
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) setList(readLogos().map(l => ({ ...l, name: nameOf(l, lang) }))) }, [open, lang])
  const patch = (i: number, p: Partial<OrgLogo>) => setList(a => a.map((l, k) => k === i ? { ...l, ...p } : l))
  const add = async (fs: FileList | null) => {
    if (!fs) return
    const items: OrgLogo[] = []
    for (const f of Array.from(fs)) items.push({ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, ''), src: await fileToLogo(f), show: true, onDocs: true })
    setList(a => [...a, ...items])
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl font-ui" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle className="font-brand text-xl">{t('logos')}</DialogTitle>
          <DialogDescription>{t('logosHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto py-1">
          {list.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{t('none')}</p>}
          {list.map((l, i) => (
            <div key={l.id} className="grid grid-cols-[96px_1fr] gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
              <div className="logo-plate flex h-16 items-center justify-center rounded-lg border p-2"><img src={l.src} alt="" className="max-h-12 w-auto object-contain" /></div>
              <div className="flex min-w-0 flex-col gap-2">
                <Input value={nameOf(l, lang)} onChange={e => patch(i, { name: e.target.value })} aria-label={t('name')} />
                <div className="flex flex-wrap gap-4 text-sm">
                  <Label className="flex items-center gap-2"><Switch checked={l.show !== false} onCheckedChange={v => patch(i, { show: v })} />{t('inHeader')}</Label>
                  <Label className="flex items-center gap-2"><Switch checked={l.onDocs !== false} onCheckedChange={v => patch(i, { onDocs: v })} />{t('onDocs')}</Label>
                </div>
              </div>
              <div className="col-span-2 flex gap-1 sm:col-span-1 sm:flex-col">
                <Button variant="ghost" size="icon" disabled={i === 0} aria-label={t('up')} onClick={() => setList(a => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b })}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={t('remove')} className="text-destructive" onClick={() => setList(a => a.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <input ref={file} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" multiple hidden onChange={e => { add(e.target.files); e.target.value = '' }} />
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => file.current?.click()}><ImagePlus className="me-2 h-4 w-4" />{t('addLogo')}</Button>
            {defaults().length > 0 && <Button variant="ghost" onClick={() => setList(defaults().map(l => ({ ...l, name: nameOf(l, lang) })))}><RotateCcw className="me-2 h-4 w-4" />{t('reset')}</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button onClick={() => { writeLogos(list); onOpenChange(false) }}>{t('save')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
