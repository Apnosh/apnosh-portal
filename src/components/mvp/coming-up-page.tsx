'use client'
/**
 * /dashboard/insights/coming-up — the whole schedule, as a page (owner 2026-09-14).
 * ==================================================================================
 * The Coming up rail on Insights used to open the Recent posts list, which is the past. This
 * is the future: a week strip showing which days have something going out, then everything
 * that did not go out (with the reason and a way to write it again), then what is going out
 * grouped by day with a way to call any of it off, then what your team is holding, then what
 * went out most recently. One Write a post door at the bottom. Same data and same cancel
 * route as the rail (social-scheduled), so the two never disagree.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Calendar, Check, ChevronRight, PenLine, Users, X } from 'lucide-react'
import MvpShell from './mvp-shell'
import { useClient } from '@/lib/client-context'
import { BrandOrMark } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf } from './hues'

interface Post { id: string; content: string; status: string; scheduledFor: string | null; platforms: string[]; mediaUrl: string | null; failure: string | null }
interface Draft { id: string; idea: string; status: string; platforms: string[]; wantedFor: string | null }
interface PlanLine { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null }
interface Plan { id: string; kind: string; name: string; lines: PlanLine[] }
interface Data { waiting: Post[]; failed: Post[]; sent: Post[]; withTeam: Draft[]; plans?: Plan[]; error: string | null }

const RED = '#ec1528', AMBER = '#9a6b17', BLUE = '#3b6fd4'
const NAME: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', google: 'Google', gbp: 'Google', x: 'X', twitter: 'X', threads: 'Threads', pinterest: 'Pinterest' }
const word = (pl: string) => NAME[pl.toLowerCase()] ?? pl

function dayKey(iso: string | null): string { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'none' }
function dayWords(key: string): string {
  if (key === 'none') return 'No time set'
  const d = new Date(key + 'T00:00:00'); const now = new Date(); now.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
const timeWords = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
/* the title is the caption's first clause; the caption under it is what follows, so nothing reads twice */
function split(text: string): { title: string; rest: string } {
  const clean = text.replace(/\s+/g, ' ').trim()
  const first = clean.split(/[.!?\n]|\s?[—–]\s?|\s-\s|:\s/)[0].trim()
  const title = first.length > 48 ? first.slice(0, 46).replace(/\s+\S*$/, '') + '…' : first
  const rest = clean.slice(first.length).replace(/^[\s.!?:—–-]+/, '')
  return { title: title || 'A post', rest: rest || clean }
}
function ownerWords(f: string | null): string {
  const s = (f ?? '').toLowerCase()
  if (/token|auth|permission|expired|reconnect/.test(s)) return 'The account needs reconnecting.'
  if (/media|image|video|size|format/.test(s)) return 'The picture or video was not accepted.'
  if (/length|too long|character/.test(s)) return 'The caption was too long for that network.'
  if (/rate|limit|throttle/.test(s)) return 'The network was busy. It can be sent again.'
  return 'The network did not accept it.'
}

const Marks = ({ ps, size = 22 }: { ps: string[]; size?: number }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    {ps.slice(0, 4).map((p, i) => <span key={p + i} style={{ marginLeft: i ? -6 : 0, width: size, height: size, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={p} size={Math.round(size * 0.58)} /></span>)}
  </span>
)

function Preview({ media, platforms, tone }: { media: string | null; platforms: string[]; tone: string }) {
  return (
    <span style={{ position: 'relative', width: 78, height: 78, borderRadius: 14, flexShrink: 0, overflow: 'hidden', background: media ? `#111 center/cover url(${media})` : '#fff', border: media ? 'none' : `0.5px solid ${C.line}` }}>
      {!media && <span style={{ position: 'absolute', inset: 0, background: gradOf(tone as 'mint'), opacity: .13 }} />}
      {!media && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Marks ps={platforms} size={24} /></span>}
    </span>
  )
}

const H = ({ children, ink = C.ink }: { children: React.ReactNode; ink?: string }) => <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', color: ink, margin: '26px 0 10px' }}>{children}</div>
const SUB = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '14px 0 6px' }}>{children}</div>

export default function ComingUpPage() {
  const { client } = useClient()
  const clientId = client?.id
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!clientId) return
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load')
      setData(j as Data); setErr(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load what is coming up.') }
  }, [clientId])
  useEffect(() => { void load() }, [load])
  const cancel = async (id: string) => {
    if (!clientId || cancelling) return
    setCancelling(id)
    try {
      const r = await fetch(`/api/dashboard/social-scheduled?clientId=${clientId}&postId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) setData((cur) => (cur ? { ...cur, waiting: cur.waiting.filter((p) => p.id !== id) } : cur))
    } finally { setCancelling(null) }
  }

  /* the week strip: seven days from today, a dot where something goes out */
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d })
  const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // local day, never the UTC one
  const countOn = (d: Date) => (data?.waiting ?? []).filter((p) => dayKey(p.scheduledFor) === localKey(d)).length
  const byDay = new Map<string, Post[]>()
  for (const p of [...(data?.waiting ?? [])].sort((a, b) => String(a.scheduledFor ?? '9').localeCompare(String(b.scheduledFor ?? '9')))) { const k = dayKey(p.scheduledFor); byDay.set(k, [...(byDay.get(k) ?? []), p]) }
  const plans = data?.plans ?? []
  const total = (data?.waiting.length ?? 0) + (data?.withTeam.length ?? 0) + plans.reduce((n, p) => n + p.lines.length, 0)
  const empty = data && data.waiting.length === 0 && data.failed.length === 0 && data.withTeam.length === 0 && plans.length === 0
  const shortDay = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) }

  return (
    <MvpShell active="home" title="Coming up" back="/dashboard/insights" backExact>
      <div style={{ background: '#fff', minHeight: '100%', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, padding: '6px 18px 40px' }}>
        {/* the week */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 8 }}>
          {days.map((d, i) => { const n = countOn(d); const today = i === 0
            return (
              <div key={i} style={{ textAlign: 'center', padding: '8px 0 6px', borderRadius: 14, background: today ? C.greenSoft : 'transparent' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: today ? C.greenDk : C.faint, letterSpacing: '.04em', textTransform: 'uppercase' }}>{d.toLocaleDateString([], { weekday: 'short' }).slice(0, 3)}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: today ? C.greenDk : C.ink, marginTop: 2 }}>{d.getDate()}</div>
                <div style={{ height: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, marginTop: 2 }}>
                  {Array.from({ length: Math.min(3, n) }, (_, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 99, background: BLUE }} />)}
                </div>
              </div>
            ) })}
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 8 }}>{data ? (total === 0 ? 'Nothing scheduled yet.' : `${total} ${total === 1 ? 'thing' : 'things'} lined up.`) : 'Loading…'}</div>
        {err && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fdecea', color: '#8a2f28', fontSize: 13 }}>{err}</div>}

        {/* did not go out */}
        {data && data.failed.length > 0 && (
          <>
            <H ink={RED}>Did not go out</H>
            {data.failed.map((p) => { const { title, rest } = split(p.content || 'A post')
              return (
                <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `0.5px solid ${C.line}` }}>
                  <Preview media={p.mediaUrl} platforms={p.platforms} tone="red" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: RED }}><AlertCircle size={12} strokeWidth={2.6} /> {ownerWords(p.failure)}</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rest}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      {p.mediaUrl && <Marks ps={p.platforms} size={18} />}
                      <Link href="/dashboard/post" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>Write it again <ChevronRight size={13} /></Link>
                    </div>
                  </div>
                </div>
              ) })}
          </>
        )}

        {/* going out, by day */}
        {data && data.waiting.length > 0 && (
          <>
            <H>Going out</H>
            {[...byDay.entries()].map(([k, list]) => (
              <div key={k}>
                <SUB>{dayWords(k)}</SUB>
                {list.map((p) => { const { title, rest } = split(p.content || 'A post')
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `0.5px solid ${C.line}` }}>
                      <Preview media={p.mediaUrl} platforms={p.platforms} tone="nights" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: BLUE }}><Calendar size={12} strokeWidth={2.6} /> {timeWords(p.scheduledFor) || 'No time set'}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rest}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                          {p.mediaUrl && <Marks ps={p.platforms} size={18} />}
                          <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.platforms.map(word).join(', ')}</span>
                          <button type="button" onClick={() => void cancel(p.id)} disabled={cancelling === p.id} style={{ marginLeft: 'auto', border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.mute, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><X size={13} /> {cancelling === p.id ? 'Calling off…' : 'Call it off'}</button>
                        </div>
                      </div>
                    </div>
                  ) })}
              </div>
            ))}
          </>
        )}

        {/* with your team */}
        {data && data.withTeam.length > 0 && (
          <>
            <H>With your team</H>
            {data.withTeam.map((d) => { const ready = d.status === 'approved'; const { title, rest } = split(d.idea || 'A post')
              return (
                <div key={d.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `0.5px solid ${C.line}` }}>
                  <Preview media={null} platforms={d.platforms} tone={ready ? 'mint' : 'amber'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: ready ? C.greenDk : AMBER }}>{ready ? <Check size={12} strokeWidth={2.8} /> : <Users size={12} strokeWidth={2.4} />} {ready ? 'Ready to go' : 'Being written'}{d.wantedFor ? ` · wanted ${dayWords(dayKey(d.wantedFor))}` : ''}</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rest}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.platforms.map(word).join(', ')}</span>
                      <Link href="/dashboard/inbox?tab=approvals" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>{ready ? 'Open in Inbox' : 'See the brief'} <ChevronRight size={13} /></Link>
                    </div>
                  </div>
                </div>
              ) })}
          </>
        )}

        {/* announcements: the plan lines that are not posts — the picture being made, the menus, the email, the Pay link */}
        {plans.length > 0 && (
          <>
            <H>Announcements</H>
            {plans.map((p) => (
              <div key={p.id} style={{ padding: '12px 0', borderTop: `0.5px solid ${C.line}` }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                {p.lines.map((l) => (
                  <div key={l.key} style={{ display: 'flex', gap: 12, padding: '8px 0 0', alignItems: 'flex-start' }}>
                    <span style={{ width: 54, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 1 }}>{shortDay(l.date)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.mute, lineHeight: 1.4, marginTop: 1 }}>{l.detail}</span>
                    </span>
                    {l.ref?.href && <Link href={l.ref.href} style={{ fontSize: 12.5, fontWeight: 700, color: l.status === 'needs_payment' ? AMBER : C.greenDk, textDecoration: 'none', whiteSpace: 'nowrap' }}>{l.status === 'needs_payment' ? 'Pay to start' : 'Open'}</Link>}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {empty && (
          <div style={{ marginTop: 26, padding: '26px 18px', borderRadius: 18, border: `1px dashed ${C.line}`, textAlign: 'center' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>Nothing lined up</div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>Write a post and pick a time, or hand one to your team.</div>
          </div>
        )}

        {/* went out */}
        {data && data.sent.length > 0 && (
          <>
            <H>Went out</H>
            {data.sent.slice(0, 5).map((p) => { const { title } = split(p.content || 'A post')
              return (
                <Link key={p.id} href="/dashboard/insights/posts" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `0.5px solid ${C.line}`, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, background: p.mediaUrl ? `#111 center/cover url(${p.mediaUrl})` : C.bg }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{p.scheduledFor ? `${dayWords(dayKey(p.scheduledFor))} ${timeWords(p.scheduledFor)}` : 'Sent'} · {p.platforms.map(word).join(', ')}</span>
                  </span>
                  <ChevronRight size={16} color={C.faint} />
                </Link>
              ) })}
            <Link href="/dashboard/insights/posts" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 10, fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none' }}>All your posts <ChevronRight size={13} /></Link>
          </>
        )}

        <Link href="/dashboard/post" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 30, height: 50, borderRadius: 99, background: C.greenDk, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}><PenLine size={17} /> Write a post</Link>
      </div>
    </MvpShell>
  )
}
