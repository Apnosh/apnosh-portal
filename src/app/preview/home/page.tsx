'use client'

/**
 * /preview/home — the Home funnel, viewable without an account. Renders the
 * REAL component with a labeled sample profile so the design can be judged
 * on its own. Nothing here saves or reads real numbers.
 *   ?theme=dark   night skin
 */

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import HomeFunnel from '@/components/mvp/home-funnel'
import { MvpThemeProvider, useMvpTheme } from '@/components/mvp/mvp-theme'

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Inner() {
  const sp = useSearchParams()
  const { setTheme, C } = useMvpTheme()
  const wantDark = sp.get('theme') === 'dark'
  useEffect(() => { setTheme(wantDark ? 'dark' : 'light') }, [wantDark, setTheme])
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  const asOf = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)
  return (
    <div className="apnosh-native-skin" style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, background: C.pageBg, minHeight: '100vh' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.card, padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 15, color: C.mute }}>Good morning, Carissa</div>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.greenSoft, border: `1px solid ${C.greenLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: C.greenDk }}>Y</div>
      </div>
      <HomeFunnel
        businessName="Yellow Bee Market"
        audience="Families near Kent"
        views={{ total: 13700, maps: 11645, search: 2055, social: 1840 }}
        actions={{ directions: 464, calls: 99, websiteClicks: 222 }}
        counts={{ interest: 2100, actions: 785, retention: 6 }}
        yoy={{ awareness: 18, interest: -9, actions: 24, orders: 24 }}
        asOf={localYmd(asOf)}
        windowStart={localYmd(start)}
        windowEnd={localYmd(today)}
        range="30d"
        height={620}
        fill
        storageKey="preview-home"
      />
    </div>
  )
}

export default function PreviewHomePage() {
  return (
    <MvpThemeProvider>
      <Suspense fallback={null}><Inner /></Suspense>
    </MvpThemeProvider>
  )
}
