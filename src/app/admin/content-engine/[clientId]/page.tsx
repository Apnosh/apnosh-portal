'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Sparkles, BarChart3, FileText, Clock, Users,
  ChevronDown, ChevronUp, Save, Loader2, Check, Calendar as CalIcon,
  Zap, Star, BookOpen, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { assembleClientContext, type ClientContext } from '@/lib/content-engine/context'
import {
  updateClientGoals, updateClientVoiceNotes, updateCycleDeliverables,
  updateCycleEvents, updateCycleClientRequests, updateContentProfile,
} from '@/lib/content-engine/actions'
import EditableSection from '@/components/content-engine/editable-section'
import { useToast } from '@/components/ui/toast'
import CalendarView from './calendar-view'
import BriefsView from './briefs-view'
import ProductionView from './production-view'
import ContentProfileSection from './content-profile-section'
import DefaultsSection from './defaults-section'

type WorkspaceTab = 'context' | 'calendar' | 'briefs' | 'production'

interface CycleData {
  id: string
  status: string
  strategy_notes: string | null
  deliverables: Record<string, unknown> | null
  context_snapshot: unknown
}

export default function ContentEngineWorkspace({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = use(params)
  const supabase = createClient()
  const { toast } = useToast()
  const [clientName, setClientName] = useState('')
  const [context, setContext] = useState<ClientContext | null>(null)
  const [cycle, setCycle] = useState<CycleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('context')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]

  const load = useCallback(async () => {
    const [ctx, { data: client }, { data: cycleRow }] = await Promise.all([
      assembleClientContext(clientId),
      supabase.from('clients').select('name').eq('id', clientId).maybeSingle(),
      supabase
        .from('content_cycles')
        .select('*')
        .eq('client_id', clientId)
        .eq('month', currentMonth)
        .maybeSingle(),
    ])

    setContext(ctx)
    setClientName(client?.name ?? '')

    if (cycleRow) {
      setCycle(cycleRow as CycleData)
      setStrategyNotes(cycleRow.strategy_notes ?? '')
      // Auto-select the right tab based on status
      const s = cycleRow.status as string
      if (s === 'briefs_approved' || s === 'in_production' || s === 'complete') {
        setActiveTab('production')
      } else if (s === 'briefs_draft') {
        setActiveTab('briefs')
      } else if (s === 'calendar_draft' || s === 'calendar_approved') {
        setActiveTab('calendar')
      }
    }

    setLoading(false)
  }, [clientId, supabase, currentMonth])

  useEffect(() => { load() }, [load])

  const ensureCycle = async (): Promise<string> => {
    if (cycle?.id) return cycle.id
    const { data } = await supabase
      .from('content_cycles')
      .insert({
        client_id: clientId,
        month: currentMonth,
        status: 'context_ready',
        deliverables: context?.deliverables ?? {},
        context_snapshot: context,
        strategy_notes: strategyNotes || null,
      })
      .select()
      .single()
    if (data) {
      setCycle(data as CycleData)
      return data.id
    }
    throw new Error('Failed to create content cycle')
  }

  const saveStrategyNotes = async () => {
    setSavingNotes(true)
    if (cycle?.id) {
      await supabase
        .from('content_cycles')
        .update({ strategy_notes: strategyNotes, updated_at: new Date().toISOString() })
        .eq('id', cycle.id)
    }
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-ink-4" />
      </div>
    )
  }

  const monthLabel = new Date(currentMonth + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const tabs: Array<{ key: WorkspaceTab; label: string; icon: typeof Sparkles }> = [
    { key: 'context', label: 'Context', icon: FileText },
    { key: 'calendar', label: 'Calendar', icon: CalIcon },
    { key: 'briefs', label: 'Briefs', icon: BookOpen },
    { key: 'production', label: 'Production', icon: Zap },
  ]

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <Link
        href="/admin/content-engine"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Content Engine
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink">{clientName}</h1>
          <p className="text-sm text-ink-3">{monthLabel} content plan</p>
        </div>
        {cycle && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-ink-6 text-ink-3">
            {cycle.status.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-6 mb-6">
        {tabs.map((tab) => {
          const isCalendarApproved = cycle && ['calendar_approved', 'briefs_draft', 'briefs_approved', 'in_production', 'complete'].includes(cycle.status)
          const isBriefsApproved = cycle && ['briefs_approved', 'in_production', 'complete'].includes(cycle.status)
          const disabled =
            (tab.key === 'briefs' && !isCalendarApproved) ||
            (tab.key === 'production' && !isBriefsApproved)

          return (
            <button
              key={tab.key}
              onClick={() => !disabled && setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-ink text-ink'
                  : disabled
                    ? 'border-transparent text-ink-4 opacity-50 cursor-not-allowed'
                    : 'border-transparent text-ink-3 hover:text-ink-2'
              }`}
              title={disabled ? (tab.key === 'briefs' ? 'Approve calendar first' : 'Approve briefs first') : undefined}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab prerequisite warnings */}
      {activeTab === 'briefs' && cycle && !['calendar_approved', 'briefs_draft', 'briefs_approved', 'in_production', 'complete'].includes(cycle.status) && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <span className="text-amber-600 text-sm">Approve your calendar first to generate briefs.</span>
        </div>
      )}
      {activeTab === 'production' && cycle && !['briefs_approved', 'in_production', 'complete'].includes(cycle.status) && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          <span className="text-amber-600 text-sm">Approve briefs first to see production packages.</span>
        </div>
      )}

      {/* Context Tab */}
      {activeTab === 'context' && context && (
        <ContextTab
          clientId={clientId}
          context={context}
          setContext={setContext}
          cycle={cycle}
          ensureCycle={ensureCycle}
          strategyNotes={strategyNotes}
          setStrategyNotes={setStrategyNotes}
          saveStrategyNotes={saveStrategyNotes}
          savingNotes={savingNotes}
          notesSaved={notesSaved}
          onGoToCalendar={() => setActiveTab('calendar')}
          toast={toast}
        />
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <CalendarView
          clientId={clientId}
          cycleId={cycle?.id ?? null}
          context={context}
          strategyNotes={strategyNotes}
          onCycleCreated={(id) => setCycle((prev) => prev ? { ...prev, id } : { id, status: 'calendar_draft', strategy_notes: strategyNotes, deliverables: null, context_snapshot: null })}
          onStatusChange={(status) => setCycle((prev) => prev ? { ...prev, status } : null)}
        />
      )}

      {/* Briefs Tab */}
      {activeTab === 'briefs' && cycle?.id && (
        <BriefsView
          cycleId={cycle.id}
          clientId={clientId}
          context={context}
          onStatusChange={(status) => setCycle((prev) => prev ? { ...prev, status } : null)}
        />
      )}

      {/* Production Tab */}
      {activeTab === 'production' && cycle?.id && (
        <ProductionView cycleId={cycle.id} clientId={clientId} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context Tab — Editable
// ---------------------------------------------------------------------------

function ContextTab({
  clientId, context, setContext, cycle, ensureCycle,
  strategyNotes, setStrategyNotes, saveStrategyNotes, savingNotes, notesSaved,
  onGoToCalendar, toast,
}: {
  clientId: string
  context: ClientContext
  setContext: (ctx: ClientContext) => void
  cycle: CycleData | null
  ensureCycle: () => Promise<string>
  strategyNotes: string
  setStrategyNotes: (s: string) => void
  saveStrategyNotes: () => Promise<void>
  savingNotes: boolean
  notesSaved: boolean
  onGoToCalendar: () => void
  toast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  // Edit-mode draft state (only applied on Save, reverted on Cancel)
  const [draftGoals, setDraftGoals] = useState(context.goals)
  const [draftVoice, setDraftVoice] = useState(context.voiceNotes ?? '')
  const [draftDeliverables, setDraftDeliverables] = useState(context.deliverables)
  const [customEvents, setCustomEvents] = useState<string[]>([])
  const [newEventText, setNewEventText] = useState('')
  const [clientRequests, setClientRequests] = useState<Array<{ text: string; status: 'pending' | 'included' | 'skipped' }>>(
    () => {
      const raw = (cycle?.deliverables as Record<string, unknown>)?.clientRequests
      if (!Array.isArray(raw)) return []
      return raw.map((r: Record<string, unknown>) => ({
        text: String(r.text ?? ''),
        status: (r.status === 'included' || r.status === 'skipped' ? r.status : 'pending') as 'pending' | 'included' | 'skipped',
      }))
    }
  )

  const allPlatforms = ['instagram', 'facebook', 'tiktok', 'linkedin']

  // Reset drafts to current context (for Cancel)
  const resetProfileDrafts = () => {
    setDraftGoals(context.goals)
    setDraftVoice(context.voiceNotes ?? '')
  }

  const resetDeliverableDrafts = () => {
    setDraftDeliverables(context.deliverables)
  }

  // Save handlers
  const saveProfile = async () => {
    const r1 = await updateClientGoals(clientId, draftGoals)
    const r2 = await updateClientVoiceNotes(clientId, draftVoice)
    if (r1.success && r2.success) {
      setContext({ ...context, goals: draftGoals, voiceNotes: draftVoice })
      toast('Profile updated', 'success')
    } else {
      toast(r1.error ?? r2.error ?? 'Failed to save', 'error')
      throw new Error('Save failed')
    }
  }

  const saveDeliverables = async () => {
    if (cycle?.id) {
      const result = await updateCycleDeliverables(cycle.id, draftDeliverables)
      if (!result.success) { toast(result.error ?? 'Failed to save', 'error'); throw new Error('Save failed') }
    }
    setContext({ ...context, deliverables: draftDeliverables })
    toast('Deliverables updated', 'success')
  }

  const saveEvents = async () => {
    if (cycle?.id) {
      await updateCycleEvents(cycle.id, customEvents)
    }
    toast('Events updated', 'success')
  }

  const handleRequestAction = async (idx: number, status: 'included' | 'skipped') => {
    const updated = [...clientRequests]
    updated[idx] = { ...updated[idx], status }
    setClientRequests(updated)
    if (cycle?.id) {
      await updateCycleClientRequests(cycle.id, updated)
    }
    toast(status === 'included' ? 'Request will be included' : 'Request skipped', 'success')
  }

  return (
    <div className="space-y-5">
      {/* Performance Highlights (read-only, no Edit button) */}
      <EditableSection
        title="Performance Highlights"
        icon={<BarChart3 className="w-4 h-4 text-brand" />}
        onSave={async () => {}}
        editContent={null}
      >
        {context.performance ? (
          <div className="text-sm text-ink-2 space-y-1.5">
            <p>
              <strong>Reach trend:</strong> {context.performance.reachTrend}.{' '}
              <strong>Best days:</strong> {context.performance.bestDays.join(' & ')}.{' '}
              <strong>Follower growth:</strong> +{context.performance.followerGrowth} (60 days).
            </p>
            {context.performance.topPosts.length > 0 && (
              <p>
                <strong>Top day:</strong> {context.performance.topPosts[0].date} reached{' '}
                {context.performance.topPosts[0].reach.toLocaleString()} people.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No performance data yet.</p>
        )}
      </EditableSection>

      {/* Client Profile — Edit shows goals + voice form */}
      <EditableSection
        title="Client Profile"
        icon={<Users className="w-4 h-4 text-brand" />}
        onSave={saveProfile}
        onCancel={resetProfileDrafts}
        editContent={
          <div className="space-y-4">
            <div className="text-sm text-ink-2">
              <strong>Business:</strong> {context.businessName} ({context.businessType ?? 'Unknown type'})
              {context.location && <> &middot; {context.location}</>}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Goals</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draftGoals.map((g, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-brand-tint text-brand-dark text-xs font-medium px-2.5 py-1 rounded-full border border-brand/20">
                    {g}
                    <button onClick={() => setDraftGoals(draftGoals.filter((_, j) => j !== i))} className="text-brand-dark/50 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                placeholder="Add a goal and press Enter..."
                className="text-sm border border-ink-6 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    setDraftGoals([...draftGoals, e.currentTarget.value.trim()])
                    e.currentTarget.value = ''
                  }
                }}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Brand Voice</label>
              <textarea
                value={draftVoice}
                onChange={(e) => setDraftVoice(e.target.value)}
                rows={3}
                placeholder="Describe the brand's tone and voice..."
                className="w-full text-sm border border-ink-6 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
          </div>
        }
      >
        {/* Display mode */}
        <div className="space-y-3">
          <div className="text-sm text-ink-2">
            <strong>Business:</strong> {context.businessName} ({context.businessType ?? 'Unknown type'})
            {context.location && <> &middot; {context.location}</>}
          </div>
          {context.goals.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Goals</label>
              <div className="flex flex-wrap gap-1.5">
                {context.goals.map((g, i) => (
                  <span key={i} className="text-xs font-medium text-brand-dark bg-brand-tint px-2.5 py-1 rounded-full border border-brand/20">{g}</span>
                ))}
              </div>
            </div>
          )}
          {context.voiceNotes && (
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Brand Voice</label>
              <p className="text-sm text-ink-2">{context.voiceNotes}</p>
            </div>
          )}
          {!context.goals.length && !context.voiceNotes && (
            <p className="text-sm text-ink-3 italic">No goals or voice notes set. Click Edit to add them.</p>
          )}
        </div>
      </EditableSection>

      {/* Content Profile — the big one with all strategy fields */}
      <ContentProfileSection clientId={clientId} context={context} setContext={setContext} toast={toast} />

      {/* Client Requests (actionable — no Edit button, always interactive) */}
      {clientRequests.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">
            Client Requests ({clientRequests.filter((r) => r.status === 'pending').length} pending)
          </h3>
          <div className="space-y-2">
            {clientRequests.map((req, i) => (
              <div key={i} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-200">
                <p className="text-sm text-ink flex-1">{req.text}</p>
                {req.status === 'pending' ? (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => handleRequestAction(i, 'included')} className="text-[10px] font-semibold text-brand bg-brand-tint px-2.5 py-1 rounded-md hover:bg-brand/10 transition-colors">Include</button>
                    <button onClick={() => handleRequestAction(i, 'skipped')} className="text-[10px] font-semibold text-ink-3 bg-bg-2 px-2.5 py-1 rounded-md hover:bg-ink-6 transition-colors">Skip</button>
                  </div>
                ) : (
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md ${req.status === 'included' ? 'text-brand bg-brand-tint' : 'text-ink-4 bg-bg-2 line-through'}`}>
                    {req.status === 'included' ? 'Included' : 'Skipped'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events — Edit shows add/remove interface */}
      <EditableSection
        title="Events This Month"
        icon={<CalIcon className="w-4 h-4 text-amber-500" />}
        onSave={saveEvents}
        onCancel={() => setNewEventText('')}
        editContent={
          <div className="space-y-3">
            {context.upcomingEvents.length > 0 && (
              <div>
                <label className="text-[10px] font-semibold text-ink-4 block mb-1">Auto-detected holidays</label>
                <ul className="text-sm text-ink-2 space-y-1">
                  {context.upcomingEvents.map((e, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <label className="text-[10px] font-semibold text-ink-4 block mb-1.5">Custom events</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customEvents.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200">
                    {e}
                    <button onClick={() => setCustomEvents(customEvents.filter((_, j) => j !== i))} className="text-amber-600/50 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={newEventText}
                onChange={(e) => setNewEventText(e.target.value)}
                placeholder="Add event (e.g., Spring menu launch) and press Enter"
                className="text-sm border border-ink-6 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEventText.trim()) {
                    setCustomEvents([...customEvents, newEventText.trim()])
                    setNewEventText('')
                  }
                }}
              />
            </div>
          </div>
        }
      >
        {/* Display mode */}
        <div className="space-y-1">
          {context.upcomingEvents.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-ink-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
              {e}
            </div>
          ))}
          {customEvents.map((e, i) => (
            <div key={`c-${i}`} className="flex items-center gap-2 text-sm text-brand-dark">
              <span className="w-1.5 h-1.5 bg-brand rounded-full flex-shrink-0" />
              {e}
            </div>
          ))}
          {context.upcomingEvents.length === 0 && customEvents.length === 0 && (
            <p className="text-sm text-ink-3 italic">No events. Click Edit to add custom events.</p>
          )}
        </div>
      </EditableSection>

      {/* Deliverables — Edit shows number inputs + platform toggles */}
      <EditableSection
        title="This Month's Deliverables"
        icon={<Sparkles className="w-4 h-4 text-brand" />}
        onSave={saveDeliverables}
        onCancel={resetDeliverableDrafts}
        collapsible={false}
        className="bg-brand-tint border-brand/20"
        editContent={
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'reels', label: 'Reels' },
                { key: 'feed_posts', label: 'Feed Posts' },
                { key: 'carousels', label: 'Carousels' },
                { key: 'stories', label: 'Stories' },
              ].map((d) => (
                <div key={d.key} className="bg-white/60 rounded-lg p-3 text-center">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={(draftDeliverables as unknown as Record<string, number>)[d.key] ?? 0}
                    onChange={(e) => setDraftDeliverables({ ...draftDeliverables, [d.key]: parseInt(e.target.value) || 0 })}
                    className="w-14 text-center text-lg font-bold text-brand-dark bg-transparent border-b-2 border-brand/30 focus:border-brand focus:outline-none mx-auto block"
                  />
                  <div className="text-[10px] font-medium text-brand-dark/70 mt-1">{d.label}</div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-brand-dark/70 block mb-1.5">Platforms</label>
              <div className="flex flex-wrap gap-2">
                {allPlatforms.map((p) => {
                  const active = draftDeliverables.platforms.includes(p)
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        const updated = active
                          ? draftDeliverables.platforms.filter((x) => x !== p)
                          : [...draftDeliverables.platforms, p]
                        setDraftDeliverables({ ...draftDeliverables, platforms: updated })
                      }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors capitalize ${
                        active ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white/60 text-brand-dark/50 border-brand/20 hover:border-brand/40'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        }
      >
        {/* Display mode */}
        <p className="text-sm text-brand-dark font-medium">
          {context.deliverables.reels} reels, {context.deliverables.feed_posts} feed posts,{' '}
          {context.deliverables.carousels} carousels, {context.deliverables.stories} stories
          {context.deliverables.platforms.length > 0 && ` \u2014 ${context.deliverables.platforms.join(', ')}`}
        </p>
      </EditableSection>

      {/* Content History (read-only, no Edit button) */}
      <EditableSection
        title={`Content History (${context.recentContent.length} items)`}
        icon={<Clock className="w-4 h-4 text-brand" />}
        defaultOpen={false}
        onSave={async () => {}}
        editContent={null}
      >
        {context.recentContent.length > 0 ? (
          <div className="space-y-1">
            {context.recentContent.slice(0, 15).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-ink-3">
                <span className="text-ink-4 w-20 flex-shrink-0">{c.date}</span>
                <span className="px-1.5 py-0.5 bg-bg-2 rounded text-[10px] font-medium capitalize">{c.type.replace('_', ' ')}</span>
                <span className="truncate">{c.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No recent content.</p>
        )}
      </EditableSection>

      {/* Templates (read-only, no Edit button) */}
      {context.templates.length > 0 && (
        <EditableSection
          title={`Proven Templates (${context.templates.length})`}
          icon={<Star className="w-4 h-4 text-brand" />}
          defaultOpen={false}
          onSave={async () => {}}
          editContent={null}
        >
          <div className="space-y-1">
            {context.templates.map((t, i) => (
              <div key={i} className="text-sm text-ink-2">
                <strong>{t.title}</strong> ({t.type.replace('_', ' ')})
                {t.performance && <span className="text-ink-3"> {t.performance}</span>}
              </div>
            ))}
          </div>
        </EditableSection>
      )}

      {/* Content Defaults */}
      <DefaultsSection
        clientId={clientId}
        defaults={context.contentDefaults as never}
        onUpdate={(d) => setContext({ ...context, contentDefaults: d as unknown as Record<string, unknown> })}
        toast={toast}
      />

      {/* Strategy Notes — always editable (no Edit button, direct textarea) */}
      <div className="bg-white rounded-xl border border-ink-6 p-4">
        <h3 className="text-sm font-bold text-ink mb-2">Strategy Notes</h3>
        <p className="text-xs text-ink-3 mb-3">
          Your direction for this month. The AI reads this before generating.
        </p>
        <textarea
          value={strategyNotes}
          onChange={(e) => setStrategyNotes(e.target.value)}
          rows={3}
          placeholder="Push brunch launch hard, lean into BTS content, avoid promotional tone..."
          className="w-full text-sm text-ink rounded-lg border border-ink-6 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-ink-4">{strategyNotes.length} characters</span>
          <button
            onClick={saveStrategyNotes}
            disabled={savingNotes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-white hover:bg-ink-2 transition-colors disabled:opacity-40"
          >
            {notesSaved ? <><Check className="w-3 h-3" /> Saved</> : savingNotes ? 'Saving...' : <><Save className="w-3 h-3" /> Save</>}
          </button>
        </div>
      </div>

      {/* Generate Calendar CTA */}
      <button
        onClick={async () => {
          await ensureCycle()
          onGoToCalendar()
        }}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Generate Calendar
      </button>
    </div>
  )
}
