'use client'

/**
 * YOUR REQUESTS — the tracking side of creative requests (owner side).
 *
 * The store's Creatives shelf is the only storefront (one card per type, owner's
 * call: individual items, no hub picker). A card deep-links here as ?type=<id> and
 * lands straight in that type's own Drafting Table flow (creative-flow.tsx driven
 * by flows.ts). Without ?type this page is the ledger: every request, its status,
 * the team's quote, the thread, and the accept button. The graphic is the original
 * design configurator (/dashboard/design/order) — owner law: one builder per thing.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DESK, paperGround, DeskKeyframes, Ticket } from '@/components/campaigns/desk/ui'
import {
  STATUS_LABEL, STATUS_OWNER_LINE, requestTypeById, questionsFor,
  type RequestType, type RequestAnswers, type RequestStatus,
} from '@/lib/requests/catalog'
import CreativeFlow from '@/components/requests/creative-flow'
import DeskCheckout from '@/components/requests/desk-checkout'
import { acceptGoesToTill, acceptPromiseLine, deskCancelable } from '@/lib/requests/desk-guards'
import { useClient } from '@/lib/client-context'

interface RequestNote {
  id: string
  author_role: 'team' | 'owner'
  body: string
  created_at: string
}

interface RequestRow {
  id: string
  type: string
  brief: RequestAnswers
  status: RequestStatus
  team_note: string | null
  created_at: string
  due_date?: string | null
  attachments?: { url: string; name: string }[] | null
  quote_cents?: number | null
  accepted_at?: string | null
  notes?: RequestNote[] | null
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** The owner reads their brief back in the question's words, never a raw field id. */
const promptFor = (typeId: string, qid: string): string => {
  const t = requestTypeById(typeId)
  const q = t ? questionsFor(t).find((x) => x.id === qid) : null
  return q ? q.prompt.replace(/\?$/, '') : qid
}

const STATUS_TONE: Record<RequestStatus, { fg: string; bg: string }> = {
  requested: { fg: DESK.ink2, bg: '#EFEDE6' },
  in_review: { fg: DESK.ink2, bg: '#EFEDE6' },
  quoted: { fg: DESK.mintDeep, bg: DESK.mintWash },
  awaiting_payment: { fg: DESK.amber, bg: DESK.amberWash },
  in_progress: { fg: DESK.mintDeep, bg: DESK.mintWash },
  delivered: { fg: DESK.mintDeep, bg: DESK.mintWash },
  closed: { fg: DESK.mute, bg: '#EFEDE6' },
  declined: { fg: DESK.amber, bg: DESK.amberWash },
}

export default function RequestFlow({ menu = [] }: { menu?: { id: string; name: string }[] }) {
  /* Client-side hops (owner ask 2026-08-18): back to the store must keep the app
   * shell mounted — a full page load flashed the bottom nav away mid-flow. */
  const router = useRouter()
  const [type, setType] = useState<RequestType | null>(null)
  const [mine, setMine] = useState<RequestRow[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [actErr, setActErr] = useState<string | null>(null)
  /* The order the owner is paying for right now. The till is the ONE card form (desk-checkout). */
  const [payFor, setPayFor] = useState<{ id: string; label: string } | null>(null)
  /* Cancelling sends money back, so it asks first. This holds the order mid-question. */
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  /* The answer the server gave about ONE order, keyed to it. Unkeyed, the line printed under
   * every card in the list: cancel one order and every other order said it was cancelled. */
  const [cancelMsg, setCancelMsg] = useState<{ id: string; text: string } | null>(null)
  /* Can the till take a card at all? The server answers with the list, because the accept button's
   * promise has to match what the accept route will do. Assumed SHUT until the server says
   * otherwise: a screen that guesses open would promise a card at a closed till. */
  const [tillOpen, setTillOpen] = useState(false)
  const { client } = useClient()

  const loadMine = useCallback(async () => {
    try {
      const r = await fetch('/api/requests')
      const d = await r.json().catch(() => ({}))
      setMine(Array.isArray(d.requests) ? d.requests : [])
      setTillOpen(d.tillOpen === true)
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

  /* accept = the owner's yes to a quote; note = a reply on the thread. */
  const act = async (id: string, kind: 'accept' | 'note') => {
    if (busy) return
    setBusy(id)
    setActErr(null)
    try {
      const r = kind === 'accept'
        ? await fetch(`/api/requests/${id}/accept`, { method: 'POST' })
        : await fetch(`/api/requests/${id}/notes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: reply.trim() }),
          })
      const d = await r.json().catch(() => ({}))
      /* The order was placed, not quoted: money comes before work. Open the till rather than
       * printing a refusal at somebody who only wants to get started. */
      if (r.status === 402 && d.code === 'DESK_NEEDS_PAYMENT') {
        const row = mine.find((m) => m.id === id)
        setPayFor({ id, label: requestTypeById(row?.type ?? '')?.label ?? 'Order' })
        setBusy(null)
        return
      }
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'That did not go through. Try again.')
      /* The yes landed and the quote has a price on it: the order is now waiting for the card, so
       * the till opens on the same tap. One yes, one card, no second trip back to this list. */
      if (kind === 'accept' && d.needsPayment) {
        const row = mine.find((m) => m.id === id)
        await loadMine()
        setPayFor({ id, label: requestTypeById(row?.type ?? '')?.label ?? 'Order' })
        setBusy(null)
        return
      }
      if (kind === 'note') setReply('')
      await loadMine()
    } catch (e) {
      setActErr(e instanceof Error ? e.message : 'That did not go through. Try again.')
    }
    setBusy(null)
  }

  /* CANCELLING AN ORDER. The server decides everything that matters (is it delivered, was it
   * paid, how much goes back) — this only asks first and repeats the answer word for word. */
  const cancelOrder = async (id: string) => {
    if (busy) return
    setBusy(id)
    setActErr(null)
    setCancelMsg(null)
    try {
      const r = await fetch(`/api/requests/${id}/cancel`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'That did not go through. Try again.')
      setCancelMsg({ id, text: typeof d.message === 'string' ? d.message : 'Your order is cancelled.' })
      setConfirmCancel(null)
      await loadMine()
    } catch (e) {
      setActErr(e instanceof Error ? e.message : 'That did not go through. Try again.')
    }
    setBusy(null)
  }

  const label = { fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: DESK.mute }

  /* ── the till: an order placed and not paid for is finished here ─────────────────── */
  if (payFor && client?.id) {
    return (
      <DeskCheckout
        clientId={client.id}
        requestId={payFor.id}
        label={payFor.label}
        onDone={() => { setPayFor(null); loadMine() }}
        onCancel={() => setPayFor(null)}
      />
    )
  }

  /* ── a creative's own Drafting Table flow ─────────────────────────────────────────── */
  if (type) {
    return (
      <CreativeFlow
        typeId={type.id}
        menu={menu}
        /* Backing out of a flow returns to where the cards live: the store. */
        onBack={() => router.push('/dashboard/campaigns/new?lens=creatives')}
        /* After a send, land on the ledger (and drop ?type so refresh stays here). */
        onDone={() => {
          window.history.replaceState(null, '', window.location.pathname)
          setType(null)
          loadMine()
        }}
      />
    )
  }

  /* ── THE LEDGER: your requests, their answers, your yes ──────────────────────────── */
  return (
    <div style={{ ...paperGround, minHeight: '100dvh', padding: '22px 16px 90px' }}>
      <DeskKeyframes />
      <div style={label}>Creative requests</div>
      <h1 style={{ fontFamily: DESK.disp, fontSize: 24, color: DESK.ink, margin: '6px 0 4px', letterSpacing: '-0.01em' }}>
        Your requests
      </h1>
      <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, margin: '0 0 14px', lineHeight: 1.5 }}>
        We answer each one with a plan and a price. Nothing is charged until you tap pay.
      </p>

      <Ticket
        name="Ask for something new"
        sub="Menus, logos, videos, photos, websites: pick one from the store"
        right={<ChevronRight size={17} />}
        onClick={() => router.push('/dashboard/campaigns/new?lens=creatives')}
      />

      <div style={{ ...label, margin: '26px 2px 10px' }}>Sent</div>
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
                        {r.quote_cents != null && r.quote_cents > 0 && (
                          <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                            ${(r.quote_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        )}
                        {r.team_note}
                      </div>
                    )}
                    {/* THE YES. With the card till open, a priced quote goes to the same till
                        everything else does: the button says so, and the card opens on this tap.
                        With the till OFF (today) the yes starts the work and the bill follows the
                        approval, the same lane the graphic orders run, and the line says exactly
                        that. It used to promise "you review the finished work before paying" in
                        both states, which was a lie in one of them. A $0 quote is the one yes that
                        starts work on its own under either switch. */}
                    {r.status === 'quoted' && (() => {
                      const pays = acceptGoesToTill(r.quote_cents, tillOpen)
                      const amount = pays ? `$${((r.quote_cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null
                      return (
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => { void act(r.id, 'accept') }}
                          style={{
                            width: '100%', height: 44, borderRadius: 22, border: 'none',
                            background: busy === r.id ? '#E7E4DB' : DESK.grad, color: busy === r.id ? DESK.mute : '#fff',
                            fontFamily: DESK.disp, fontSize: 15, fontWeight: 700, cursor: busy === r.id ? 'default' : 'pointer',
                            boxShadow: busy === r.id ? 'none' : '0 8px 20px rgba(46,154,120,0.3)',
                          }}
                        >
                          {busy === r.id ? 'Starting...' : pays ? `Say yes and pay ${amount}` : 'Say yes and start the work'}
                        </button>
                        <div style={{ fontFamily: DESK.body, fontSize: 11.5, color: DESK.mute, marginTop: 6, textAlign: 'center', lineHeight: 1.45 }}>
                          {acceptPromiseLine(pays, r.quote_cents)}
                        </div>
                      </div>
                      )
                    })()}
                    {/* an order the OWNER placed: the till priced it, so the card is what starts
                        it. No "you review before paying" here — that would be the old lie. */}
                    {r.status === 'awaiting_payment' && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={!client?.id}
                          onClick={() => setPayFor({ id: r.id, label: t?.label ?? 'Order' })}
                          style={{
                            width: '100%', height: 44, borderRadius: 22, border: 'none',
                            background: client?.id ? DESK.grad : '#E7E4DB', color: client?.id ? '#fff' : DESK.mute,
                            fontFamily: DESK.disp, fontSize: 15, fontWeight: 700, cursor: client?.id ? 'pointer' : 'default',
                            boxShadow: client?.id ? '0 8px 20px rgba(46,154,120,0.3)' : 'none',
                          }}
                        >
                          Pay to start
                        </button>
                        <div style={{ fontFamily: DESK.body, fontSize: 11.5, color: DESK.mute, marginTop: 6, textAlign: 'center', lineHeight: 1.45 }}>
                          {r.quote_cents != null && r.quote_cents > 0
                            ? `$${(r.quote_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} on your card. Your team starts the same day.`
                            : 'Your team starts the same day.'}
                        </div>
                      </div>
                    )}
                    {/* CANCEL. Only before the work lands — after that it is a conversation, not a
                        button, and the server says so in the same words. */}
                    {deskCancelable(r.status) && (
                      <div style={{ marginTop: 10 }}>
                        {confirmCancel === r.id ? (
                          <div style={{ background: DESK.amberWash, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '11px 13px' }}>
                            <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink, lineHeight: 1.5 }}>
                              We stop the work that has not started and send back what you paid for it. It lands on your card in 5 to 10 days. Work already being made keeps going.
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => { void cancelOrder(r.id) }}
                                style={{
                                  flex: 1, height: 38, borderRadius: 19, border: `1.5px solid ${DESK.amberLine}`,
                                  background: DESK.card, color: DESK.amber, fontFamily: DESK.disp, fontSize: 13.5,
                                  fontWeight: 700, cursor: busy === r.id ? 'default' : 'pointer',
                                }}
                              >
                                {busy === r.id ? 'Cancelling...' : 'Yes, cancel it'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancel(null)}
                                style={{
                                  flex: 1, height: 38, borderRadius: 19, border: `1.5px solid ${DESK.line}`,
                                  background: DESK.card, color: DESK.ink2, fontFamily: DESK.disp, fontSize: 13.5,
                                  fontWeight: 700, cursor: 'pointer',
                                }}
                              >
                                Keep it
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setCancelMsg(null); setActErr(null); setConfirmCancel(r.id) }}
                            style={{
                              background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                              fontFamily: DESK.body, fontSize: 12.5, fontWeight: 600, color: DESK.mute,
                            }}
                          >
                            Cancel this order
                          </button>
                        )}
                      </div>
                    )}
                    {cancelMsg?.id === r.id && (
                      <div style={{ marginTop: 8, fontFamily: DESK.body, fontSize: 12.5, color: DESK.mintDeep, lineHeight: 1.45 }}>
                        {cancelMsg.text}
                      </div>
                    )}
                    {/* the thread: every note both ways, oldest first */}
                    {(r.notes ?? []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(r.notes ?? []).map((n) => (
                          <div key={n.id} style={{
                            alignSelf: n.author_role === 'owner' ? 'flex-end' : 'flex-start', maxWidth: '88%',
                            background: n.author_role === 'owner' ? '#EFEDE6' : DESK.card,
                            border: `1px solid ${DESK.line}`, borderRadius: 10, padding: '7px 10px',
                            fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                          }}>
                            <span style={{ display: 'block', fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: DESK.mute, marginBottom: 2 }}>
                              {n.author_role === 'owner' ? 'You' : 'The team'} · {fmtDay(n.created_at)}
                            </span>
                            {n.body}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* reply box: the owner can always speak on an open request */}
                    {!['closed', 'declined'].includes(r.status) && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
                        <input
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Ask or add something..."
                          style={{
                            flex: 1, minWidth: 0, border: `1.5px solid ${DESK.line}`, borderRadius: 11,
                            padding: '9px 11px', fontFamily: DESK.body, fontSize: 13, color: DESK.ink,
                            background: DESK.card, outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy === r.id || !reply.trim()}
                          onClick={() => { void act(r.id, 'note') }}
                          style={{
                            flexShrink: 0, borderRadius: 11, border: `1.5px solid ${DESK.mintLine}`,
                            background: DESK.mintWash, color: DESK.mintDeep, fontFamily: DESK.disp,
                            fontSize: 13, fontWeight: 700, padding: '0 14px',
                            cursor: busy === r.id || !reply.trim() ? 'default' : 'pointer',
                            opacity: busy === r.id || !reply.trim() ? 0.5 : 1,
                          }}
                        >
                          Send
                        </button>
                      </div>
                    )}
                    {actErr && (
                      <div style={{ marginTop: 8, fontFamily: DESK.body, fontSize: 12, color: DESK.amber, lineHeight: 1.4 }}>
                        {actErr}
                      </div>
                    )}
                    {(r.attachments ?? []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(r.attachments ?? []).map((f, i) => (
                          <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noreferrer" style={{
                            fontFamily: DESK.body, fontSize: 11.5, color: DESK.mintDeep, background: DESK.mintWash,
                            border: `1px solid ${DESK.mintLine}`, borderRadius: 999, padding: '4px 10px', textDecoration: 'none',
                          }}>
                            {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                    {Object.entries(r.brief).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(r.brief).map(([k, v]) => (
                          <div key={k} style={{ fontFamily: DESK.body, fontSize: 12, color: DESK.mute, lineHeight: 1.45 }}>
                            <span style={{ color: DESK.ink2, fontWeight: 600 }}>{promptFor(r.type, k)}: </span>{v}
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
