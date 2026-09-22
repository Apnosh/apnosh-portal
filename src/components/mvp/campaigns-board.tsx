'use client'
/**
 * THE CAMPAIGNS TAB (owner 2026-09-22, "think of everything to manage campaigns, orders and
 * planning from the restaurant's side"): five questions, in order.
 *   Needs you   only what the owner alone can do, each with one button
 *   Active      what is live or being made (the cards)
 *   This week   the next seven days of pieces
 *   Doors       Calendar · Plan ahead (with next month's state) · Order history
 * Needs you and Active always show, even to say "nothing". The rest vanish when empty.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { C } from './tokens'
import { Drawing, DRAW_CSS, type Scene } from './create/drawings'
import MvpCampaigns from './mvp-campaigns'

interface Need { id: string; kind: 'approve' | 'see' | 'pay' | 'there' | 'fill' | 'reconnect' | 'task'; scene?: string; title: string; detail: string; action: string | null; href: string; when: string | null; slotId?: string; slotKind?: string; slotDate?: string }
interface Piece { id: string; kind: string; label: string; detail: string; date: string | null; state: string; href: string | null; source: string; group: { kind: string; label: string; emoji?: string }; fill?: string; subject?: string | null }
interface Board { needs: Need[]; week: Piece[]; next: { month: string; status: string }; thisMonth: { month: string; status: string } }

const SCENE_OF = (k: string): Scene => (({ post: 'post', boost: 'boost', creator: 'creator', reel: 'reel', graphic: 'graphic', photos: 'photos', print: 'print', offer: 'offer', taste: 'dish', sticky: 'sticky', review: 'review', team: 'grid', brand: 'brand', site: 'site', email: 'email', ad: 'ad', menu: 'sitemenu', apps: 'apps', google: 'google', note: 'sticky', else: 'else' } as Record<string, Scene>)[k] ?? 'else')
const HUE_OF: Record<string, string> = { post: '#2e9a78', boost: '#2e9a78', creator: '#2e9a78', reel: '#3b6fd4', graphic: '#3b6fd4', photos: '#3b6fd4', offer: '#6a39de', taste: '#6a39de', print: '#6a39de', review: '#0f97a8', team: '#0f97a8' }
const NEED_SCENE: Record<Need['kind'], Scene> = { approve: 'post', see: 'graphic', pay: 'ticket', there: 'photos', fill: 'graphic', reconnect: 'profile', task: 'sticky' }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dt = (iso: string) => new Date(iso + 'T12:00:00')
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
const inDays = (iso: string) => Math.round((dt(iso).getTime() - dt(new Date().toISOString().slice(0, 10)).getTime()) / 86400000)

export default function CampaignsBoard() {
  const { client, loading } = useClient()
  const router = useRouter()
  const [board, setBoard] = useState<Board | null>(null)
  const clientId = client?.id
  const q = clientId ? `?clientId=${clientId}` : ''
  useEffect(() => { if (!clientId) return; fetch(`/api/dashboard/board?clientId=${clientId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => setBoard(j ?? { needs: [], week: [], next: { month: '', status: 'none' }, thisMonth: { month: '', status: 'none' } })).catch(() => setBoard({ needs: [], week: [], next: { month: '', status: 'none' }, thisMonth: { month: '', status: 'none' } })) }, [clientId])
  if (loading || !clientId) return null
  const nextWord = board ? (board.next.status === 'started' ? 'on' : board.next.status === 'draft' ? 'drafted, not started' : 'not planned yet') : ''
  const today = new Date().toISOString().slice(0, 10)
  const days = Array.from({ length: 7 }, (_, i) => { const d = dt(today); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const onDay = (iso: string) => (board?.week ?? []).filter((p) => p.date === iso)
  const H = ({ children, count }: { children: React.ReactNode; count?: number }) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, padding: '22px 2px 10px' }}>{children}{count ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: '#fff4e0', color: '#8a5a0c', letterSpacing: 0 }}>{count}</span> : null}</div>
  return (
    <div className="cr" style={{ padding: '4px 18px 28px', color: C.ink, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>
      <style>{DRAW_CSS}{`.cb-card{transition:transform .12s}.cb-card:active{transform:scale(.985)}`}</style>

      {/* NEEDS YOU: a short stack of cards, one button each. Empty is one calm line. */}
      <H count={board?.needs.length || undefined}>Needs you</H>
      {!board && <div style={{ padding: '10px 0', color: C.faint }}><Loader2 size={16} className="mvp-spin" /></div>}
      {board && board.needs.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 16, background: '#f6f6f8', fontSize: 13.5, fontWeight: 600, color: C.mute }}><span style={{ width: 8, height: 8, borderRadius: 99, background: C.greenDk, flex: 'none' }} />Nothing waiting on you.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {board?.needs.map((n) => { const urgent = n.kind === 'approve' || n.kind === 'pay' || n.kind === 'reconnect' || (n.when != null && inDays(n.when) <= 1); return (
          <div key={n.id} className="cb-card" onClick={() => router.push(n.href.includes('?') ? `${n.href}&clientId=${clientId}` : `${n.href}${q}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', borderRadius: 18, background: '#fff', border: `0.5px solid ${C.line}`, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 99, background: urgent ? '#d99a1e' : C.greenDk }} />
            <span style={{ width: 38, flex: 'none', ['--c2' as string]: n.kind === 'reconnect' || n.kind === 'pay' ? '#d99a1e' : n.kind === 'there' ? '#2e9a78' : '#3b6fd4' }}><Drawing spec={{ scene: n.scene ? SCENE_OF(n.scene) : NEED_SCENE[n.kind] }} name="" rating="" t={(x) => x} /></span>
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14.5, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</b><small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.detail}</small></span>
            {n.action ? <span style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 99, background: C.ink, color: '#fff', whiteSpace: 'nowrap', flex: 'none' }}>{n.action}</span> : n.when ? <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 99, background: '#fff4e0', color: '#8a5a0c', whiteSpace: 'nowrap', flex: 'none' }}>{inDays(n.when) <= 0 ? 'today' : inDays(n.when) === 1 ? 'tomorrow' : `in ${inDays(n.when)} days`}</span> : null}
          </div>) })}
      </div>

      {/* ACTIVE: the cards, as they are */}
      <H>Active</H>
      <MvpCampaigns board="active" embedded />

      {/* THIS WEEK: seven days across, the calendar's own drawings under each. Tap to open the calendar. */}
      {board && (
        <>
          <H>This week</H>
          <Link href={`/dashboard/campaigns/calendar${q}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, textDecoration: 'none', color: C.ink }}>
            {days.map((iso, i) => { const ps = onDay(iso); const posts = ps.filter((p) => p.kind === 'post'); const rest = ps.filter((p) => p.kind !== 'post'); const isToday = i === 0; return (
              <span key={iso} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px 8px', borderRadius: 14, background: ps.length ? '#fff' : '#fafafb', boxShadow: ps.length ? `0 1px 2px rgba(0,0,0,.05), 0 0 0 0.5px ${C.line}` : 'inset 0 0 0 0.5px #eeeef1', minHeight: 78 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.04em' }}>{WD[dt(iso).getDay()].slice(0, 1)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1, width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', background: isToday ? C.ink : 'transparent', color: isToday ? '#fff' : C.ink }}>{dt(iso).getDate()}</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  {rest.slice(0, 2).map((p) => p.fill === 'open' ? <span key={p.id} style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px dashed #c9c9d0', boxSizing: 'border-box' }} /> : <span key={p.id} style={{ width: 16, display: 'block', ['--c2' as string]: HUE_OF[p.kind] ?? '#6e6e73' }}><Drawing spec={{ scene: SCENE_OF(p.kind) }} name="" rating="" t={(x) => x} /></span>)}
                  {rest.length > 2 && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.mute }}>+{rest.length - 2}</span>}
                </span>
                <span style={{ display: 'flex', gap: 2, height: 5, marginTop: 'auto' }}>{posts.slice(0, 3).map((p) => <span key={p.id} style={{ width: 5, height: 5, borderRadius: 99, boxSizing: 'border-box', ...(p.fill === 'open' ? { border: '1px dashed #b0b0b6' } : { background: '#2e9a78' }) }} />)}</span>
              </span>) })}
          </Link>
        </>
      )}

      {/* the three doors as tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 22 }}>
        {([['calendar', `/dashboard/campaigns/calendar${q}`, 'calendar', 'Calendar', 'by week or month'], ['plan', `/dashboard/plan${q}${board?.next.month ? `${q ? '&' : '?'}month=${board.next.month}` : ''}`, 'chart', 'Plan ahead', board?.next.month ? `${MONTH_NAME(board.next.month).slice(0, 3)} · ${nextWord}` : ''], ['history', `/dashboard/campaigns/history${q}`, 'grid', 'History', 'what ran']] as const).map(([k, href, scene, label, sub]) => (
          <Link key={k} href={href} className="cb-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 12px 10px', borderRadius: 16, background: '#f6f6f8', textDecoration: 'none', color: C.ink, minWidth: 0 }}>
            <span style={{ width: 30, display: 'block', ['--c2' as string]: k === 'plan' ? '#3b6fd4' : k === 'history' ? '#0f97a8' : '#2e9a78' }}><Drawing spec={{ scene }} name="" rating="" t={(x) => x} /></span>
            <b style={{ fontSize: 13, letterSpacing: '-.01em' }}>{label}</b>
            {sub ? <small style={{ fontSize: 10.5, color: C.mute, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{sub}</small> : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
