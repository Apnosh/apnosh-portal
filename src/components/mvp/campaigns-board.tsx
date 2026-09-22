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
import { CalendarDays, ChevronRight, Clock, Loader2, Sparkles } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { C, DISPLAY } from './tokens'
import { Mark } from './mark'
import { Drawing, DRAW_CSS, type Scene } from './create/drawings'
import MvpCampaigns from './mvp-campaigns'

interface Need { id: string; kind: 'approve' | 'see' | 'pay' | 'there' | 'fill' | 'reconnect' | 'task'; scene?: string; title: string; detail: string; action: string | null; href: string; when: string | null; slotId?: string; slotKind?: string; slotDate?: string }
interface Piece { id: string; kind: string; label: string; detail: string; date: string | null; state: string; href: string | null; source: string; group: { kind: string; label: string; emoji?: string }; fill?: string; subject?: string | null }
interface Board { needs: Need[]; week: Piece[]; next: { month: string; status: string }; thisMonth: { month: string; status: string } }

const SCENE_OF = (k: string): Scene => (({ post: 'post', boost: 'boost', creator: 'creator', reel: 'reel', graphic: 'graphic', photos: 'photos', print: 'print', offer: 'offer', taste: 'dish', sticky: 'sticky', review: 'review', team: 'grid', brand: 'brand', site: 'site', email: 'email', ad: 'ad', menu: 'sitemenu', apps: 'apps', google: 'google', note: 'sticky', else: 'else' } as Record<string, Scene>)[k] ?? 'else')
const HUE_OF: Record<string, string> = { post: '#2e9a78', boost: '#2e9a78', creator: '#2e9a78', reel: '#3b6fd4', graphic: '#3b6fd4', photos: '#3b6fd4', offer: '#6a39de', taste: '#6a39de', print: '#6a39de', review: '#0f97a8', team: '#0f97a8' }
const NEED_SCENE: Record<Need['kind'], Scene> = { approve: 'post', see: 'graphic', pay: 'ticket', there: 'photos', fill: 'graphic', reconnect: 'profile', task: 'sticky' }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dt = (iso: string) => new Date(iso + 'T12:00:00')
const nice = (iso: string) => { const d = dt(iso); return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}` }
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
  const k2: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink, padding: '18px 2px 8px' }
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: 'none' }
  const door = (href: string, icon: React.ReactNode, label: string, sub?: string) => (
    <Link key={label} href={href} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px', minHeight: 46, borderRadius: 12, textDecoration: 'none', color: C.ink }}>
      <Mark hue="mint" size={36} bare>{icon}</Mark>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>{label}{sub ? <small style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{sub}</small> : null}</span>
      <ChevronRight size={17} color={C.faint} />
    </Link>
  )
  /* posts collapse into one line per week */
  const week = (() => { const ps = board?.week ?? []; const posts = ps.filter((p) => p.kind === 'post' && p.group.kind === 'month'); const rest = ps.filter((p) => !(p.kind === 'post' && p.group.kind === 'month')).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')); return { posts, rest } })()
  const nextWord = board ? (board.next.status === 'started' ? 'on' : board.next.status === 'draft' ? 'drafted, not started' : 'not planned yet') : ''
  return (
    <div className="cr" style={{ padding: '10px 18px 28px', color: C.ink, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>
      <style>{DRAW_CSS}</style>

      <div style={k2}>Needs you{board && board.needs.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: '#fff4e0', color: '#8a5a0c' }}>{board.needs.length}</span>}</div>
      {!board && <div style={{ padding: '14px 0', color: C.faint }}><Loader2 size={16} className="mvp-spin" /></div>}
      {board && board.needs.length === 0 && <div style={{ fontSize: 13, color: C.mute, padding: '4px 2px 6px' }}>Nothing waiting on you.</div>}
      {board?.needs.map((n) => (
        <div key={n.id} onClick={() => router.push(n.href.includes('?') ? `${n.href}&clientId=${clientId}` : `${n.href}${q}`)} style={{ ...rowS, cursor: 'pointer' }}>
          <span style={{ width: 30, flex: 'none', ['--c2' as string]: n.kind === 'reconnect' || n.kind === 'pay' ? '#d99a1e' : '#3b6fd4' }}><Drawing spec={{ scene: n.scene ? SCENE_OF(n.scene) : NEED_SCENE[n.kind] }} name="" rating="" t={(x) => x} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span><small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.detail}</small></span>
          {n.action ? <span style={{ fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 99, background: C.ink, color: '#fff', whiteSpace: 'nowrap', flex: 'none' }}>{n.action}</span> : n.when ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: '#fff4e0', color: '#8a5a0c', whiteSpace: 'nowrap', flex: 'none' }}>{inDays(n.when) <= 0 ? 'today' : inDays(n.when) === 1 ? 'tomorrow' : `in ${inDays(n.when)} days`}</span> : null}
        </div>
      ))}

      <div style={k2}>Active</div>
      <MvpCampaigns board="active" embedded />

      {board && (week.posts.length > 0 || week.rest.length > 0) && (
        <>
          <div style={k2}>This week</div>
          {week.rest.map((p) => (
            <Link key={p.id} href={p.href ? (p.href.includes('?') ? `${p.href}&clientId=${clientId}` : `${p.href}${q}`) : `/dashboard/campaigns/calendar${q}`} style={rowS}>
              <span style={{ width: 30, flex: 'none', ['--c2' as string]: HUE_OF[p.kind] ?? '#6e6e73' }}>{p.fill === 'open' ? <span style={{ width: 30, height: 30, borderRadius: 9, border: '1.5px dashed #c9c9d0', display: 'block', boxSizing: 'border-box' }} /> : <Drawing spec={{ scene: SCENE_OF(p.kind) }} name="" rating="" t={(x) => x} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group.emoji ? `${p.group.emoji} ` : ''}{p.subject ? p.subject.slice(0, 48) : p.label}</span><small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{p.date ? nice(p.date) : ''}{p.fill === 'open' ? ' · open, yours to fill' : p.state === 'team' ? ' · with the team' : ''}</small></span>
              <ChevronRight size={15} color={C.faint} style={{ flex: 'none' }} />
            </Link>
          ))}
          {week.posts.length > 0 && (
            <Link href={`/dashboard/campaigns/calendar${q}`} style={rowS}>
              <span style={{ width: 30, flex: 'none', ['--c2' as string]: '#2e9a78' }}><Drawing spec={{ scene: 'post' }} name="" rating="" t={(x) => x} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>{week.posts.length} post{week.posts.length === 1 ? '' : 's'}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11.5, marginTop: 1 }}>{week.posts.map((p) => WD[dt(p.date!).getDay()]).join(' · ')}{week.posts.some((p) => p.fill === 'open') ? ` · ${week.posts.filter((p) => p.fill === 'open').length} open` : ''}</small></span>
              <ChevronRight size={15} color={C.faint} style={{ flex: 'none' }} />
            </Link>
          )}
        </>
      )}

      <div style={{ ...k2, paddingTop: 22 }}>More</div>
      {door(`/dashboard/campaigns/calendar${q}`, <CalendarDays size={18} />, 'Calendar')}
      {door(`/dashboard/plan${q}${board?.next.month ? `${q ? '&' : '?'}month=${board.next.month}` : ''}`, <Sparkles size={18} />, 'Plan ahead', board?.next.month ? `${MONTH_NAME(board.next.month)} · ${nextWord}` : undefined)}
      {door(`/dashboard/campaigns/history${q}`, <Clock size={18} />, 'Order history')}
    </div>
  )
}
