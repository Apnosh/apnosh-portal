'use client'

import { useState } from 'react'
import {
  BarChart3, Users, Clock, Star, Sparkles, Save, Loader2, Check, X,
  ChevronDown, ChevronUp, Calendar as CalIcon,
} from 'lucide-react'
import {
  updateClientGoals, updateClientVoiceNotes, updateCycleDeliverables,
  updateCycleEvents, updateCycleClientRequests, updateContentProfile,
} from '@/lib/content-engine/actions'
import { generateContentPlan } from '@/lib/content-engine/generate-content-plan'
import EditableSection from '@/components/content-engine/editable-section'
import type { ClientContext } from '@/lib/content-engine/context'
import ContentProfileSection from './content-profile-section'
import DefaultsSection from './defaults-section'

interface CycleData {
  id: string
  status: string
  strategy_notes: string | null
  deliverables: Record<string, unknown> | null
  context_snapshot: unknown
}

interface StrategyTabProps {
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
  currentMonth: string
  onGoToContentPlan: () => void
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
  toast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export default function StrategyTab({
  clientId, context, setContext, cycle, ensureCycle,
  strategyNotes, setStrategyNotes, saveStrategyNotes, savingNotes, notesSaved,
  currentMonth, onGoToContentPlan, onCycleCreated, onStatusChange, toast,
}: StrategyTabProps) {
  const [generating, setGenerating] = useState(false)
  const [genPhase, setGenPhase] = useState('')
  const [genError, setGenError] = useState<string | null>(null)

  // Editable state
  const [draftGoals, setDraftGoals] = useState(context.goals)
  const [draftVoice, setDraftVoice] = useState(context.voiceNotes ?? '')
  const [draftDeliverables, setDraftDeliverables] = useState(context.deliverables)
  const [customEvents, setCustomEvents] = useState<string[]>([])
  const [newEventText, setNewEventText] = useState('')
  const [clientRequests] = useState<Array<{ text: string; status: 'pending' | 'included' | 'skipped' }>>([])

  const allPlatforms = ['instagram', 'facebook', 'tiktok', 'linkedin']

  const resetProfileDrafts = () => { setDraftGoals(context.goals); setDraftVoice(context.voiceNotes ?? '') }
  const resetDeliverableDrafts = () => { setDraftDeliverables(context.deliverables) }

  const saveProfile = async () => {
    const r1 = await updateClientGoals(clientId, draftGoals)
    const r2 = await updateClientVoiceNotes(clientId, draftVoice)
    if (r1.success && r2.success) { setContext({ ...context, goals: draftGoals, voiceNotes: draftVoice }); toast('Profile updated', 'success') }
    else { toast(r1.error ?? r2.error ?? 'Failed', 'error'); throw new Error('Save failed') }
  }

  const saveDeliverables = async () => {
    if (cycle?.id) { const result = await updateCycleDeliverables(cycle.id, draftDeliverables); if (!result.success) { toast(result.error ?? 'Failed', 'error'); throw new Error('Save failed') } }
    setContext({ ...context, deliverables: draftDeliverables })
    toast('Deliverables updated', 'success')
  }

  const saveEvents = async () => {
    if (cycle?.id) await updateCycleEvents(cycle.id, customEvents)
    toast('Events updated', 'success')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    setGenPhase('Setting up...')

    try {
      const cycleId = await ensureCycle()
      setGenPhase('Generating calendar + briefs...')
      const result = await generateContentPlan(cycleId, clientId, context, strategyNotes, currentMonth)

      if (result.success) {
        onStatusChange('briefs_draft')
        toast(`Plan generated: ${result.calendarCount} items with briefs`, 'success')
        onGoToContentPlan()
      } else {
        setGenError(result.error ?? 'Generation failed')
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Unknown error')
    }

    setGenerating(false)
    setGenPhase('')
  }

  return (
    <div className="space-y-5">
      {/* Performance Highlights (read-only) */}
      <EditableSection title="Performance Highlights" icon={<BarChart3 className="w-4 h-4 text-brand" />} onSave={async () => {}} editContent={null}>
        {context.performance ? (
          <div className="text-sm text-ink-2 space-y-1.5">
            <p><strong>Reach trend:</strong> {context.performance.reachTrend}. <strong>Best days:</strong> {context.performance.bestDays.join(' & ')}. <strong>Follower growth:</strong> +{context.performance.followerGrowth} (60 days).</p>
            {context.performance.topPosts.length > 0 && (
              <p><strong>Top day:</strong> {context.performance.topPosts[0].date} reached {context.performance.topPosts[0].reach.toLocaleString()} people.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No performance data yet.</p>
        )}
      </EditableSection>

      {/* Client Profile (editable) */}
      <EditableSection title="Client Profile" icon={<Users className="w-4 h-4 text-brand" />} onSave={saveProfile} onCancel={resetProfileDrafts}
        editContent={
          <div className="space-y-4">
            <div className="text-sm text-ink-2"><strong>Business:</strong> {context.businessName} ({context.businessType ?? 'Unknown'}){context.location && <> &middot; {context.location}</>}</div>
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Goals</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draftGoals.map((g, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-brand-tint text-brand-dark text-xs font-medium px-2.5 py-1 rounded-full border border-brand/20">
                    {g}<button onClick={() => setDraftGoals(draftGoals.filter((_, j) => j !== i))} className="text-brand-dark/50 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <input placeholder="Add goal + Enter" className="text-sm border border-ink-6 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand/30" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { setDraftGoals([...draftGoals, e.currentTarget.value.trim()]); e.currentTarget.value = '' } }} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Brand Voice</label>
              <textarea value={draftVoice} onChange={(e) => setDraftVoice(e.target.value)} rows={3} placeholder="Describe tone and voice..." className="w-full text-sm border border-ink-6 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-ink-2"><strong>Business:</strong> {context.businessName} ({context.businessType ?? 'Unknown'}){context.location && <> &middot; {context.location}</>}</div>
          {context.goals.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1.5">Goals</label>
              <div className="flex flex-wrap gap-1.5">{context.goals.map((g, i) => (<span key={i} className="text-xs font-medium text-brand-dark bg-brand-tint px-2.5 py-1 rounded-full border border-brand/20">{g}</span>))}</div>
            </div>
          )}
          {context.voiceNotes && (<div><label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">Brand Voice</label><p className="text-sm text-ink-2">{context.voiceNotes}</p></div>)}
          {!context.goals.length && !context.voiceNotes && (<p className="text-sm text-ink-3 italic">No goals or voice notes set. Click Edit to add.</p>)}
        </div>
      </EditableSection>

      {/* Content Profile */}
      <ContentProfileSection clientId={clientId} context={context} setContext={setContext} toast={toast} />

      {/* Events */}
      <EditableSection title="Events This Month" icon={<CalIcon className="w-4 h-4 text-amber-500" />} onSave={saveEvents} onCancel={() => setNewEventText('')}
        editContent={
          <div className="space-y-3">
            {context.upcomingEvents.length > 0 && (<ul className="text-sm text-ink-2 space-y-1">{context.upcomingEvents.map((e, i) => (<li key={i} className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />{e}</li>))}</ul>)}
            <div>
              <label className="text-[10px] font-semibold text-ink-4 block mb-1.5">Custom events</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customEvents.map((e, i) => (<span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200">{e}<button onClick={() => setCustomEvents(customEvents.filter((_, j) => j !== i))} className="text-amber-600/50 hover:text-red-500"><X className="w-3 h-3" /></button></span>))}
              </div>
              <input value={newEventText} onChange={(e) => setNewEventText(e.target.value)} placeholder="Add event + Enter" className="text-sm border border-ink-6 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand/30" onKeyDown={(e) => { if (e.key === 'Enter' && newEventText.trim()) { setCustomEvents([...customEvents, newEventText.trim()]); setNewEventText('') } }} />
            </div>
          </div>
        }
      >
        <div className="space-y-1">
          {context.upcomingEvents.map((e, i) => (<div key={i} className="flex items-center gap-2 text-sm text-ink-2"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />{e}</div>))}
          {customEvents.map((e, i) => (<div key={`c-${i}`} className="flex items-center gap-2 text-sm text-brand-dark"><span className="w-1.5 h-1.5 bg-brand rounded-full" />{e}</div>))}
          {context.upcomingEvents.length === 0 && customEvents.length === 0 && (<p className="text-sm text-ink-3 italic">No events. Click Edit to add.</p>)}
        </div>
      </EditableSection>

      {/* Deliverables */}
      <EditableSection title="This Month's Deliverables" icon={<Sparkles className="w-4 h-4 text-brand" />} onSave={saveDeliverables} onCancel={resetDeliverableDrafts} collapsible={false} className="bg-brand-tint border-brand/20"
        editContent={
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[{ key: 'reels', label: 'Reels' }, { key: 'feed_posts', label: 'Feed Posts' }, { key: 'carousels', label: 'Carousels' }, { key: 'stories', label: 'Stories' }].map((d) => (
                <div key={d.key} className="bg-white/60 rounded-lg p-3 text-center">
                  <input type="number" min={0} max={50} value={(draftDeliverables as unknown as Record<string, number>)[d.key] ?? 0} onChange={(e) => setDraftDeliverables({ ...draftDeliverables, [d.key]: parseInt(e.target.value) || 0 })} className="w-14 text-center text-lg font-bold text-brand-dark bg-transparent border-b-2 border-brand/30 focus:border-brand focus:outline-none mx-auto block" />
                  <div className="text-[10px] font-medium text-brand-dark/70 mt-1">{d.label}</div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-brand-dark/70 block mb-1.5">Platforms</label>
              <div className="flex flex-wrap gap-2">
                {allPlatforms.map((p) => {
                  const active = draftDeliverables.platforms.includes(p)
                  return (<button key={p} onClick={() => setDraftDeliverables({ ...draftDeliverables, platforms: active ? draftDeliverables.platforms.filter((x) => x !== p) : [...draftDeliverables.platforms, p] })} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors capitalize ${active ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white/60 text-brand-dark/50 border-brand/20 hover:border-brand/40'}`}>{p}</button>)
                })}
              </div>
            </div>
          </div>
        }
      >
        <p className="text-sm text-brand-dark font-medium">
          {context.deliverables.reels} reels, {context.deliverables.feed_posts} feed posts, {context.deliverables.carousels} carousels, {context.deliverables.stories} stories
          {context.deliverables.platforms.length > 0 && ` \u2014 ${context.deliverables.platforms.join(', ')}`}
        </p>
      </EditableSection>

      {/* Content Defaults */}
      <DefaultsSection clientId={clientId} defaults={context.contentDefaults as never} onUpdate={(d) => setContext({ ...context, contentDefaults: d as unknown as Record<string, unknown> })} toast={toast} />

      {/* Content History (read-only) */}
      <EditableSection title={`Content History (${context.recentContent.length})`} icon={<Clock className="w-4 h-4 text-brand" />} defaultOpen={false} onSave={async () => {}} editContent={null}>
        {context.recentContent.length > 0 ? (
          <div className="space-y-1">{context.recentContent.slice(0, 15).map((c, i) => (<div key={i} className="flex items-center gap-2 text-xs text-ink-3"><span className="text-ink-4 w-20 flex-shrink-0">{c.date}</span><span className="px-1.5 py-0.5 bg-bg-2 rounded text-[10px] font-medium capitalize">{c.type.replace('_', ' ')}</span><span className="truncate">{c.title}</span></div>))}</div>
        ) : (<p className="text-sm text-ink-3">No recent content.</p>)}
      </EditableSection>

      {/* Templates (read-only) */}
      {context.templates.length > 0 && (
        <EditableSection title={`Proven Templates (${context.templates.length})`} icon={<Star className="w-4 h-4 text-brand" />} defaultOpen={false} onSave={async () => {}} editContent={null}>
          <div className="space-y-1">{context.templates.map((t, i) => (<div key={i} className="text-sm text-ink-2"><strong>{t.title}</strong> ({t.type.replace('_', ' ')}){t.performance && <span className="text-ink-3"> {t.performance}</span>}</div>))}</div>
        </EditableSection>
      )}

      {/* Strategy Notes */}
      <div className="bg-white rounded-xl border border-ink-6 p-4">
        <h3 className="text-sm font-bold text-ink mb-2">Strategy Notes</h3>
        <p className="text-xs text-ink-3 mb-3">Your direction for this month. The AI reads this before generating.</p>
        <textarea value={strategyNotes} onChange={(e) => setStrategyNotes(e.target.value)} rows={3} placeholder="Push brunch launch hard, lean into BTS content..." className="w-full text-sm text-ink rounded-lg border border-ink-6 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-ink-4">{strategyNotes.length} chars</span>
          <button onClick={saveStrategyNotes} disabled={savingNotes} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-white hover:bg-ink-2 transition-colors disabled:opacity-40">
            {notesSaved ? <><Check className="w-3 h-3" /> Saved</> : savingNotes ? 'Saving...' : <><Save className="w-3 h-3" /> Save</>}
          </button>
        </div>
      </div>

      {/* Generate Content Plan CTA */}
      {genError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600 mb-2">{genError}</p>
          <button onClick={handleGenerate} className="text-xs font-semibold text-red-700 hover:text-red-800">Try again</button>
        </div>
      )}
      {generating ? (
        <div className="bg-white border border-ink-6 rounded-xl p-6 text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-ink">{genPhase || 'Generating your content plan...'}</h3>
            <p className="text-xs text-ink-3 mt-1">The AI is reading your strategy, goals, and performance data to create a full month of content with production-ready briefs.</p>
          </div>
          <div className="flex justify-center gap-6 text-[10px] text-ink-4">
            <span>1. Creating calendar</span>
            <span>2. Writing hooks & scripts</span>
            <span>3. Building production briefs</span>
          </div>
          <p className="text-[10px] text-ink-4">This takes 30-60 seconds. Don't close this page.</p>
        </div>
      ) : !genError && (
        <button
          onClick={handleGenerate}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Generate Content Plan
        </button>
      )}
      {!generating && !genError && (
        <p className="text-[10px] text-ink-4 text-center -mt-2">Creates calendar + production briefs in one shot (30-60 seconds)</p>
      )}
    </div>
  )
}
