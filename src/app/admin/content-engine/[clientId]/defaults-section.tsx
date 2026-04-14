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
}

const ALL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
]

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

const GOALS = [
  { value: 'awareness', label: 'Awareness' }, { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' }, { value: 'community', label: 'Community' },
]

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
    if (result.success) {
      onUpdate(draft)
      toast('Defaults saved', 'success')
    } else {
      toast(result.error ?? 'Failed to save', 'error')
      throw new Error('Save failed')
    }
  }

  const togglePlatform = (p: string) => {
    const current = draft.default_platforms ?? []
    const updated = current.includes(p) ? current.filter((x) => x !== p) : [...current, p]
    setDraft({ ...draft, default_platforms: updated })
  }

  const setTime = (day: string, time: string) => {
    setDraft({ ...draft, default_times: { ...(draft.default_times ?? {}), [day]: time } })
  }

  // Format time display
  const formatTimes = (times: Record<string, string> | undefined) => {
    if (!times) return null
    const unique = new Set(Object.values(times))
    if (unique.size === 1) return `All days at ${[...unique][0]}`
    return DAYS.map((d) => `${d.label} ${times[d.key] ?? '10:00'}`).join(', ')
  }

  return (
    <EditableSection
      title="Content Defaults"
      icon={<Settings className="w-4 h-4 text-ink-3" />}
      onSave={handleSave}
      onCancel={resetDraft}
      defaultOpen={false}
      editContent={
        <div className="space-y-5">
          {/* Default platforms */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">
              Default Platforms
            </label>
            <p className="text-[10px] text-ink-4 mb-2">Generated calendar items will target these platforms. Each item can be adjusted individually.</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => {
                const active = (draft.default_platforms ?? []).includes(p.value)
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePlatform(p.value)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      active ? 'bg-ink text-white border-ink' : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Auto cross-post */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.auto_cross_post ?? false}
              onChange={(e) => setDraft({ ...draft, auto_cross_post: e.target.checked })}
              className="rounded border-ink-5 text-brand focus:ring-brand/30"
            />
            <span className="text-xs text-ink-2">Auto cross-post every item to all default platforms</span>
          </label>

          {/* Default posting times per day */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">
              Default Posting Times
            </label>
            <p className="text-[10px] text-ink-4 mb-2">AI will schedule posts at these times unless performance data suggests better times.</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => (
                <div key={d.key} className="text-center">
                  <label className="text-[10px] text-ink-4 block mb-1">{d.label}</label>
                  <input
                    type="time"
                    value={(draft.default_times ?? {})[d.key] ?? '10:00'}
                    onChange={(e) => setTime(d.key, e.target.value)}
                    className="w-full text-[11px] text-center border border-ink-6 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Default strategic goal */}
          <div>
            <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-2">
              Default Strategic Goal
            </label>
            <p className="text-[10px] text-ink-4 mb-2">Applied as the default goal for new items. AI will vary goals across the calendar for balance.</p>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setDraft({ ...draft, default_goal: g.value })}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    draft.default_goal === g.value ? 'bg-ink text-white border-ink' : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      }
    >
      {/* Display mode */}
      <div className="text-sm text-ink-2 space-y-1.5">
        {(defaults.default_platforms ?? []).length > 0 && (
          <p><strong className="text-ink-3">Platforms:</strong> {defaults.default_platforms.join(', ')}{defaults.auto_cross_post ? ' (auto cross-post)' : ''}</p>
        )}
        {defaults.default_goal && (
          <p><strong className="text-ink-3">Default goal:</strong> {defaults.default_goal}</p>
        )}
        {defaults.default_times && (
          <p><strong className="text-ink-3">Times:</strong> {formatTimes(defaults.default_times)}</p>
        )}
        {!(defaults.default_platforms ?? []).length && !defaults.default_goal && (
          <p className="text-ink-3 italic">No defaults set. Click Edit to configure default platforms, posting times, and goals.</p>
        )}
      </div>
    </EditableSection>
  )
}
