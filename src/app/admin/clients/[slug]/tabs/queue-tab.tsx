'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Loader2, ChevronDown, Send, Check, Eye, Clock, Pencil,
  ListTodo, MessageSquare, X, Play, Archive, Upload, Image as ImageIcon,
  FileText, Sparkles, Activity, Film, ExternalLink, Calendar as CalendarIcon,
  List,
} from 'lucide-react'
import ContentCalendar from './content-calendar'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import {
  uploadDraftContent,
  sendForReview as sendForReviewAction,
  confirmContentRequest,
} from '@/lib/client-portal-actions'
import { GraphicBriefView } from '@/components/dashboard/graphic-brief-view'
import { VideoBriefView } from '@/components/dashboard/video-brief-view'
import PostGenerator from './post-generator'
import type {
  ContentQueueItem, ContentQueueDraft, QueueStatus, TemplateType, PostPlatform,
  ClientFeedbackEntry, ContentFormat,
} from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: typeof ListTodo }> = {
  new: { label: 'Awaiting Confirmation', color: 'bg-cyan-50 text-cyan-700', icon: Eye },
  confirmed: { label: 'Confirmed', color: 'bg-blue-50 text-blue-700', icon: Check },
  drafting: { label: 'In Production', color: 'bg-purple-50 text-purple-700', icon: Pencil },
  in_review: { label: 'Client Reviewing', color: 'bg-amber-50 text-amber-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700', icon: Check },
  scheduled: { label: 'Scheduled', color: 'bg-indigo-50 text-indigo-700', icon: Clock },
  posted: { label: 'Posted', color: 'bg-green-50 text-green-700', icon: Send },
  cancelled: { label: 'Cancelled', color: 'bg-ink-6 text-ink-3', icon: X },
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  insight: 'Insight', stat: 'Stat', tip: 'Tip', compare: 'Compare',
  result: 'Result', photo: 'Photo', custom: 'Custom',
}

const PLATFORM_LABELS: Record<PostPlatform, string> = {
  instagram: 'IG', tiktok: 'TT', linkedin: 'LI',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QueueTab({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const supabase = createClient()

  const [items, setItems] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'brief' | 'deliver' | 'activity'>('brief')
  const [feedback, setFeedback] = useState<Map<string, ClientFeedbackEntry[]>>(new Map())
  const [showGenerator, setShowGenerator] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'calendar'>('list')

  // Pick the most useful tab to land on based on the request's status.
  function defaultTabForStatus(status: QueueStatus): 'brief' | 'deliver' | 'activity' {
    if (status === 'new') return 'brief'          // read + confirm
    if (status === 'confirmed') return 'deliver'  // ready to start uploading
    if (status === 'drafting') return 'deliver'   // upload work
    if (status === 'in_review') return 'activity' // wait for client
    return 'brief'
  }

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (data) setItems(data as ContentQueueItem[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useRealtimeRefresh(['content_queue', 'client_feedback'], fetchQueue)

  // Fetch feedback for expanded item
  async function loadFeedback(queueId: string) {
    if (feedback.has(queueId)) return
    const { data } = await supabase
      .from('client_feedback')
      .select('*')
      .eq('content_queue_id', queueId)
      .order('created_at', { ascending: true })

    if (data) {
      setFeedback(prev => new Map(prev).set(queueId, data as ClientFeedbackEntry[]))
    }
  }

  function handleExpand(id: string) {
    const isOpen = expandedId === id
    setExpandedId(isOpen ? null : id)
    if (!isOpen) {
      loadFeedback(id)
      const item = items.find(i => i.id === id)
      if (item) setActiveTab(defaultTabForStatus(item.status))
    }
  }

  /* ── Status transitions ─────────────────────────────────────────── */

  async function updateStatus(id: string, newStatus: QueueStatus) {
    setUpdatingId(id)

    // Use server action for confirmed so the client gets notified
    if (newStatus === 'confirmed') {
      await confirmContentRequest(id)
      await fetchQueue()
      setUpdatingId(null)
      return
    }

    // Use server action for in_review so the client gets notified
    if (newStatus === 'in_review') {
      await sendForReviewAction(id)
      await fetchQueue()
      setUpdatingId(null)
      return
    }

    const updates: Record<string, unknown> = { status: newStatus }

    // Auto-catalog when approving
    if (newStatus === 'approved') {
      const item = items.find(i => i.id === id)
      if (item && item.selected_draft != null && item.drafts[item.selected_draft]) {
        const draft = item.drafts[item.selected_draft]

        // Generate next post_code
        const { data: lastPost } = await supabase
          .from('style_library')
          .select('post_code')
          .eq('client_id', clientId)
          .order('approved_at', { ascending: false })
          .limit(1)
          .single()

        const lastNum = lastPost?.post_code ? parseInt(lastPost.post_code.split('-').pop() ?? '0') : 0
        const slug = (items.find(i => i.id === id) as ContentQueueItem | undefined)
        const prefix = clientSlug.slice(0, 3).toUpperCase()
        const postCode = `${prefix}-${String(lastNum + 1).padStart(3, '0')}`

        // Insert into style library
        await supabase.from('style_library').insert({
          client_id: clientId,
          post_code: postCode,
          image_url: draft.image_url || null,
          html_source: draft.html_source || null,
          template_type: item.template_type,
          platform: item.platform,
          size: item.size,
          caption: draft.caption || null,
          hashtags: draft.hashtags || null,
          status: 'approved',
        })
      }
    }

    await supabase.from('content_queue').update(updates).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
    setUpdatingId(null)
  }

  async function selectDraft(queueId: string, draftIndex: number) {
    await supabase.from('content_queue').update({ selected_draft: draftIndex }).eq('id', queueId)
    setItems(prev => prev.map(i => i.id === queueId ? { ...i, selected_draft: draftIndex } : i))
  }

  /* ── Status-priority sort ───────────────────────────────────────── */

  const statusPriority: QueueStatus[] = ['new', 'in_review', 'drafting', 'approved', 'scheduled', 'posted']
  const sorted = [...items].sort((a, b) => {
    const aPri = statusPriority.indexOf(a.status)
    const bPri = statusPriority.indexOf(b.status)
    if (aPri !== bPri) return aPri - bPri
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  /* ── Status counts ──────────────────────────────────────────────── */

  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Header: view toggle + status counters + new post */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[12px]">
            <button
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                view === 'list' ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'
              }`}
            >
              <List className="w-3 h-3" />
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                view === 'calendar' ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'
              }`}
            >
              <CalendarIcon className="w-3 h-3" />
              Calendar
            </button>
          </div>

          {/* Status counters */}
          <div className="flex items-center gap-3 text-xs text-ink-4">
            {counts.new ? <span className="font-medium text-blue-600">{counts.new} new</span> : null}
            {counts.in_review ? <span className="font-medium text-amber-600">{counts.in_review} in review</span> : null}
            {counts.drafting ? <span className="font-medium text-purple-600">{counts.drafting} drafting</span> : null}
          </div>
        </div>

        {view === 'list' && (
          <button
            onClick={() => setShowGenerator(true)}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        )}
      </div>

      {/* Calendar view */}
      {view === 'calendar' && !loading && (
        <ContentCalendar
          items={items}
          onItemClick={(id) => {
            setView('list')
            setExpandedId(id)
            const item = items.find(i => i.id === id)
            if (item) setActiveTab(defaultTabForStatus(item.status))
            // Scroll to the item after a tick so the list has rendered
            setTimeout(() => {
              document.getElementById(`queue-item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 50)
          }}
          onNewPost={() => setShowGenerator(true)}
        />
      )}

      {/* Queue list — hidden when calendar view is active */}
      {view === 'list' && loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse space-y-2">
              <div className="flex gap-3">
                <div className="h-5 w-16 bg-ink-6 rounded-full" />
                <div className="h-5 w-24 bg-ink-6 rounded-full" />
              </div>
              <div className="h-4 w-3/4 bg-ink-6 rounded" />
            </div>
          ))}
        </div>
      ) : view === 'list' && sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">Queue is empty.</p>
          <p className="text-xs text-ink-4 mt-1">Click &ldquo;New Post&rdquo; to start generating content.</p>
        </div>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {sorted.map(item => {
            const isExpanded = expandedId === item.id
            const statusCfg = STATUS_CONFIG[item.status]
            const StatusIcon = statusCfg.icon
            const isNewClientRequest = item.submitted_by === 'client' && item.status === 'new'

            return (
              <div
                key={item.id}
                id={`queue-item-${item.id}`}
                className={`bg-white rounded-xl border overflow-hidden ${
                  isNewClientRequest ? 'border-cyan-300 ring-1 ring-cyan-200' : 'border-ink-6'
                }`}
              >
                {/* Row header */}
                <button
                  onClick={() => handleExpand(item.id)}
                  className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-bg-2 transition-colors"
                >
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${statusCfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </span>

                  {item.submitted_by === 'client' && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">client</span>
                  )}

                  {item.template_type && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink-6 text-ink-3">
                      {TEMPLATE_LABELS[item.template_type] ?? item.template_type}
                    </span>
                  )}

                  {item.platform && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink-6 text-ink-3">
                      {PLATFORM_LABELS[item.platform] ?? item.platform}
                    </span>
                  )}

                  <span className="flex-1 text-sm text-ink-2 truncate ml-1">
                    {item.input_text || 'No description'}
                  </span>

                  <span className="text-[10px] text-ink-4 flex-shrink-0">
                    {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>

                  <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail with tabs */}
                {isExpanded && (
                  <div className="border-t border-ink-6">
                    {/* Tab bar — sticky-feeling header */}
                    <div className="bg-bg-2 px-4 pt-3 flex items-center gap-1 border-b border-ink-6">
                      <TabBtn
                        active={activeTab === 'brief'}
                        onClick={() => setActiveTab('brief')}
                        icon={Sparkles}
                        label="Brief"
                      />
                      <TabBtn
                        active={activeTab === 'deliver'}
                        onClick={() => setActiveTab('deliver')}
                        icon={Upload}
                        label="Deliver"
                        badge={item.drafts.length > 0 ? item.drafts.length : undefined}
                      />
                      <TabBtn
                        active={activeTab === 'activity'}
                        onClick={() => setActiveTab('activity')}
                        icon={Activity}
                        label="Activity"
                        badge={feedback.get(item.id)?.length || undefined}
                      />

                      {/* Quick action — always visible in tab bar header */}
                      <div className="ml-auto pb-2">
                        <PrimaryAction
                          status={item.status}
                          loading={updatingId === item.id}
                          onChange={s => updateStatus(item.id, s)}
                        />
                      </div>
                    </div>

                    {/* Tab body */}
                    <div className="p-4 space-y-4">
                      {/* ── BRIEF ── */}
                      {activeTab === 'brief' && (
                        <>
                          {item.content_format === 'graphic' && (
                            <GraphicBriefView contentQueueId={item.id} isAdmin />
                          )}
                          {item.content_format === 'short_form_video' && (
                            <VideoBriefView contentQueueId={item.id} isAdmin />
                          )}

                          {item.input_text && (
                            <div className="bg-white rounded-xl border border-ink-6 p-4">
                              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {(item.content_format === 'graphic' || item.content_format === 'short_form_video') ? 'Summary' : 'Request'}
                              </span>
                              <p className="text-sm text-ink-2 mt-2 whitespace-pre-line leading-relaxed">{item.input_text}</p>
                            </div>
                          )}

                          {item.designer_notes && (
                            <div className="bg-white rounded-xl border border-ink-6 p-4">
                              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">
                                Internal designer notes
                              </span>
                              <p className="text-sm text-ink-2 mt-2 whitespace-pre-line">{item.designer_notes}</p>
                            </div>
                          )}
                        </>
                      )}

                      {/* ── DELIVER ── */}
                      {activeTab === 'deliver' && (
                        <>
                          {/* Existing drafts strip (only if any exist) */}
                          {item.drafts.length > 0 && (
                            <div className="bg-white rounded-xl border border-ink-6 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">
                                  Drafts ({item.drafts.length})
                                </span>
                                {item.selected_draft != null && (
                                  <span className="text-[10px] text-emerald-700 font-medium">
                                    Draft {item.selected_draft + 1} selected for client
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {item.drafts.map((draft, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => selectDraft(item.id, idx)}
                                    className={`relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors ${
                                      item.selected_draft === idx ? 'border-brand' : 'border-ink-6 hover:border-ink-4'
                                    }`}
                                  >
                                    {draft.image_url ? (
                                      <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full bg-bg-2 flex items-center justify-center text-[10px] text-ink-4">
                                        Draft {idx + 1}
                                      </div>
                                    )}
                                    {item.selected_draft === idx && (
                                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-white" />
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Upload form */}
                          <UploadDraftForm queueId={item.id} clientId={clientId} contentFormat={item.content_format} onUploaded={fetchQueue} />

                          {/* Status banner if not yet drafting */}
                          {item.status === 'new' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                                <Pencil className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-blue-900">Click &ldquo;Start Drafting&rdquo; above to begin</p>
                                <p className="text-[11px] text-blue-700">Once drafting, you can upload the graphic and send it for review.</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* ── ACTIVITY ── */}
                      {activeTab === 'activity' && (
                        <div className="bg-white rounded-xl border border-ink-6 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" /> Client feedback & history
                            </span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              item.revision_count >= item.revision_limit
                                ? 'bg-red-50 text-red-700'
                                : 'bg-bg-2 text-ink-3'
                            }`}>
                              Revisions {item.revision_count} / {item.revision_limit}
                            </span>
                          </div>

                          {feedback.get(item.id) && feedback.get(item.id)!.length > 0 ? (
                            <div className="space-y-2">
                              {feedback.get(item.id)!.map(fb => (
                                <div key={fb.id} className="bg-bg-2 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                      fb.feedback_type === 'approval' ? 'bg-emerald-50 text-emerald-700' :
                                      fb.feedback_type === 'revision' ? 'bg-amber-50 text-amber-700' :
                                      'bg-ink-6 text-ink-3'
                                    }`}>
                                      {fb.feedback_type}
                                    </span>
                                    <span className="text-[10px] text-ink-4">
                                      {new Date(fb.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {fb.message && <p className="text-xs text-ink-2 mt-1">{fb.message}</p>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-ink-4 italic py-2">No feedback yet. Once the client reviews the draft, it&apos;ll appear here.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Post Generator */}
      {showGenerator && (
        <PostGenerator
          clientId={clientId}
          onClose={() => setShowGenerator(false)}
          onCreated={fetchQueue}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab button                                                         */
/* ------------------------------------------------------------------ */

function TabBtn({
  active, onClick, icon: Icon, label, badge,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Check
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 border-b-2 -mb-px ${
        active
          ? 'border-brand text-brand-dark'
          : 'border-transparent text-ink-4 hover:text-ink-2'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge != null && badge > 0 && (
        <span className={`ml-0.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-1 ${
          active ? 'bg-brand text-white' : 'bg-ink-6 text-ink-3'
        }`}>
          {badge}
        </span>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Primary action button — context-aware "next step"                  */
/* ------------------------------------------------------------------ */

function PrimaryAction({
  status, loading, onChange,
}: {
  status: QueueStatus
  loading: boolean
  onChange: (s: QueueStatus) => void
}) {
  // Pick the single most useful next action for the current status.
  let label = ''
  let next: QueueStatus | null = null
  let Icon: typeof Check = Pencil
  let bg = 'bg-brand hover:bg-brand-dark'

  switch (status) {
    case 'new':
      label = 'Confirm Request'; next = 'confirmed'; Icon = Check
      break
    case 'confirmed':
      label = 'Start Drafting'; next = 'drafting'; Icon = Pencil
      break
    case 'drafting':
      label = 'Send for Review'; next = 'in_review'; Icon = Send
      break
    case 'in_review':
      label = 'Approve'; next = 'approved'; Icon = Check
      bg = 'bg-emerald-600 hover:bg-emerald-700'
      break
    case 'approved':
      label = 'Mark Posted'; next = 'posted'; Icon = Check
      bg = 'bg-emerald-600 hover:bg-emerald-700'
      break
    case 'scheduled':
      label = 'Mark Posted'; next = 'posted'; Icon = Check
      bg = 'bg-emerald-600 hover:bg-emerald-700'
      break
    case 'posted':
      return (
        <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Posted
        </span>
      )
  }

  if (!next) return null

  return (
    <button
      onClick={() => onChange(next!)}
      disabled={loading}
      className={`${bg} text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Status action button                                               */
/* ------------------------------------------------------------------ */

function StatusButton({
  label, onClick, loading, icon: Icon, color = 'brand',
}: {
  label: string
  onClick: () => void
  loading: boolean
  icon: typeof Check
  color?: string
}) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand hover:text-brand-dark',
    emerald: 'text-emerald-600 hover:text-emerald-700',
    amber: 'text-amber-600 hover:text-amber-700',
    red: 'text-red-500 hover:text-red-600',
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50 ${colorMap[color] ?? colorMap.brand}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Upload Draft Form                                                  */
/* ------------------------------------------------------------------ */

function UploadDraftForm({
  queueId,
  clientId,
  contentFormat,
  onUploaded,
}: {
  queueId: string
  clientId: string
  contentFormat: ContentFormat | null
  onUploaded: () => void
}) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isVideo = contentFormat === 'short_form_video'
  const bucket = isVideo ? 'video-drafts' : 'post-drafts'
  const acceptedTypes = isVideo
    ? 'video/mp4,video/quicktime,video/webm,video/x-matroska'
    : 'image/*'

  // Two modes: "file" (direct upload) or "link" (paste a URL)
  const [mode, setMode] = useState<'file' | 'link'>(isVideo ? 'link' : 'file')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [externalUrl, setExternalUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [designerNotes, setDesignerNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (f.size > 50 * 1024 * 1024) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(0)} MB — exceeds the 50 MB limit. Use the "Paste link" option instead (Google Drive, Dropbox, etc).`)
      return
    }
    setFile(f)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    // Determine the deliverable URL
    let deliverableUrl: string | null = null

    if (mode === 'link') {
      if (!externalUrl.trim()) {
        setError('Please paste a link to the file')
        return
      }
      deliverableUrl = externalUrl.trim()
    } else {
      if (!file) {
        setError(`Please select a ${isVideo ? 'video' : 'image'}`)
        return
      }
      setUploading(true)
      setError(null)

      const ext = file.name.split('.').pop()
      const subfolder = isVideo ? 'video-drafts' : 'drafts'
      const path = `${clientId}/${subfolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, contentType: file.type })

      if (uploadErr) {
        setError(`Upload failed: ${uploadErr.message}`)
        setUploading(false)
        return
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      deliverableUrl = urlData.publicUrl
    }

    if (!deliverableUrl) return

    setUploading(true)
    setError(null)

    const result = await uploadDraftContent(queueId, {
      imageUrl: deliverableUrl,
      caption,
      hashtags,
      designerNotes: designerNotes || undefined,
    })

    if (result.success) {
      clearFile()
      setExternalUrl('')
      setCaption('')
      setHashtags('')
      setDesignerNotes('')
      onUploaded()
    } else {
      setError(result.error)
    }

    setUploading(false)
  }

  const hasContent = mode === 'link' ? !!externalUrl.trim() : !!file

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-brand-tint flex items-center justify-center">
          <Upload className="w-3.5 h-3.5 text-brand-dark" />
        </div>
        <h4 className="text-sm font-semibold text-ink">Upload a draft</h4>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-bg-2 rounded-lg p-1 w-fit">
        {([
          { id: 'file' as const, label: 'Upload file', hint: isVideo ? '< 50 MB' : '' },
          { id: 'link' as const, label: 'Paste link', hint: 'Drive, Dropbox, etc' },
        ]).map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setError(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === m.id ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {m.label}
            {m.hint && <span className="text-[9px] text-ink-4 ml-1">{m.hint}</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        {/* Left: file picker OR link input */}
        <div>
          {mode === 'file' ? (
            <>
              {preview ? (
                <div className="relative">
                  {isVideo ? (
                    <video
                      src={preview}
                      controls
                      className="w-40 h-40 object-cover rounded-lg border border-ink-6 bg-black"
                    />
                  ) : (
                    <img src={preview} alt="" className="w-40 h-40 object-cover rounded-lg border border-ink-6" />
                  )}
                  <button
                    onClick={clearFile}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center hover:bg-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-40 h-40 rounded-lg border-2 border-dashed border-ink-5 hover:border-brand/50 flex flex-col items-center justify-center gap-1.5 text-ink-4 hover:text-brand-dark transition-colors"
                >
                  {isVideo ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  <span className="text-[10px] font-medium">
                    {isVideo ? 'Choose video' : 'Choose image'}
                  </span>
                  <span className="text-[9px] text-ink-4">
                    {isVideo ? 'MP4 · MOV · < 50 MB' : 'JPG · PNG · WebP'}
                  </span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept={acceptedTypes} className="hidden" onChange={handleFile} />
            </>
          ) : (
            <div className="w-40 h-40 rounded-lg border border-ink-6 bg-bg-2 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 mb-1">
                <ExternalLink className="w-3.5 h-3.5 text-ink-4" />
                <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Link</span>
              </div>
              <input
                type="url"
                value={externalUrl}
                onChange={e => setExternalUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full border border-ink-6 rounded px-2 py-1.5 text-[11px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white"
              />
              <p className="text-[9px] text-ink-4 leading-tight">
                Google Drive, Dropbox, WeTransfer, or any public URL
              </p>
            </div>
          )}
        </div>

        {/* Right: caption + hashtags + notes */}
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-0.5 block">Caption</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Post caption..."
              rows={3}
              className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-0.5 block">Hashtags</label>
            <input
              type="text"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#hashtag #another"
              className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-ink-4 font-medium uppercase tracking-wide mb-0.5 block">Designer Notes (internal)</label>
            <input
              type="text"
              value={designerNotes}
              onChange={e => setDesignerNotes(e.target.value)}
              placeholder="Optional internal notes..."
              className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 bg-white"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-6">
        <button
          onClick={handleSave}
          disabled={uploading || !hasContent}
          className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Save Draft
        </button>
      </div>
    </div>
  )
}
