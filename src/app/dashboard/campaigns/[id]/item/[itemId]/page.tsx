'use client'

/**
 * /dashboard/campaigns/[id]/item/[itemId] — one ordered item, product-page style, with its LIVE
 * status. Opened from the Campaign details blocks on the campaign page. Read-only: this is a
 * purchased item, so there is no buy button — just what it is, where it stands right now (derived
 * by item-status.ts with the same honest rules as the tracker), when to expect it, and its price.
 * Same 480 phone-column shell as /order so it reads as one continuous part of the campaign.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Check, CalendarClock, TrendingUp, FileText } from 'lucide-react'
import { C, DISPLAY, EYEBROW, AMBER_GRAD, cadenceLabel, cadenceSub } from '@/components/campaigns/ui'
import MotionStyles from '@/components/campaigns/motion-styles'
import { shippedStatus, ownerSetupComplete, servicesSettingUp, ownerRunWorkDone, type SavedCampaign, type CampaignProgress } from '@/lib/campaigns/view'
import { itemStatus, piecesForItem, type ItemServiceOrder, type ItemStatusWord } from '@/lib/campaigns/tracker/item-status'
import { serviceView } from '@/lib/campaigns/tracker/journey'
import { STAGE_LABEL } from '@/lib/campaigns/tracker/stages'
import { fmtShort } from '@/components/campaigns/tracker/piece-tracker'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'
import type { ReadinessReport } from '@/lib/campaigns/readiness-types'

export default function ItemDetailPage() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [progress, setProgress] = useState<CampaignProgress | null>(null)
  const [pieces, setPieces] = useState<TrackerPiece[]>([])
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null)
  const [serviceOrders, setServiceOrders] = useState<ItemServiceOrder[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/campaigns/${id}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      setCamp(j.campaign as SavedCampaign)
      setProgress((j.progress as CampaignProgress) ?? null)
      setPieces((j.pieces as TrackerPiece[]) ?? [])
      setReadiness((j.readiness as ReadinessReport) ?? null)
      setServiceOrders((j.serviceOrders as ItemServiceOrder[]) ?? null)
    } catch { setError(true) }
  }, [id])
  useEffect(() => { load() }, [load])

  const item = camp ? (camp.draft.items ?? []).find((x) => x.id === itemId && x.included && !x.optOut) ?? null : null
  const shipped = camp?.status === 'shipped' || camp?.status === 'stopped'
  const st = camp && shipped
    ? shippedStatus(progress, (camp.draft.brief?.contentBeats?.length ?? 0) > 0, ownerSetupComplete(camp), servicesSettingUp(camp), ownerRunWorkDone(camp))
    : null
  const status = camp && item && st ? itemStatus({ item, camp, phase: st.phase, pieces, readiness, serviceOrders }) : null
  const mine = camp && item ? piecesForItem(item, pieces, camp.draft.brief?.contentBeats) : []
  const isService = !!item && !/^content-/.test(item.serviceId ?? '')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 32px', background: 'radial-gradient(120% 300px at 50% 0%, rgba(74,189,152,0.07), rgba(255,255,255,0) 100%)' }}>
          <MotionStyles />
          {error ? <div style={{ color: C.red, fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>Could not load this item.</div>
            : !camp ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
            : !item ? (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>We could not find this item</div>
                <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>It may have been removed from this campaign.</div>
              </div>
            )
            : (
              <>
                {/* the live status, named before anything else */}
                {status && <StatusPill word={status.word} sub={
                  status.word === 'Needs you'
                    ? (status.pieceAwaitsYou ? 'Your OK on the finished piece' : 'We need something from you to keep this moving')
                    : status.word === 'Setting up' ? 'Your team is getting this in place'
                    : status.word === 'Being made' ? 'Your team is working on this'
                    : status.word === 'Live' ? 'Up and running'
                    : status.word === 'Done' ? 'This work is finished'
                    : 'Stopped. Nothing new posts.'
                } />}
                <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: '-.02em', margin: '10px 0 4px', lineHeight: 1.15 }}>{item.plain || item.name}</h1>
                {item.does && <p style={{ fontSize: 13.5, color: C.mute, margin: 0, lineHeight: 1.5 }}>{item.does}</p>}

                {/* the one setup door, only when a real open ask ties to THIS item */}
                {status && status.openAsks.length > 0 && camp.status !== 'stopped' && (
                  <button onClick={() => router.push(`/dashboard/campaigns/${id}/ready`)} className="cw-press" style={{ marginTop: 14, width: '100%', minHeight: 56, borderRadius: 12, border: 'none', cursor: 'pointer', background: AMBER_GRAD, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '10px 14px' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      We need {status.openAsks.length === 1 ? 'one thing' : `${status.openAsks.length} things`} from you <ChevronRight size={16} />
                    </span>
                    <span style={{ fontSize: 11.5, opacity: 0.92 }}>{status.openAsks[0].title}{status.openAsks.length > 1 ? ' and more' : ''}</span>
                  </button>
                )}

                {/* why it matters */}
                {item.why && (
                  <Card title="Why it matters">
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}>{item.why}</div>
                  </Card>
                )}

                {/* when — estimates say so; real piece dates show as planned days */}
                {(item.when || item.eta || isService) && (
                  <Card title="When">
                    {item.when && <FactRow Icon={CalendarClock} k="Timing" v={item.when} />}
                    {isService
                      ? <FactRow Icon={CalendarClock} k="Estimate" v={serviceView(item).etaLabel} />
                      : item.eta ? <FactRow Icon={CalendarClock} k="Takes about" v={item.eta.replace(/^~/, '')} /> : null}
                    <div style={{ fontSize: 11, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Estimated. Your team confirms the real dates.</div>
                  </Card>
                )}

                {/* this item's real pieces, each at its own real stage */}
                {mine.length > 0 && (
                  <Card title={mine.length === 1 ? 'The piece' : 'The pieces'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mine.map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: C.bg, borderRadius: 12, padding: '10px 12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{p.label}</div>
                            {p.goLiveISO && p.stage !== 'posted' && p.stage !== 'gathering' && p.stage !== 'dropped' && (
                              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>Planned for {fmtShort(p.goLiveISO)}</div>
                            )}
                          </div>
                          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: p.stage === 'posted' || p.stage === 'gathering' ? C.greenDk : C.mute }}>{STAGE_LABEL[p.stage]}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* what it moves */}
                {item.metric?.expect && (
                  <Card title="What it moves">
                    <FactRow Icon={TrendingUp} k={item.metric.label || 'Expect'} v={item.metric.expect} green />
                  </Card>
                )}

                {/* the drafted content, read-only */}
                {item.draft?.body && (
                  <Card title="What we're making">
                    <div style={{ display: 'flex', gap: 10 }}>
                      <FileText size={15} color={C.faint} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ minWidth: 0 }}>
                        {item.draft.title && <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{item.draft.title}</div>}
                        <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.draft.body}</div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* price — read-only receipt line; nothing to buy here */}
                <Card title="Price">
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{cadenceLabel(item)}</div>
                      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{cadenceSub(item)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>Already part of your order.</div>
                </Card>
              </>
            )}
        </div>
      </div>
    </div>
  )
}

const PILL: Record<ItemStatusWord, { bg: string; fg: string; dot: string }> = {
  'Needs you': { bg: C.amberBg, fg: C.amberFg, dot: C.amberDot },
  'Setting up': { bg: '#eef0ef', fg: C.mute, dot: C.faint },
  'Being made': { bg: '#eef0ef', fg: C.mute, dot: C.faint },
  'Live': { bg: C.greenSoft, fg: C.greenDk, dot: C.green },
  'Done': { bg: C.greenSoft, fg: C.greenDk, dot: C.green },
  'Stopped': { bg: '#f4f4f6', fg: C.mute, dot: C.faint },
}

function StatusPill({ word, sub }: { word: ItemStatusWord; sub: string }) {
  const pal = PILL[word]
  return (
    <div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: pal.bg, color: pal.fg, borderRadius: 99, padding: '4px 10px', fontWeight: 700, fontSize: 11 }}>
        {word === 'Done' ? <Check size={11} strokeWidth={3} /> : <span className={word === 'Live' ? 'cw-ping' : undefined} style={{ width: 6, height: 6, borderRadius: 99, background: pal.dot }} />}
        {word}
      </span>
      <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function FactRow({ Icon, k, v, green }: { Icon: typeof CalendarClock; k: string; v: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: C.mute, padding: '3px 0' }}>
      <Icon size={14} color={green ? C.green : C.faint} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ lineHeight: 1.5 }}><span style={{ color: C.ink, fontWeight: 600 }}>{k}:</span> {v}</span>
    </div>
  )
}
