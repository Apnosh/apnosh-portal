'use client'

/**
 * COMING UP — everything asked for that has not happened yet, as a section.
 * =========================================================================
 * This was its own screen at /dashboard/scheduled, reached only from More, and it
 * sat one tap away from the list of posts that had ALREADY gone out on a different
 * screen entirely. Those are the same story in time order: what is about to
 * happen, then what happened. Reading them meant leaving one page for the other
 * and holding the first one in your head.
 *
 * So it moved (owner 2026-09-10: "the flow should be coming up -> recent posts").
 * It renders above the post list on /dashboard/insights/posts, in that screen's
 * design rather than its own: the same white cards on the grey ground, the same
 * hairline, the same small grey section labels.
 *
 * WHAT IS NOT HERE. The old screen ended with an "Already went" list. Under the
 * real post list that is the same posts twice, with worse numbers, so it is gone.
 *
 * Order inside the section is what an owner opens this to find out: what went
 * WRONG first (a post they believe went out and did not is the worst thing this
 * can hide), then what is still to go, then what their team is holding.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar, Users, Image as ImageIcon, PenLine, ChevronRight } from 'lucide-react'
/* mvp-insights imports THIS file for its own compact block, so the two are a
   cycle. It is safe because both bindings are function declarations used at
   render time, never read while either module is still evaluating -- but do not
   turn either of them into a const arrow without checking the other side. */
import { BrandOrMark } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, glow, tint } from './hues'

interface Post { id: string; content: string; status: string; scheduledFor: string | null; platforms: string[]; mediaUrl: string | null; failure: string | null }
interface Draft { id: string; idea: string; status: string; platforms: string[]; wantedFor: string | null }
interface Data { waiting: Post[]; failed: Post[]; sent: Post[]; withTeam: Draft[]; error: string | null }

/* An owner never reads a machine's words. The scheduled endpoint passes the
   vendor's own error through, and on a box with no key that is the literal string
   "ZERNIO_API_KEY is not set" -- true, and no help to a restaurant. Anything
   shaped like an internal name becomes the plain line. */
const OWNER_SAFE = 'We could not check what is coming up just now.'
const ownerWords = (m: string): string => (/[A-Z]{3,}[_ ][A-Z]/.test(m) || /\bAPI\b|\bkey\b|\btoken\b|\b\d{3}\b/i.test(m) ? OWNER_SAFE : m)

/* One answer per client, shared by every mount for a minute.
   Insights renders this under the stage the owner is looking at, so swiping from
   one stage to the next unmounts and remounts it -- without this, that is a fresh
   call to the vendor every swipe, and the block flashes empty each time. Stale
   data is shown while the refetch runs rather than a blank. */
const CACHE = new Map<string, { at: number; data: Data }>()
const FRESH_MS = 60_000

/** "Tomorrow 9 AM", not a timestamp. */
function whenWords(iso: string | null): string {
  if (!iso) return 'No time set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No time set'
  const now = new Date()
  const days = Math.round((d.setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000)
  const t = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today ${t}`
  if (days === 1) return `Tomorrow ${t}`
  if (days > 1 && days < 7) return `${new Date(iso).toLocaleDateString([], { weekday: 'long' })} ${t}`
  return `${new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${t}`
}

/**
 * @param onCount  told how many things are waiting, so the page around it can
 *                 decide whether the WHOLE screen is empty. -1 until it knows.
 * @param nudge    when there is nothing waiting: draw the quiet line that says so
 *                 and offers a post. False on a screen that is drawing its own
 *                 empty state, so an empty screen never says "nothing" twice.
 */
export default function ComingUp({ clientId, onCount, nudge = true, compact = false }: {
  clientId: string
  onCount?: (n: number) => void
  nudge?: boolean
  /** The Insights version: three lines and a way through, no cancel buttons.
   *  Cancelling a post is a decision, and a decision belongs on the screen the
   *  owner went to on purpose, not under a graph they were reading. */
  compact?: boolean
}) {
  const [data, setData] = useState<Data | null>(() => CACHE.get(clientId)?.data ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  /* The callback in a ref: a parent that passes an inline arrow would otherwise
     re-run this effect on every render of theirs, which is a fetch loop. */
  const countRef = useRef(onCount)
  countRef.current = onCount

  const load = useCallback(async () => {
    const hit = CACHE.get(clientId)
    if (hit && Date.now() - hit.at < FRESH_MS) { setData(hit.data); return }
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load what is coming up')
      CACHE.set(clientId, { at: Date.now(), data: j as Data })
      setData(j as Data)
      if (j.error) setErr(ownerWords(String(j.error)))
    } catch (e) {
      setErr(ownerWords(e instanceof Error ? e.message : OWNER_SAFE))
      setData({ waiting: [], failed: [], sent: [], withTeam: [], error: null })
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!data) return
    countRef.current?.(data.waiting.length + data.failed.length + data.withTeam.length)
  }, [data])

  async function cancel(id: string) {
    setCancelling(id); setErr(null)
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}&postId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not cancel it')
      setData((cur) => {
        if (!cur) return cur
        const next = { ...cur, waiting: cur.waiting.filter((p) => p.id !== id) }
        CACHE.set(clientId, { at: Date.now(), data: next })
        return next
      })
    } catch (e) {
      setErr(ownerWords(e instanceof Error ? e.message : 'Could not cancel it'))
    } finally { setCancelling(null) }
  }

  const card: React.CSSProperties = { background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 13, display: 'flex', gap: 11, alignItems: 'flex-start' }
  const thumb = (url: string | null) => (
    <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: url ? `center/cover url(${url})` : '#f0f0f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!url && <ImageIcon size={17} color={C.faint} />}
    </span>
  )
  const marks = (ps: string[]) => (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {ps.slice(0, 4).map((p, i) => (
        <span key={p + i} style={{ marginLeft: i ? -5 : 0, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandOrMark provider={p} size={12} />
        </span>
      ))}
    </span>
  )
  /* The section's own label, drawn exactly like "Recent posts" under it: the two
     of them ARE the flow, and they have to read as one pair rather than as a
     stray group of cards followed by a titled list. */
  const H = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.faint, margin: '13px 2px 7px' }}>{children}</div>
  )

  if (!data) return null
  const nothing = !data.waiting.length && !data.failed.length && !data.withTeam.length

  if (nothing) {
    if (!nudge) return null
    /* The quiet version. Nothing is wrong when nothing is scheduled, so this is a
       line and a link, not a card with a drawing in it. */
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', ...(compact ? { marginTop: 16 } : { marginBottom: 12 }), background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: tint('mint', .16), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={15} color={C.greenDk} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.mute, lineHeight: 1.4 }}>Nothing is scheduled.</span>
        <Link href="/dashboard/post" style={{ flexShrink: 0, textDecoration: 'none', font: 'inherit', fontSize: 13, fontWeight: 600, color: C.greenDk }}>Write one</Link>
      </div>
    )
  }

  if (compact) {
    /* SIDEWAYS, ten at most (owner 2026-09-10). Stacked, a busy week of scheduled
       posts pushed the post rail and everything under it off the screen; on a rail
       ten of them cost one card's height. Order still matters: what went wrong,
       then what is next, then what the team is holding. */
    const rows: Array<{ id: string; when: string; text: string; platforms: string[]; media: string | null; bad?: boolean; team?: boolean }> = [
      ...data.failed.map((p) => ({ id: p.id, when: p.failure ?? 'It did not publish', text: p.content || 'A post', platforms: p.platforms, media: p.mediaUrl, bad: true })),
      ...data.waiting.map((p) => ({ id: p.id, when: whenWords(p.scheduledFor), text: p.content || 'A post', platforms: p.platforms, media: p.mediaUrl })),
      ...data.withTeam.map((d) => ({ id: d.id, when: d.status === 'approved' ? 'Written, ready to go' : 'Your team is writing it', text: d.idea, platforms: d.platforms, media: null, team: true })),
    ]
    const shown = rows.slice(0, 10)
    return (
      <div style={{ marginTop: 16, padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, padding: '0 2px' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute }}>Coming up</span>
          <span style={{ fontSize: 12, color: C.faint }}>{rows.length === 1 ? '1 thing' : `${rows.length} things`}</span>
          <Link href="/dashboard/insights/posts" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            Open <ChevronRight size={13} />
          </Link>
        </div>
        {/* bleeds past the page gutter so a cut-off card shows there is more */}
        <div className="mvp-swipe" style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x proximity', padding: '2px 18px 2px 2px', margin: '0 -18px 0 -2px' }}>
          {shown.map((r) => (
            <div key={r.id} style={{
              flex: '0 0 238px', width: 238, scrollSnapAlign: 'start', boxSizing: 'border-box',
              borderRadius: 16, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
              border: `0.5px solid ${r.bad ? tint('red', .45, 1) : C.line}`,
              background: r.bad ? '#fffafa' : r.team ? `linear-gradient(150deg, ${tint('mint', .12)}, ${tint('brand', .1)})` : '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.05)',
            }}>
              {r.media
                ? <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `center/cover url(${r.media})` }} />
                : (
                  <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: r.team ? gradOf('mint') : r.bad ? gradOf('red') : gradOf('nights'), boxShadow: r.team ? glow('mint', .26) : 'none' }}>
                    {r.team ? <Users size={18} /> : <Calendar size={18} />}
                  </span>
                )}
              {/* THE WHEN GETS THE WHOLE LINE. With the network marks beside it,
                  "Written, ready to go" truncated to "Written, re…" in a 238px
                  card -- the marks are a detail and the words are the point. */}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: r.bad ? C.coral : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.when}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 3, lineHeight: 1.35, maxHeight: 32, overflow: 'hidden' }}>{r.text}</span>
                {r.platforms.length > 0 && <span style={{ display: 'block', marginTop: 7 }}>{marks(r.platforms)}</span>}
              </span>
            </div>
          ))}
          {rows.length > shown.length && (
            <Link href="/dashboard/insights/posts" style={{ flex: '0 0 132px', width: 132, scrollSnapAlign: 'start', textDecoration: 'none', color: 'inherit', borderRadius: 16, border: `1px dashed ${C.line}`, background: 'linear-gradient(180deg,#fbfdfc,#f4f7f6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={16} color={C.greenDk} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{rows.length - shown.length} more</span>
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '4px 2px 2px' }}>
        <Calendar size={14} color={C.greenDk} /> Coming up
      </div>
      {err && <div style={{ fontSize: 12.5, color: C.coral, margin: '6px 2px 0' }}>{err}</div>}

      {data.failed.length > 0 && (
        <>
          <H>Did not go out</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.failed.map((p) => (
              <div key={p.id} style={{ ...card, borderColor: tint('red', .45, 1), background: '#fffafa' }}>
                {thumb(p.mediaUrl)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: C.ink, lineHeight: 1.4, maxHeight: 38, overflow: 'hidden' }}>{p.content || 'A post'}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.coral, marginTop: 4, fontWeight: 600 }}>{p.failure ?? 'It did not publish'}</span>
                </span>
                {marks(p.platforms)}
              </div>
            ))}
          </div>
        </>
      )}

      {data.waiting.length > 0 && (
        <>
          <H>Still to go</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.waiting.map((p) => (
              <div key={p.id} style={card}>
                {thumb(p.mediaUrl)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: C.ink }}>{whenWords(p.scheduledFor)}</span>
                    {marks(p.platforms)}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.4, maxHeight: 37, overflow: 'hidden' }}>{p.content || 'A post'}</span>
                  <button type="button" onClick={() => void cancel(p.id)} disabled={cancelling === p.id}
                    style={{ marginTop: 7, font: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.coral, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    {cancelling === p.id ? 'Cancelling…' : 'Cancel this'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {data.withTeam.length > 0 && (
        <>
          <H>With your team</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.withTeam.map((d) => (
              <div key={d.id} style={{ ...card, background: `linear-gradient(160deg, ${tint('mint', .09)}, ${tint('brand', .09)})`, borderColor: 'transparent' }}>
                <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: gradOf('mint'), boxShadow: glow('mint', .28), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Users size={19} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: C.ink, lineHeight: 1.4, maxHeight: 38, overflow: 'hidden' }}>{d.idea}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 4 }}>
                    {d.status === 'approved' ? 'Written, waiting to go out' : 'Your team is writing it'}
                    {d.wantedFor ? ` · you asked for ${new Date(d.wantedFor + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** The whole screen is empty: nothing waiting AND nothing ever posted. One card,
 *  one thing to do. Kept here so the "nothing" wording lives beside the section
 *  that decides there is nothing. */
export function NothingYet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'linear-gradient(180deg,#fbfdfc,#f5f9f7)', border: '1px dashed rgba(74,189,152,0.4)', borderRadius: 18, padding: '30px 22px', marginTop: 20 }}>
      <span style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 2px 10px rgba(74,189,152,0.18)' }}>
        <PenLine size={19} color={C.greenDk} />
      </span>
      <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink, marginBottom: 5 }}>Nothing here yet</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, maxWidth: 250 }}>
        Nothing is scheduled, and nothing has gone out yet. Your posts and how they did will show up here.
      </div>
      <Link href="/dashboard/post" style={{ marginTop: 16, textDecoration: 'none', font: 'inherit', fontSize: 14.5, fontWeight: 600, color: '#fff', background: C.ink, borderRadius: 13, padding: '12px 22px' }}>
        Write your first post
      </Link>
    </div>
  )
}
