'use client'

import { useState } from 'react'
import { Target, X, Plus } from 'lucide-react'
import EditableSection from '@/components/content-engine/editable-section'
import { updateContentProfile } from '@/lib/content-engine/actions'
import type { ClientContext, TargetAudience, KeyPerson, FilmingLocation, Competitor } from '@/lib/content-engine/context'

interface Props {
  clientId: string
  context: ClientContext
  setContext: (ctx: ClientContext) => void
  toast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export default function ContentProfileSection({ clientId, context, setContext, toast }: Props) {
  // Draft state for edit mode
  const [audience, setAudience] = useState<TargetAudience>(context.targetAudience ?? {})
  const [offerings, setOfferings] = useState(context.offerings)
  const [pillars, setPillars] = useState(context.contentPillars)
  const [avoid, setAvoid] = useState(context.contentAvoid)
  const [hashtags, setHashtags] = useState(context.hashtagSets ?? { branded: [], community: [], location: [] })
  const [ctas, setCtas] = useState(context.ctaPreferences)
  const [people, setPeople] = useState(context.keyPeople)
  const [locations, setLocations] = useState(context.filmingLocations)
  const [competitors, setCompetitors] = useState(context.competitors)
  const [seasonal, setSeasonal] = useState(context.seasonalNotes ?? '')

  // Temp input states
  const [newOffering, setNewOffering] = useState('')
  const [newPillar, setNewPillar] = useState('')
  const [newAvoid, setNewAvoid] = useState('')
  const [newCta, setNewCta] = useState('')

  const resetDrafts = () => {
    setAudience(context.targetAudience ?? {})
    setOfferings(context.offerings)
    setPillars(context.contentPillars)
    setAvoid(context.contentAvoid)
    setHashtags(context.hashtagSets ?? { branded: [], community: [], location: [] })
    setCtas(context.ctaPreferences)
    setPeople(context.keyPeople)
    setLocations(context.filmingLocations)
    setCompetitors(context.competitors)
    setSeasonal(context.seasonalNotes ?? '')
  }

  const handleSave = async () => {
    const result = await updateContentProfile(clientId, {
      target_audience: audience,
      offerings: offerings,
      content_pillars: pillars,
      content_avoid: avoid,
      hashtag_sets: hashtags,
      cta_preferences: ctas,
      key_people: people,
      filming_locations: locations,
      competitors: competitors,
      seasonal_notes: seasonal || null,
    })
    if (result.success) {
      setContext({
        ...context,
        targetAudience: audience,
        offerings,
        contentPillars: pillars,
        contentAvoid: avoid,
        hashtagSets: hashtags,
        ctaPreferences: ctas,
        keyPeople: people,
        filmingLocations: locations,
        competitors,
        seasonalNotes: seasonal || null,
      })
      toast('Content profile saved', 'success')
    } else {
      toast(result.error ?? 'Failed to save', 'error')
      throw new Error('Save failed')
    }
  }

  const filledCount = [
    context.targetAudience, context.offerings.length, context.contentPillars.length,
    context.contentAvoid.length, context.ctaPreferences.length, context.keyPeople.length,
    context.filmingLocations.length, context.seasonalNotes,
  ].filter(Boolean).length

  return (
    <EditableSection
      title={`Content Profile (${filledCount}/8 sections filled)`}
      icon={<Target className="w-4 h-4 text-brand" />}
      onSave={handleSave}
      onCancel={resetDrafts}
      editContent={
        <div className="space-y-5">
          {/* Target Audience */}
          <FieldGroup label="Target Audience">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Age range" value={audience.age_range ?? ''} onChange={(v) => setAudience({ ...audience, age_range: v })} placeholder="e.g., 25-45" />
              <Input label="Lifestyle" value={audience.lifestyle ?? ''} onChange={(v) => setAudience({ ...audience, lifestyle: v })} placeholder="e.g., foodies, families" />
            </div>
            <TagInput label="Pain points" items={audience.pain_points ?? []} onChange={(v) => setAudience({ ...audience, pain_points: v })} placeholder="Add pain point..." />
          </FieldGroup>

          {/* Offerings */}
          <FieldGroup label="Products / Services / Menu Highlights">
            <TagInput items={offerings} onChange={setOfferings} placeholder="Add offering..." inputValue={newOffering} setInputValue={setNewOffering} />
          </FieldGroup>

          {/* Content Pillars */}
          <FieldGroup label="Content Pillars (3-5 themes)">
            <TagInput items={pillars} onChange={setPillars} placeholder="Add pillar..." inputValue={newPillar} setInputValue={setNewPillar} variant="brand" />
          </FieldGroup>

          {/* Content Avoid */}
          <FieldGroup label="Topics to Avoid">
            <TagInput items={avoid} onChange={setAvoid} placeholder="Add topic to avoid..." inputValue={newAvoid} setInputValue={setNewAvoid} variant="danger" />
          </FieldGroup>

          {/* Hashtag Sets */}
          <FieldGroup label="Hashtag Strategy">
            <div className="space-y-2">
              <HashtagRow label="Branded" items={hashtags.branded ?? []} onChange={(v) => setHashtags({ ...hashtags, branded: v })} placeholder="#YourBrand" />
              <HashtagRow label="Community" items={hashtags.community ?? []} onChange={(v) => setHashtags({ ...hashtags, community: v })} placeholder="#IndustryTag" />
              <HashtagRow label="Location" items={hashtags.location ?? []} onChange={(v) => setHashtags({ ...hashtags, location: v })} placeholder="#CityTag" />
            </div>
          </FieldGroup>

          {/* CTAs */}
          <FieldGroup label="Preferred CTAs">
            <TagInput items={ctas} onChange={setCtas} placeholder="Add CTA..." inputValue={newCta} setInputValue={setNewCta} />
          </FieldGroup>

          {/* Key People */}
          <FieldGroup label="Key People to Feature">
            <div className="space-y-2">
              {people.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-bg-2 rounded-lg p-2">
                  <input value={p.name} onChange={(e) => { const u = [...people]; u[i] = { ...u[i], name: e.target.value }; setPeople(u) }} placeholder="Name" className="text-sm border border-ink-6 rounded px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <input value={p.role} onChange={(e) => { const u = [...people]; u[i] = { ...u[i], role: e.target.value }; setPeople(u) }} placeholder="Role" className="text-sm border border-ink-6 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <label className="flex items-center gap-1 text-xs text-ink-3 whitespace-nowrap">
                    <input type="checkbox" checked={p.comfortable_on_camera ?? false} onChange={(e) => { const u = [...people]; u[i] = { ...u[i], comfortable_on_camera: e.target.checked }; setPeople(u) }} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
                    On camera
                  </label>
                  <button onClick={() => setPeople(people.filter((_, j) => j !== i))} className="text-ink-4 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={() => setPeople([...people, { name: '', role: '', comfortable_on_camera: false }])} className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand-dark">
                <Plus className="w-3 h-3" /> Add person
              </button>
            </div>
          </FieldGroup>

          {/* Filming Locations */}
          <FieldGroup label="Filming Locations">
            <div className="space-y-2">
              {locations.map((l, i) => (
                <div key={i} className="flex items-center gap-2 bg-bg-2 rounded-lg p-2">
                  <input value={l.name} onChange={(e) => { const u = [...locations]; u[i] = { ...u[i], name: e.target.value }; setLocations(u) }} placeholder="Location name" className="text-sm border border-ink-6 rounded px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <input value={l.notes ?? ''} onChange={(e) => { const u = [...locations]; u[i] = { ...u[i], notes: e.target.value }; setLocations(u) }} placeholder="Notes (lighting, noise, etc.)" className="text-sm border border-ink-6 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <button onClick={() => setLocations(locations.filter((_, j) => j !== i))} className="text-ink-4 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={() => setLocations([...locations, { name: '', notes: '' }])} className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand-dark">
                <Plus className="w-3 h-3" /> Add location
              </button>
            </div>
          </FieldGroup>

          {/* Competitors */}
          <FieldGroup label="Competitors">
            <div className="space-y-2">
              {competitors.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-bg-2 rounded-lg p-2">
                  <input value={c.name} onChange={(e) => { const u = [...competitors]; u[i] = { ...u[i], name: e.target.value }; setCompetitors(u) }} placeholder="Name" className="text-sm border border-ink-6 rounded px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <input value={c.notes ?? ''} onChange={(e) => { const u = [...competitors]; u[i] = { ...u[i], notes: e.target.value }; setCompetitors(u) }} placeholder="How we differentiate" className="text-sm border border-ink-6 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                  <button onClick={() => setCompetitors(competitors.filter((_, j) => j !== i))} className="text-ink-4 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={() => setCompetitors([...competitors, { name: '', notes: '' }])} className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand-dark">
                <Plus className="w-3 h-3" /> Add competitor
              </button>
            </div>
          </FieldGroup>

          {/* Seasonal Notes */}
          <FieldGroup label="Seasonal Business Notes">
            <textarea value={seasonal} onChange={(e) => setSeasonal(e.target.value)} rows={2} placeholder="When are busy/slow seasons? Any recurring events?" className="w-full text-sm border border-ink-6 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </FieldGroup>
        </div>
      }
    >
      {/* Display mode — compact summary */}
      <div className="space-y-3 text-sm text-ink-2">
        {context.targetAudience && (
          <p><strong className="text-ink-3">Audience:</strong> {context.targetAudience.lifestyle ?? context.targetAudience.age_range ?? 'Not set'}{context.targetAudience.pain_points?.length ? ` — pain points: ${context.targetAudience.pain_points.join(', ')}` : ''}</p>
        )}
        {context.offerings.length > 0 && (
          <p><strong className="text-ink-3">Offerings:</strong> {context.offerings.join(', ')}</p>
        )}
        {context.contentPillars.length > 0 && (
          <div>
            <strong className="text-ink-3">Content pillars:</strong>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {context.contentPillars.map((p, i) => (
                <span key={i} className="text-xs font-medium text-brand-dark bg-brand-tint px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          </div>
        )}
        {context.contentAvoid.length > 0 && (
          <p><strong className="text-ink-3">Avoid:</strong> {context.contentAvoid.join(', ')}</p>
        )}
        {context.ctaPreferences.length > 0 && (
          <p><strong className="text-ink-3">CTAs:</strong> {context.ctaPreferences.slice(0, 2).map((c) => `"${c}"`).join(', ')}{context.ctaPreferences.length > 2 ? ` +${context.ctaPreferences.length - 2} more` : ''}</p>
        )}
        {context.keyPeople.length > 0 && (
          <p><strong className="text-ink-3">People:</strong> {context.keyPeople.map((p) => `${p.name} (${p.role})`).join(', ')}</p>
        )}
        {context.seasonalNotes && (
          <p><strong className="text-ink-3">Seasonal:</strong> {context.seasonalNotes.slice(0, 120)}{context.seasonalNotes.length > 120 ? '...' : ''}</p>
        )}
        {filledCount === 0 && (
          <p className="text-ink-3 italic">No content profile set. Click Edit to fill in audience, offerings, content pillars, and more. This dramatically improves AI content quality.</p>
        )}
      </div>
    </EditableSection>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">{label}</label>
      {children}
    </div>
  )
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] text-ink-4 block mb-0.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
    </div>
  )
}

function TagInput({ label, items, onChange, placeholder, variant, inputValue, setInputValue }: {
  label?: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string
  variant?: 'brand' | 'danger'; inputValue?: string; setInputValue?: (v: string) => void
}) {
  const [localInput, setLocalInput] = useState('')
  const val = inputValue ?? localInput
  const setVal = setInputValue ?? setLocalInput

  const colors = variant === 'brand' ? 'bg-brand-tint text-brand-dark border-brand/20'
    : variant === 'danger' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-bg-2 text-ink-2 border-ink-6'

  return (
    <div>
      {label && <label className="text-[10px] text-ink-4 block mb-1">{label}</label>}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((item, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${colors}`}>
            {item}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && val.trim()) {
            onChange([...items, val.trim()])
            setVal('')
          }
        }}
        placeholder={placeholder}
        className="text-sm border border-ink-6 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />
    </div>
  )
}

function HashtagRow({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [val, setVal] = useState('')
  return (
    <div>
      <label className="text-[10px] text-ink-4 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-1">
        {items.map((h, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
            {h}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
          </span>
        ))}
      </div>
      <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onChange([...items, val.trim().startsWith('#') ? val.trim() : '#' + val.trim()]); setVal('') } }} placeholder={placeholder} className="text-xs border border-ink-6 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-brand/30" />
    </div>
  )
}
