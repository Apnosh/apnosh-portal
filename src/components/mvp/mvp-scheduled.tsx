'use client'

/**
 * COMING UP — everything asked for that has not happened yet.
 * ===========================================================
 * You could schedule a post and then never see it again. That is worse than not
 * scheduling: a promise was made and there was no way to check it was kept, no
 * way to change your mind, and no way to know when one silently failed.
 *
 * Ordered by what an owner opens this to find out. What is still coming. What
 * went wrong. What their team is holding. What already went, last and short.
 */

import { useCallback, useEffect, useState } from 'react'
import { Calendar, AlertCircle, Users, Check, Image as ImageIcon, Plus } from 'lucide-react'
import Link from 'next/link'
import MvpShell from './mvp-shell'
import { MvpEmpty, MvpMsg } from './mvp-detail'
import { BrandOrMark } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, glow, tint } from './hues'

interface Post { id: string; content: string; status: string; scheduledFor: string | null; platforms: string[]; mediaUrl: string | null; failure: string | null }
interface Draft { id: string; idea: string; status: string; platforms: string[]; wantedFor: string | null }
interface Data { waiting: Post[]; failed: Post[]; sent: Post[]; withTeam: Draft[]; error: string | null }

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

export default function MvpScheduled({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load what is coming up')
      setData(j as Data)
      if (j.error) setErr(j.error)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load what is coming up')
      setData({ waiting: [], failed: [], sent: [], withTeam: [], error: null })
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function cancel(id: string) {
    setCancelling(id); setErr(null)
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}&postId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not cancel it')
      setData((cur) => cur ? { ...cur, waiting: cur.waiting.filter((p) => p.id !== id) } : cur)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not cancel it')
    } finally { setCancelling(null) }
  }

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 13, display: 'flex', gap: 11, alignItems: 'flex-start' }
  const thumb = (url: string | null) => (
    <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: url ? `center/cover url(${url})` : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const H = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 9px' }}>{icon}{children}</div>
  )

  const empty = data && !data.waiting.length && !data.failed.length && !data.withTeam.length && !data.sent.length

  return (
    <MvpShell active="home" back="/dashboard" title="Coming up">
      <div style={{ padding: '8px 16px 40px' }}>
        {err && <div style={{ marginBottom: 12 }}><MvpMsg ok={false} text={err} /></div>}

        {data === null ? (
          <div style={{ fontSize: 13.5, color: C.faint, padding: 6 }}>Loading…</div>
        ) : empty ? (
          <div style={{ paddingTop: 12 }}>
            <MvpEmpty title="Nothing waiting" text="When you schedule a post, or ask your team to write one, it waits here until it goes out." />
            <Link href="/dashboard/post" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, textDecoration: 'none', font: 'inherit', fontSize: 14.5, fontWeight: 600, color: '#fff', background: C.ink, borderRadius: 14, padding: '13px 0' }}>
              <Plus size={17} /> Write a post
            </Link>
          </div>
        ) : (
          <>
            {/* WHAT WENT WRONG comes first. A post the owner believes went out and
                did not is the worst thing this screen can be hiding. */}
            {data.failed.length > 0 && (
              <>
                <H icon={<AlertCircle size={14} color={C.coral} />}>Did not go out</H>
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
                <H icon={<Calendar size={14} color={C.greenDk} />}>Still to go</H>
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
                <H icon={<Users size={14} color={C.greenDk} />}>With your team</H>
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

            {data.sent.length > 0 && (
              <>
                <H icon={<Check size={14} color={C.faint} />}>Already went</H>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.sent.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px' }}>
                      {marks(p.platforms)}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.content || 'A post'}</span>
                      <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0 }}>{whenWords(p.scheduledFor)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </MvpShell>
  )
}
