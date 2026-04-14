'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Sparkles, Loader2, FileText, Lightbulb, Layers, Calendar as CalIcon, Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { assembleClientContext, type ClientContext } from '@/lib/content-engine/context'
import { useToast } from '@/components/ui/toast'
import BrainstormView from './brainstorm-view'
import ContentDetailsView from './content-details-view'
import ContentPlanView from './content-plan-view'
import ProductionView from './production-view'
import StrategyTab from './strategy-tab'

type WorkspaceTab = 'strategy' | 'brainstorm' | 'content-details' | 'content-calendar' | 'production'

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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('strategy')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )

  const currentMonth = selectedMonth

  // Reset state when month changes
  useEffect(() => {
    setCycle(null)
    setActiveTab('strategy')
    setStrategyNotes('')
    setLoading(true)
  }, [selectedMonth])

  const load = useCallback(async () => {
    const [ctx, { data: client }, { data: cycleRow }] = await Promise.all([
      assembleClientContext(clientId),
      supabase.from('clients').select('name').eq('id', clientId).maybeSingle(),
      supabase.from('content_cycles').select('*').eq('client_id', clientId).eq('month', currentMonth).maybeSingle(),
    ])

    setContext(ctx)
    setClientName(client?.name ?? '')

    if (cycleRow) {
      setCycle(cycleRow as CycleData)
      setStrategyNotes(cycleRow.strategy_notes ?? '')
      // Auto-select tab based on status
      const s = cycleRow.status as string
      if (['in_production', 'complete'].includes(s)) setActiveTab('production')
      else if (['calendar_draft'].includes(s)) setActiveTab('brainstorm')
      else if (['calendar_approved', 'briefs_draft'].includes(s)) setActiveTab('content-details')
      else if (['briefs_approved'].includes(s)) setActiveTab('content-calendar')
    }

    setLoading(false)
  }, [clientId, supabase, currentMonth])

  useEffect(() => { load() }, [load])

  const ensureCycle = async (): Promise<string> => {
    if (cycle?.id) return cycle.id
    const { data } = await supabase.from('content_cycles').insert({
      client_id: clientId, month: currentMonth, status: 'context_ready',
      deliverables: context?.deliverables ?? {}, context_snapshot: context, strategy_notes: strategyNotes || null,
    }).select().single()
    if (data) { setCycle(data as CycleData); return data.id }
    throw new Error('Failed to create content cycle')
  }

  const saveStrategyNotes = async () => {
    setSavingNotes(true)
    if (cycle?.id) {
      await supabase.from('content_cycles').update({ strategy_notes: strategyNotes, updated_at: new Date().toISOString() }).eq('id', cycle.id)
    }
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  }

  const monthLabel = new Date(currentMonth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const tabs: Array<{ key: WorkspaceTab; label: string; icon: typeof Sparkles }> = [
    { key: 'strategy', label: 'Strategy', icon: FileText },
    { key: 'brainstorm', label: 'Brainstorm', icon: Lightbulb },
    { key: 'content-details', label: 'Content Details', icon: Layers },
    { key: 'production', label: 'Team & Production', icon: Zap },
    { key: 'content-calendar', label: 'Content Calendar', icon: CalIcon },
  ]

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <Link href="/admin/content-engine" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
        <ArrowLeft className="w-4 h-4" /> Content Engine
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink">{clientName}</h1>
          <p className="text-sm text-ink-3 mt-0.5">{monthLabel}</p>
        </div>
        {cycle && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-ink-6 text-ink-3 capitalize">
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

      {/* Strategy Tab */}
      {activeTab === 'strategy' && context && (
        <StrategyTab
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
          currentMonth={currentMonth}
          onGoToContentPlan={() => setActiveTab('brainstorm')}
          onCycleCreated={(id) => setCycle((prev) => prev ? { ...prev, id } : { id, status: 'briefs_draft', strategy_notes: strategyNotes, deliverables: null, context_snapshot: null })}
          onStatusChange={(status) => setCycle((prev) => prev ? { ...prev, status } : null)}
          toast={toast}
        />
      )}

      {/* Brainstorm Tab */}
      {activeTab === 'brainstorm' && (
        <BrainstormView
          clientId={clientId}
          cycleId={cycle?.id ?? null}
          context={context}
          strategyNotes={strategyNotes}
          onStrategyNotesChange={setStrategyNotes}
          onSaveStrategyNotes={saveStrategyNotes}
          targetMonth={currentMonth}
          onMonthChange={setSelectedMonth}
          onCycleCreated={(id) => setCycle((prev) => prev ? { ...prev, id } : { id, status: 'calendar_draft', strategy_notes: strategyNotes, deliverables: null, context_snapshot: null })}
          onStatusChange={(status) => setCycle((prev) => prev ? { ...prev, status } : null)}
          onGoToContentPlan={() => setActiveTab('content-details')}
        />
      )}

      {/* Content Details Tab */}
      {activeTab === 'content-details' && cycle?.id && (
        <ContentDetailsView cycleId={cycle.id} clientId={clientId} context={context} onGoToProduction={() => setActiveTab('production')} />
      )}
      {activeTab === 'content-details' && !cycle?.id && (
        <div className="text-center py-16 text-sm text-ink-3">Generate ideas in the Brainstorm tab first.</div>
      )}

      {/* Content Calendar Tab */}
      {activeTab === 'content-calendar' && (
        <ContentPlanView
          clientId={clientId}
          cycleId={cycle?.id ?? null}
          context={context}
          strategyNotes={strategyNotes}
          targetMonth={currentMonth}
          onMonthChange={setSelectedMonth}
          onCycleCreated={(id) => setCycle((prev) => prev ? { ...prev, id } : { id, status: 'calendar_draft', strategy_notes: strategyNotes, deliverables: null, context_snapshot: null })}
          onStatusChange={(status) => setCycle((prev) => prev ? { ...prev, status } : null)}
        />
      )}

      {/* Team & Production Tab */}
      {activeTab === 'production' && cycle?.id && (
        <ProductionView cycleId={cycle.id} clientId={clientId} onGoToCalendar={() => setActiveTab('content-calendar')} />
      )}
      {activeTab === 'production' && !cycle?.id && (
        <div className="text-center py-16 text-sm text-ink-3">
          Generate a content plan first from the Strategy tab.
        </div>
      )}
    </div>
  )
}
