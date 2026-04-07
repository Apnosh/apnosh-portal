'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, ChevronDown, Send, Check, Eye, Clock, Pencil,
  ListTodo, MessageSquare, X, Play, Archive,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PostGenerator from './post-generator'
import type {
  ContentQueueItem, ContentQueueDraft, QueueStatus, TemplateType, PostPlatform,
  ClientFeedbackEntry,
} from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: typeof ListTodo }> = {
  new: { label: 'New', color: 'bg-blue-50 text-blue-700', icon: Plus },
  drafting: { label: 'Drafting', color: 'bg-purple-50 text-purple-700', icon: Pencil },
  in_review: { label: 'In Review', color: 'bg-amber-50 text-amber-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700', icon: Check },
  scheduled: { label: 'Scheduled', color: 'bg-indigo-50 text-indigo-700', icon: Clock },
  posted: { label: 'Posted', color: 'bg-green-50 text-green-700', icon: Send },
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
  const [feedback, setFeedback] = useState<Map<string, ClientFeedbackEntry[]>>(new Map())
  const [showGenerator, setShowGenerator] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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
    if (!isOpen) loadFeedback(id)
  }

  /* ── Status transitions ─────────────────────────────────────────── */

  async function updateStatus(id: string, newStatus: QueueStatus) {
    setUpdatingId(id)

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-ink-4">
          {counts.new ? <span className="font-medium text-blue-600">{counts.new} new</span> : null}
          {counts.in_review ? <span className="font-medium text-amber-600">{counts.in_review} in review</span> : null}
          {counts.drafting ? <span className="font-medium text-purple-600">{counts.drafting} drafting</span> : null}
        </div>
        <button
          onClick={() => setShowGenerator(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Post
        </button>
      </div>

      {/* Queue list */}
      {loading ? (
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
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">Queue is empty.</p>
          <p className="text-xs text-ink-4 mt-1">Click &ldquo;New Post&rdquo; to start generating content.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(item => {
            const isExpanded = expandedId === item.id
            const statusCfg = STATUS_CONFIG[item.status]
            const StatusIcon = statusCfg.icon

            return (
              <div key={item.id} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
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

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-ink-6 p-4 space-y-4">
                    {/* Input text */}
                    {item.input_text && (
                      <div>
                        <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Request</span>
                        <p className="text-sm text-ink-2 mt-1 whitespace-pre-line">{item.input_text}</p>
                      </div>
                    )}

                    {/* Drafts thumbnails */}
                    {item.drafts.length > 0 && (
                      <div>
                        <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Drafts</span>
                        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                          {item.drafts.map((draft, idx) => (
                            <button
                              key={idx}
                              onClick={() => selectDraft(item.id, idx)}
                              className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
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

                    {/* Designer notes */}
                    {item.designer_notes && (
                      <div>
                        <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Designer Notes</span>
                        <p className="text-sm text-ink-2 mt-1">{item.designer_notes}</p>
                      </div>
                    )}

                    {/* Feedback */}
                    {feedback.get(item.id) && feedback.get(item.id)!.length > 0 && (
                      <div>
                        <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Feedback
                        </span>
                        <div className="mt-2 space-y-2">
                          {feedback.get(item.id)!.map(fb => (
                            <div key={fb.id} className="bg-bg-2 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                                  fb.feedback_type === 'approval' ? 'bg-emerald-50 text-emerald-700' :
                                  fb.feedback_type === 'revision' ? 'bg-amber-50 text-amber-700' :
                                  'bg-ink-6 text-ink-3'
                                }`}>
                                  {fb.feedback_type}
                                </span>
                                <span className="text-[10px] text-ink-4">
                                  {new Date(fb.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              {fb.message && <p className="text-xs text-ink-2">{fb.message}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ink-6">
                      {item.status === 'new' && (
                        <>
                          <StatusButton label="Start Drafting" onClick={() => updateStatus(item.id, 'drafting')} loading={updatingId === item.id} icon={Pencil} />
                        </>
                      )}
                      {item.status === 'drafting' && (
                        <StatusButton label="Send for Review" onClick={() => updateStatus(item.id, 'in_review')} loading={updatingId === item.id} icon={Send} />
                      )}
                      {item.status === 'in_review' && (
                        <>
                          <StatusButton label="Approve" onClick={() => updateStatus(item.id, 'approved')} loading={updatingId === item.id} icon={Check} color="emerald" />
                          <StatusButton label="Request Revision" onClick={() => updateStatus(item.id, 'drafting')} loading={updatingId === item.id} icon={Pencil} color="amber" />
                        </>
                      )}
                      {item.status === 'approved' && (
                        <>
                          <StatusButton label="Mark Posted" onClick={() => updateStatus(item.id, 'posted')} loading={updatingId === item.id} icon={Check} color="emerald" />
                          <StatusButton label="Schedule" onClick={() => updateStatus(item.id, 'scheduled')} loading={updatingId === item.id} icon={Clock} />
                        </>
                      )}
                      {item.status === 'scheduled' && (
                        <StatusButton label="Mark Posted" onClick={() => updateStatus(item.id, 'posted')} loading={updatingId === item.id} icon={Check} color="emerald" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
