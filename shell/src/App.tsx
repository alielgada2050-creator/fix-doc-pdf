import { memo, useEffect } from 'react'
import Header from './Header'
import { VIEWS, TAIL } from './legacy/markup'
import { boot } from './loader'
const BOOT = '<svg class="boot-ic" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="wqs-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset=".5" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff3d5a"/></linearGradient><linearGradient id="wqs-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="wqs-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#fff1e2"/></linearGradient><linearGradient id="wqs-seal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f86"/><stop offset="1" stop-color="#d9083f"/></linearGradient><filter id="wqs-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#8a2400" flood-opacity=".35"/></filter><filter id="wqs-sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#7a0020" flood-opacity=".4"/></filter></defs><rect width="512" height="512" rx="116" fill="url(#wqs-bg)"/><path d="M116 0h280a116 116 0 0 1 116 116v40C380 120 132 120 0 168V116A116 116 0 0 1 116 0z" fill="url(#wqs-gloss)"/><g filter="url(#wqs-sh)"><path d="M150 92h160l70 70v234a28 28 0 0 1-28 28H150a28 28 0 0 1-28-28V120a28 28 0 0 1 28-28z" fill="url(#wqs-paper)"/><path d="M310 92v50a20 20 0 0 0 20 20h50z" fill="#ffd2a8"/></g><g stroke="#ffb27a" stroke-width="16" stroke-linecap="round"><path d="M168 186h112M168 230h150M168 274h96"/></g><g filter="url(#wqs-sh2)"><circle cx="330" cy="352" r="78" fill="url(#wqs-seal)"/><circle cx="330" cy="352" r="60" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-dasharray="6 9"/><path d="M296 352l24 24 44-48" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="312" cy="306" rx="38" ry="16" fill="#fff" opacity=".28"/></g></svg><span class="boot-bar"><i></i></span>'

/* the editor, transactions, automation, assistant, cloud and support views are driven by the Wathiq engine (plain JS);
   React renders their markup once and never touches it again */
const Legacy = memo(({ html }: { html: string }) => <div className="legacy-views" dangerouslySetInnerHTML={{ __html: html }} />, () => true)

export default function App() {
  useEffect(() => { boot() }, [])
  return (
    <>
      <div className="loading" id="boot" role="status" aria-label="Loading" dangerouslySetInnerHTML={{ __html: BOOT }} />
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.focus(); } }}>{document.documentElement.lang === 'en' ? 'Skip to content' : 'تخطَّ إلى المحتوى'}</a>
      <div className="app" id="app">
        <Header />
        <main id="main" tabIndex={-1} style={{ display: 'contents' }}><Legacy html={VIEWS} /></main>
      </div>
      <Legacy html={TAIL} />
    </>
  )
}
