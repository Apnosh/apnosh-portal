'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import EditableSection from '@/components/content-engine/editable-section'
import { updateContentProfile } from '@/lib/content-engine/actions'

interface ContentDefaults {
  default_platforms: string[]
  default_times: Record<string, string>
  default_goal: string
  auto_cross_post: boolean
  // Design defaults
  default_mood: string
  default_color_preference: string
  default_include_logo: boolean
  default_colors_to_avoid: string
  default_styles_to_avoid: string
  default_placement: string
  // Reel defaults
  default_editing_style: string
  default_music_feel: string
  default_footage_source: string
}

const ALL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' }, { value: 'linkedin', label: 'LinkedIn' },
]
const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]
const GOALS = [
  { value: 'awareness', label: 'Awareness' }, { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' }, { value: 'community', label: 'Community' },
]
const MOODS = ['Bold & energetic', 'Clean & minimal', 'Warm & inviting', 'Professional', 'Playful', 'Luxury', 'Festive']
const COLORS = ['Use brand colors', 'Light & airy', 'Dark & bold', 'Seasonal']
const EDITING_STYLES = ['Fast cuts', 'Cinematic', 'Raw / authentic', 'Text-driven', 'Montage']
const MUSIC_FEELS = ['Upbeat & energetic', 'Chill & relaxed', 'Trending audio', 'Cinematic / epic', 'Acoustic / warm', 'Electronic / modern']
const FOOTAGE_SOURCES = ['We film it', 'Client provides', 'UGC style']

interface Props {
  clientId: string
  defaults: ContentDefaults
  onUpdate: (d: ContentDefaults) => void
  toast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export default function DefaultsSection({ clientId, defaults, onUpdate, toast }: Props) {
  const [draft, setDraft] = useState<ContentDefaults>(defaults)
  const resetDraft = () => setDraft(defaults)

  const handleSave = async () => {
    const result = await updateContentProfile(clientId, { content_defaults: draft })
    if (result.success) { onUpdate(draft); toast('Defaults saved', 'success') }
    else { toast(result.error ?? 'Failed', 'error'); throw new Error('Save failed') }
  }

  const togglePlatform = (p: string) => {
    const current = draft.default_platforms ?? []
    setDraft({ ...draft, default_platforms: current.includes(p) ? current.filter((x) => x !== p) : [...current, p] })
  }

  const setTime = (day: string, time: string) => {
    setDraft({ ...draft, default_times: { ...(draft.default_times ?? {}), [day]: time } })
  }

  const formatTimes = (times: Record<string, string> | undefined) => {
    if (!times) return null
    const unique = new Set(Object.values(times))
    if (unique.size === 1) return `All days at ${[...unique][0]}`
    return DAYS.map((d) => `${d.label} ${times[d.key] ?? '10:00'}`).join(', ')
  }

  const ChipRow = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${value === o ? 'bg-ink text-white border-ink' : 'border-ink-6 text-ink-3 hover:border-ink-5'}`}>{o}</button>
        ))}
      </div>
    </div>
  )

  return (
    <EditableSection
      title="Content Defaults"
      icon={<Settings className="w-4 h-4 text-ink-3" />}
      onSave={handleSave}
      onCancel={resetDraft}
      defaultOpen={false}
      editContent={
        <div className="space-y-5">
          {/* Platforms */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Default Platforms</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button key={p.value} onClick={() => togglePlatform(p.value)} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${(draft.default_platforms ?? []).includes(p.value) ? 'bg-ink text-white border-ink' : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={draft.auto_cross_post ?? false} onChange={(e) => setDraft({ ...draft, auto_cross_post: e.target.checked })} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
            <span className="text-xs text-ink-2">Auto cross-post to all default platforms</span>
          </label>

          {/* Times */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">Default Posting Times</label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => (
                <div key={d.key} className="text-center">
                  <label className="text-[10px] text-ink-4 block mb-1">{d.label}</label>
                  <input type="time" value={(draft.default_times ?? {})[d.key] ?? '10:00'} onChange={(e) => setTime(d.key, e.target.value)} className="w-full text-[11px] text-center border border-ink-6 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                </div>
              ))}
            </div>
          </div>

          {/* Goal */}
          <ChipRow label="Default Strategic Goal" options={GOALS.map((g) => g.label)} value={GOALS.find((g) => g.value === draft.default_goal)?.label ?? ''} onChange={(v) => setDraft({ ...draft, default_goal: GOALS.find((g) => g.label === v)?.value ?? v.toLowerCase() })} />

          {/* Design defaults */}
          <div className="border-t border-ink-6 pt-4">
            <h4 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-3">Design Defaults (Static Posts)</h4>
            <div className="space-y-4">
              <ChipRow label="Default Mood" options={MOODS} value={draft.default_mood ?? ''} onChange={(v) => setDraft({ ...draft, default_mood: v })} />
              <ChipRow label="Default Color Preference" options={COLORS} value={draft.default_color_preference ?? ''} onChange={(v) => setDraft({ ...draft, default_color_preference: v })} />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={draft.default_include_logo ?? true} onChange={(e) => setDraft({ ...draft, default_include_logo: e.target.checked })} className="rounded border-ink-5 text-brand focus:ring-brand/30" />
                <span className="text-xs text-ink-2">Include logo by default</span>
              </label>
              <div>
                <label className="text-[10px] text-ink-4 block mb-1">Colors to avoid (brand-wide)</label>
                <input value={draft.default_colors_to_avoid ?? ''} onChange={(e) => setDraft({ ...draft, default_colors_to_avoid: e.target.value })} placeholder="e.g., neon green, red" className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              <div>
                <label className="text-[10px] text-ink-4 block mb-1">Styles to avoid (brand-wide)</label>
                <input value={draft.default_styles_to_avoid ?? ''} onChange={(e) => setDraft({ ...draft, default_styles_to_avoid: e.target.value })} placeholder="e.g., clip art, cartoon" className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
            </div>
          </div>

          {/* Reel defaults */}
          <div className="border-t border-ink-6 pt-4">
            <h4 className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-3">Reel Defaults</h4>
            <div className="space-y-4">
              <ChipRow label="Default Editing Style" options={EDITING_STYLES} value={draft.default_editing_style ?? ''} onChange={(v) => setDraft({ ...draft, default_editing_style: v })} />
              <ChipRow label="Default Music Feel" options={MUSIC_FEELS} value={draft.default_music_feel ?? ''} onChange={(v) => setDraft({ ...draft, default_music_feel: v })} />
              <ChipRow label="Default Footage Source" options={FOOTAGE_SOURCES} value={draft.default_footage_source ?? ''} onChange={(v) => setDraft({ ...draft, default_footage_source: v })} />
            </div>
          </div>
        </div>
      }
    >
      {/* Display mode */}
      <div className="text-sm text-ink-2 space-y-1.5">
        {(defaults.default_platforms ?? []).length > 0 && <p><strong className="text-ink-3">Platforms:</strong> {defaults.default_platforms.join(', ')}</p>}
        {defaults.default_goal && <p><strong className="text-ink-3">Goal:</strong> {defaults.default_goal}</p>}
        {defaults.default_mood && <p><strong className="text-ink-3">Mood:</strong> {defaults.default_mood}</p>}
        {defaults.default_color_preference && <p><strong className="text-ink-3">Colors:</strong> {defaults.default_color_preference}</p>}
        {defaults.default_editing_style && <p><strong className="text-ink-3">Editing:</strong> {defaults.default_editing_style}</p>}
        {defaults.default_music_feel && <p><strong className="text-ink-3">Music:</strong> {defaults.default_music_feel}</p>}
        {defaults.default_times && <p><strong className="text-ink-3">Times:</strong> {formatTimes(defaults.default_times)}</p>}
        {!(defaults.default_platforms ?? []).length && !defaults.default_mood && <p className="text-ink-3 italic">No defaults set. Click Edit to configure.</p>}
      </div>
    </EditableSection>
  )
}
