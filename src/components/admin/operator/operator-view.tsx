'use client'

/**
 * Admin UI for the AI Marketing Operator.
 *
 * Three sections:
 *   1. "Run analysis" trigger card
 *   2. Pending proposal queue (approve/reject)
 *   3. Agent run history (audit + cost trail)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, CheckCircle2, XCircle, Loader2, AlertCircle, Clock,
  ChevronDown, ChevronRight, DollarSign, Brain, Tag,
} from 'lucide-react'
import {
  runAnalysisAction, approveProposal, rejectProposal,
} from '@/lib/operator/actions'
import type { ProposedAction, AgentRun, ProposalCategory } from '@/lib/operator/types'

interface Props {
  clientId: string
  clientSlug: string
  initialProposals: ProposedAction[]
  initialRuns: AgentRun[]
}

const CATEGORY_LABELS: Record<ProposalCategory, { label: string; cls: string }> = {
  anomaly_response: { label: 'Anomaly response', cls: 'bg-red-50 text-red-700 border-red-200' },
  content:          { label: 'Content',          cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  maintenance:      { label: 'Maintenance',      cls: 'bg-gray-50 text-gray-700 border-gray-200' },
  opportunity:      { label: 'Opportunity',      cls: 'bg-green-50 text-green-700 border-green-200' },
}

export default function OperatorView({ clientId, initialProposals, initialRuns }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [, startTransition] = useTransition()

  const pending = initialProposals.filter(p => p.status === 'pending')
  const past = initialProposals.filter(p => p.status !== 'pending')

  const handleRunAnalysis = async () => {
    setBusy(true)
    setResult(null)
    const res = await runAnalysisAction(clientId)
    setBusy(false)
    if (res.success) {
      setResult({
        ok: true,
        msg: `Analyzed. ${res.data.proposalCount} proposals · $${res.data.costUsd.toFixed(4)}`,
      })
      startTransition(() => router.refresh())
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  const handleApprove = async (id: string) => {
    setActioning(id)
    const res = await approveProposal(id)
    setActioning(null)
    if (res.success) {
      startTransition(() => router.refresh())
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting? (optional)')
    if (reason === null) return
    setActioning(id)
    const res = await rejectProposal(id, reason || undefined)
    setActioning(null)
    if (res.success) {
      startTransition(() => router.refresh())
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  return (
    <div className="space-y-6">
      {/* Run analysis trigger */}
      <div className="rounded-lg border border-stroke bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" /> Run analysis
            </h2>
            <p className="text-sm text-ink-3 mt-0.5">
              Pull fresh metrics + context and ask Claude for new proposals.
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? 'Analyzing…' : 'Run now'}
          </button>
        </div>
        {result && (
          <div className={`mt-3 text-sm rounded-md px-3 py-2 ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.msg}
          </div>
        )}
      </div>

      {/* Pending proposals */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">
          Pending proposals {pending.length > 0 && <span className="text-ink-3 font-normal">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stroke bg-white p-6 text-center text-sm text-ink-3">
            No pending proposals. Run an analysis to generate some.
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map(p => (
              <ProposalCard
                key={p.id}
                proposal={p}
                actioning={actioning === p.id}
                onApprove={() => handleApprove(p.id)}
                onReject={() => handleReject(p.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Past proposals */}
      {past.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink mb-3">Past proposals</h2>
          <ul className="space-y-2">
            {past.slice(0, 20).map(p => (
              <li key={p.id} className="rounded-md border border-stroke bg-white px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusPill status={p.status} />
                  <span className="text-ink truncate">{p.summary}</span>
                </div>
                <span className="text-xs text-ink-3 shrink-0">{relTime(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Run history */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">Run history</h2>
        {initialRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stroke bg-white p-6 text-center text-sm text-ink-3">
            No runs yet.
          </div>
        ) : (
          <ul className="divide-y divide-stroke rounded-lg border border-stroke bg-white">
            {initialRuns.map(r => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Proposal card ──────────────────────────────────────────────

function ProposalCard({
  proposal: p, actioning, onApprove, onReject,
}: {
  proposal: ProposedAction
  actioning: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [open, setOpen] = useState(false)
  const cat = p.category ? CATEGORY_LABELS[p.category] : null

  return (
    <li className="rounded-lg border border-stroke bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-3 flex items-center gap-1">
                <Tag className="w-3 h-3" /> {p.type}
              </span>
              {cat && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${cat.cls}`}>
                  {cat.label}
                </span>
              )}
              {p.confidenceScore !== null && (
                <span className="text-xs text-ink-3">
                  {Math.round(p.confidenceScore * 100)}% confidence
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-ink">{p.summary}</p>
            {p.reasoning && (
              <p className="text-sm text-ink-3 mt-1">{p.reasoning}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onReject}
              disabled={actioning}
              className="px-3 py-1.5 rounded-md border border-stroke text-sm text-ink-3 hover:text-ink hover:border-ink/30 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={onApprove}
              disabled={actioning}
              className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {actioning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              Approve
            </button>
          </div>
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          className="mt-3 text-xs text-ink-3 hover:text-ink inline-flex items-center gap-1"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {open ? 'Hide' : 'Show'} payload
        </button>
        {open && (
          <pre className="mt-2 text-xs bg-gray-50 border border-stroke rounded-md p-3 overflow-x-auto text-ink-2">
            {JSON.stringify({ payload: p.payload, targets: p.targets, scheduledFor: p.scheduledFor }, null, 2)}
          </pre>
        )}
      </div>
    </li>
  )
}

// ─── Run row ────────────────────────────────────────────────────

function RunRow({ run }: { run: AgentRun }) {
  const Icon =
    run.status === 'success' ? CheckCircle2
    : run.status === 'failed' ? AlertCircle
    : run.status === 'running' ? Loader2
    : Clock
  const iconCls =
    run.status === 'success' ? 'text-green-600'
    : run.status === 'failed' ? 'text-red-600'
    : run.status === 'running' ? 'text-blue-600 animate-spin'
    : 'text-ink-3'

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${iconCls}`} />
        <div className="min-w-0">
          <p className="text-ink truncate">
            {run.summary ?? run.errorMessage ?? `${run.runType} (${run.triggeredBy})`}
          </p>
          <p className="text-xs text-ink-3 mt-0.5 flex items-center gap-3">
            <span><Brain className="w-3 h-3 inline mr-1" />{run.model ?? '—'}</span>
            {run.costUsd !== null && (
              <span><DollarSign className="w-3 h-3 inline mr-0.5" />{run.costUsd.toFixed(4)}</span>
            )}
            <span>{relTime(run.createdAt)}</span>
          </p>
        </div>
      </div>
    </li>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function StatusPill({ status }: { status: ProposedAction['status'] }) {
  const map: Record<ProposedAction['status'], string> = {
    pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved:  'bg-blue-50 text-blue-700 border-blue-200',
    rejected:  'bg-gray-50 text-gray-600 border-gray-200',
    executed:  'bg-green-50 text-green-700 border-green-200',
    expired:   'bg-gray-50 text-gray-500 border-gray-200',
    cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${map[status]}`}>
      {status}
    </span>
  )
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
