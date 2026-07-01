'use client'

/**
 * /dashboard/campaigns/[id] — the campaign's lifecycle surface.
 * Shows the complete plan as transparent, editable plays, the honest bill,
 * and a path-aware gate: DIY/AI self-ship; the strategist path sits in review
 * ("Apnosh is building this") until the owner taps Approve & ship. Edits
 * persist via PATCH; nothing is charged until a piece ships.
 */
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Trash2, Rocket, Check, CalendarDays, Play, Film, Image as ImageIcon, Hammer } from 'lucide-react'
import { playsFrom } from '@/lib/campaigns/plays'
import { summarize, type LineItem, type OptOutReason } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { AUDIENCES, CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import PlayCard from '@/components/campaigns/play-card'
import LineCard from '@/components/campaigns/line-card'
import HonestBillBar from '@/components/campaigns/honest-bill-bar'
import { C, DISPLAY, GRAD } from '@/components/campaigns/ui'

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/campaigns/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j) => { if (live) setCamp(j.campaign as SavedCampaign) })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [id])

  function patchItems(items: LineItem[]) {
    if (!camp) return
    setCamp({ ...camp, draft: { ...camp.draft, items } })  // optimistic
    fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).catch(() => {})
  }
  const mutate = (fn: (items: LineItem[]) => LineItem[]) => { if (camp) patchItems(fn(camp.draft.items)) }
  const toggleOptOut = (lid: string, r: OptOutReason) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, optOut: x.optOut === r ? undefined : r } : x)))
  const toggleInclude = (lid: string) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, included: !x.included, optOut: undefined } : x)))
  const remove = (lid: string) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, included: false, optOut: undefined } : x)))
  const setQty = (lid: string, qty: number) => mutate((items) => items.map((x) => (x.id === lid ? { ...x, qty: Math.max(1, qty) } : x)))

  async function ship() {
    if (!camp) return
    setBusy(true)
    await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: new Date().toISOString() } }) }).catch(() => {})
    setCamp({ ...camp, status: 'shipped', phase: 'monitor' })
    setBusy(false)
  }
  async function del() {
    setBusy(true)
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' }).catch(() => {})
    router.push('/dashboard/campaigns')
  }

  const shipped = camp?.status === 'shipped'
  const path = camp?.draft.path ?? 'strategist'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', height: '100dvh' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push('/dashboard/campaigns')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ChevronLeft size={18} /> Campaigns</button>
          {camp && !shipped && <button onClick={del} disabled={busy} aria-label="Delete" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4 }}><Trash2 size={18} /></button>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          {error ? <div style={{ color: '#c0392b', fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>{error}</div>
            : !camp ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
            : <Detail camp={camp} onToggleOptOut={toggleOptOut} onToggleInclude={toggleInclude} onRemove={remove} onSetQty={setQty} />}
        </div>

        {camp && (
          <>
            {!shipped && <HonestBillBar items={camp.draft.items} note={path === 'strategist' ? 'Approving is free. Each piece bills only when it ships.' : 'Nothing is charged until a piece ships.'} />}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#fff' }}>
              {shipped ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: C.greenDk, fontWeight: 700, fontSize: 14, background: C.greenSoft, borderRadius: 12, padding: 13 }}><Check size={16} /> Shipped — your team’s on it</div>
              ) : (
                <button onClick={ship} disabled={busy} style={{ width: '100%', background: GRAD, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />}
                  {path === 'strategist' ? 'Approve & ship' : path === 'diy' ? 'Schedule it' : 'Ship it'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Detail({ camp, onToggleOptOut, onToggleInclude, onRemove, onSetQty }: {
  camp: SavedCampaign
  onToggleOptOut: (id: string, r: OptOutReason) => void
  onToggleInclude: (id: string) => void
  onRemove: (id: string) => void
  onSetQty: (id: string, qty: number) => void
}) {
  const items = camp.draft.items
  const core = items.filter((i) => i.included)
  const recommended = items.filter((i) => !i.included)
  const plays = playsFrom(core)
  const brief = camp.draft.brief
  const bill = summarize(items)
  const shipped = camp.status === 'shipped'
  const inReview = !shipped && camp.phase === 'review'

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: shipped ? C.greenSoft : '#eef0ef', color: shipped ? C.greenDk : C.mute, borderRadius: 99, padding: '4px 11px', fontWeight: 700, fontSize: 11.5, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: shipped ? C.green : C.faint }} />{shipped ? 'Live' : inReview ? 'In review' : 'Draft'}
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, margin: '0 0 4px', lineHeight: 1.15 }}>{camp.draft.name}</h1>
      {brief && <p style={{ fontSize: 13, color: C.mute, margin: '0 0 14px' }}>{brief.objective}{brief.projected ? ` · ${brief.projected}` : ''}</p>}

      {/* path/lifecycle banner */}
      {inReview && camp.draft.path === 'strategist' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          <Hammer size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Apnosh is building every piece you kept. Review the plan below, then tap <b>Approve &amp; ship</b> when it looks right. Approving doesn’t charge you.</span>
        </div>
      )}
      {shipped && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '11px 12px', marginBottom: 14, fontSize: 12.5, fontWeight: 600 }}>
          <Check size={15} /> Shipped. Each piece bills only as it’s delivered.
        </div>
      )}

      {/* the plays */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plays.map((p) => (
          <PlayCard key={p.key} play={p} defaultOpen={false} onToggleOptOut={onToggleOptOut} onToggleInclude={onToggleInclude} onRemove={onRemove} onSetQty={onSetQty} />
        ))}
      </div>

      <ContentPreview items={core} shipped={shipped} />

      {recommended.length > 0 && !shipped && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Go further</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommended.map((it) => <LineCard key={it.id} item={it} onToggleInclude={() => onToggleInclude(it.id)} />)}
          </div>
        </div>
      )}

      {/* brief */}
      {brief && (
        <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.green, marginBottom: 10 }}>The plan</div>
          {brief.offer && <Row k="Offer" v={brief.offer.label} />}
          <Row k="Goal" v={brief.kpi} />
          <Row k="Who" v={brief.audienceIds.map((a) => AUDIENCES[a]?.label ?? a).join(', ') || '—'} />
          <Row k="Where" v={brief.channelIds.map((c) => CHANNELS[c]?.label ?? c).join(', ') || '—'} />
          {brief.contentBeats.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 8 }}><CalendarDays size={13} /> Content calendar</div>
              {brief.contentBeats.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontSize: 12.5 }}>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 6, padding: '2px 7px' }}>Wk {b.week}</span>
                  <span style={{ flex: 1, minWidth: 0, color: C.ink }}>{b.label}</span>
                  {b.channel && <span style={{ flexShrink: 0, fontSize: 11, color: C.faint }}>{b.channel}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {shipped && (
        <div style={{ marginTop: 14, fontSize: 12, color: C.faint, textAlign: 'center' }}>
          {bill.oneTimeOnDelivery > 0 ? `$${bill.oneTimeOnDelivery} on delivery` : ''}{bill.oneTimeOnDelivery > 0 && bill.perMonth > 0 ? ' · ' : ''}{bill.perMonth > 0 ? `$${bill.perMonth}/mo` : ''}
        </div>
      )}
    </div>
  )
}

/* Preview the actual content pieces. Each is watchable/viewable once it's
   produced; before that it shows as in-production. */
const PIECE: Record<string, { label: string; Icon: typeof Play; verb: string }> = {
  'content-reel':  { label: 'Reel',          Icon: Play,      verb: 'Watch reel' },
  'content-photo': { label: 'Photo',         Icon: ImageIcon, verb: 'View photo' },
  'content-post':  { label: 'Post / graphic', Icon: ImageIcon, verb: 'Preview' },
  'content-story': { label: 'Story',         Icon: Film,      verb: 'View story' },
}

function ContentPreview({ items, shipped }: { items: LineItem[]; shipped: boolean }) {
  const pieces = items.filter((it) => it.serviceId?.startsWith('content-'))
  if (pieces.length === 0) return null
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Your content</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pieces.map((it) => {
          const meta = PIECE[it.serviceId ?? ''] ?? { label: it.name, Icon: ImageIcon, verb: 'Preview' }
          const ready = shipped || it.lock === 'delivered'
          const Icon = meta.Icon
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '10px 12px' }}>
              <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                <Icon size={20} fill={meta.verb === 'Watch reel' ? '#fff' : 'none'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                <div style={{ fontSize: 11.5, color: ready ? C.greenDk : C.faint, marginTop: 1 }}>{ready ? 'Ready to preview' : 'In production · preview when it’s ready'}</div>
              </div>
              {ready ? (
                <a href={`#preview-${it.id}`} onClick={(e) => e.preventDefault()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '7px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                  <Play size={12} fill={C.greenDk} /> {meta.verb}
                </a>
              ) : (
                <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: C.faint, background: '#f1f3f2', borderRadius: 99, padding: '6px 11px' }}>Soon</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #f3f6f4', fontSize: 13 }}>
      <span style={{ color: C.mute, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: C.ink }}>{v}</span>
    </div>
  )
}
