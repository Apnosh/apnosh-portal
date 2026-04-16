'use client'

import { useState, useEffect, useCallback } from 'react'
import { Target, Megaphone, Settings2, Pencil, Save, X, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { syncBusinessToClientProfile } from '@/lib/crm-sync'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Business {
  id: string
  primary_goal: string | null
  goal_detail: string | null
  success_signs: string[] | null
  timeline: string | null
  content_likes: string[] | null
  brand_voice_words: string[] | null
  brand_tone: string | null
  ref_accounts: string | null
  avoid_list: string[] | null
  approval_type: string | null
  can_film: string[] | null
  can_tag: string | null
  main_offerings: string | null
  upcoming: string | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Chips({ items, color = 'brand' }: { items: string[] | null; color?: 'brand' | 'amber' | 'red' }) {
  if (!items?.length) return <span className="text-ink-4 text-sm italic">None selected</span>
  const styles = {
    brand: 'bg-brand-tint text-brand-dark',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className={`px-2.5 py-1 text-xs font-medium rounded-full ${styles[color]}`}>{t}</span>
      ))}
    </div>
  )
}

function SectionCard({ icon: Icon, title, subtitle, editing, onEdit, onCancel, onSave, saving, children }: {
  icon: typeof Target
  title: string
  subtitle: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-tint flex items-center justify-center">
            <Icon className="w-4 h-4 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            <p className="text-xs text-ink-4">{subtitle}</p>
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink rounded-lg">Cancel</button>
            <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
            </button>
          </div>
        ) : (
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-brand rounded-lg border border-ink-6 hover:border-brand/30 transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">{label}</dt>
      <dd className="text-sm text-ink">{value || <span className="text-ink-4 italic">Not set</span>}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function StrategyPage() {
  const supabase = createClient()
  const [biz, setBiz] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('businesses')
      .select('id, primary_goal, goal_detail, success_signs, timeline, content_likes, brand_voice_words, brand_tone, ref_accounts, avoid_list, approval_type, can_film, can_tag, main_offerings, upcoming')
      .eq('owner_id', user.id)
      .maybeSingle()
    setBiz(data as Business | null)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function startEdit(section: string, fields: Record<string, unknown>) {
    setEditingSection(section)
    setDraft(fields)
  }

  function cancelEdit() {
    setEditingSection(null)
    setDraft({})
  }

  async function saveSection() {
    if (!biz) return
    setSaving(true)
    const { error } = await supabase.from('businesses').update(draft).eq('id', biz.id)
    if (error) {
      setToast('Save failed')
      setSaving(false)
      return
    }
    // Sync to CRM
    syncBusinessToClientProfile(biz.id).catch(console.error)
    // Refresh
    const { data: fresh } = await supabase
      .from('businesses')
      .select('id, primary_goal, goal_detail, success_signs, timeline, content_likes, brand_voice_words, brand_tone, ref_accounts, avoid_list, approval_type, can_film, can_tag, main_offerings, upcoming')
      .eq('id', biz.id)
      .single()
    if (fresh) setBiz(fresh as Business)
    setSaving(false)
    setEditingSection(null)
    setToast('Saved')
    setTimeout(() => setToast(null), 2000)
  }

  if (loading) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-ink-6 rounded w-48" />
          <div className="h-40 bg-ink-6 rounded-xl" />
          <div className="h-40 bg-ink-6 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!biz) {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-16 text-center">
        <Sparkles className="w-8 h-8 text-brand mx-auto mb-3" />
        <p className="text-sm text-ink-3">Complete onboarding to see your strategy here.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[720px] mx-auto px-6 max-sm:px-4 pb-20">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-ink">My Strategy</h1>
        <p className="text-sm text-ink-4 mt-1">Your goals, content preferences, and workflow settings. These guide everything we create for you.</p>
      </div>

      <div className="space-y-5">
        {/* Goals */}
        <SectionCard
          icon={Target} title="Goals" subtitle="What you want to achieve"
          editing={editingSection === 'goals'} saving={saving}
          onEdit={() => startEdit('goals', {
            primary_goal: biz.primary_goal || '',
            goal_detail: biz.goal_detail || '',
            success_signs: biz.success_signs || [],
            timeline: biz.timeline || '',
          })}
          onCancel={cancelEdit} onSave={saveSection}
        >
          {editingSection === 'goals' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Main goal</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.primary_goal as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, primary_goal: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">More detail</label>
                <textarea rows={2} className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.goal_detail as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, goal_detail: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Timeline</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.timeline as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, timeline: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ReadField label="Main Goal" value={biz.primary_goal} />
              <ReadField label="Detail" value={biz.goal_detail} />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">How you'll know it's working</dt><Chips items={biz.success_signs} /></div>
              <ReadField label="Timeline" value={biz.timeline} />
            </div>
          )}
        </SectionCard>

        {/* Content Preferences */}
        <SectionCard
          icon={Megaphone} title="Content Preferences" subtitle="What kind of content works for your brand"
          editing={editingSection === 'content'} saving={saving}
          onEdit={() => startEdit('content', {
            brand_voice_words: biz.brand_voice_words || [],
            brand_tone: biz.brand_tone || '',
            content_likes: biz.content_likes || [],
            ref_accounts: biz.ref_accounts || '',
            avoid_list: biz.avoid_list || [],
            main_offerings: biz.main_offerings || '',
            upcoming: biz.upcoming || '',
          })}
          onCancel={cancelEdit} onSave={saveSection}
        >
          {editingSection === 'content' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">What to promote</label>
                <textarea rows={2} className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.main_offerings as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, main_offerings: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Coming up</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.upcoming as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, upcoming: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Custom tone notes</label>
                <textarea rows={2} className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.brand_tone as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, brand_tone: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Accounts you admire</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.ref_accounts as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, ref_accounts: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ReadField label="What to Promote" value={biz.main_offerings} />
              <ReadField label="Coming Up" value={biz.upcoming} />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Brand Voice</dt><Chips items={biz.brand_voice_words} /></div>
              <ReadField label="Tone Notes" value={biz.brand_tone} />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Content Types</dt><Chips items={biz.content_likes} /></div>
              <ReadField label="Accounts You Admire" value={biz.ref_accounts} />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Things to Avoid</dt><Chips items={biz.avoid_list} color="red" /></div>
            </div>
          )}
        </SectionCard>

        {/* Approval & Workflow */}
        <SectionCard
          icon={Settings2} title="Approval & Workflow" subtitle="How hands-on you want to be"
          editing={editingSection === 'workflow'} saving={saving}
          onEdit={() => startEdit('workflow', {
            approval_type: biz.approval_type || '',
            can_film: biz.can_film || [],
            can_tag: biz.can_tag || '',
          })}
          onCancel={cancelEdit} onSave={saveSection}
        >
          {editingSection === 'workflow' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Approval style</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.approval_type as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, approval_type: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-1 block">Can we tag @apnosh?</label>
                <input className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 outline-none" value={(draft.can_tag as string) || ''} onChange={(e) => setDraft((d) => ({ ...d, can_tag: e.target.value }))} placeholder="Yes / No" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ReadField label="Approval Style" value={biz.approval_type} />
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-1">Who can be on camera</dt><Chips items={biz.can_film} /></div>
              <ReadField label="Tag @apnosh" value={biz.can_tag} />
            </div>
          )}
        </SectionCard>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-ink text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg z-50 animate-[fadeUp_0.2s_ease]">
          {toast}
        </div>
      )}
    </div>
  )
}
