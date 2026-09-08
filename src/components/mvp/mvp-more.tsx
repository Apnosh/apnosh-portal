'use client'

/**
 * /dashboard/more — the owner's More hub (owner 2026-09-08: "can we redesign the more page to
 * fit the same design/aesthetic as the info page?").
 *
 * THE REFERENCE IS /dashboard/business-info, and this file now speaks its grammar rather than a
 * dialect of it:
 *
 *   · connection truth at the top — the kit's StatusPill row, so the page opens by saying where
 *     what you change here actually goes;
 *   · MvpGroup for every group, with the group's hue as a dot, and MvpRow for every row, so the
 *     press, the mark column, the 15/500 label and the 18px chevron are the kit's and cannot
 *     drift six values away from the page next door again;
 *   · A ROW SAYS WHAT IS INSIDE IT. Business-info tells you "Open every day", "2 links",
 *     "3 profiles" without opening anything; this hub used to give seven bare nouns. Every row
 *     that can read its own value now shows it, and a row whose value we could not read shows
 *     NOTHING — never "Not set", never a zero we are not sure about (kit rule 3);
 *   · every door this section owns is on it. About a dozen pages default their back chevron to
 *     /dashboard/more; the hub listed none of them, so "back" landed on a page that never
 *     mentioned where the owner had just been.
 *
 * KEPT, because they were the best things here: openLine() below (the "Open now, closes 9 pm"
 * reader that handles both our hours shape and Google's periods), the profile identity block,
 * the goal chips in each goal's own hue, the five things owners touch most, and the Wins row
 * that only exists once there is a win to look at.
 *
 * The data arrives from /dashboard/more/page.tsx, which owns the fetch because the header's
 * subtitle is computed from the same answer.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import {
  Store, Clock, UtensilsCrossed, Image as ImageIcon, Palette, SlidersHorizontal, Heart,
  CreditCard, Plug, LifeBuoy, Sparkles, Trophy, LogOut, MapPin, ShoppingBag, ListChecks,
  Share2, Mail, Truck, Users, PenLine, CalendarCheck, KeyRound, Contact, Gift,
} from 'lucide-react'
import { signOut } from '@/lib/supabase/hooks'
import { useLang } from './mvp-language'
import { hueOf, tint, type HueKey } from './hues'
import { Mark } from './mark'
import {
  C, DISPLAY, MvpGroup, MvpRow, MvpPill, MvpEmpty, MvpSkeleton, MvpStatGrid, StatusPill,
  type PillTone,
} from './mvp-detail'
import { REPLY_PROMISE_SENTENCE } from '@/lib/reply-promise'
import { newestNewsDate } from '@/lib/whats-new'

const GOAL_HUE: Record<string, HueKey> = {
  more_foot_traffic: 'newfaces', regulars_more_often: 'regulars', more_online_orders: 'online', more_reservations: 'event',
  better_reputation: 'reviews', be_known_for: 'brand', fill_slow_times: 'nights', grow_catering: 'catering',
}

/**
 * The plan word, from one mapper, in plain English (kit rule 13: never render a raw status).
 * `Internal` is a staff account, not a plan an owner is on, so it says nothing at all.
 */
const TIER_WORD: Record<string, string> = { basic: 'Basic plan', standard: 'Standard plan', pro: 'Pro plan' }

export interface MoreData {
  profile: { name: string; logoUrl: string | null; cuisine: string | null; city: string | null; tier: string | null; hours: unknown; goals: { slug: string; name: string }[] }
  settings: { approveFirst: boolean; favorites: string[] }
  people: { id: string; name: string }[]
  toRate: { id: string }[]
  /** how many counted promises are on the wins shelf. 0 = the shelf is empty, so there is no row. */
  wins: number
  /* Everything below is best-effort on the server: `null` means "we could not read it", and the
     row it belongs to shows no sub-line rather than a guess. */
  email: string | null
  listing: { name: string | null; connected: boolean; orderLinks: number; socialProfiles: number } | null
  connections: { count: number; google: boolean; social: boolean } | null
  team: number | null
  requests: number | null
  bookings: number | null
  guests: number | null
  winsLatestAt: string | null
  /** the referral loop is open and this owner has had a promise counted */
  referral: boolean
}

/** loading → the shape of the answer; error → the rows without their values, and one line saying so. */
export type MoreState = 'loading' | 'ready' | 'error'

/* "Open now · closes 9 pm" from the weekly hours on the Google listing, read on the phone's clock.
   Hours arrive in one of two shapes (our editor's {mon:[{open,close}]} or Google's periods);
   both are tried, and the line is simply hidden when neither fits. */
function openLine(hours: unknown): { open: boolean; text: string } | null {
  if (!hours || typeof hours !== 'object') return null
  const now = new Date()
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const day = keys[now.getDay()]
  const mins = now.getHours() * 60 + now.getMinutes()
  const toMin = (t: string) => { const m = /^(\d{1,2}):?(\d{2})?/.exec(t); if (!m) return null; return Number(m[1]) * 60 + Number(m[2] ?? 0) }
  const fmt = (t: string) => { const mm = toMin(t); if (mm == null) return t; const h = Math.floor(mm / 60), m = mm % 60; const ap = h >= 12 ? 'pm' : 'am'; const hh = ((h + 11) % 12) + 1; return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}` }
  const h = hours as Record<string, unknown>
  let spans: { open: string; close: string }[] = []
  const ours = h[day]
  if (Array.isArray(ours)) spans = ours.filter((s) => s && typeof s === 'object' && 'open' in (s as object)).map((s) => s as { open: string; close: string })
  else if (Array.isArray(h.periods)) {
    const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    spans = (h.periods as Array<{ openDay?: string; openTime?: string | { hours?: number; minutes?: number }; closeTime?: string | { hours?: number; minutes?: number } }>)
      .filter((p) => p.openDay === names[now.getDay()])
      .map((p) => {
        const t = (x: string | { hours?: number; minutes?: number } | undefined) => typeof x === 'string' ? x : x ? `${x.hours ?? 0}:${String(x.minutes ?? 0).padStart(2, '0')}` : ''
        return { open: t(p.openTime), close: t(p.closeTime) }
      })
  }
  if (spans.length === 0) return null
  for (const s of spans) {
    const a = toMin(s.open), b = toMin(s.close)
    if (a == null || b == null) continue
    const closeM = b <= a ? b + 24 * 60 : b
    if (mins >= a && mins < closeM) return { open: true, text: `Open now · closes ${fmt(s.close)}` }
  }
  const next = spans.map((s) => toMin(s.open)).filter((x): x is number => x != null && x > mins).sort((a, b) => a - b)[0]
  if (next != null) { const s = spans.find((x) => toMin(x.open) === next)!; return { open: false, text: `Closed · opens ${fmt(s.open)}` } }
  return { open: false, text: 'Closed today' }
}

type GroupKey = 'business' | 'shown' | 'you' | 'account' | 'help' | 'out'

/** One place an owner can get to from this hub. The search filters THIS, so nothing is ever on
 *  screen one keystroke and unfindable the next. */
interface Dest {
  /** the English label: the row's name, its T() key, and its identity in the list */
  label: string
  group: GroupKey
  href?: string
  onClick?: () => void
  Icon: typeof Store
  hue: HueKey
  sub?: string
  pill?: { text: string; tone: PillTone }
  danger?: boolean
  /** drawn as a tile in the grid while nothing is typed, so it is not also a row */
  tile?: boolean
}

const GROUPS: { key: GroupKey; title?: string; hue?: HueKey }[] = [
  { key: 'business', title: 'Your business', hue: 'newfaces' },
  { key: 'shown', title: 'Where you show up', hue: 'online' },
  { key: 'you', title: 'You', hue: 'mint' },
  { key: 'account', title: 'Account', hue: 'nights' },
  { key: 'help', title: 'Help', hue: 'grey' },
  { key: 'out' },
]

export default function MvpMore({ name, tier, query = '', data, state }: { name: string; tier?: string | null; query?: string; data: MoreData | null; state: MoreState }) {
  const { T, locale } = useLang()
  const p = data?.profile
  const shownName = p?.name || name
  const initials = shownName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'A'
  const line = [p?.cuisine, p?.city].filter(Boolean).join(' · ')
  const open = useMemo(() => openLine(p?.hours), [p?.hours])
  const q = query.trim().toLowerCase()

  const dests = useMemo<Dest[]>(() => {
    /** "1 link" / "2 links", in the owner's language, and nothing at all when there are none. */
    const count = (n: number | null | undefined, one: string, many: string): string | undefined =>
      n == null || n <= 0 ? undefined : T(n === 1 ? one : many, { n })
    const toRate = data?.toRate.length ?? 0
    const favs = data?.settings.favorites.length ?? 0
    const people = data?.people.length ?? 0
    const listing = data?.listing ?? null
    const planWord = TIER_WORD[(tier ?? p?.tier ?? '').toLowerCase()]
    const winMonth = data?.winsLatestAt ? new Date(data.winsLatestAt) : null
    const news = newestNewsDate()

    return [
      /* Your business — the five things owners touch most. The first four are the tile rail
         while nothing is typed; all five are rows the moment somebody searches. */
      { label: 'Info', group: 'business', href: '/dashboard/business-info', Icon: Store, hue: 'newfaces', tile: true },
      // No sub-line on Hours: the one live sentence we have for it is openLine()'s, which is built
      // by hand in English and is already on the card above. Repeating it here in English on a
      // Spanish screen would be worse than saying nothing (kit rule 3).
      { label: 'Hours', group: 'business', href: '/dashboard/business-info/hours', Icon: Clock, hue: 'newfaces', tile: true },
      { label: 'Menu', group: 'business', href: '/dashboard/business-info/menu', Icon: UtensilsCrossed, hue: 'catering', tile: true },
      { label: 'Photos', group: 'business', href: '/dashboard/assets', Icon: ImageIcon, hue: 'catering', tile: true },
      { label: 'Your brand', group: 'business', href: '/dashboard/business-info/brand', Icon: Palette, hue: 'brand' },

      /* Where you show up — the six walkthroughs whose back chevron already returns here. */
      {
        label: 'Your Google profile', group: 'shown', href: '/dashboard/google-profile', Icon: MapPin, hue: 'newfaces',
        sub: listing?.name || (listing?.connected ? T('Connected') : undefined),
      },
      { label: 'Google order buttons', group: 'shown', href: '/dashboard/order-buttons', Icon: ShoppingBag, hue: 'online', sub: count(listing?.orderLinks, '{n} link', '{n} links') },
      { label: 'Your other listings', group: 'shown', href: '/dashboard/listings', Icon: ListChecks, hue: 'nights' },
      { label: 'Your social profiles', group: 'shown', href: '/dashboard/social-profiles', Icon: Share2, hue: 'brand', sub: count(listing?.socialProfiles, '{n} profile', '{n} profiles') },
      { label: 'Land in the inbox', group: 'shown', href: '/dashboard/email', Icon: Mail, hue: 'regulars' },
      { label: 'Price your delivery menu', group: 'shown', href: '/dashboard/delivery-menu', Icon: Truck, hue: 'deal' },

      /* You */
      {
        label: 'Your settings', group: 'you', href: '/dashboard/preferences', Icon: SlidersHorizontal, hue: 'mint',
        sub: data ? (data.settings.approveFirst ? T('We ask you first') : T('We post for you')) : undefined,
      },
      // The wins shelf. Only once there IS one: the deck drops a counted promise after 14 days and
      // there is no other way back to it, but a row that opens an empty page is worse than no row.
      ...((data?.wins ?? 0) > 0 ? [{
        label: 'Wins', group: 'you' as GroupKey, href: '/dashboard/wins', Icon: Trophy, hue: 'brand' as HueKey,
        pill: { text: String(data?.wins ?? 0), tone: 'good' as PillTone },
        sub: winMonth ? T('Newest in {month}', { month: winMonth.toLocaleDateString(locale, { month: 'long' }) }) : undefined,
      }] : []),
      { label: 'Your team', group: 'you', href: '/dashboard/team', Icon: Users, hue: 'event', sub: count(data?.team, '{n} on your team', '{n} on your team') },
      { label: 'Your requests', group: 'you', href: '/dashboard/requests', Icon: PenLine, hue: 'announce', sub: count(data?.requests, '{n} request', '{n} requests') },
      { label: 'Your bookings', group: 'you', href: '/dashboard/bookings', Icon: CalendarCheck, hue: 'event', sub: count(data?.bookings, '{n} coming up', '{n} coming up') },
      {
        label: 'People you have worked with', group: 'you', href: '/dashboard/people', Icon: Heart, hue: 'catering',
        sub: count(people, '{n} person', '{n} people'),
        pill: toRate ? { text: T('{n} to rate', { n: toRate }), tone: 'warn' as PillTone } : favs ? { text: String(favs), tone: 'neutral' as PillTone } : undefined,
      },
      // Tell a friend: the loop is open AND a promise of ours has been counted. Both are decided
      // on the server; a row that opens a page saying "not yet" is not a door.
      ...(data?.referral ? [{ label: 'Tell a friend', group: 'you' as GroupKey, href: '/dashboard/tell-a-friend', Icon: Gift, hue: 'regulars' as HueKey }] : []),

      /* Account — the login gets its own door now that the profile card leads to the business. */
      { label: 'Your login', group: 'account', href: '/dashboard/settings', Icon: KeyRound, hue: 'nights', sub: data?.email ?? undefined },
      { label: 'Plan and billing', group: 'account', href: '/dashboard/billing', Icon: CreditCard, hue: 'nights', sub: planWord ? T(planWord) : undefined },
      { label: 'Connected accounts', group: 'account', href: '/dashboard/connected-accounts', Icon: Plug, hue: 'nights', sub: count(data?.connections?.count, '{n} connected', '{n} connected') },
      { label: 'Guest list', group: 'account', href: '/dashboard/guests', Icon: Contact, hue: 'regulars', sub: count(data?.guests, '{n} guest', '{n} guests') },

      /* Help */
      { label: 'Get help', group: 'help', href: '/dashboard/get-help', Icon: LifeBuoy, hue: 'mint', sub: T(REPLY_PROMISE_SENTENCE) },
      { label: "What's new", group: 'help', href: '/dashboard/whats-new', Icon: Sparkles, hue: 'brand', sub: news ? T('Newest: {date}', { date: news }) : undefined },

      { label: 'Sign out', group: 'out', onClick: () => { void signOut() }, Icon: LogOut, hue: 'red', danger: true },
    ]
  }, [T, locale, data, tier, p?.tier])

  // Search on both words: the row is drawn in the owner's language, and they type what they see.
  const shown = q ? dests.filter((d) => d.label.toLowerCase().includes(q) || T(d.label).toLowerCase().includes(q)) : dests
  const tiles = dests.filter((d) => d.tile)

  return (
    <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>

      {state === 'loading' ? (
        <div style={{ marginTop: 4 }}>
          <MvpSkeleton heights={[88, 60, 120, 180]} />
        </div>
      ) : (
        <>
          {!q && (
            <>
              {/* The half-drawn business, made honest. Until 2026-09-08 a failed load rendered the
                  initials, the fallback name and no hours — indistinguishable from a real business
                  with nothing filled in. Now the identity block stands down and says so, and every
                  door below it stays exactly where it was, because an owner who cannot load a
                  count still needs the way out. */}
              {state === 'error' ? (
                <MvpEmpty title={T('We could not load your details.')} text={T('Check your connection, then open More again.')} />
              ) : (
                <Link href="/dashboard/business-info" className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, border: `0.5px solid ${C.line}`, background: '#fff', textDecoration: 'none', color: 'inherit', marginTop: 4, boxSizing: 'border-box' }}>
                  <span style={{ width: 62, height: 62, borderRadius: 18, overflow: 'hidden', background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, flexShrink: 0 }}>
                    {p?.logoUrl ? <img src={p.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownName}</span>
                    {line && <span style={{ display: 'block', fontSize: 13, color: C.mute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</span>}
                    {open
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: open.open ? C.greenDk : C.mute, marginTop: 5 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: open.open ? C.greenDk : C.faint }} />{open.text}</span>
                      : <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 4 }}>{T('Your profile')}</span>}
                  </span>
                </Link>
              )}

              {/* their goals, in each goal's colour; a nudge when none are set */}
              {p && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, padding: '0 4px' }}>
                {p.goals.map((g) => { const hue = GOAL_HUE[g.slug] ?? 'mint'; return <Link key={g.slug} href="/dashboard/goals" style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 99, background: tint(hue, 0.16), color: hueOf(hue)[1], textDecoration: 'none' }}>{g.name}</Link> })}
                {p.goals.length === 0 && <Link href="/dashboard/goals" style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 99, background: C.greenSoft, color: C.greenDk, textDecoration: 'none' }}>{T('Pick your goals')}</Link>}
              </div>
              )}

              {/* Where what you change here goes, said before the first group — the reference hub's
                  opening move (business-info/page.tsx:81-84). */}
              {data?.connections && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 20 }}>
                  <StatusPill label="Google" on={data.connections.google} onText={T('Connected')} offText={T('Not connected')} />
                  <StatusPill label={T('Social')} on={data.connections.social} onText={T('Connected')} offText={T('Not connected')} />
                </div>
              )}
            </>
          )}

          {q && shown.length === 0 && (
            <MvpEmpty title={T('Nothing matches')} text={T('Nothing here is called “{word}”. Try a shorter word.', { word: query.trim() })} />
          )}

          {GROUPS.map((g) => {
            const rows = shown.filter((d) => d.group === g.key && (q ? true : !d.tile))
            const grid = !q && g.key === 'business' && tiles.length > 0
            if (rows.length === 0 && !grid) return null
            return (
              <MvpGroup key={g.key} title={g.title ? T(g.title) : undefined} hue={g.hue}>
                {grid && (
                  <div style={{ marginBottom: rows.length ? 8 : 0 }}>
                    <MvpStatGrid>
                      {tiles.map((d) => (
                        <Link key={d.label} href={d.href ?? '#'} className="mvp-row" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: C.ink, textDecoration: 'none' }}>
                          <Mark hue={d.hue} size={30}><d.Icon size={20} /></Mark>{T(d.label)}
                        </Link>
                      ))}
                    </MvpStatGrid>
                  </div>
                )}
                {rows.map((d) => (
                  <MvpRow
                    key={d.label}
                    icon={<d.Icon size={18} />}
                    hue={d.hue}
                    label={T(d.label)}
                    sub={d.sub}
                    right={d.pill ? <MvpPill tone={d.pill.tone} label={d.pill.text} /> : undefined}
                    href={d.href}
                    onClick={d.onClick}
                    danger={d.danger}
                  />
                ))}
              </MvpGroup>
            )
          })}
        </>
      )}
    </div>
  )
}
