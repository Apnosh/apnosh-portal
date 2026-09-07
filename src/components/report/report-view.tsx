'use client'

/**
 * The monthly report, rendered — the editorial treatment from the spec:
 * a cover moment, one hero numeral per chapter, search words sized by their
 * real counts, the best quote set large. Chapters with nothing true to say
 * are simply absent. Light-only by design (it matches the app's material).
 *
 * SEND THIS TO SOMEONE. Two buttons at the foot: print (which is also "save as PDF" on every
 * phone and desktop) and copy link. The print sheet is this same page with the chrome taken off —
 * one @media print block, the same tokens, no second layout to keep in step. There is no public
 * address for a report: the link copied is the owner's own, behind their login, because a month's
 * numbers are the business's and a win card is the thing built for showing strangers.
 *
 * THE LANGUAGE COMES FROM THE SERVER. The page reads clients.preferred_language and passes it in,
 * rather than this file reaching for the provider, so a Spanish owner never sees a frame of
 * English while the browser catches up.
 *
 * WHAT IS STILL ENGLISH, HONESTLY: the review THEMES and the move written for each one come from
 * the sentiment engine (src/lib/reviews/moves.ts) as free text, not as keys, so they render in
 * English inside a Spanish page. Everything this file writes is translated; that data is not, and
 * translating it belongs with the engine that writes it.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Printer, Link2, Check } from 'lucide-react'
import type { MonthlyReport } from '@/lib/report/build-month'
import { t, localeOf, type Lang } from '@/lib/i18n/t'
import { monthKey } from '@/lib/report/report-sent'

const INK = '#12241d', MUTE = '#48484a', FAINT = '#8e8e93'

/** `hide` takes the whole section off the printed page, chrome and heading together. */
function Sec({ label, gray = false, hide = false, children }: { label: string; gray?: boolean; hide?: boolean; children: React.ReactNode }) {
  return (
    <div className={hide ? 'rpt-sec rpt-hide' : 'rpt-sec'} style={{ background: '#fff', borderRadius: 18, padding: 16, marginTop: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: gray ? '#6e6e73' : '#2e9a78', marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: gray ? '#aeaeb2' : '#4abd98' }} />
        {label}
      </div>
      {children}
    </div>
  )
}

/* The chrome comes off and the shadows go flat: ink on paper, same tokens, one layout. */
const PRINT_CSS = `
@media print {
  .rpt-hide { display: none !important; }
  .rpt-page { background: #fff !important; max-width: none !important; padding: 0 !important; }
  .rpt-ground { background: #fff !important; }
  .rpt-sec, .rpt-cover { box-shadow: none !important; border: 1px solid #e6e6ea !important; break-inside: avoid; }
}
`

export default function ReportView({ report, bizName, backHref, lang = 'en' }: {
  report: MonthlyReport
  bizName: string
  backHref?: string
  lang?: Lang
}) {
  const r = report
  const T = (k: string, vars?: Record<string, string | number>) => t(k, lang, vars)
  const locale = localeOf(lang)
  const n = (v: number) => v.toLocaleString(locale)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const anyChapter = r.found || r.said || r.worked || r.moved
  const heroN = r.found?.total ?? ((r.moved?.directions ?? 0) + (r.moved?.calls ?? 0))
  const maxWord = r.found?.words[0]?.n ?? 1
  /* the month in the owner's language; r.monthLabel is the English one the email and staff read */
  const monthLabel = new Date(Date.UTC(r.year, r.month - 1, 1))
    .toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' })

  /**
   * The link to THIS report, not to the address bar.
   *
   * window.location.href copied whatever brought them here: the email's ?src=email (which stamps
   * an open for whoever they send it to), an admin's ?clientId=, or, on the current month, no
   * month at all — so a link sent in October opened November's page. The canonical address is the
   * month being read.
   *
   * And it says what happened. The write was fired and forgotten inside a try that a promise
   * rejection never reaches, so a browser that refused the clipboard (no permission, an insecure
   * origin) still said "Link copied" over an empty clipboard.
   */
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?m=${monthKey(r.year, r.month)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 2500)
  }

  return (
    <div className="rpt-ground" style={{ minHeight: '100dvh', background: '#ececef', display: 'flex', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{PRINT_CSS}</style>
      <div className="rpt-page" style={{ width: '100%', maxWidth: 480, background: '#fbfbfd', padding: '14px 16px 48px' }}>
        {backHref && (
          <Link href={backHref} aria-label={T('Back')} className="rpt-hide" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 99, background: '#fff', border: '1px solid #e6e6ea', color: '#1d1d1f', marginBottom: 10 }}>
            <ChevronLeft size={18} />
          </Link>
        )}

        {/* Cover */}
        <div className="rpt-cover" style={{ borderRadius: 20, padding: '26px 18px 20px', background: 'radial-gradient(140% 90% at 20% 0%, rgba(74,189,152,.28), rgba(74,189,152,.06) 55%, rgba(255,255,255,0)), linear-gradient(180deg, #fdfefd, #f4faf7)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 14px 36px rgba(46,154,120,.14)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2e9a78' }}>
            {r.sealed ? T('Your month · made from your numbers') : T('This month, so far')}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.045em', color: INK, lineHeight: 1.05, marginTop: 6 }}>
            {`${bizName},`}<br />{T('in {month}', { month: monthLabel })}
          </div>
          {heroN > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', color: '#0f6e56', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {n(heroN)}
              </div>
              <div style={{ fontSize: 12.5, color: MUTE, fontWeight: 600, marginTop: 3 }}>
                {r.found ? T('people found you in search') : T('people acted on your listing')}
              </div>
            </div>
          )}
          {!anyChapter && (
            <div style={{ fontSize: 13, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
              {T('A quiet month on the wires. Connect Google and publish work, and this page fills with your real numbers.')}
            </div>
          )}
        </div>

        {r.found && r.found.words.length > 0 && (
          <Sec label={T('The words that brought them')}>
            <div>
              {r.found.words.map((w) => {
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
                {r.found.total >= r.found.prior
                  ? T('Up from {n} the month before.', { n: n(r.found.prior) })
                  : T('Down from {n} the month before.', { n: n(r.found.prior) })}
              </div>
            )}
          </Sec>
        )}

        {r.said && (
          <Sec label={T('What they said')}>
            {r.said.quote && (
              /* An open quote mark with nothing to shut it read as a sentence cut off. It closes
                 now, and a quote that stops mid-thought (no full stop, question or exclamation at
                 the end) gets an ellipsis first, so a trimmed one looks trimmed on purpose. */
              <div style={{ fontSize: 15, lineHeight: 1.45, color: INK, fontWeight: 600, letterSpacing: '-0.01em' }}>
                <span style={{ color: '#4abd98', fontSize: 24, fontWeight: 800, verticalAlign: '-6px', marginRight: 2 }}>&ldquo;</span>
                {r.said.quote}{/[.!?…]$/.test(r.said.quote.trim()) ? '' : '…'}
                <span style={{ color: '#4abd98', fontSize: 24, fontWeight: 800, verticalAlign: '-6px', marginLeft: 2 }}>&rdquo;</span>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
              {r.said.count === 1
                ? T('{n} new review · {avg} average', { n: n(r.said.count), avg: r.said.avg.toFixed(1) })
                : T('{n} new reviews · {avg} average', { n: n(r.said.count), avg: r.said.avg.toFixed(1) })}
              {r.said.priorCount > 0 && <> &middot; {r.said.priorCount === 1
                ? T('{n} review the month before', { n: n(r.said.priorCount) })
                : T('{n} reviews the month before', { n: n(r.said.priorCount) })}</>}
            </div>
            {r.said.loved.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#2e9a78', marginBottom: 6 }}>{T('Loved lately')}</div>
                {r.said.loved.map((th) => (
                  <span key={th.theme} style={{ display: 'inline-block', borderRadius: 99, padding: '4px 11px', margin: '0 5px 6px 0', fontSize: 12.5, fontWeight: 700, color: '#0f6e56', background: '#f0faf6' }}>
                    {th.theme} <span style={{ fontWeight: 600, color: '#2e9a78' }}>&middot; {n(th.mentions)}</span>
                  </span>
                ))}
              </div>
            )}
            {r.said.heard.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6e6e73', marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: '#aeaeb2' }} />{T('Heard more than once')}
                </div>
                {r.said.heard.map((th) => (
                  <div key={th.theme} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{th.theme} <span style={{ fontWeight: 500, color: FAINT }}>&middot; {th.mentions === 1 ? T('{n} mention', { n: n(th.mentions) }) : T('{n} mentions', { n: n(th.mentions) })}</span></div>
                    <div style={{ fontSize: 12, color: th.operational ? '#6e4408' : '#8a5a12', background: '#fdf6ec', borderRadius: 10, padding: '8px 11px', marginTop: 5, lineHeight: 1.45 }}>
                      <b style={{ fontWeight: 700 }}>{T('The move:')}</b> {th.move}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Sec>
        )}

        {r.worked && (
          <Sec label={T('What worked')}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: INK, fontVariantNumeric: 'tabular-nums' }}>
              {r.worked.topReach > 0
                ? T('{n} people', { n: n(r.worked.topReach) })
                : r.worked.posts === 1 ? T('{n} post', { n: n(r.worked.posts) }) : T('{n} posts', { n: n(r.worked.posts) })}
            </div>
            <div style={{ fontSize: 12.5, color: MUTE, marginTop: 3 }}>
              {r.worked.topReach > 0
                ? (r.worked.topTitle ? T('saw your best post: {title}', { title: r.worked.topTitle }) : T('saw your best post'))
                : T('published this month')}
            </div>
          </Sec>
        )}

        {r.moved && (
          <Sec label={T('What it moved')}>
            <div style={{ display: 'flex', gap: 8 }}>
              {([[T('Calls'), r.moved.calls, r.moved.priorCalls], [T('Directions'), r.moved.directions, r.moved.priorDirections], [T('Site visits'), r.moved.siteClicks, r.moved.priorSiteClicks]] as [string, number, number][])
                .filter(([, v, prior]) => v > 0 || prior > 0)
                .map(([label, v, prior]) => (
                <div key={label} style={{ flex: 1, background: '#f9f9fb', borderRadius: 12, padding: '9px 11px' }}>
                  <div style={{ fontSize: 10, color: FAINT, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: INK, fontVariantNumeric: 'tabular-nums' }}>{n(v)}</div>
                  {prior > 0 && (
                    <div style={{ fontSize: 10.5, color: v >= prior ? '#2e9a78' : '#8a5a12', fontWeight: 700 }}>
                      {v >= prior ? '↑' : '↓'} {n(prior)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Sec>
        )}

        {/* Send this to someone: print (which is save-as-PDF everywhere) and the link. The WHOLE
            section goes off the printed page — only the buttons were hidden before, so the paper
            carried an empty "Send this to someone" heading and a line about a link nobody printing
            it can click. */}
        {anyChapter && (
          <Sec label={T('Send this to someone')} gray hide>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => window.print()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 99, border: '1px solid #e6e6ea', background: '#fff', color: '#1d1d1f', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                <Printer size={14} color="#2e9a78" /> {T('Print or save as PDF')}
              </button>
              <button
                onClick={() => { void copyLink() }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 99, border: '1px solid #e6e6ea', background: '#fff', color: '#1d1d1f', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                {copyState === 'copied' ? <Check size={14} color="#2e9a78" /> : <Link2 size={14} color="#2e9a78" />}
                {copyState === 'copied' ? T('Link copied') : copyState === 'failed' ? T('Could not copy') : T('Copy link')}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8, lineHeight: 1.45 }}>
              {T('The link only opens for people who can already see your business.')}
            </div>
          </Sec>
        )}

        {anyChapter && (
          <Sec label={T('What happens next')} gray>
            <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
              {T('Next month builds on this one. Plan the next push in a minute.')}
            </div>
            <Link href="/campaigns/new" className="rpt-hide" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 8, textDecoration: 'none' }}>
              {T('Open the builder')} ›
            </Link>
          </Sec>
        )}
      </div>
    </div>
  )
}
