'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Phone, Users as UsersIcon, Mail, MessageSquare, StickyNote,
  Activity, FileSignature, RefreshCw, Award, Star, AlertTriangle,
  Smile, Trophy, AlertCircle, Download, Circle, Plus, Loader2,
} from 'lucide-react'

interface Interaction {
  id: string
  client_id: string
  performed_by_name: string | null
  kind: InteractionKind
  subtype: string | null
  occurred_at: string
  summary: string | null
  body: string | null
  outcome: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  satisfaction_score: number | null
  duration_minutes: number | null
  tags: string[]
}

type InteractionKind =
  | 'call' | 'meeting' | 'email' | 'text' | 'note'
  | 'status_change' | 'contract_signed' | 'contract_renewed' | 'contract_ended'
  | 'onboarding_milestone' | 'review_requested' | 'review_received'
  | 'complaint' | 'compliment' | 'win' | 'issue'
  | 'imported' | 'other'

const KIND_ICON: Record<InteractionKind, typeof Phone> = {
  call: Phone,
  meeting: UsersIcon,
  email: Mail,
  text: MessageSquare,
  note: StickyNote,
  status_change: Activity,
  contract_signed: FileSignature,
  contract_renewed: RefreshCw,
  contract_ended: AlertCircle,
  onboarding_milestone: Award,
  review_requested: Star,
  review_received: Star,
  complaint: AlertTriangle,
  compliment: Smile,
  win: Trophy,
  issue: AlertCircle,
  imported: Download,
  other: Circle,
}

const KIND_LABEL: Record<InteractionKind, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  text: 'Text',
  note: 'Note',
  status_change: 'Status change',
  contract_signed: 'Contract signed',
  contract_renewed: 'Contract renewed',
  contract_ended: 'Contract ended',
  onboarding_milestone: 'Milestone',
  review_requested: 'Review requested',
  review_received: 'Review received',
  complaint: 'Complaint',
  compliment: 'Compliment',
  win: 'Win',
  issue: 'Issue',
  imported: 'Imported',
  other: 'Other',
}

const SENTIMENT_COLORS: Record<'positive' | 'neutral' | 'negative', string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral:  'bg-ink-6 text-ink-3 border-ink-6',
  negative: 'bg-rose-50 text-rose-700 border-rose-200',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function daysAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (diff < 1) return 'Today'
  if (diff < 2) return 'Yesterday'
  if (diff < 30) return `${Math.floor(diff)}d ago`
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
  return `${Math.floor(diff / 365)}y ago`
}

interface TimelineTabProps {
  clientId: string
}

export default function TimelineTab({ clientId }: TimelineTabProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('client_interactions')
      .select('*')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('timeline load error:', error.message)
      setInteractions([])
    } else {
      setInteractions((data ?? []) as Interaction[])
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const filtered = interactions.filter(i => {
    if (filter === 'all') return true
    return i.sentiment === filter
  })

  const stats = {
    total: interactions.length,
    positive: interactions.filter(i => i.sentiment === 'positive').length,
    negative: interactions.filter(i => i.sentiment === 'negative').length,
    lastContact: interactions[0]?.occurred_at,
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total interactions" value={String(stats.total)} />
        <StatCard label="Positive" value={String(stats.positive)} tone="positive" />
        <StatCard label="Negative" value={String(stats.negative)} tone="negative" />
        <StatCard label="Last contact" value={stats.lastContact ? daysAgo(stats.lastContact) : '—'} />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {(['all', 'positive', 'negative'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
              filter === f ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto text-[11px] text-ink-4">
          {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-ink-4">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading interactions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Activity className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm text-ink-3">
            {interactions.length === 0
              ? 'No interactions logged yet. Calls, meetings, emails, and notes will appear here as you add them.'
              : 'No interactions match this filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <ol className="divide-y divide-ink-6">
            {filtered.map(i => {
              const Icon = KIND_ICON[i.kind] ?? Circle
              return (
                <li key={i.id} className="p-4 hover:bg-bg-2 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-bg-2 border border-ink-6 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-ink-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[11px] uppercase tracking-wide font-medium text-ink-4">
                          {KIND_LABEL[i.kind] ?? i.kind}
                        </span>
                        {i.subtype && (
                          <span className="text-[11px] text-ink-4">· {i.subtype}</span>
                        )}
                        {i.sentiment && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border capitalize ${SENTIMENT_COLORS[i.sentiment]}`}>
                            {i.sentiment}
                          </span>
                        )}
                        {i.satisfaction_score != null && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-tint text-brand-dark">
                            NPS {i.satisfaction_score}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-ink-4 whitespace-nowrap">{formatDateTime(i.occurred_at)}</span>
                      </div>
                      {i.summary && (
                        <p className="text-sm text-ink mt-1.5">{i.summary}</p>
                      )}
                      {i.body && (
                        <p className="text-sm text-ink-3 mt-1 whitespace-pre-wrap">{i.body}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-4">
                        {i.performed_by_name && <span>by {i.performed_by_name}</span>}
                        {i.duration_minutes != null && <span>{i.duration_minutes} min</span>}
                        {i.outcome && <span>→ {i.outcome}</span>}
                        {i.tags.length > 0 && (
                          <span>{i.tags.map(t => `#${t}`).join(' ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <p className="text-[11px] text-ink-4 text-center pt-2">
        Showing up to 200 most recent. Inline logging form coming in the next phase.
      </p>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-700' :
    tone === 'negative' ? 'text-rose-700' :
    'text-ink'
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className={`font-[family-name:var(--font-display)] text-xl ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-ink-4 mt-0.5">{label}</div>
    </div>
  )
}
