'use client'
/**
 * PeopleRow — the people on your active orders, at the top of Home.
 *
 * The strategist's read was that "the people on your order do not exist as data". They do now
 * (assignment at mint, then src/lib/team/people.ts), and this is the first place an owner sees
 * them. It answers the question every owner in the sim asked in week two: I paid, who is doing
 * it, and can I talk to them.
 *
 * The owner's rules, kept literally:
 *   · No standing concierge. Nobody appears here because they exist; they appear because they
 *     are ON something the owner is paying for right now.
 *   · No placeholder faces. With no active orders the people part renders nothing at all — the
 *     row is then just the one door, Get help, with the one reply promise under it.
 *   · ONE row. Get help is the last stop in the same strip, not a second row underneath.
 *   · Tap a person and you land in the conversation with them. When no conversation has been
 *     started yet there is nothing to open, so the tap goes to the order they are on instead.
 *
 * Design: the avatar/glass-circle family already in the app (Home's funnel bar and the Messages
 * strip), the mvp-theme tokens so it is right in light and dark, Cal Sans for names. No new
 * colours, no new component family.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HelpCircle } from 'lucide-react'
import { useMvpTheme } from './mvp-theme'
import { REPLY_PROMISE_SENTENCE } from '@/lib/reply-promise'
import { useLang } from './mvp-language'

const DISPLAY = "'Cal Sans','Inter',sans-serif"

/** The shape /api/dashboard/people returns (src/lib/team/people.ts). */
export interface PersonOrder { kind: 'service' | 'creator' | 'desk'; id: string; title: string; campaignId: string | null }
export interface OrderPerson {
  id: string
  name: string
  avatarUrl: string | null
  role: string
  orders: PersonOrder[]
  threadId: string | null
  threadSubject: string
}

/** A person's role word → the Messages contact key its deep link uses (mvp-messages CONTACTS).
 *  A writer is covered by the strategist thread today, which is what THREAD_SUBJECT already says. */
export const CONTACT_KEY: Record<string, string> = {
  Strategist: 'strategist',
  Designer: 'designer',
  Photographer: 'photographer',
  Videographer: 'videographer',
  Writer: 'strategist',
  'Apnosh team': 'support',
}

/** Where a tap on this person goes. The conversation when one exists, else the work itself —
 *  never a dead tap, and never a thread we would have to invent to make the link true.
 *
 *  Exported because the Create shelf's bottom door names the same person and has to land in the
 *  same place. It used to send everyone to Messages, which for a person with no thread yet is a
 *  door onto an empty room. */
export function hrefFor(p: OrderPerson): string {
  if (p.threadId) return `/dashboard/messages?to=${CONTACT_KEY[p.role] ?? 'strategist'}`
  const first = p.orders[0]
  if (first?.kind === 'desk') return `/dashboard/requests/${first.id}`
  if (first?.campaignId) return `/dashboard/campaigns/${first.campaignId}`
  return '/dashboard/orders'
}

/** First name only under the circle, like every other people strip in the app. */
export const firstName = (n: string) => n.trim().split(/\s+/)[0] || n
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·'

/** What this person is on, in one short line: the order when there is one, else how many.
 *  An order's TITLE is the catalog's own words and stays as written; only the count line is
 *  ours to translate. */
function whatTheyAreOn(p: OrderPerson, T: (k: string, v?: Record<string, string | number>) => string): string {
  if (p.orders.length === 1) return p.orders[0].title
  return T('{n} pieces of work', { n: p.orders.length })
}

export default function PeopleRow({ clientId }: { clientId?: string }) {
  const { C, theme } = useMvpTheme()
  const { T } = useLang()
  const [people, setPeople] = useState<OrderPerson[]>([])

  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/people?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && Array.isArray(j?.people)) setPeople(j.people as OrderPerson[]) })
      .catch(() => { /* nobody known is a fine answer; the door below still opens */ })
    return () => { alive = false }
  }, [clientId])

  // The glass circle the rest of the app wears, in both skins.
  const circle: React.CSSProperties = {
    width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', flexShrink: 0,
    background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(240,241,240,0.72)',
    backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)'}`,
    boxShadow: theme === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,.04), 0 6px 18px rgba(0,0,0,.07)',
  }
  const name: React.CSSProperties = {
    fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, color: C.ink, maxWidth: 66,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
  }
  const stop: React.CSSProperties = {
    flex: '0 0 auto', width: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    textDecoration: 'none', color: 'inherit',
  }

  /* NOBODY ON YOUR WORK MEANS NO ROW. This used to draw the Get help door on its own, which
   * cost a strip of the first screen to say something More and the header already say. Home is
   * one screen; a row earns its place by naming a real person. */
  if (!people.length) return null

  return (
    <section aria-label={T('The people on your work')} style={{ margin: '10px 0 0' }}>
      <div className="mvp-swipe" style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '2px 2px 4px' }}>
        {people.map((p) => (
          <Link key={p.id} href={hrefFor(p)} className="mvp-press" style={stop} title={`${p.role} · ${whatTheyAreOn(p, T)}`}>
            <span style={circle}>
              {p.avatarUrl
                ? <img src={p.avatarUrl} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.greenDk }}>{initials(p.name)}</span>}
            </span>
            <span style={name}>{firstName(p.name)}</span>
          </Link>
        ))}
        {/* the one door. Last stop in the SAME row, so there is never a second row of faces. */}
        <Link href="/dashboard/get-help" className="mvp-press" style={stop}>
          <span style={{ ...circle, color: C.mute }}><HelpCircle size={22} /></span>
          <span style={name}>{T('Get help')}</span>
        </Link>
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, padding: '2px 2px 0' }}>{T(REPLY_PROMISE_SENTENCE)}</div>
    </section>
  )
}
