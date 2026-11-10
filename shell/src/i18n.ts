import { useEffect, useState } from 'react'
const D = {
  ar: { tools:'الأدوات', editor:'المحرر', work:'المعاملات', auto:'الأتمتة', ai:'المساعد', cloud:'السحابة', support:'الدعم الفني', appearance:'المظهر', auto_s:'تلقائي', light:'فاتح', dark:'داكن', bright:'مشرق',
    logos:'شعارات الجهات', logosHint:'تظهر في الترويسة وعلى صفحة سجل الاعتماد في النسخ المعتمدة. تُحفظ في متصفح هذا الجهاز فقط.', addLogo:'إضافة شعار', name:'الاسم', inHeader:'في الترويسة', onDocs:'في الوثائق المعتمدة', remove:'حذف', up:'أعلى', reset:'استعادة الافتراضي', save:'حفظ', cancel:'إلغاء', none:'لا توجد شعارات. أضف شعار جهتك أو الجهات التي تعمل معها.', menu:'القائمة', editLogos:'تعديل الشعارات', sections:'الأقسام' },
  en: { tools:'Tools', editor:'Editor', work:'Transactions', auto:'Automation', ai:'Assistant', cloud:'Cloud', support:'Support', appearance:'Appearance', auto_s:'Automatic', light:'Light', dark:'Dark', bright:'Bright',
    logos:'Organisation logos', logosHint:'Shown in the header and on the approval record page of issued copies. Saved in this browser only.', addLogo:'Add logo', name:'Name', inHeader:'In header', onDocs:'On issued documents', remove:'Remove', up:'Up', reset:'Restore defaults', save:'Save', cancel:'Cancel', none:'No logos yet. Add your organisation’s logo or the partners you work with.', menu:'Menu', editLogos:'Edit logos', sections:'Sections' }
} as const
export type Key = keyof typeof D.ar
export const getLang = (): 'ar'|'en' => { try { return (localStorage.getItem('wq.lang') || 'ar').replace(/"/g,'') === 'en' ? 'en' : 'ar' } catch { return 'ar' } }
export function useLang(){
  const [lang, setLang] = useState(getLang())
  useEffect(()=>{ const f = (e: Event)=>setLang(((e as CustomEvent).detail || getLang()) as 'ar'|'en'); window.addEventListener('wq:lang', f); return ()=>window.removeEventListener('wq:lang', f) }, [])
  return { lang, t: (k: Key) => D[lang][k] }
}
