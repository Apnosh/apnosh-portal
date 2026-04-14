'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Check, BookOpen,
  Camera, Globe, Video, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateBriefs, refineBriefField } from '@/lib/content-engine/generate-briefs'
import { updateBriefField, approveAllBriefs } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import HookGallery from '@/components/content-engine/hook-gallery'
import BriefDetailPanel from '@/components/content-engine/brief-detail-panel'
import { BriefGenerationProgress } from '@/components/content-engine/generation-progress'
import { useToast } from '@/components/ui/toast'
import Anthropic from '@anthropic-ai/sdk'

interface BriefItem {
  id: string
  concept_title: string
  concept_description: string | null
  content_type: string
  platform: string
  strategic_goal: string | null
  filming_batch: string | null
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

const COMPLETENESS_COLORS: Record<string, string> = {
  complete: 'bg-brand',
  partial: 'bg-amber-400',
  empty: 'bg-ink-5',
}

interface BriefsViewProps {
  cycleId: string
  clientId: string
  context: ClientContext | null
  onStatusChange: (status: string) => void
}

export default function BriefsView({ cycleId, clientId, context, onStatusChange }: BriefsViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<BriefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, title: '' })
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('id, concept_title, concept_description, content_type, platform, strategic_goal, filming_batch, hook, script, caption, hashtags, shot_list, props, location_notes, music_direction, estimated_duration, editor_notes, status')
      .eq('cycle_id', cycleId)
      .order('sort_order')
    const loaded = (data ?? []) as BriefItem[]
    setItems(loaded)
    // Auto-select first item
    if (loaded.length > 0 && !selectedId) setSelectedId(loaded[0].id)
    setLoading(false)
  }, [cycleId, supabase, selectedId])

  useEffect(() => { loadItems() }, [loadItems])

  // Stats
  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'strategist_approved').length
  const totalCount = items.length
  const approvalPct = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0
  const hasBriefs = items.some((i) => i.hook || i.caption || i.script)

  // Completeness per item
  const getCompleteness = (item: BriefItem): string => {
    const isVideo = ['reel', 'video', 'short_form_video'].includes(item.content_type)
    const fields = [item.hook, item.caption]
    if (isVideo) fields.push(item.script)
    const filled = fields.filter(Boolean).length
    if (filled === fields.length) return 'complete'
    if (filled > 0) return 'partial'
    return 'empty'
  }

  // Handlers
  const saveField = async (id: string, field: string, value: unknown) => {
    await updateBriefField(id, field, value)
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }

  const handleApproveItem = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = item.status === 'approved' ? 'draft' : 'approved'
    await updateBriefField(id, 'status', newStatus)
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  const handleApproveAll = async () => {
    const result = await approveAllBriefs(cycleId, clientId)
    if (result.success) {
      onStatusChange('briefs_approved')
      await loadItems()
      toast('All briefs approved and sent to client', 'success')
    }
  }

  const handleRefine = async (id: string, field: string, direction: string) => {
    if (!context) return
    const result = await refineBriefField(id, field, direction, context)
    if (result.success) {
      await loadItems()
      toast('Refined', 'success')
    }
  }

  const handleGenerateAlternativeHooks = async (id: string): Promise<string[]> => {
    const item = items.find((i) => i.id === id)
    if (!item || !context) return []
    try {
      const anthropic = new Anthropic({ dangerouslyAllowBrowser: true })
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        temperature: 0.9,
        system: 'Generate 3 alternative social media hooks. Return ONLY a JSON array of 3 strings. No markdown.',
        messages: [{
          role: 'user',
          content: `Current hook: "${item.hook}"\nConcept: ${item.concept_title}\nBusiness: ${context.businessName} (${context.businessType})\nVoice: ${context.voiceNotes ?? 'friendly'}\nPlatform: ${item.platform}\n\nGenerate 3 alternative hooks that are punchier and more scroll-stopping.`,
        }],
      })
      const text = response.content.find((b) => b.type === 'text')?.text
      if (!text) return []
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(cleaned) as string[]
    } catch {
      return []
    }
  }

  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true)
    setError(null)
    setGenProgress({ current: 0, total: items.length, title: '' })
    const result = await generateBriefs(cycleId, clientId, context)
    if (result.success) {
      onStatusChange('briefs_draft')
      await loadItems()
      toast(`${result.count} briefs generated`, 'success')
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  if (generating) {
    return <BriefGenerationProgress total={genProgress.total || items.length} current={genProgress.current} currentTitle={genProgress.title} />
  }

  // No briefs yet
  if (!hasBriefs) {
    return (
      <div className="text-center py-16">
        <BookOpen className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate production briefs</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          AI will create hooks, scripts, captions, and production details for all {items.length} calendar items.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Generate All Briefs
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header: progress + approve all */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${approvalPct}%` }} />
          </div>
          <span className="text-xs text-ink-3 font-medium">{approvedCount}/{totalCount} approved</span>
        </div>
        <div className="flex items-center gap-2">
          {approvedCount < totalCount && (
            <button onClick={handleApproveAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors">
              <Check className="w-3.5 h-3.5" /> Approve All
            </button>
          )}
          {approvedCount === totalCount && totalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
              <Check className="w-3 h-3" /> All approved
            </span>
          )}
        </div>
      </div>

      {/* Hook Gallery */}
      <HookGallery
        items={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onApprove={handleApproveItem}
        onFlag={(id) => { setSelectedId(id); toast('Review this item', 'info') }}
      />

      {/* Two-panel layout */}
      <div className="flex gap-4 min-h-[500px]">
        {/* Left: Item list */}
        <div className="w-2/5 bg-white rounded-xl border border-ink-6 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-ink-6 bg-bg-2">
            <span className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider">Content Items</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-ink-6">
            {items.map((item) => {
              const PIcon = PLATFORM_ICONS[item.platform] ?? Globe
              const comp = getCompleteness(item)
              const isSelected = selectedId === item.id
              const isApproved = item.status === 'approved' || item.status === 'strategist_approved'

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                    isSelected ? 'bg-brand-tint' : 'hover:bg-bg-2'
                  } ${isApproved ? 'opacity-60' : ''}`}
                >
                  {/* Completeness dot */}
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${COMPLETENESS_COLORS[comp]}`} />

                  {/* Platform icon */}
                  <PIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />

                  {/* Title */}
                  <span className="text-xs font-medium text-ink truncate flex-1">{item.concept_title}</span>

                  {/* Approve indicator */}
                  {isApproved && <Check className="w-3 h-3 text-brand flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Brief detail */}
        <div className="w-3/5 bg-white rounded-xl border border-ink-6 overflow-hidden">
          {selectedItem ? (
            <BriefDetailPanel
              item={selectedItem}
              allItems={items}
              onSave={saveField}
              onApprove={handleApproveItem}
              onRefine={handleRefine}
              onGenerateAlternativeHooks={handleGenerateAlternativeHooks}
              onNavigate={setSelectedId}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-ink-3">
              Select an item to review its brief
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
