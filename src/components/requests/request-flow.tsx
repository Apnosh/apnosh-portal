'use client'

/**
 * THE REQUEST DESK — ask us for anything (creative requests, owner side).
 *
 * The hub lists every way to ask plus the owner's past requests with the team's
 * replies. Picking a creative opens ITS OWN Drafting Table flow (creative-flow.tsx
 * driven by flows.ts): the live board on top, numbered steps with controls sized to
 * the thing, a real calendar, the spoken review, the $0 receipt, hold-to-send.
 * The graphic is the original design configurator (/dashboard/design/order) — owner
 * law: one builder per thing, never a generic form.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Palette, BookOpen, Sparkles, Globe, Clapperboard, Camera, Share2, Mail,
  Megaphone, Printer, PenLine, MessageCircle, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { DESK, paperGround, DeskKeyframes, Ticket } from '@/components/campaigns/desk/ui'
import {
  REQUEST_TYPES, STATUS_LABEL, STATUS_OWNER_LINE, requestTypeById,
  type RequestType, type RequestTypeId, type RequestAnswers, type RequestStatus,
} from '@/lib/requests/catalog'
import CreativeFlow from '@/components/requests/creative-flow'

const TYPE_ICONS: Record<RequestTypeId, LucideIcon> = {
  graphic: Palette, menu: BookOpen, logo: Sparkles, website: Globe, video: Clapperboard,
  photos: Camera, social: Share2, email: Mail, ads: Megaphone, print: Printer,
  copy: PenLine, other: MessageCircle,
}

interface RequestRow {
  id: string
  type: string
  brief: RequestAnswers
  status: RequestStatus
  team_note: string | null
  created_at: string
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const STATUS_TONE: Record<RequestStatus, { fg: string; bg: string }> = {
  requested: { fg: DESK.ink2, bg: '#EFEDE6' },
  in_review: { fg: DESK.ink2, bg: '#EFEDE6' },
  quoted: { fg: DESK.mintDeep, bg: DESK.mintWash },
  in_progress: { fg: DESK.mintDeep, bg: DESK.mintWash },
  delivered: { fg: DESK.mintDeep, bg: DESK.mintWash },
  closed: { fg: DESK.mute, bg: '#EFEDE6' },
  declined: { fg: DESK.amber, bg: DESK.amberWash },
}

export default function RequestFlow() {
  const [type, setType] = useState<RequestType | null>(null)
  const [mine, setMine] = useState<RequestRow[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  const loadMine = useCallback(async () => {
    try {
      const r = await fetch('/api/requests')
      const d = await r.json().catch(() => ({}))
      setMine(Array.isArray(d.requests) ? d.requests : [])
    } catch {
      setMine([])
    }
    setLoadingMine(false)
  }, [])
  useEffect(() => { loadMine() }, [loadMine])

  /* Deep link: a Creatives-shelf card arrives as /dashboard/requests?type=<id> and lands
   * straight in that type's own flow. The graphic goes to THE builder (the Drafting Table). */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('type')
    if (wanted === 'graphic') { window.location.replace('/dashboard/design/order'); return }
    const t = wanted ? requestTypeById(wanted) : null
    if (t) setType(t)
  }, [])

  const start = (t: RequestType) => {
    if (t.id === 'graphic') { window.location.assign('/dashboard/design/order'); return }
    setType(t)
  }

  const label = { fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: DESK.mute }

  /* ── a creative's own Drafting Table flow ─────────────────────────────────────────── */
  if (type) {
    return <CreativeFlow typeId={type.id} onBack={() => { setType(null); loadMine() }} />
  }

  /* ── HUB: the picker + your requests ──────────────────────────────────────────────── */
  return (
    <div style={{ ...paperGround, minHeight: '100dvh', padding: '22px 16px 90px' }}>
      <DeskKeyframes />
      <div style={label}>The request desk</div>
      <h1 style={{ fontFamily: DESK.disp, fontSize: 24, color: DESK.ink, margin: '6px 0 4px', letterSpacing: '-0.01em' }}>
        What do you need made?
      </h1>
      <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, margin: '0 0 18px', lineHeight: 1.5 }}>
        Ask for anything. We answer with a plan and a price. Nothing is charged until you say yes.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {REQUEST_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t.id]
          return (
            <Ticket
              key={t.id}
              name={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                  <Icon size={16} style={{ color: DESK.mintDeep, flexShrink: 0 }} />
                  {t.label}
                </span>
              }
              sub={t.blurb}
              right={<ChevronRight size={17} />}
              onClick={() => start(t)}
            />
          )
        })}
      </div>

      <div style={{ ...label, margin: '30px 2px 10px' }}>Your requests</div>
      {loadingMine ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>Loading...</div>
      ) : mine.length === 0 ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>
          Nothing yet. Your first request will show up here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {mine.map((r) => {
            const t = requestTypeById(r.type)
            const tone = STATUS_TONE[r.status] ?? STATUS_TONE.requested
            const isOpen = open === r.id
            return (
              <div key={r.id} style={{ background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 14, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: DESK.disp, fontWeight: 700, fontSize: 14, color: DESK.ink }}>
                      {t?.label ?? 'Request'}
                    </span>
                    <span style={{ display: 'block', fontFamily: DESK.body, fontSize: 12, color: DESK.mute, marginTop: 1 }}>
                      Sent {fmtDay(r.created_at)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: tone.fg, background: tone.bg, borderRadius: 999, padding: '5px 10px' }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </button>
                {isOpen && (
                  <div className="dk-ink" style={{ padding: '0 14px 13px', borderTop: `1px dashed ${DESK.line}` }}>
                    <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink2, lineHeight: 1.5, paddingTop: 11 }}>
                      {STATUS_OWNER_LINE[r.status] ?? ''}
                    </div>
                    {r.team_note && (
                      <div style={{ marginTop: 10, background: DESK.mintWash, border: `1px solid ${DESK.mintLine}`, borderRadius: 10, padding: '10px 12px', fontFamily: DESK.body, fontSize: 13, color: DESK.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {r.team_note}
                      </div>
                    )}
                    {Object.entries(r.brief).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(r.brief).map(([k, v]) => (
                          <div key={k} style={{ fontFamily: DESK.body, fontSize: 12, color: DESK.mute, lineHeight: 1.45 }}>
                            <span style={{ color: DESK.ink2, fontWeight: 600 }}>{k}: </span>{v}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
