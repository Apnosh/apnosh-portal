'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check, Clock, Lock, Minus, AlertCircle, Upload, Link2, MessageSquare,
  ChevronDown, ChevronRight, UserPlus, Camera, Scissors, Palette, Pen,
} from 'lucide-react'
import {
  advanceStage, assignStage, getTeamMembers,
  submitDeliverable, getDeliverables, reviewDeliverable,
  addTaskNote, getTaskNotes,
} from '@/lib/content-engine/task-actions'

interface ContentItem { id: string; [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

const STAGES = [
  { key: 'concept', label: 'Concept', icon: Check, doneStatuses: ['approved'] },
  { key: 'script', label: 'Script', icon: Pen, doneStatuses: ['approved'] },
  { key: 'filming', label: 'Filming', icon: Camera, doneStatuses: ['filmed'], advanceLabel: 'Mark as filmed', advanceTo: 'filmed' },
  { key: 'editing', label: 'Editing', icon: Scissors, doneStatuses: ['approved', 'draft_ready'], advanceLabel: 'Submit for review', advanceTo: 'draft_ready' },
  { key: 'design', label: 'Design', icon: Palette, doneStatuses: ['approved', 'draft_ready'], advanceLabel: 'Submit for review', advanceTo: 'draft_ready' },
  { key: 'caption', label: 'Caption', icon: Pen, doneStatuses: ['approved'], advanceLabel: 'Submit caption', advanceTo: 'draft_ready' },
]

const ROLE_FOR_STAGE: Record<string, string> = {
  filming: 'videographer', editing: 'editor', design: 'designer', caption: 'copywriter',
}

interface TaskPipelinePanelProps {
  item: ContentItem
  onStageUpdate: (field: string, value: string) => void
}

export default function TaskPipelinePanel({ item, onStageUpdate }: TaskPipelinePanelProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [deliverables, setDeliverables] = useState<Array<Record<string, unknown>>>([])
  const [notes, setNotes] = useState<Array<Record<string, unknown>>>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [noteText, setNoteText] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    getTeamMembers().then(setTeamMembers)
    getDeliverables(item.id).then(setDeliverables)
    getTaskNotes(item.id).then(setNotes)
  }, [item.id])

  const getStageStatus = (key: string): string => s(item[`${key}_status`]) || 'not_applicable'
  const getAssignee = (key: string): string | null => s(item[`${key}_assigned_to`]) || null

  const getStageState = (stage: typeof STAGES[0], idx: number): 'done' | 'active' | 'locked' | 'na' => {
    const status = getStageStatus(stage.key)
    if (status === 'not_applicable') return 'na'
    if (stage.doneStatuses.includes(status)) return 'done'
    // Active if all previous applicable stages are done
    const prevStages = STAGES.slice(0, idx).filter((s) => getStageStatus(s.key) !== 'not_applicable')
    const allPrevDone = prevStages.every((ps) => ps.doneStatuses.includes(getStageStatus(ps.key)))
    if (allPrevDone) return 'active'
    return 'locked'
  }

  const handleAdvance = async (stageKey: string, toStatus: string) => {
    const result = await advanceStage(item.id, stageKey, toStatus)
    if (result.success) onStageUpdate(`${stageKey}_status`, toStatus)
  }

  const handleAssign = async (stageKey: string, memberId: string | null) => {
    await assignStage(item.id, stageKey, memberId)
    onStageUpdate(`${stageKey}_assigned_to`, memberId ?? '')
    setAssigning(null)
  }

  const handleSubmitLink = async (stageKey: string) => {
    if (!linkUrl.trim()) return
    await submitDeliverable({ contentItemId: item.id, stage: stageKey, type: 'link', externalUrl: linkUrl.trim() })
    setLinkUrl('')
    const fresh = await getDeliverables(item.id)
    setDeliverables(fresh)
  }

  const handleAddNote = async (stageKey: string) => {
    if (!noteText.trim()) return
    await addTaskNote({ contentItemId: item.id, stage: stageKey, noteText: noteText.trim() })
    setNoteText('')
    const fresh = await getTaskNotes(item.id)
    setNotes(fresh)
  }

  const assigneeName = (memberId: string | null) => {
    if (!memberId) return null
    return teamMembers.find((m) => m.id === memberId)?.name ?? null
  }

  return (
    <div className="space-y-1">
      {STAGES.map((stage, idx) => {
        const state = getStageState(stage, idx)
        const assigneeId = getAssignee(stage.key)
        const name = assigneeName(assigneeId)
        const isExpanded = expandedStage === stage.key
        const stageDeliverables = deliverables.filter((d) => d.stage === stage.key)
        const stageNotes = notes.filter((n) => n.stage === stage.key)

        if (state === 'na') return null

        const Icon = stage.icon

        return (
          <div key={stage.key} className={`rounded-lg border transition-colors ${
            state === 'done' ? 'border-emerald-200 bg-emerald-50/50'
            : state === 'active' ? 'border-brand/30 bg-brand-tint/20'
            : 'border-ink-6 bg-ink-6/10'
          }`}>
            {/* Stage header */}
            <button
              onClick={() => setExpandedStage(isExpanded ? null : stage.key)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
              {state === 'done' && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {state === 'active' && <Clock className="w-4 h-4 text-brand flex-shrink-0" />}
              {state === 'locked' && <Lock className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />}
              <Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
              <span className={`text-xs font-semibold flex-1 ${state === 'locked' ? 'text-ink-4' : 'text-ink'}`}>{stage.label}</span>
              {name && <span className="text-[10px] text-ink-3">{name}</span>}
              {!name && state !== 'locked' && ROLE_FOR_STAGE[stage.key] && (
                <span className="text-[10px] text-ink-4 italic">Unassigned</span>
              )}
              {isExpanded ? <ChevronDown className="w-3 h-3 text-ink-4" /> : <ChevronRight className="w-3 h-3 text-ink-4" />}
            </button>

            {/* Expanded content */}
            {isExpanded && state !== 'locked' && (
              <div className="px-3 pb-3 space-y-3 border-t border-ink-6/50 pt-2">
                {/* Assignment */}
                {ROLE_FOR_STAGE[stage.key] && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-ink-4">Assigned to:</span>
                    {assigning === stage.key ? (
                      <select
                        autoFocus
                        value={assigneeId ?? ''}
                        onChange={(e) => handleAssign(stage.key, e.target.value || null)}
                        onBlur={() => setAssigning(null)}
                        className="text-xs border border-ink-6 rounded px-2 py-1"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.filter((m) => m.role === ROLE_FOR_STAGE[stage.key]).map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setAssigning(stage.key)} className="text-xs text-brand hover:underline flex items-center gap-1">
                        {name ?? <><UserPlus className="w-3 h-3" /> Assign</>}
                      </button>
                    )}
                  </div>
                )}

                {/* Deliverables with review actions */}
                {stageDeliverables.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[9px] text-ink-4 font-semibold uppercase tracking-wider">Deliverables</span>
                    {stageDeliverables.map((d) => (
                      <DeliverableCard
                        key={s(d.id)}
                        deliverable={d}
                        onReview={async (status, notes) => {
                          await reviewDeliverable(s(d.id), status, notes)
                          if (status === 'approved' && stage.advanceTo) {
                            await handleAdvance(stage.key, 'approved')
                          }
                          const fresh = await getDeliverables(item.id)
                          setDeliverables(fresh)
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Submit deliverable (active stages only) */}
                {state === 'active' && ['filming', 'editing', 'design'].includes(stage.key) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="Paste Google Drive, Dropbox, or Frame.io link"
                        className="flex-1 text-xs border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                      <button
                        onClick={() => handleSubmitLink(stage.key)}
                        disabled={!linkUrl.trim()}
                        className="text-[10px] font-semibold text-brand px-2 py-1.5 rounded-lg hover:bg-brand-tint disabled:opacity-40"
                      >
                        Add link
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {stageNotes.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] text-ink-4 font-semibold uppercase tracking-wider">Notes</span>
                    {stageNotes.map((n) => (
                      <div key={s(n.id)} className="text-xs text-ink-2 bg-bg-2 rounded px-2 py-1.5">
                        <p>{s(n.note_text)}</p>
                        <span className="text-[9px] text-ink-4">{new Date(s(n.created_at)).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add note */}
                {state === 'active' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note..."
                      className="flex-1 text-xs border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <button
                      onClick={() => handleAddNote(stage.key)}
                      disabled={!noteText.trim()}
                      className="text-[10px] font-semibold text-ink-3 px-2 py-1.5 rounded-lg hover:bg-bg-2 disabled:opacity-40"
                    >
                      <MessageSquare className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Advance button */}
                {state === 'active' && stage.advanceLabel && (
                  <button
                    onClick={() => handleAdvance(stage.key, stage.advanceTo!)}
                    className="w-full text-xs font-semibold text-white bg-brand px-3 py-2 rounded-lg hover:bg-brand-dark transition-colors"
                  >
                    {stage.advanceLabel}
                  </button>
                )}

              </div>
            )}

            {/* Locked message */}
            {isExpanded && state === 'locked' && (
              <div className="px-3 pb-3 pt-1 border-t border-ink-6/50">
                <p className="text-[10px] text-ink-4 italic">Waiting for previous stage to complete</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deliverable Card with Review Actions
// ---------------------------------------------------------------------------

function DeliverableCard({ deliverable, onReview }: {
  deliverable: Record<string, unknown>
  onReview: (status: 'approved' | 'revision_requested', notes?: string) => void
}) {
  const [showRevisionInput, setShowRevisionInput] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')

  const status = s(deliverable.review_status) || 'pending'
  const isPending = status === 'pending'
  const url = s(deliverable.external_url) || s(deliverable.file_url)

  return (
    <div className={`rounded-lg border p-2.5 ${
      status === 'approved' ? 'border-emerald-200 bg-emerald-50/50'
      : status === 'revision_requested' ? 'border-amber-200 bg-amber-50/50'
      : 'border-ink-6 bg-bg-2'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {deliverable.type === 'link' ? <Link2 className="w-3 h-3 text-ink-4 flex-shrink-0" /> : <Upload className="w-3 h-3 text-ink-4 flex-shrink-0" />}
        <span className="text-xs font-medium text-ink truncate flex-1">
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{s(deliverable.file_name) || 'View link'}</a> : s(deliverable.file_name) || 'File'}
        </span>
        <span className="text-[9px] text-ink-3">v{deliverable.revision_number as number}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
          status === 'approved' ? 'bg-emerald-100 text-emerald-700'
          : status === 'revision_requested' ? 'bg-amber-100 text-amber-700'
          : 'bg-ink-6 text-ink-3'
        }`}>{status.replace(/_/g, ' ')}</span>
      </div>

      {/* Revision notes if any */}
      {!!s(deliverable.review_notes) && (
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 border-l-2 border-amber-400">
          {s(deliverable.review_notes)}
        </p>
      )}

      {/* Submission notes */}
      {!!s(deliverable.notes) && (
        <p className="text-[10px] text-ink-3 mt-1">{s(deliverable.notes)}</p>
      )}

      {/* Review actions (only for pending deliverables) */}
      {isPending && (
        <div className="mt-2 space-y-2">
          {showRevisionInput ? (
            <div className="space-y-1.5">
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="What needs to change? Be specific..."
                rows={3}
                className="w-full text-xs border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <div className="flex gap-2">
                <button onClick={() => { onReview('revision_requested', revisionNotes); setShowRevisionInput(false); setRevisionNotes('') }} disabled={!revisionNotes.trim()} className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg disabled:opacity-40">Send revision notes</button>
                <button onClick={() => setShowRevisionInput(false)} className="text-[10px] text-ink-4">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => onReview('approved')} className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg hover:bg-emerald-200">Approve</button>
              <button onClick={() => setShowRevisionInput(true)} className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg hover:bg-amber-200">Request revision</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
