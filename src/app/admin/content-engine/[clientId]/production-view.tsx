'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Camera, Scissors, Palette, Pen, ShieldCheck,
  AlertCircle, Clock, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateAssignments, completeAssignment } from '@/lib/content-engine/generate-assignments'
import PipelineBoard from '@/components/content-engine/pipeline-board'
import ProductionItemCard from '@/components/content-engine/production-item-card'
import { useToast } from '@/components/ui/toast'

interface Assignment {
  id: string
  item_id: string
  role: string
  step_order: number
  team_member_id: string | null
  status: string
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  notes: string | null
}

interface ContentItem {
  id: string
  concept_title: string
  content_type: string
  platform: string
  scheduled_date: string
  filming_batch: string | null
}

interface TeamMember {
  id: string
  name: string
  role: string
  workload: number
}

const ROLE_ORDER = ['videographer', 'editor', 'designer', 'copywriter', 'qa']

export default function ProductionView({ cycleId, clientId }: { cycleId: string; clientId: string }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [items, setItems] = useState<ContentItem[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: assignData }, { data: itemData }, { data: teamData }] = await Promise.all([
      supabase
        .from('production_assignments')
        .select('*')
        .eq('cycle_id', cycleId)
        .order('step_order'),
      supabase
        .from('content_calendar_items')
        .select('id, concept_title, content_type, platform, scheduled_date, filming_batch')
        .eq('cycle_id', cycleId)
        .order('scheduled_date'),
      supabase
        .from('team_members')
        .select('id, name, role')
        .eq('is_active', true),
    ])

    // Compute workload per team member
    const workloadMap = new Map<string, number>()
    for (const a of (assignData ?? [])) {
      if (a.team_member_id && a.status !== 'completed') {
        workloadMap.set(a.team_member_id, (workloadMap.get(a.team_member_id) ?? 0) + 1)
      }
    }

    setAssignments((assignData ?? []) as Assignment[])
    setItems((itemData ?? []) as ContentItem[])
    setTeamMembers(((teamData ?? []) as Array<{ id: string; name: string; role: string }>).map((m) => ({
      ...m,
      workload: workloadMap.get(m.id) ?? 0,
    })))
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { load() }, [load])

  // Group assignments by role for pipeline board
  const getPipelineItems = (role: string) => {
    return assignments
      .filter((a) => a.role === role && a.status !== 'completed')
      .map((a) => {
        const item = items.find((i) => i.id === a.item_id)
        const member = a.team_member_id ? teamMembers.find((m) => m.id === a.team_member_id) : null
        return {
          id: a.id,
          item_id: a.item_id,
          concept_title: item?.concept_title ?? 'Unknown',
          content_type: item?.content_type ?? 'feed_post',
          platform: item?.platform ?? 'instagram',
          team_member_name: member?.name ?? null,
          status: a.status,
          due_date: a.due_date,
          filming_batch: item?.filming_batch ?? null,
        }
      })
  }

  // Get assignments for a specific item
  const getItemAssignments = (itemId: string) => {
    return assignments
      .filter((a) => a.item_id === itemId)
      .map((a) => ({
        ...a,
        team_member_name: a.team_member_id ? teamMembers.find((m) => m.id === a.team_member_id)?.name : undefined,
      }))
  }

  // Stats
  const stats = ROLE_ORDER.map((role) => {
    const roleAssignments = assignments.filter((a) => a.role === role)
    const completed = roleAssignments.filter((a) => a.status === 'completed').length
    return { role, total: roleAssignments.length, completed }
  })

  const unassigned = assignments.filter((a) => !a.team_member_id && a.status !== 'completed').length
  const blocked = assignments.filter((a) => a.status === 'blocked').length
  const overdue = assignments.filter((a) => a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed').length

  // Handlers
  const handleAssign = async (assignmentId: string, memberId: string | null) => {
    await supabase
      .from('production_assignments')
      .update({ team_member_id: memberId, updated_at: new Date().toISOString() })
      .eq('id', assignmentId)
    await load()
  }

  const handleComplete = async (assignmentId: string) => {
    await completeAssignment(assignmentId)
    await load()
    toast('Step completed, next step started', 'success')
  }

  const handleBlock = async (assignmentId: string) => {
    await supabase
      .from('production_assignments')
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('id', assignmentId)
    await load()
    toast('Marked as blocked', 'warning')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const result = await generateAssignments(cycleId, clientId)
    if (result.success) {
      toast(`${result.created} assignments created`, 'success')
      await load()
    } else {
      toast(result.error ?? 'Failed', 'error')
    }
    setGenerating(false)
  }

  const ROLE_ICONS: Record<string, typeof Camera> = {
    videographer: Camera, editor: Scissors, designer: Palette, copywriter: Pen, qa: ShieldCheck,
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  // No assignments yet
  if (assignments.length === 0) {
    return (
      <div className="text-center py-16">
        <RefreshCw className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate production assignments</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          Create task assignments for each role in the production chain. Video items get filming → editing → design → copy → QA. Static items get design → copy → QA.
        </p>
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><RefreshCw className="w-4 h-4" /> Generate Assignments</>}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3">
        {stats.filter((s) => s.total > 0).map((s) => {
          const Icon = ROLE_ICONS[s.role] ?? ShieldCheck
          const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0
          return (
            <div key={s.role} className="flex items-center gap-2 bg-white rounded-lg border border-ink-6 px-3 py-2">
              <Icon className="w-3.5 h-3.5 text-ink-3" />
              <span className="text-xs font-medium text-ink capitalize">{s.role === 'qa' ? 'QA' : s.role}</span>
              <div className="w-12 h-1 bg-ink-6 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-ink-3">{s.completed}/{s.total}</span>
            </div>
          )
        })}
      </div>

      {/* Alerts */}
      {(unassigned > 0 || blocked > 0 || overdue > 0) && (
        <div className="flex flex-wrap gap-2">
          {unassigned > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <AlertCircle className="w-3 h-3" /> {unassigned} unassigned
            </div>
          )}
          {blocked > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <AlertCircle className="w-3 h-3" /> {blocked} blocked
            </div>
          )}
          {overdue > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <Clock className="w-3 h-3" /> {overdue} overdue
            </div>
          )}
        </div>
      )}

      {/* Pipeline board */}
      <PipelineBoard
        filming={getPipelineItems('videographer')}
        editing={getPipelineItems('editor')}
        design={getPipelineItems('designer')}
        copy={getPipelineItems('copywriter')}
        qa={getPipelineItems('qa')}
        onItemClick={(id) => setExpandedItemId(expandedItemId === id ? null : id)}
      />

      {/* Expanded item detail */}
      {expandedItemId && (() => {
        const item = items.find((i) => i.id === expandedItemId)
        if (!item) return null
        return (
          <ProductionItemCard
            itemId={item.id}
            title={item.concept_title}
            contentType={item.content_type}
            platform={item.platform}
            scheduledDate={item.scheduled_date}
            filmingBatch={item.filming_batch}
            assignments={getItemAssignments(item.id)}
            teamMembers={teamMembers}
            onAssign={handleAssign}
            onComplete={handleComplete}
            onBlock={handleBlock}
            onAddNotes={() => {}}
          />
        )
      })()}

      {/* All items list */}
      <div>
        <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">All Items ({items.length})</h3>
        <div className="space-y-1.5">
          {items.map((item) => (
            <ProductionItemCard
              key={item.id}
              itemId={item.id}
              title={item.concept_title}
              contentType={item.content_type}
              platform={item.platform}
              scheduledDate={item.scheduled_date}
              filmingBatch={item.filming_batch}
              assignments={getItemAssignments(item.id)}
              teamMembers={teamMembers}
              onAssign={handleAssign}
              onComplete={handleComplete}
              onBlock={handleBlock}
              onAddNotes={() => {}}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
