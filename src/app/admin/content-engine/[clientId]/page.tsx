'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Sparkles, BarChart3, FileText, Clock, Users,
  ChevronDown, ChevronUp, Save, Loader2, Check, Calendar as CalIcon,
  Zap, Star, BookOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { assembleClientContext, type ClientContext } from '@/lib/content-engine/context'
import CalendarView from './calendar-view'
import BriefsView from './briefs-view'
import ProductionView from './production-view'

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
  const [clientName, setClientName] = useState('')
  const [context, setContext] = useState<ClientContext | null>(null)
  const [cycle, setCycle] = useState<CycleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('context')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // Collapsible sections
  const [showPerformance, setShowPerformance] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

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
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Context Tab */}
      {activeTab === 'context' && context && (
        <div className="space-y-5">
          {/* Performance Highlights */}
          <CollapsibleSection
            title="Performance Highlights"
            icon={<BarChart3 className="w-4 h-4 text-brand" />}
            open={showPerformance}
            onToggle={() => setShowPerformance(!showPerformance)}
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
          </CollapsibleSection>

          {/* Client Profile */}
          <CollapsibleSection
            title="Client Profile"
            icon={<Users className="w-4 h-4 text-brand" />}
            open={showProfile}
            onToggle={() => setShowProfile(!showProfile)}
          >
            <div className="text-sm text-ink-2 space-y-2">
              <p><strong>Business:</strong> {context.businessName} ({context.businessType ?? 'Unknown type'})</p>
              {context.location && <p><strong>Location:</strong> {context.location}</p>}
              {context.goals.length > 0 && <p><strong>Goals:</strong> {context.goals.join(', ')}</p>}
              {context.voiceNotes && <p><strong>Voice:</strong> {context.voiceNotes}</p>}
              {context.brandGuidelines && (
                <details className="mt-2">
                  <summary className="text-xs text-ink-3 cursor-pointer">Full brand guidelines</summary>
                  <pre className="text-xs text-ink-3 mt-2 whitespace-pre-wrap bg-bg-2 p-3 rounded-lg max-h-48 overflow-y-auto">
                    {context.brandGuidelines}
                  </pre>
                </details>
              )}
            </div>
          </CollapsibleSection>

          {/* Content History */}
          <CollapsibleSection
            title={`Content History (${context.recentContent.length} items)`}
            icon={<Clock className="w-4 h-4 text-brand" />}
            open={showHistory}
            onToggle={() => setShowHistory(!showHistory)}
          >
            {context.recentContent.length > 0 ? (
              <div className="space-y-1">
                {context.recentContent.slice(0, 15).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-ink-3">
                    <span className="text-ink-4 w-20 flex-shrink-0">{c.date}</span>
                    <span className="px-1.5 py-0.5 bg-bg-2 rounded text-[10px] font-medium capitalize">
                      {c.type.replace('_', ' ')}
                    </span>
                    <span className="truncate">{c.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">No recent content.</p>
            )}
          </CollapsibleSection>

          {/* Templates */}
          {context.templates.length > 0 && (
            <CollapsibleSection
              title={`Proven Templates (${context.templates.length})`}
              icon={<Star className="w-4 h-4 text-brand" />}
              open={false}
              onToggle={() => {}}
            >
              <div className="space-y-1">
                {context.templates.map((t, i) => (
                  <div key={i} className="text-sm text-ink-2">
                    <strong>{t.title}</strong> ({t.type.replace('_', ' ')})
                    {t.performance && <span className="text-ink-3"> — {t.performance}</span>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Upcoming Events */}
          {context.upcomingEvents.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">
                Upcoming this month
              </h3>
              <ul className="text-sm text-amber-800 space-y-1">
                {context.upcomingEvents.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Deliverables */}
          <div className="bg-brand-tint rounded-xl p-4 border border-brand/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-dark mb-2">
              This month's deliverables
            </h3>
            <p className="text-sm text-brand-dark font-medium">
              {context.deliverables.reels} reels, {context.deliverables.feed_posts} feed posts,{' '}
              {context.deliverables.carousels} carousels, {context.deliverables.stories} stories
              {context.deliverables.platforms.length > 0 &&
                ` — ${context.deliverables.platforms.join(', ')}`}
            </p>
          </div>

          {/* Strategy Notes */}
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <h3 className="text-sm font-bold text-ink mb-2">Strategy Notes</h3>
            <p className="text-xs text-ink-3 mb-3">
              Your direction for this month's content. Included in AI generation context.
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
              setActiveTab('calendar')
            }}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Calendar
          </button>
        </div>
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
// Collapsible Section Component
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-4 text-left"
      >
        {icon}
        <span className="text-sm font-semibold text-ink flex-1">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-ink-4" /> : <ChevronDown className="w-4 h-4 text-ink-4" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
