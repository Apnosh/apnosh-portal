'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Camera, Scissors, Palette, Pen, LayoutGrid,
  BarChart3, AlertCircle, Clock, Users, CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AllItemsView from '@/components/content-engine/production-views/all-items-view'
import RoleBriefView from '@/components/content-engine/production-views/role-brief-view'

interface ContentItem { [key: string]: unknown }

type RoleTab = 'all' | 'videographer' | 'editor' | 'designer' | 'copywriter' | 'overview'

const ROLE_TABS: Array<{ key: RoleTab; label: string; icon: typeof Camera }> = [
  { key: 'all', label: 'All Items', icon: LayoutGrid },
  { key: 'videographer', label: 'Videographer', icon: Camera },
  { key: 'editor', label: 'Editor', icon: Scissors },
  { key: 'designer', label: 'Designer', icon: Palette },
  { key: 'copywriter', label: 'Copywriter', icon: Pen },
  { key: 'overview', label: 'Overview', icon: BarChart3 },
]

export default function ProductionView({ cycleId, clientId, onGoToCalendar }: { cycleId: string; clientId: string; onGoToCalendar?: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRole, setActiveRole] = useState<RoleTab>('all')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date')
      .order('scheduled_time')
    setItems((data ?? []) as ContentItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  if (items.length === 0) {
    return <div className="text-center py-16 text-sm text-ink-3">No content items yet. Generate ideas in the Brainstorm tab first.</div>
  }

  // Stats for the role pills
  const videoItems = items.filter((i) => ['reel', 'video', 'short_form_video'].includes(i.content_type as string))
  const designItems = items.filter((i) => ['feed_post', 'static_post', 'carousel'].includes(i.content_type as string) || !!(i.cover_frame))
  const roleCounts: Record<string, number> = {
    all: items.length,
    videographer: videoItems.filter((i) => !['client_provides', 'animation', 'stock'].includes((i.footage_source as string) ?? '')).length,
    editor: videoItems.length,
    designer: designItems.length,
    copywriter: items.length,
  }

  return (
    <div className="space-y-5">
      {/* Role selector pills */}
      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map((tab) => {
          const isActive = activeRole === tab.key
          const count = roleCounts[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveRole(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-ink text-white shadow-sm'
                  : 'bg-white text-ink-3 border border-ink-6 hover:border-ink-5 hover:text-ink-2'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {count !== undefined && tab.key !== 'overview' && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20' : 'bg-ink-6'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content based on active role */}
      {activeRole === 'all' && (
        <AllItemsView items={items} onItemClick={() => {}} />
      )}

      {(activeRole === 'videographer' || activeRole === 'editor' || activeRole === 'designer' || activeRole === 'copywriter') && (
        <RoleBriefView items={items} role={activeRole} />
      )}

      {activeRole === 'overview' && (
        <OverviewDashboard items={items} />
      )}

      {/* Transition CTA */}
      {items.length > 0 && onGoToCalendar && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between">
          <span className="text-xs text-ink-2">{items.length} items ready for scheduling</span>
          <button onClick={onGoToCalendar} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-ink text-white rounded-lg hover:bg-ink-2 transition-colors">
            Schedule content →
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Dashboard
// ---------------------------------------------------------------------------

function OverviewDashboard({ items }: { items: ContentItem[] }) {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const stageLabels: Record<string, string> = {
    concept_status: 'Concept', script_status: 'Script', filming_status: 'Filming',
    editing_status: 'Editing', design_status: 'Design', caption_status: 'Caption',
  }

  // Per-stage completion
  const stageStats = stages.map((stage) => {
    const applicable = items.filter((i) => (i[stage] as string) !== 'not_applicable')
    const done = applicable.filter((i) => ['approved', 'filmed', 'draft_ready'].includes(i[stage] as string))
    const blocked = applicable.filter((i) => (i[stage] as string) === 'blocked')
    return { stage, label: stageLabels[stage], total: applicable.length, done: done.length, blocked: blocked.length }
  })

  // Overall progress
  const totalApplicable = stageStats.reduce((sum, s) => sum + s.total, 0)
  const totalDone = stageStats.reduce((sum, s) => sum + s.done, 0)
  const overallPct = totalApplicable > 0 ? Math.round((totalDone / totalApplicable) * 100) : 0

  // Content type breakdown
  const typeCounts: Record<string, number> = {}
  items.forEach((i) => { const t = i.content_type as string; typeCounts[t] = (typeCounts[t] ?? 0) + 1 })

  // Items that are fully done
  const fullyDone = items.filter((item) => {
    const applicable = stages.filter((s) => (item[s] as string) !== 'not_applicable')
    return applicable.length > 0 && applicable.every((s) => ['approved', 'filmed', 'draft_ready'].includes(item[s] as string))
  })

  // Blocked items
  const blockedItems = items.filter((item) =>
    stages.some((s) => (item[s] as string) === 'blocked')
  )

  return (
    <div className="space-y-5">
      {/* Overall progress */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ink">Overall Progress</h3>
          <span className="text-2xl font-bold text-ink">{overallPct}%</span>
        </div>
        <div className="w-full h-2 bg-ink-6 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-ink">{items.length}</p>
            <p className="text-[10px] text-ink-3">Total items</p>
          </div>
          <div>
            <p className="text-lg font-bold text-brand">{fullyDone.length}</p>
            <p className="text-[10px] text-ink-3">Complete</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-500">{blockedItems.length}</p>
            <p className="text-[10px] text-ink-3">Blocked</p>
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h3 className="text-sm font-bold text-ink mb-4">Production Pipeline</h3>
        <div className="space-y-3">
          {stageStats.filter((s) => s.total > 0).map((s) => {
            const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-ink">{s.label}</span>
                  <div className="flex items-center gap-2">
                    {s.blocked > 0 && (
                      <span className="text-[9px] text-red-500 flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" /> {s.blocked}
                      </span>
                    )}
                    <span className="text-[10px] text-ink-3">{s.done}/{s.total}</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-ink-6 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Content type breakdown */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h3 className="text-sm font-bold text-ink mb-3">Content Mix</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2 bg-bg-2 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-ink capitalize">{type.replace(/_/g, ' ')}</span>
              <span className="text-xs font-bold text-ink-3">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked items detail */}
      {blockedItems.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> Blocked Items
          </h3>
          <div className="space-y-2">
            {blockedItems.map((item) => {
              const blockedStages = stages.filter((s) => (item[s] as string) === 'blocked').map((s) => stageLabels[s])
              return (
                <div key={item.id as string} className="flex items-center justify-between py-2 border-b border-ink-6 last:border-0">
                  <span className="text-xs font-medium text-ink">{item.concept_title as string}</span>
                  <span className="text-[10px] text-red-500">{blockedStages.join(', ')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
