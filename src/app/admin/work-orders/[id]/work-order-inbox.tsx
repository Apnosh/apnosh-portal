'use client'
/**
 * WorkOrderInbox — the "Your Turn" surface for servicing one order. Three piles sorted by who acts:
 * Your turn (one decision per card, one green button), Waiting (client / Google, calm amber, named),
 * Done (collapsed receipts). On open the sync endpoint runs everything automatic (safe reads + AI
 * drafts), so the operator only ever sees real decisions. Every live write passes through a named
 * consent sheet; a push only reads "Live on Google" when the read-back confirms it. The full playbook
 * survives as an audit drawer.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, ChevronDown, ExternalLink, Loader2, MessageSquare, RefreshCw, Send, UploadCloud, X } from 'lucide-react'
import { classifySteps, pileCounts, type PiledStep } from '@/lib/gbp-apply/piles'
import type { WorkOrderStep } from '@/lib/campaigns/data/service-playbooks'

type StepX = WorkOrderStep & {
  prepared?: { proposed: string; at: string }
  applied?: { at?: string; summary?: string; proofUrl?: string | null; requested?: string; confirmed?: string | null; verified?: boolean }
  checked?: { at: string; summary: string; kind: string }
  sentAt?: string
}

export interface InboxSWO {
  id: string
  campaignId: string
  serviceId: string
  title: string
  status: string
  dueDate: string | null
  proofUrl: string | null
  proofNote: string | null
  steps: Record<string, unknown>[]
}

function fmtShort(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WorkOrderInbox({ swo, clientName, deliverableLabel }: { swo: InboxSWO; clientName: string; deliverableLabel: string }) {
  const router = useRouter()
  const steps = swo.steps as unknown as StepX[]
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState<{ stepId: string; label: string; value: string } | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const [proofUrl, setProofUrl] = useState(swo.proofUrl ?? '')
  const [proofNote, setProofNote] = useState(swo.proofNote ?? '')
  const [pending, startTransition] = useTransition()
  const syncedOnce = useRef(false)

  // The machine's turn happens first: sync on open (safe reads + drafts), then show the piles. A
  // failed sync is said out loud — silent staleness would leave the operator working blind.
  useEffect(() => {
    if (syncedOnce.current) return
    syncedOnce.current = true
    void (async () => {
      setSyncing(true)
      try {
        const res = await fetch(`/api/admin/service-work-orders/${swo.id}/sync`, { method: 'POST' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || 'sync failed')
        setCheckedAt(j.checkedAt ?? new Date().toISOString())
        if (j.changed) startTransition(() => router.refresh())
      } catch {
        setErr('Could not check Google, so this view may be stale. Try Check again.')
      } finally { setSyncing(false) }
    })()
  }, [swo.id, router])

  const piled = useMemo(() => classifySteps(swo.serviceId, steps as unknown as WorkOrderStep[]), [swo.serviceId, steps])
  const counts = pileCounts(piled)
  const total = counts.yourTurn + counts.waiting + counts.done
  const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0
  const yourTurn = piled.filter((p) => p.pile === 'your-turn')
  const waitingClient = piled.filter((p) => p.pile === 'waiting-client')
  const waitingGoogle = piled.filter((p) => p.pile === 'waiting-google')
  const done = piled.filter((p) => p.pile === 'done')
  const delivered = swo.status === 'delivered'
  const firstActionable = yourTurn.find((p) => !p.locked)?.step.id

  async function api(path: string, body: Record<string, unknown>, method = 'POST') {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new Error(j?.error || 'Could not save. Try again.') as Error & { status?: number }
      e.status = res.status
      throw e
    }
    return j
  }

  async function run(stepId: string, fn: () => Promise<void>) {
    if (busyId || syncing) return // one action at a time; the sync and a click must never race
    setBusyId(stepId); setErr(null)
    try { await fn(); startTransition(() => router.refresh()) }
    catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      // A conflict means the view is stale: pull the fresh state so a retry works against reality.
      if ((e as { status?: number })?.status === 409) startTransition(() => router.refresh())
    }
    finally { setBusyId(null) }
  }

  const toggleBullet = (stepId: string, idx: number, next: boolean) =>
    run(stepId, async () => { await api(`/api/admin/service-work-orders/${swo.id}`, { stepUpdates: [{ id: stepId, actionIndex: idx, actionDone: next }] }, 'PATCH') })

  const confirmPush = () => {
    if (!consent) return
    const { stepId, value } = consent
    setConsent(null)
    void run(stepId, async () => {
      const j = await api(`/api/admin/service-work-orders/${swo.id}/apply`, { stepId, mode: 'push', value, consent: true })
      if (!j?.ok && j?.error) throw new Error(j.error)
      setEdits((e) => { const n = { ...e }; delete n[stepId]; return n })
    })
  }

  const sendSignoff = (stepId: string) =>
    run(stepId, async () => { await api(`/api/admin/service-work-orders/${swo.id}`, { status: 'ready_for_client', stepUpdates: [{ id: stepId, markSent: true }] }, 'PATCH') })

  const checkAgain = () => run('__sync', async () => {
    const j = await api(`/api/admin/service-work-orders/${swo.id}/sync`, {})
    setCheckedAt(j.checkedAt ?? new Date().toISOString())
  })

  // Delivery is structural, not tied to a step id: any playbook can deliver once every step is done.
  // Covers both a playbook with no deliver step (gbp-posts) AND a deliver step that is already
  // checked off — the Deliver action must always remain reachable until the order is delivered.
  const deliverStep = steps.find((s) => s.id === 'qa-deliver')
  const hasDeliverStep = !!deliverStep
  const nonDeliverDone = steps.filter((s) => s.id !== 'qa-deliver').every((s) => s.status === 'done')
  const readyToDeliverNoStep = steps.length > 0 && nonDeliverDone && (!hasDeliverStep || deliverStep?.status === 'done')

  const deliver = () =>
    run('qa-deliver', async () => {
      await api(`/api/admin/service-work-orders/${swo.id}`, {
        status: 'delivered',
        proofUrl: proofUrl.trim(),
        proofNote: proofNote.trim(),
        ...(hasDeliverStep ? { stepUpdates: [{ id: 'qa-deliver', status: 'done' }] } : {}),
      }, 'PATCH')
    })

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div>
        <Link href={`/admin/campaign-orders/${swo.campaignId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-3"><ArrowLeft className="w-4 h-4" /> Back to the order</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{clientName} · {swo.title}</h1>
            <p className="text-sm text-ink-3 mt-0.5">{counts.yourTurn} your turn · {counts.waiting} waiting · {counts.done} done{swo.dueDate ? ` · due ${fmtShort(swo.dueDate)}` : ''}</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-ink-4 inline-flex items-center gap-1.5">
              {syncing ? <><Loader2 className="w-3 h-3 animate-spin" /> Checking Google…</> : checkedAt ? `Checked Google ${new Date(checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Not checked yet'}
              {!syncing && <button type="button" onClick={checkAgain} disabled={busyId !== null} className="text-brand-dark hover:underline inline-flex items-center gap-0.5 disabled:opacity-50"><RefreshCw className="w-3 h-3" /> Check again</button>}
            </div>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-ink-6 overflow-hidden mt-3"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} /></div>
      </div>

      {delivered && (
        <div className="rounded-xl border border-brand/30 bg-brand-tint/40 p-4 flex items-center gap-2.5">
          <Check className="w-5 h-5 text-brand-dark" />
          <div className="text-sm text-ink-2">Serviced ✓ {swo.proofUrl && <a href={swo.proofUrl} target="_blank" rel="noopener noreferrer" className="text-brand-dark font-medium hover:underline inline-flex items-center gap-0.5">{deliverableLabel} <ExternalLink className="w-3 h-3" /></a>}</div>
        </div>
      )}

      {/* YOUR TURN */}
      {!delivered && (
        <section className="space-y-2.5">
          <h2 className="text-[13px] font-semibold text-ink-2 uppercase tracking-wide">Your turn</h2>
          {yourTurn.length === 0 && !readyToDeliverNoStep && <div className="rounded-xl border border-ink-6 bg-white p-4 text-sm text-ink-4">Nothing needs you right now. It is all with the client or Google.</div>}
          {readyToDeliverNoStep && (
            <div className="rounded-xl border border-brand/40 border-l-4 border-l-brand bg-white p-4">
              <div className="text-sm font-semibold text-ink">Everything is done. Deliver it.</div>
              <div className="mt-2 space-y-1.5">
                <input type="url" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder={`${deliverableLabel} link (https://...)`} className="w-full rounded-md border border-ink-6 bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/40" />
                <textarea value={proofNote} onChange={(e) => setProofNote(e.target.value)} rows={2} placeholder="Short note for the owner (what changed, what to watch)." className="w-full rounded-md border border-ink-6 bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={deliver} disabled={busyId !== null || pending || syncing || !proofUrl.trim()} className="rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark disabled:opacity-40 inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Deliver</button>
                  {!proofUrl.trim() && <span className="text-[11px] text-ink-4">Needs the proof link.</span>}
                </div>
              </div>
            </div>
          )}
          {yourTurn.map((p) => (
            <YourTurnCard
              key={p.step.id}
              p={p}
              next={p.step.id === firstActionable}
              busy={busyId === p.step.id || pending || syncing}
              edits={edits}
              setEdits={setEdits}
              onPush={(stepId, label, value) => setConsent({ stepId, label, value })}
              onToggle={toggleBullet}
              onSignoff={sendSignoff}
              proofUrl={proofUrl}
              setProofUrl={setProofUrl}
              proofNote={proofNote}
              setProofNote={setProofNote}
              onDeliver={deliver}
              deliverableLabel={deliverableLabel}
            />
          ))}
        </section>
      )}

      {/* WAITING */}
      {(waitingClient.length > 0 || waitingGoogle.length > 0) && (
        <section className="space-y-2.5">
          <h2 className="text-[13px] font-semibold text-ink-2 uppercase tracking-wide">Waiting</h2>
          {waitingClient.map((p) => (
            <div key={p.step.id} className="rounded-xl border border-ink-6 border-l-4 border-l-amber-400 bg-bg-2/60 p-3.5">
              <div className="text-sm font-medium text-ink">{p.step.label}</div>
              <div className="text-xs text-ink-3 mt-0.5">Waiting on {clientName}{(p.step as StepX).sentAt ? ` · asked ${fmtShort((p.step as StepX).sentAt)}` : ''}</div>
              {p.step.id === 'intake' && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {p.step.actions.filter((a) => !a.done).slice(0, 5).map((a, i) => (
                    <span key={i} className="text-[10px] bg-amber-50 text-amber-800 rounded px-1.5 py-0.5">{a.text.length > 34 ? a.text.slice(0, 32) + '…' : a.text}</span>
                  ))}
                  <Link href="/admin/messages" className="text-[11px] text-brand-dark hover:underline inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Message the owner</Link>
                </div>
              )}
            </div>
          ))}
          {waitingGoogle.map((p) => (
            <div key={p.step.id} className="rounded-xl border border-ink-6 border-l-4 border-l-amber-400 bg-bg-2/60 p-3.5">
              <div className="text-sm font-medium text-ink">{p.step.label}</div>
              <div className="text-xs text-ink-3 mt-0.5">{(p.step as StepX).checked?.summary || 'Google is checking this business. This is normal and can take a few days.'}</div>
              <button type="button" onClick={checkAgain} disabled={syncing || pending} className="mt-2 text-[11px] text-brand-dark hover:underline inline-flex items-center gap-1 disabled:opacity-50"><RefreshCw className="w-3 h-3" /> Check again</button>
            </div>
          ))}
        </section>
      )}

      {/* DONE */}
      {done.length > 0 && (
        <section>
          <button type="button" onClick={() => setDoneOpen((o) => !o)} className="w-full rounded-xl border border-ink-6 bg-white px-4 py-3 flex items-center justify-between text-sm text-ink-2 hover:bg-bg-2 transition-colors">
            <span className="inline-flex items-center gap-2"><Check className="w-4 h-4 text-brand-dark" /> {done.length} done</span>
            <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${doneOpen ? 'rotate-180' : ''}`} />
          </button>
          {doneOpen && (
            <div className="mt-2 space-y-1.5">
              {done.map((p) => {
                const s = p.step as StepX
                return (
                  <div key={s.id} className="rounded-lg border border-ink-6/70 bg-bg-2/40 px-3.5 py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] text-ink-2">{s.label}</div>
                      {s.applied?.summary && <div className="text-[11px] text-ink-4 mt-0.5">{s.applied.summary}</div>}
                    </div>
                    {s.applied?.proofUrl && <a href={s.applied.proofUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-dark hover:underline shrink-0 inline-flex items-center gap-0.5">open <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Audit drawer: the full authored playbook, demoted but intact */}
      <details className="group rounded-xl border border-ink-6 bg-white [&_summary::-webkit-details-marker]:hidden">
        <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between text-sm text-ink-3">
          <span>Full playbook ({steps.reduce((n, s) => n + s.actions.length, 0)} tasks)</span>
          <ChevronDown className="w-4 h-4 text-ink-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 space-y-3">
          {steps.map((s, si) => (
            <div key={s.id}>
              <div className="text-[12px] font-semibold text-ink-2">{si + 1}. {s.label}</div>
              <div className="mt-1 space-y-0.5 pl-4">
                {s.actions.map((a, ai) => (
                  <button key={ai} type="button" onClick={() => toggleBullet(s.id, ai, !a.done)} disabled={busyId === s.id || pending || syncing} className="w-full text-left flex items-start gap-2 group/b">
                    <span className={`mt-0.5 grid place-items-center rounded shrink-0 ${a.done ? 'bg-brand text-white' : 'bg-white border border-ink-5 group-hover/b:border-brand'}`} style={{ height: '14px', width: '14px' }}>{a.done && <Check className="w-2.5 h-2.5" />}</span>
                    <span className={`text-[11.5px] leading-snug ${a.done ? 'text-ink-4 line-through' : 'text-ink-3'}`}>{a.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 flex items-center justify-between gap-2">{err}<button type="button" onClick={() => setErr(null)}><X className="w-4 h-4" /></button></div>}

      {/* Consent sheet: every live write is confirmed by name, never silently */}
      {consent && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setConsent(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-ink">This changes the live Google profile.</div>
            <div className="text-[11px] text-ink-4 uppercase tracking-wide font-medium mt-3 mb-1">{consent.label}</div>
            <div className="rounded-lg bg-bg-2 border border-ink-6 p-3 text-[13px] text-ink-2 max-h-44 overflow-y-auto whitespace-pre-wrap">{consent.value}</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setConsent(null)} className="rounded-md border border-ink-6 bg-white px-3.5 py-1.5 text-sm text-ink-2 hover:bg-bg-2">Cancel</button>
              <button type="button" onClick={confirmPush} className="rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-dark inline-flex items-center gap-1.5"><UploadCloud className="w-4 h-4" /> Confirm and push</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── One decision per card ─────────────────────────────────────────────────────────────────────── */
function YourTurnCard({ p, next, busy, edits, setEdits, onPush, onToggle, onSignoff, proofUrl, setProofUrl, proofNote, setProofNote, onDeliver, deliverableLabel }: {
  p: PiledStep
  next: boolean
  busy: boolean
  edits: Record<string, string>
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onPush: (stepId: string, label: string, value: string) => void
  onToggle: (stepId: string, idx: number, next: boolean) => void
  onSignoff: (stepId: string) => void
  proofUrl: string
  setProofUrl: (v: string) => void
  proofNote: string
  setProofNote: (v: string) => void
  onDeliver: () => void
  deliverableLabel: string
}) {
  const s = p.step as StepX
  const shell = `rounded-xl border bg-white p-4 ${p.locked ? 'opacity-50 border-ink-6' : next ? 'border-brand/40 border-l-4 border-l-brand shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]' : 'border-ink-6 border-l-4 border-l-brand/30'}`

  // Locked deliver card
  if (p.locked) {
    return (
      <div className={shell}>
        <div className="text-sm font-medium text-ink">{s.label}</div>
        <div className="text-xs text-ink-4 mt-0.5">Opens when everything above is done.</div>
      </div>
    )
  }

  // Deliver card (active)
  if (s.id === 'qa-deliver') {
    return (
      <div className={shell}>
        {next && <NextBadge />}
        <div className="text-sm font-semibold text-ink">{s.label}</div>
        <div className="text-xs text-ink-3 mt-0.5">{s.lead}</div>
        <div className="mt-2.5 space-y-1">
          {s.actions.map((a, i) => (
            <button key={i} type="button" onClick={() => onToggle(s.id, i, !a.done)} disabled={busy} className="w-full text-left flex items-start gap-2 group/b">
              <span className={`mt-0.5 grid place-items-center rounded shrink-0 ${a.done ? 'bg-brand text-white' : 'bg-white border border-ink-5 group-hover/b:border-brand'}`} style={{ height: '15px', width: '15px' }}>{a.done && <Check className="w-2.5 h-2.5" />}</span>
              <span className={`text-[12px] ${a.done ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{a.text}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <input type="url" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder={`${deliverableLabel} link (https://...)`} className="w-full rounded-md border border-ink-6 bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/40" />
          <textarea value={proofNote} onChange={(e) => setProofNote(e.target.value)} rows={2} placeholder="Short note for the owner (what changed, what to watch)." className="w-full rounded-md border border-ink-6 bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={onDeliver} disabled={busy || !proofUrl.trim()} className="rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark disabled:opacity-40 inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Deliver</button>
            {!proofUrl.trim() && <span className="text-[11px] text-ink-4">Needs the proof link.</span>}
          </div>
        </div>
      </div>
    )
  }

  // Sign-off card
  if (s.actor === 'client') {
    return (
      <div className={shell}>
        {next && <NextBadge />}
        <div className="text-sm font-semibold text-ink">{s.label}</div>
        <div className="text-xs text-ink-3 mt-0.5">{s.lead}</div>
        <button type="button" onClick={() => onSignoff(s.id)} disabled={busy} className="mt-2.5 rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send for owner sign-off</button>
      </div>
    )
  }

  // Review-and-push card (a prepared draft exists)
  if (s.prepared?.proposed && p.action?.kind === 'write') {
    const value = edits[s.id] ?? s.prepared.proposed
    const pendingPush = s.applied && s.applied.verified === false
    // Per-handler limit: Google caps descriptions at 750; posts run to 1200 here.
    const maxLen = p.action?.handler === 'gbpPosts' ? 1200 : 750
    return (
      <div className={shell}>
        {next && <NextBadge />}
        <div className="text-sm font-semibold text-ink">{s.label}</div>
        {pendingPush ? (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-[12px] text-blue-700">{s.applied?.summary || 'Sent. Waiting for Google to say yes.'}</div>
        ) : null}
        <div className="mt-2.5">
          <div className="text-[10px] text-ink-4 uppercase tracking-wide font-medium mb-1">Now on Google</div>
          <div className="rounded-lg bg-bg-2 border border-ink-6/70 px-3 py-2 text-[12px] text-ink-3 whitespace-pre-wrap">{(s.applied?.confirmed ?? null) || 'Nothing yet.'}</div>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-ink-4 uppercase tracking-wide font-medium">Our draft · edit freely</div>
            <div className={`text-[10px] tabular-nums ${value.length > maxLen ? 'text-red-600 font-semibold' : 'text-ink-4'}`}>{value.length}/{maxLen}</div>
          </div>
          <textarea value={value} maxLength={maxLen} onChange={(e) => setEdits((d) => ({ ...d, [s.id]: e.target.value }))} rows={4} className="w-full rounded-lg border border-ink-6 bg-white px-3 py-2 text-[13px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand/40" />
        </div>
        <button type="button" onClick={() => onPush(s.id, s.label, value)} disabled={busy || !value.trim()} className="mt-2 rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark disabled:opacity-40 inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} Push to Google</button>
      </div>
    )
  }

  // Manual card: the operator's own checklist for this step (claim, photos, and anything unwired)
  const done = s.actions.filter((a) => a.done).length
  return (
    <div className={shell}>
      {next && <NextBadge />}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{s.label}</div>
        {s.actions.length > 0 && <span className="text-[10px] text-ink-4 tabular-nums">{done}/{s.actions.length}</span>}
      </div>
      <div className="text-xs text-ink-3 mt-0.5">{s.lead}</div>
      {s.checked?.kind === 'not_verified' && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-800">{s.checked.summary}</div>
      )}
      <div className="mt-2.5 space-y-1">
        {s.actions.map((a, i) => (
          <button key={i} type="button" onClick={() => onToggle(s.id, i, !a.done)} disabled={busy} className="w-full text-left flex items-start gap-2 group/b">
            <span className={`mt-0.5 grid place-items-center rounded shrink-0 ${a.done ? 'bg-brand text-white' : 'bg-white border border-ink-5 group-hover/b:border-brand'}`} style={{ height: '15px', width: '15px' }}>{a.done && <Check className="w-2.5 h-2.5" />}</span>
            <span className={`text-[12px] ${a.done ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{a.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NextBadge() {
  return <div className="inline-flex items-center rounded-full bg-brand-tint text-brand-dark text-[10px] font-semibold px-2 py-0.5 mb-1.5">Next up</div>
}
