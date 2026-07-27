'use client'

/**
 * The screen index, as a client component.
 *
 * It is split out from page.tsx for one concrete reason: mvp-detail carries 'use client', so the C
 * token map resolves to undefined when a server component imports it — silently, producing
 * `border: 0.5px solid undefined` with no warning from tsc or the build. Marking the whole page
 * 'use client' fixes the palette but then `export const metadata` is illegal, so the page stays a
 * server component and the view lives here.
 *
 * The `state` field is the honest part. A screen listed as not built is not built, and saying so on
 * the index is what stops us designing on top of something that does not exist.
 */

import Link from 'next/link'
import { C, DISPLAY } from '@/components/mvp/mvp-detail'

type State = 'live' | 'blocked' | 'todo'

const SCREENS: { n: number; title: string; what: string; state: State; href?: string; note?: string }[] = [
  { n: 1, title: 'Describe it', what: 'One box. The paragraph an owner would actually type.', state: 'live', href: '/preview/campaign/setup' },
  { n: 2, title: 'We read it back', what: 'What the model understood, and the two things we will not do.', state: 'blocked', note: 'The parse route is written. The Anthropic balance is empty, so it cannot run.' },
  { n: 3, title: 'Only the gaps', what: 'The two or three questions the paragraph did not answer.', state: 'live', href: '/preview/campaign/setup' },
  { n: 4, title: 'What will you give', what: 'Four rules, each with the reach it demands.', state: 'live', href: '/preview/campaign/plan' },
  { n: 5, title: 'How many', what: 'The cap, which sizes everything downstream.', state: 'live', href: '/preview/campaign/plan' },
  { n: 6, title: 'How they take it up', what: 'Decided by the rule. Free work ranked above paid.', state: 'live', href: '/preview/campaign/plan' },
  { n: 7, title: 'How they find out', what: 'Reach sized from the cap, minus what they already own.', state: 'live', href: '/preview/campaign/plan' },
  { n: 8, title: 'Three numbers', what: 'What we bill, what they fund, what they do themselves.', state: 'live', href: '/preview/campaign/plan' },
  { n: 9, title: 'Name it and start', what: 'Timeline, dependencies, and the button.', state: 'todo', note: 'No name field, and the go-live date is a constant rather than a read of the creator calendar.' },
  { n: 10, title: 'While it runs', what: 'Claims per day against the healthy threshold.', state: 'todo', note: 'Not built. The threshold exists in the mechanism; nothing displays it yet.' },
  { n: 11, title: 'The day itself', what: 'A morning checklist and a live count.', state: 'todo', note: 'Not built. Claim codes are a concept in the mechanism, not a thing that scans.' },
  { n: 12, title: 'Did it work', what: 'Counted, compared, and cannot tell.', state: 'todo', note: '378 outcome rows exist with 0 verdicts and 0 tracked links. The maths is written and has never run.' },
]

const BADGE: Record<State, { label: string; fg: string; bg: string }> = {
  live: { label: 'Open it', fg: C.greenDk, bg: C.greenSoft },
  blocked: { label: 'Blocked', fg: '#8a5a0c', bg: '#fbf0da' },
  todo: { label: 'Not built', fg: C.mute, bg: '#f0f0f2' },
}

export default function PreviewIndexView() {
  return (
    <div style={{ minHeight: '100dvh', background: C.bg, padding: '22px 14px 60px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.faint }}>
            Apnosh · preview · no login
          </span>
          <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 27, fontWeight: 620, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            Building one campaign, screen by screen
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: C.mute, lineHeight: 1.5 }}>
            These are the real components, running on a made-up business so they can be opened
            without signing in. Change a screen and reload. Nothing here reads your data.
          </p>
        </header>

        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 15, padding: 13 }}>
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>
            <b style={{ color: C.ink, fontWeight: 620 }}>Yellowbee Market &amp; Cafe.</b> Second
            location in Seattle, opening Saturday 12 September. Wants a line outside before the doors
            open. About 300 people a day walk past their first shop.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {SCREENS.map((s) => {
            const b = BADGE[s.state]
            const inner = (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.faint, minWidth: 18, fontVariantNumeric: 'tabular-nums' }}>
                    {String(s.n).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 640, color: s.state === 'live' ? C.ink : C.mute, letterSpacing: '-0.012em' }}>
                    {s.title}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 650, color: b.fg, background: b.bg, padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                    {b.label}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, paddingLeft: 27, marginTop: 3 }}>{s.what}</div>
                {s.note && (
                  <div style={{ fontSize: 12, color: '#8a5a0c', lineHeight: 1.45, paddingLeft: 27, marginTop: 4 }}>{s.note}</div>
                )}
              </>
            )
            const style: React.CSSProperties = {
              display: 'block', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 15,
              padding: '12px 13px', textDecoration: 'none', opacity: s.state === 'live' ? 1 : 0.82,
            }
            return s.href ? (
              <Link key={s.n} href={s.href} style={style}>{inner}</Link>
            ) : (
              <div key={s.n} style={style}>{inner}</div>
            )
          })}
        </div>

        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          Screens 1 and 3 are two steps of the same setup flow; 4 through 8 are one plan screen you
          scroll. That is why several rows lead to the same place.
        </p>
      </div>
    </div>
  )
}
