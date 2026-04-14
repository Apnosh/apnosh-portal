'use client'

import { useState } from 'react'
import {
  Check, AlertCircle, Clock, ChevronDown, ChevronUp,
  Camera, Scissors, Palette, Pen, ShieldCheck,
  Globe, Video, MessageCircle,
} from 'lucide-react'

interface Assignment {
  id: string
  role: string
  step_order: number
  team_member_id: string | null
  team_member_name?: string
  status: string
  due_date: string | null
  completed_at: string | null
  notes: string | null
}

interface TeamMember {
  id: string
  name: string
  role: string
  workload: number
}

interface ProductionItemCardProps {
  itemId: string
  title: string
  contentType: string
  platform: string
  scheduledDate: string
  filmingBatch: string | null
  assignments: Assignment[]
  teamMembers: TeamMember[]
  onAssign: (assignmentId: string, memberId: string | null) => void
  onComplete: (assignmentId: string) => void
  onBlock: (assignmentId: string) => void
  onAddNotes: (assignmentId: string, notes: string) => void
}

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Camera; color: string }> = {
  videographer: { label: 'Filming', icon: Camera, color: 'text-indigo-600 bg-indigo-50' },
  editor: { label: 'Editing', icon: Scissors, color: 'text-purple-600 bg-purple-50' },
  designer: { label: 'Design', icon: Palette, color: 'text-pink-600 bg-pink-50' },
  copywriter: { label: 'Copy', icon: Pen, color: 'text-cyan-600 bg-cyan-50' },
  qa: { label: 'QA', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-ink-6 text-ink-3',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  blocked: 'bg-red-50 text-red-600',
  revision: 'bg-amber-50 text-amber-700',
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
}

export default function ProductionItemCard({
  title, contentType, platform, scheduledDate, filmingBatch,
  assignments, teamMembers, onAssign, onComplete, onBlock, onAddNotes,
}: ProductionItemCardProps) {
  const [expanded, setExpanded] = useState(false)
  const PIcon = PLATFORM_ICONS[platform] ?? Globe
  const tc = TYPE_COLORS[contentType] ?? 'bg-ink-6 text-ink-3'

  // Find the active (current) step
  const activeAssignment = assignments.find((a) => a.status === 'in_progress')
  const completedCount = assignments.filter((a) => a.status === 'completed').length
  const isBlocked = assignments.some((a) => a.status === 'blocked')
  const isOverdue = assignments.some((a) => a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed')

  return (
    <div className={`bg-white rounded-xl border transition-colors ${
      isBlocked ? 'border-red-200' : isOverdue ? 'border-amber-200' : 'border-ink-6'
    }`}>
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* Progress dots */}
        <div className="flex gap-0.5 flex-shrink-0">
          {assignments.map((a) => (
            <span
              key={a.id}
              className={`w-2 h-2 rounded-full ${
                a.status === 'completed' ? 'bg-brand' :
                a.status === 'in_progress' ? 'bg-blue-400' :
                a.status === 'blocked' ? 'bg-red-400' :
                a.status === 'revision' ? 'bg-amber-400' : 'bg-ink-5'
              }`}
              title={`${ROLE_CONFIG[a.role]?.label ?? a.role}: ${a.status}`}
            />
          ))}
        </div>

        {/* Type + platform */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tc}`}>
          {contentType.replace(/_/g, ' ')}
        </span>
        <PIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />

        {/* Title */}
        <span className="text-sm font-medium text-ink truncate flex-1">{title}</span>

        {/* Current stage */}
        {activeAssignment && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ROLE_CONFIG[activeAssignment.role]?.color ?? ''}`}>
            {ROLE_CONFIG[activeAssignment.role]?.label ?? activeAssignment.role}
            {activeAssignment.team_member_name && ` · ${activeAssignment.team_member_name}`}
          </span>
        )}

        {/* Alerts */}
        {isBlocked && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        {isOverdue && !isBlocked && <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}

        {/* Progress fraction */}
        <span className="text-[10px] text-ink-4 flex-shrink-0">{completedCount}/{assignments.length}</span>

        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-ink-4" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-4" />}
      </button>

      {/* Expanded: assignment chain */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-ink-6">
          {/* Meta */}
          <div className="flex items-center gap-3 py-2 text-[10px] text-ink-4">
            <span>Scheduled: {scheduledDate}</span>
            {filmingBatch && <span>Batch {filmingBatch}</span>}
          </div>

          {/* Assignment chain */}
          <div className="space-y-1.5 mt-2">
            {assignments
              .sort((a, b) => a.step_order - b.step_order)
              .map((assignment, idx) => {
                const rc = ROLE_CONFIG[assignment.role]
                const Icon = rc?.icon ?? ShieldCheck
                const isActive = assignment.status === 'in_progress'
                const isDone = assignment.status === 'completed'
                const membersForRole = teamMembers.filter(
                  (m) => m.role === assignment.role || m.role === 'admin'
                )

                return (
                  <div
                    key={assignment.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? 'bg-blue-50 ring-1 ring-blue-200' :
                      isDone ? 'bg-bg-2 opacity-60' : 'bg-bg-2'
                    }`}
                  >
                    {/* Step indicator */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isDone ? 'bg-brand text-white' :
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-ink-6 text-ink-4'
                    }`}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>

                    {/* Role + status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink">{rc?.label ?? assignment.role}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLES[assignment.status] ?? ''}`}>
                          {assignment.status.replace('_', ' ')}
                        </span>
                      </div>
                      {assignment.due_date && (
                        <span className={`text-[10px] ${
                          !isDone && assignment.due_date && new Date(assignment.due_date) < new Date()
                            ? 'text-red-500 font-medium' : 'text-ink-4'
                        }`}>
                          Due: {new Date(assignment.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {isDone && assignment.completed_at && (
                        <span className="text-[10px] text-brand">
                          Done {new Date(assignment.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Assignee dropdown */}
                    <select
                      value={assignment.team_member_id ?? ''}
                      onChange={(e) => onAssign(assignment.id, e.target.value || null)}
                      disabled={isDone}
                      className="text-[11px] border border-ink-6 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 max-w-[140px] disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {membersForRole.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.workload})</option>
                      ))}
                    </select>

                    {/* Actions */}
                    {isActive && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => onComplete(assignment.id)}
                          className="px-2 py-1 text-[10px] font-semibold text-brand bg-brand-tint rounded hover:bg-brand/10 transition-colors"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => onBlock(assignment.id)}
                          className="px-2 py-1 text-[10px] font-semibold text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                        >
                          Block
                        </button>
                      </div>
                    )}

                    {/* Connector line */}
                    {idx < assignments.length - 1 && (
                      <div className="absolute left-[30px] w-px h-3 bg-ink-5 hidden" />
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
