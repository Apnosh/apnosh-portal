'use client'

/**
 * The monthly report, rendered — the editorial treatment from the spec:
 * a cover moment, one hero numeral per chapter, search words sized by their
 * real counts, the best quote set large. Chapters with nothing true to say
 * are simply absent. Light-only by design (it matches the app's material).
 */

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { MonthlyReport } from '@/lib/report/build-month'

const INK = '#12241d', MUTE = '#48484a', FAINT = '#8e8e93'

function Sec({ label, gray = false, children }: { label: string; gray?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: 16, marginTop: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: gray ? '#6e6e73' : '#2e9a78', marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: gray ? '#aeaeb2' : '#4abd98' }} />
        {label}
      </div>
      {children}
    </div>
  )
}

export default function ReportView({ report, bizName, backHref }: {
  report: MonthlyReport
  bizName: string
  backHref?: string
}) {
  const r = report
  const anyChapter = r.found || r.said || r.worked || r.moved
  const heroN = r.found?.total ?? ((r.moved?.directions ?? 0) + (r.moved?.calls ?? 0))
  const maxWord = r.found?.words[0]?.n ?? 1

  return (
    <div style={{ minHeight: '100dvh', background: '#ececef', display: 'flex', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fbfbfd', padding: '14px 16px 48px' }}>
        {backHref && (
          <Link href={backHref} aria-label="Back" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 99, background: '#fff', border: '1px solid #e6e6ea', color: '#1d1d1f', marginBottom: 10 }}>
            <ChevronLeft size={18} />
          </Link>
        )}

        {/* Cover */}
        <div style={{ borderRadius: 20, padding: '26px 18px 20px', background: 'radial-gradient(140% 90% at 20% 0%, rgba(74,189,152,.28), rgba(74,189,152,.06) 55%, rgba(255,255,255,0)), linear-gradient(180deg, #fdfefd, #f4faf7)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 14px 36px rgba(46,154,120,.14)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2e9a78' }}>
            {r.sealed ? 'Your month · made from your numbers' : 'This month, so far'}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.045em', color: INK, lineHeight: 1.05, marginTop: 6 }}>
            {bizName},<br />in {r.monthLabel}
          </div>
          {heroN > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', color: '#0f6e56', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {heroN.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12.5, color: MUTE, fontWeight: 600, marginTop: 3 }}>
                {r.found ? 'people found you in search' : 'people acted on your listing'}
              </div>
            </div>
          )}
          {!anyChapter && (
            <div style={{ fontSize: 13, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
              A quiet month on the wires. Connect Google and publish work, and this page fills with your real numbers.
            </div>
          )}
        </div>

        {r.found && r.found.words.length > 0 && (
          <Sec label="The words that brought them">
            <div>
              {r.found.words.map((w, i) => {
                const big = w.n >= maxWord * 0.66
                const mid = !big && w.n >= maxWord * 0.25
                return (
                  <span key={w.q} style={{
                    display: 'inline-block', borderRadius: 99, margin: '0 5px 6px 0',
                    padding: big ? '5px 13px' : mid ? '4px 11px' : '3px 9px',
                    fontSize: big ? 14 : mid ? 12 : 11,
                    fontWeight: big ? 800 : mid ? 700 : 600,
                    color: big ? '#0f6e56' : mid ? '#2e9a78' : '#6e6e73',
                    background: big ? '#e7f6f0' : mid ? '#f0faf6' : '#f5f5f7',
                    letterSpacing: '-0.01em',
                  }}>{w.q}</span>
                )
              })}
            </div>
            {r.found.prior > 0 && (
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
                {r.found.total >= r.found.prior ? 'Up from' : 'Down from'} {r.found.prior.toLocaleString('en-US')} the month before.
              </div>
            )}
          </Sec>
        )}

        {r.said && (
          <Sec label="What they said">
            {r.said.quote && (
              <div style={{ fontSize: 15, lineHeight: 1.45, color: INK, fontWeight: 600, letterSpacing: '-0.01em' }}>
                <span style={{ color: '#4abd98', fontSize: 24, fontWeight: 800, verticalAlign: '-6px', marginRight: 2 }}>&ldquo;</span>
                {r.said.quote}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
              {r.said.count} new review{r.said.count === 1 ? '' : 's'} &middot; {r.said.avg.toFixed(1)} average
              {r.said.priorCount > 0 ? ` · ${r.said.priorCount} the month before` : ''}
            </div>
            {r.said.loved.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#2e9a78', marginBottom: 6 }}>Loved lately</div>
                {r.said.loved.map((t) => (
                  <span key={t.theme} style={{ display: 'inline-block', borderRadius: 99, padding: '4px 11px', margin: '0 5px 6px 0', fontSize: 12.5, fontWeight: 700, color: '#0f6e56', background: '#f0faf6' }}>
                    {t.theme} <span style={{ fontWeight: 600, color: '#2e9a78' }}>&middot; {t.mentions}</span>
                  </span>
                ))}
              </div>
            )}
            {r.said.heard.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6e6e73', marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: '#aeaeb2' }} />Heard more than once
                </div>
                {r.said.heard.map((t) => (
                  <div key={t.theme} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{t.theme} <span style={{ fontWeight: 500, color: FAINT }}>&middot; {t.mentions} mention{t.mentions === 1 ? '' : 's'}</span></div>
                    <div style={{ fontSize: 12, color: t.operational ? '#6e4408' : '#8a5a12', background: '#fdf6ec', borderRadius: 10, padding: '8px 11px', marginTop: 5, lineHeight: 1.45 }}>
                      <b style={{ fontWeight: 700 }}>The move:</b> {t.move}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Sec>
        )}

        {r.worked && (
          <Sec label="What worked">
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: INK, fontVariantNumeric: 'tabular-nums' }}>
              {r.worked.topReach > 0 ? `${r.worked.topReach.toLocaleString('en-US')} people` : `${r.worked.posts} post${r.worked.posts === 1 ? '' : 's'}`}
            </div>
            <div style={{ fontSize: 12.5, color: MUTE, marginTop: 3 }}>
              {r.worked.topReach > 0
                ? `saw your best post${r.worked.topTitle ? `: ${r.worked.topTitle}` : ''}`
                : 'published this month'}
            </div>
          </Sec>
        )}

        {r.moved && (
          <Sec label="What it moved">
            <div style={{ display: 'flex', gap: 8 }}>
              {[['Calls', r.moved.calls, r.moved.priorCalls], ['Directions', r.moved.directions, r.moved.priorDirections], ['Site visits', r.moved.siteClicks, r.moved.priorSiteClicks]]
                .filter(([, n, prior]) => Number(n) > 0 || Number(prior) > 0)
                .map(([label, n, prior]) => (
                <div key={String(label)} style={{ flex: 1, background: '#f9f9fb', borderRadius: 12, padding: '9px 11px' }}>
                  <div style={{ fontSize: 10, color: FAINT, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: INK, fontVariantNumeric: 'tabular-nums' }}>{Number(n).toLocaleString('en-US')}</div>
                  {Number(prior) > 0 && (
                    <div style={{ fontSize: 10.5, color: Number(n) >= Number(prior) ? '#2e9a78' : '#8a5a12', fontWeight: 700 }}>
                      {Number(n) >= Number(prior) ? '↑' : '↓'} {Number(prior).toLocaleString('en-US')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Sec>
        )}

        {anyChapter && (
          <Sec label="What happens next" gray>
            <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
              Next month builds on this one. Plan the next push in a minute.
            </div>
            <Link href="/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 8, textDecoration: 'none' }}>
              Open the builder ›
            </Link>
          </Sec>
        )}
      </div>
    </div>
  )
}
