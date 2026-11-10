import { useEffect, useRef, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Bot, Cloud, Download, FilePen, Images, LayoutGrid, LifeBuoy, Menu, Moon, Palette, Stamp, Sun, SunMedium, Workflow, Monitor, Search } from 'lucide-react'
import LogoManager from './LogoManager'
import { OrgLogo, nameOf, readLogos } from './logos'
import { useLang } from './i18n'

const VIEWS = [['hub', 'nav_tools', LayoutGrid], ['editor', 'nav_editor', FilePen], ['work', 'nav_work', Stamp], ['auto', 'nav_auto', Workflow], ['ai', 'nav_ai', Bot], ['cloud', 'nav_cloud', Cloud], ['support', 'nav_support', LifeBuoy]] as const
const SKINS = [['auto', 'auto_s', Monitor], ['light', 'light', Sun], ['dark', 'dark', Moon], ['bright', 'bright', SunMedium]] as const
const go = (v: string) => window.App?.go?.(v)

const ICON = '<svg class="h-full w-full" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="wqb-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset=".5" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff3d5a"/></linearGradient><linearGradient id="wqb-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="wqb-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#fff1e2"/></linearGradient><linearGradient id="wqb-seal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f86"/><stop offset="1" stop-color="#d9083f"/></linearGradient><filter id="wqb-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#8a2400" flood-opacity=".35"/></filter><filter id="wqb-sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#7a0020" flood-opacity=".4"/></filter></defs><rect width="512" height="512" rx="116" fill="url(#wqb-bg)"/><path d="M116 0h280a116 116 0 0 1 116 116v40C380 120 132 120 0 168V116A116 116 0 0 1 116 0z" fill="url(#wqb-gloss)"/><g filter="url(#wqb-sh)"><path d="M150 92h160l70 70v234a28 28 0 0 1-28 28H150a28 28 0 0 1-28-28V120a28 28 0 0 1 28-28z" fill="url(#wqb-paper)"/><path d="M310 92v50a20 20 0 0 0 20 20h50z" fill="#ffd2a8"/></g><g stroke="#ffb27a" stroke-width="16" stroke-linecap="round"><path d="M168 186h112M168 230h150M168 274h96"/></g><g filter="url(#wqb-sh2)"><circle cx="330" cy="352" r="78" fill="url(#wqb-seal)"/><circle cx="330" cy="352" r="60" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-dasharray="6 9"/><path d="M296 352l24 24 44-48" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="312" cy="306" rx="38" ry="16" fill="#fff" opacity=".28"/></g></svg>'
function Brand() {
  const { lang } = useLang()
  return (
    <div className="brand-block flex shrink-0 items-center gap-3">
      <span className="brand-mark h-10 w-10 shrink-0 sm:h-12 sm:w-12" dangerouslySetInnerHTML={{ __html: ICON }} />
      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1.5"><span className="brand-name" data-i18n="brand">وثيق</span><span className="brand-pdf">PDF</span></span>
        <span className="brand-sub hidden sm:block">{lang === 'ar' ? 'منصة المستندات والاعتمادات' : 'Documents & approvals'}</span>
      </span>
    </div>
  )
}

function LogoStrip({ logos, lang, onEdit, compact }: { logos: OrgLogo[]; lang: string; onEdit: () => void; compact?: boolean }) {
  const shown = logos.filter(l => l.show !== false && l.src)
  return (
    <TooltipProvider delayDuration={200}>
      <div className={`flex min-w-0 items-center gap-2.5 overflow-x-auto ${compact ? 'w-full py-2' : 'justify-end'}`} style={{ scrollbarWidth: 'none' }}>
        {shown.map(l => (
          <Tooltip key={l.id}>
            <TooltipTrigger asChild>
              <button type="button" tabIndex={-1} onClick={onEdit} className={`logo-plate flex shrink-0 items-center justify-center rounded-xl border px-3 ${compact ? 'h-12 min-w-0 flex-1 px-2' : 'h-14'}`} aria-label={nameOf(l, lang)}>
                <img src={l.src} alt={nameOf(l, lang)} className={`${compact ? 'max-h-9 max-w-full' : 'max-h-11 max-w-[150px]'} w-auto object-contain`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{nameOf(l, lang)}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onEdit} className="h-9 w-9 shrink-0 text-muted-foreground" aria-label="logos"><Images className="h-[18px] w-[18px]" /></Button>
          </TooltipTrigger>
          <TooltipContent>{lang === 'ar' ? 'شعارات الجهات' : 'Organisation logos'}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

export default function Header() {
  const { t, lang } = useLang()
  const [logos, setLogos] = useState<OrgLogo[]>(readLogos())
  const [skin, setSkin] = useState<string>(() => { try { return JSON.parse(localStorage.getItem('wq.skin') || '"auto"') } catch { return 'auto' } })
  const [manage, setManage] = useState(false)
  const [sheet, setSheet] = useState(false)
  const save = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (save.current) save.current.hidden = true }, [])
  useEffect(() => {
    const upd = () => setLogos(readLogos()); const sk = (e: Event) => setSkin((e as CustomEvent).detail || 'auto')
    window.addEventListener('wq:logos', upd); window.addEventListener('wq:ready', upd); window.addEventListener('wq:skin', sk)
    return () => { window.removeEventListener('wq:logos', upd); window.removeEventListener('wq:ready', upd); window.removeEventListener('wq:skin', sk) }
  }, [])
  const setTheme = (v: string) => { window.App?.setSkin ? window.App.setSkin(v) : null; setSkin(v) }
  const SkinIcon = (SKINS.find(s => s[0] === skin) || SKINS[0])[2]
  return (
    <header className="shell-head bg-card font-ui text-card-foreground shadow-[0_1px_0_hsl(var(--border))]" style={{ paddingInline: 'max(12px, env(safe-area-inset-left, 0px))' }}>
      <div className="head-top flex h-[64px] items-center gap-3 sm:h-[80px]">
        <Brand />
        <Separator orientation="vertical" className="hidden h-11 sm:block" />
        <div className="hidden min-w-0 flex-1 sm:block"><LogoStrip logos={logos} lang={lang} onEdit={() => setManage(true)} /></div>
        <div className="flex-1 sm:hidden" />
        <span id="docname" className="hidden max-w-[22vw] truncate text-[13px] text-muted-foreground lg:inline" />
        <button ref={save} id="btnSave" className="btn primary" type="button"><Download className="h-[18px] w-[18px]" /><span data-i18n="save_pdf">حفظ PDF</span></button>
        <button id="btnAccount" className="btn acct" type="button" />
        <button className="ibtn" type="button" onClick={() => (window as any).Recent?.palette()} title={lang === 'ar' ? 'بحث سريع (Ctrl+K)' : 'Quick search (Ctrl+K)'} aria-label={lang === 'ar' ? 'بحث سريع' : 'Quick search'} aria-keyshortcuts="Control+K"><Search className="h-[18px] w-[18px]" /></button>
        <button id="btnLang" className="ibtn lang" type="button" title="Language" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t('appearance')}><SkinIcon className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 font-ui" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <DropdownMenuLabel className="flex items-center gap-2"><Palette className="h-4 w-4" />{t('appearance')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={skin} onValueChange={setTheme}>
              {SKINS.map(([k, label, Icon]) => <DropdownMenuRadioItem key={k} value={k} className="gap-2"><Icon className="h-4 w-4" />{t(label)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden" aria-label={t('menu')}><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-[300px] font-ui" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <SheetHeader className="text-start"><SheetTitle className="font-brand">{t('sections')}</SheetTitle></SheetHeader>
            <nav id="sheetnav" className="mt-4 flex flex-col gap-1">
              {VIEWS.map(([v, k, Icon]) => <button key={v} type="button" onClick={() => { go(v); setSheet(false) }} className="flex items-center gap-3 rounded-lg px-3 py-3 text-start text-[15px] hover:bg-accent"><span className="navico" data-v={v}><Icon /></span>{t(({ nav_tools: 'tools', nav_editor: 'editor', nav_work: 'work', nav_auto: 'auto', nav_ai: 'ai', nav_cloud: 'cloud', nav_support: 'support' } as const)[k])}</button>)}
            </nav>
            <Separator className="my-4" />
            <button type="button" onClick={() => { setSheet(false); setManage(true) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start hover:bg-accent"><span className="navico lg" data-v="logos"><Images /></span>{t('editLogos')}</button>
          </SheetContent>
        </Sheet>
      </div>
      <div className="logo-row sm:hidden"><LogoStrip logos={logos} lang={lang} onEdit={() => setManage(true)} compact /></div>
      <nav id="nav" className="head-nav hidden items-center gap-1.5 overflow-x-auto md:flex" style={{ scrollbarWidth: 'none' }}>
        {VIEWS.map(([v, k, Icon]) => (
          <button key={v} type="button" data-view={v} aria-current={v === 'hub' ? 'page' : 'false'} className="navtab flex h-10 shrink-0 items-center gap-2 rounded-full ps-1.5 pe-3.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
            <span className="navico" data-v={v}><Icon /></span><span data-i18n={k} />
          </button>
        ))}
      </nav>
      <LogoManager open={manage} onOpenChange={setManage} />
    </header>
  )
}
