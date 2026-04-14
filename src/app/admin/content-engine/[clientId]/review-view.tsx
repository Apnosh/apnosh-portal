'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Check, ChevronDown, ChevronUp, Send,
  Camera, Scissors, Palette, Pen, ShieldCheck,
  Globe, Video, MessageCircle, Clipboard, ClipboardCheck,
  AlertCircle, Eye, EyeOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { approveAllBriefs } from '@/lib/content-engine/actions'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { useToast } from '@/components/ui/toast'

interface ReviewItem {
  id: string
  concept_title: string
  concept_description: string | null
  content_type: string
  platform: string
  additional_platforms: string[] | null
  strategic_goal: string | null
  filming_batch: string | null
  scheduled_date: string
  scheduled_time: string | null
  hook: string | null
  script: string | null
  caption: string | null
  hashtags: string[] | null
  shot_list: Array<{ shot_number: number; description: string }> | null
  props: string[] | null
  location_notes: string | null
  music_direction: string | null
  estimated_duration: string | null
  editor_notes: string | null
  status: string
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

const GOAL_LABELS: Record<string, string> = {
  awareness: 'Awareness', engagement: 'Engagement', conversion: 'Conversion', community: 'Community',
}

type RoleView = 'overview' | 'videographer' | 'editor' | 'designer' | 'copywriter'

const ROLE_TABS: Array<{ key: RoleView; label: string; icon: typeof Camera; description: string }> = [
  { key: 'overview', label: 'Full Plan', icon: Eye, description: 'Everything — for strategist review' },
  { key: 'videographer', label: 'Videographer', icon: Camera, description: 'Shot lists, locations, props, filming batches' },
  { key: 'editor', label: 'Editor', icon: Scissors, description: 'Scripts, music direction, editor notes, specs' },
  { key: 'designer', label: 'Designer', icon: Palette, description: 'Concept descriptions, platform specs, visual direction' },
  { key: 'copywriter', label: 'Copywriter', icon: Pen, description: 'Captions, hashtags, CTAs, voice notes' },
]

interface ReviewViewProps {
  cycleId: string
  clientId: string
  onStatusChange: (status: string) => void
}

export default function ReviewView({ cycleId, clientId, onStatusChange }: ReviewViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [roleView, setRoleView] = useState<RoleView>('overview')
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('scheduled_time')
    setItems((data ?? []) as ReviewItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(items.map((i) => i.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const handleConfirmSend = async () => {
    setSending(true)
    setConfirmSend(false)
    const result = await approveAllBriefs(cycleId, clientId)
    if (result.success) {
      onStatusChange('briefs_approved')
      toast('Plan confirmed! Assignments generated and sent to production.', 'success')
    } else {
      toast(result.error ?? 'Failed to send', 'error')
    }
    setSending(false)
  }

  // Stats
  const videoItems = items.filter((i) => ['reel', 'video', 'short_form_video'].includes(i.content_type))
  const staticItems = items.filter((i) => !['reel', 'video', 'short_form_video'].includes(i.content_type))
  const batches = new Set(items.map((i) => i.filming_batch).filter(Boolean))
  const platforms = new Set(items.flatMap((i) => [i.platform, ...(i.additional_platforms ?? [])]))
  const missingHooks = items.filter((i) => !i.hook).length
  const missingCaptions = items.filter((i) => !i.caption).length

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  return (
    <div className="space-y-5">
      {/* Plan summary header */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h2 className="text-base font-bold text-ink mb-3">Content Plan Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-ink">{items.length}</div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wider">Total Items</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-600">{videoItems.length}</div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wider">Video</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-cyan-600">{staticItems.length}</div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wider">Static</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-ink">{batches.size}</div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wider">Filming Sessions</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-ink-3">
          <span>Platforms: {[...platforms].join(', ')}</span>
          {missingHooks > 0 && <span className="text-amber-600">⚠ {missingHooks} missing hooks</span>}
          {missingCaptions > 0 && <span className="text-amber-600">⚠ {missingCaptions} missing captions</span>}
        </div>
      </div>

      {/* Role view selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROLE_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setRoleView(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                roleView === tab.key ? 'bg-ink text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6'
              }`}
              title={tab.description}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
        <div className="flex-1" />
        <button onClick={expandAll} className="text-[10px] text-ink-3 hover:text-ink whitespace-nowrap">Expand all</button>
        <button onClick={collapseAll} className="text-[10px] text-ink-3 hover:text-ink whitespace-nowrap">Collapse all</button>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item) => {
          const isVideo = ['reel', 'video', 'short_form_video'].includes(item.content_type)
          const expanded = expandedIds.has(item.id)
          const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
          const tc = TYPE_COLORS[item.content_type] ?? 'bg-ink-6 text-ink-3'

          // Skip items not relevant to selected role
          if (roleView === 'videographer' && !isVideo) return null
          if (roleView === 'editor' && !isVideo) return null

          return (
            <div key={item.id} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              {/* Header row — always visible */}
              <button
                onClick={() => toggleExpand(item.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-2/50 transition-colors"
              >
                <span className="text-xs text-ink-3 font-medium tabular-nums w-20 flex-shrink-0">
                  {new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {item.scheduled_time && ` ${item.scheduled_time.slice(0, 5)}`}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tc}`}>
                  {item.content_type.replace(/_/g, ' ')}
                </span>
                <PIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />
                {(item.additional_platforms ?? []).map((p) => {
                  const ExIcon = PLATFORM_ICONS[p] ?? Globe
                  return <ExIcon key={p} className="w-2.5 h-2.5 text-ink-5 flex-shrink-0" />
                })}
                <span className="text-sm font-medium text-ink truncate flex-1">{item.concept_title}</span>
                {item.strategic_goal && (
                  <span className="text-[10px] text-ink-4 flex-shrink-0">{GOAL_LABELS[item.strategic_goal] ?? item.strategic_goal}</span>
                )}
                {item.filming_batch && (
                  <span className="text-[9px] font-bold text-ink-4 flex-shrink-0">Batch {item.filming_batch}</span>
                )}
                {expanded ? <ChevronUp className="w-3.5 h-3.5 text-ink-4" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-4" />}
              </button>

              {/* Expanded detail — filtered by role */}
              {expanded && (
                <div className="px-4 pb-4 border-t border-ink-6 space-y-3 pt-3">
                  {item.concept_description && (roleView === 'overview' || roleView === 'designer') && (
                    <DetailSection label="Concept">{item.concept_description}</DetailSection>
                  )}

                  {/* Hook — strategist, copywriter */}
                  {item.hook && (roleView === 'overview' || roleView === 'copywriter') && (
                    <DetailSection label="Hook" copyable={item.hook}>
                      <span className="font-medium">{item.hook}</span>
                    </DetailSection>
                  )}

                  {/* Script — strategist, videographer, editor */}
                  {item.script && isVideo && (roleView === 'overview' || roleView === 'videographer' || roleView === 'editor') && (
                    <DetailSection label="Script" copyable={item.script}>
                      <pre className="whitespace-pre-wrap text-ink-2">{item.script}</pre>
                    </DetailSection>
                  )}

                  {/* Shot list — videographer */}
                  {item.shot_list && item.shot_list.length > 0 && (roleView === 'overview' || roleView === 'videographer') && (
                    <DetailSection label={`Shot List (${item.shot_list.length} shots)`}>
                      <div className="space-y-1">
                        {item.shot_list.map((s) => (
                          <div key={s.shot_number} className="flex gap-2 text-ink-2">
                            <span className="font-bold text-ink-3 w-6 text-right">#{s.shot_number}</span>
                            <span>{s.description}</span>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {/* Props — videographer */}
                  {item.props && item.props.length > 0 && (roleView === 'overview' || roleView === 'videographer') && (
                    <DetailSection label="Props">
                      <div className="flex flex-wrap gap-1.5">
                        {item.props.map((p, i) => (
                          <span key={i} className="text-ink-2 bg-bg-2 px-2 py-0.5 rounded text-xs">{p}</span>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {/* Location — videographer */}
                  {item.location_notes && (roleView === 'overview' || roleView === 'videographer') && (
                    <DetailSection label="Location">{item.location_notes}</DetailSection>
                  )}

                  {/* Music — editor */}
                  {item.music_direction && (roleView === 'overview' || roleView === 'editor') && (
                    <DetailSection label="Music Direction">{item.music_direction}</DetailSection>
                  )}

                  {/* Duration — editor, videographer */}
                  {item.estimated_duration && (roleView === 'overview' || roleView === 'editor' || roleView === 'videographer') && (
                    <DetailSection label="Duration">{item.estimated_duration}</DetailSection>
                  )}

                  {/* Editor notes — editor */}
                  {item.editor_notes && (roleView === 'overview' || roleView === 'editor') && (
                    <DetailSection label="Editor Notes">{item.editor_notes}</DetailSection>
                  )}

                  {/* Caption — copywriter, designer (for text overlays) */}
                  {item.caption && (roleView === 'overview' || roleView === 'copywriter' || roleView === 'designer') && (
                    <DetailSection label={`Caption (${item.caption.length} chars)`} copyable={item.caption}>
                      <pre className="whitespace-pre-wrap text-ink-2">{item.caption}</pre>
                    </DetailSection>
                  )}

                  {/* Hashtags — copywriter */}
                  {item.hashtags && item.hashtags.length > 0 && (roleView === 'overview' || roleView === 'copywriter') && (
                    <DetailSection label={`Hashtags (${item.hashtags.length})`} copyable={item.hashtags.join(' ')}>
                      <p className="text-ink-3">{item.hashtags.join(' ')}</p>
                    </DetailSection>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Confirm & Send bar */}
      <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Ready to send to production?</h3>
          <p className="text-xs text-ink-3 mt-0.5">
            This will create assignments for each team role and start the production workflow.
          </p>
        </div>
        <button
          onClick={() => setConfirmSend(true)}
          disabled={sending || missingHooks > 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Confirm & Start Production
        </button>
      </div>

      {missingHooks > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {missingHooks} items are missing hooks. Go back to Briefs to generate them before sending.
        </div>
      )}

      <ConfirmModal
        open={confirmSend}
        onConfirm={handleConfirmSend}
        onCancel={() => setConfirmSend(false)}
        title="Start production?"
        description={`${items.length} items will be sent to production. Assignments will be created for videographers (${videoItems.length} items), editors (${videoItems.length}), designers (${items.length}), copywriters (${items.length}), and QA (${items.length}). Each role will receive only the information relevant to them.`}
        confirmLabel="Confirm & Send"
        variant="primary"
        loading={sending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail section with optional copy
// ---------------------------------------------------------------------------

function DetailSection({ label, children, copyable }: { label: string; children: React.ReactNode; copyable?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!copyable) return
    await navigator.clipboard.writeText(copyable)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">{label}</span>
        {copyable && (
          <button onClick={handleCopy} className="text-ink-5 hover:text-ink transition-colors" title="Copy">
            {copied ? <ClipboardCheck className="w-3 h-3 text-brand" /> : <Clipboard className="w-3 h-3" />}
          </button>
        )}
      </div>
      <div className="text-xs text-ink-2 leading-relaxed">{children}</div>
    </div>
  )
}
