'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Send, Clock, Check, Eye, AlertCircle, Mail,
  ExternalLink, Plus, ChevronDown, Filter, Copy,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import { submitClientFeedback } from '@/lib/client-portal-actions'
import type { EmailCampaign, EmailCampaignStatus } from '@/types/database'

const STATUS_CONFIG: Record<EmailCampaignStatus, { label: string; color: string; icon: typeof Send }> = {
  draft: { label: 'Draft', color: 'bg-ink-6 text-ink-3', icon: Mail },
  in_review: { label: 'Ready for Review', color: 'bg-amber-50 text-amber-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700', icon: Check },
  scheduled: { label: 'Scheduled', color: 'bg-indigo-50 text-indigo-700', icon: Clock },
  sending: { label: 'Sending', color: 'bg-blue-50 text-blue-700', icon: Send },
  sent: { label: 'Sent', color: 'bg-green-50 text-green-700', icon: Send },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-700', icon: AlertCircle },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EmailCampaignsPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<EmailCampaignStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const { data } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('client_id', client.id)
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    setCampaigns((data ?? []) as EmailCampaign[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['email_campaigns'], load)

  const filtered = campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter)

  // Separate upcoming vs sent
  const upcoming = filtered.filter(c => ['draft', 'in_review', 'approved', 'scheduled'].includes(c.status))
  const sent = filtered.filter(c => ['sent', 'sending', 'cancelled'].includes(c.status))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/email-sms" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Email Campaigns</h1>
          <p className="text-ink-3 text-sm mt-0.5">Every campaign, upcoming and sent.</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-ink-4" />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as EmailCampaignStatus | 'all')}
          className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>
        <span className="text-xs text-ink-4 ml-auto">{filtered.length} campaigns</span>
      </div>

      {clientLoading || loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Mail className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No campaigns yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team will draft campaigns here. You&apos;ll be able to review and approve before each goes out.
          </p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Upcoming</h2>
              <div className="space-y-2">
                {upcoming.map(c => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onUpdate={load}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sent */}
          {sent.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Sent</h2>
              <div className="space-y-2">
                {sent.map(c => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onUpdate={load}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CampaignCard({
  campaign, expanded, onToggle, onUpdate,
}: {
  campaign: EmailCampaign
  expanded: boolean
  onToggle: () => void
  onUpdate: () => void
}) {
  const [approving, setApproving] = useState(false)
  const [showRevision, setShowRevision] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const statusCfg = STATUS_CONFIG[campaign.status]
  const StatusIcon = statusCfg.icon
  const canReview = campaign.status === 'in_review'

  async function handleApprove() {
    setApproving(true)
    // Note: email campaigns don't use content_queue's feedback system directly,
    // but we mark them as approved through the admin side. For now, just reach
    // out via messaging.
    setError('Please confirm approval with your account manager via Messages.')
    setApproving(false)
  }

  const openRate = campaign.recipient_count > 0 ? ((campaign.opens / campaign.recipient_count) * 100).toFixed(1) : '0.0'
  const clickRate = campaign.opens > 0 ? ((campaign.clicks / campaign.opens) * 100).toFixed(1) : '0.0'

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${canReview ? 'border-amber-300 ring-1 ring-amber-200' : 'border-ink-6'}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-bg-2 transition-colors"
      >
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${statusCfg.color}`}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{campaign.name}</p>
          <p className="text-[10px] text-ink-4 truncate mt-0.5">Subject: {campaign.subject}</p>
        </div>
        <div className="text-right text-[10px] text-ink-4 flex-shrink-0">
          {campaign.sent_at ? (
            <>Sent {formatDate(campaign.sent_at)}</>
          ) : campaign.scheduled_for ? (
            <>Scheduled {formatDate(campaign.scheduled_for)}</>
          ) : (
            <>Draft</>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-ink-6 p-5 space-y-4">
          {/* Preview */}
          {campaign.preview_image_url && (
            <div>
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">Preview</div>
              <img
                src={campaign.preview_image_url}
                alt={campaign.name}
                className="rounded-lg border border-ink-6 max-w-md"
              />
            </div>
          )}

          {/* Subject + preview text */}
          <div className="bg-bg-2 rounded-lg p-3 space-y-1">
            <div className="text-xs text-ink-3"><span className="font-medium">Subject:</span> {campaign.subject}</div>
            {campaign.preview_text && (
              <div className="text-xs text-ink-4 italic">Preview: {campaign.preview_text}</div>
            )}
          </div>

          {/* Recipient + segment */}
          <div className="flex items-center gap-4 text-xs text-ink-3">
            {campaign.recipient_count > 0 && (
              <span>{campaign.recipient_count.toLocaleString()} recipients</span>
            )}
            {campaign.segment_name && <span>Segment: {campaign.segment_name}</span>}
          </div>

          {/* Metrics (if sent) */}
          {campaign.status === 'sent' && campaign.recipient_count > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricPill label="Opens" value={`${campaign.opens.toLocaleString()} (${openRate}%)`} />
              <MetricPill label="Clicks" value={`${campaign.clicks.toLocaleString()} (${clickRate}%)`} />
              <MetricPill label="Unsubs" value={campaign.unsubscribes.toLocaleString()} />
              {campaign.revenue != null && (
                <MetricPill label="Revenue" value={`$${campaign.revenue.toLocaleString()}`} />
              )}
            </div>
          )}

          {/* Full preview link */}
          {campaign.preview_url && (
            <a
              href={campaign.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-dark font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open full preview
            </a>
          )}

          {/* Review actions */}
          {canReview && (
            <div className="border-t border-ink-6 pt-4 bg-amber-50/30 -mx-5 -mb-5 px-5 pb-5">
              <p className="text-sm text-ink mb-3 font-medium">Approve this campaign?</p>
              {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
              <p className="text-[11px] text-ink-4 mb-3">
                To keep things clear, approvals happen via messages with your account manager. Click below to start a conversation.
              </p>
              <Link
                href="/dashboard/messages"
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Message Team
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-2 rounded-lg p-2.5">
      <div className="text-[10px] text-ink-4 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-ink mt-0.5">{value}</div>
    </div>
  )
}
