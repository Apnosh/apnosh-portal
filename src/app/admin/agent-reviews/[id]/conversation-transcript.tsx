'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, User, Sparkles, Wrench, CheckCircle2, XCircle, AlertCircle, ThumbsUp, ThumbsDown } from 'lucide-react'

interface Turn {
  id: string
  turnIndex: number
  role: string
  content: unknown
  toolCalls: unknown
  toolCallId: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  createdAt: string
}
interface Execution {
  id: string
  toolName: string
  status: string
  input: unknown
  output: unknown
  failedReason: string | null
  createdAt: string
}
interface Evaluation {
  id: string
  raterType: string
  thumbs: string | null
  tags: string[] | null
  notes: string | null
  createdAt: string
}

export default function ConversationTranscript({
  turns, executions, evaluations,
}: {
  turns: Turn[]
  executions: Execution[]
  evaluations: Evaluation[]
}) {
  /* Owner-side evaluations get rendered as inline chips under the
     turn they're against (if turn_id is set on the eval row). */
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-ink">Transcript</h2>
        <div className="text-[11px] text-ink-4">{turns.length} turns · {executions.length} tool executions</div>
      </div>
      {turns.map(t => <TurnRow key={t.id} turn={t} evaluations={evaluations} />)}
      {executions.length > 0 && (
        <div className="pt-3 mt-3 border-t border-ink-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">Tool executions</h3>
          {executions.map(e => <ExecutionRow key={e.id} execution={e} />)}
        </div>
      )}
    </div>
  )
}

function TurnRow({ turn, evaluations }: { turn: Turn; evaluations: Evaluation[] }) {
  /* Show role + content. Tool turns get a more muted styling. */
  const text = typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content)
  const ownerEvals = evaluations.filter(e => e.raterType === 'owner')

  if (turn.role === 'user') {
    return (
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-bg-2 flex items-center justify-center flex-shrink-0">
          <User className="w-3 h-3 text-ink-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-ink-3 mb-0.5">Owner</div>
          <div className="text-[13px] text-ink whitespace-pre-wrap">{text}</div>
        </div>
      </div>
    )
  }
  if (turn.role === 'assistant') {
    return (
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3 h-3 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-[11px] font-medium text-ink-3">Agent</div>
            {turn.model && <span className="text-[10px] text-ink-4 font-mono">{turn.model}</span>}
            {turn.latencyMs && <span className="text-[10px] text-ink-4">{turn.latencyMs}ms</span>}
            {turn.inputTokens && turn.outputTokens && (
              <span className="text-[10px] text-ink-4">{turn.inputTokens}↓ {turn.outputTokens}↑ tokens</span>
            )}
          </div>
          {text && <div className="text-[13px] text-ink whitespace-pre-wrap">{String(text)}</div>}
          {Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0 ? (
            <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-2 text-[10.5px] text-ink-3">
              <Wrench className="w-2.5 h-2.5" />
              Called {(turn.toolCalls as Array<{ name: string }>).map(c => c.name).join(', ')}
            </div>
          ) : null}
          {ownerEvals.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ownerEvals.filter(e => e.thumbs).map(e => (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium ${
                    e.thumbs === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {e.thumbs === 'up' ? <ThumbsUp className="w-2.5 h-2.5" /> : <ThumbsDown className="w-2.5 h-2.5" />}
                  {e.tags?.join(', ') ?? e.thumbs}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (turn.role === 'tool') {
    return (
      <div className="flex items-start gap-2 pl-8 text-[12px] text-ink-3">
        <span className="text-[10px] inline-flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
          tool result returned
        </span>
      </div>
    )
  }
  return null
}

function ExecutionRow({ execution }: { execution: Execution }) {
  const [open, setOpen] = useState(false)
  const statusMeta: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    executed:                { color: 'text-emerald-700 bg-emerald-50',  icon: CheckCircle2 },
    failed:                  { color: 'text-rose-700 bg-rose-50',        icon: XCircle },
    cancelled:               { color: 'text-amber-700 bg-amber-50',      icon: XCircle },
    pending_confirmation:    { color: 'text-blue-700 bg-blue-50',        icon: AlertCircle },
    confirmed:               { color: 'text-blue-700 bg-blue-50',        icon: AlertCircle },
    reverted:                { color: 'text-ink-3 bg-ink-7',             icon: XCircle },
  }
  const m = statusMeta[execution.status] ?? statusMeta.executed
  const Icon = m.icon
  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left py-1.5 hover:bg-bg-2 rounded px-1.5"
      >
        {open ? <ChevronDown className="w-3 h-3 text-ink-4" /> : <ChevronRight className="w-3 h-3 text-ink-4" />}
        <span className="text-[12.5px] font-mono text-ink-2">{execution.toolName}</span>
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${m.color}`}>
          <Icon className="w-2.5 h-2.5" />
          {execution.status}
        </span>
        {execution.failedReason && (
          <span className="text-[10.5px] text-rose-600 truncate">{execution.failedReason}</span>
        )}
      </button>
      {open && (
        <div className="ml-5 mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-semibold text-ink-3 mb-1">Input</div>
            <pre className="bg-bg-2 rounded p-2 text-[10.5px] font-mono text-ink-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
{JSON.stringify(execution.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-ink-3 mb-1">Output</div>
            <pre className="bg-bg-2 rounded p-2 text-[10.5px] font-mono text-ink-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
{execution.output ? JSON.stringify(execution.output, null, 2) : '(no output captured)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
