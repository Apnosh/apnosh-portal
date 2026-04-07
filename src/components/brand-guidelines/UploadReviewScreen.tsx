'use client'

import { useState, useMemo } from 'react'
import { CheckSquare, Square, Check, X } from 'lucide-react'

// Section display config
const SECTION_CONFIG: Record<string, { label: string; order: number }> = {
  brand_overview: { label: 'Brand Overview', order: 1 },
  visual_identity: { label: 'Visual Identity', order: 2 },
  voice_and_tone: { label: 'Voice & Tone', order: 3 },
  audience_profile: { label: 'Audience Profile', order: 4 },
  competitive_positioning: { label: 'Competitive Positioning', order: 5 },
  content_guidelines: { label: 'Content Guidelines', order: 6 },
}

const FIELD_LABELS: Record<string, string> = {
  mission: 'Mission',
  story: 'Brand Story',
  what_we_do: 'What We Do',
  tagline: 'Tagline',
  primary_color: 'Primary Color',
  secondary_color: 'Secondary Color',
  accent_colors: 'Accent Colors',
  fonts: 'Fonts',
  logo_usage_notes: 'Logo Usage',
  imagery_style: 'Imagery Style',
  voice_words: 'Voice Words',
  tone_description: 'Tone Description',
  sample_phrases: 'Sample Phrases',
  sample_ctas: 'Sample CTAs',
  do_nots: 'Do Nots',
  persona: 'Ideal Customer Persona',
  age_range: 'Age Range',
  location: 'Location',
  pain_points: 'Pain Points',
  motivations: 'Motivations',
  where_they_hang_out: 'Where They Hang Out',
  positioning_statement: 'Positioning Statement',
  differentiators: 'Differentiators',
  competitor_awareness: 'Competitive Landscape',
  unique_value: 'Unique Value',
  topics: 'Topics to Cover',
  avoid_topics: 'Topics to Avoid',
  posting_frequency: 'Posting Frequency',
  best_platforms: 'Best Platforms',
  content_pillars: 'Content Pillars',
}

interface ExtractedField {
  section: string
  field: string
  value: unknown
  key: string // "section.field"
}

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    if (val.length === 0) return '(empty)'
    if (typeof val[0] === 'object') {
      // Voice words
      return val.map((v) => (v as { word: string }).word || JSON.stringify(v)).join(', ')
    }
    return val.join(', ')
  }
  if (typeof val === 'object' && val !== null) {
    return Object.entries(val as Record<string, string>)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  }
  return String(val)
}

interface Props {
  extractedData: Record<string, unknown>
  onConfirm: (confirmed: Record<string, unknown>) => void
  onCancel: () => void
}

export default function UploadReviewScreen({ extractedData, onConfirm, onCancel }: Props) {
  // Flatten extracted data into fields grouped by section
  const fields = useMemo(() => {
    const result: ExtractedField[] = []
    for (const [section, sectionData] of Object.entries(extractedData)) {
      if (section === 'extracted_sections') continue
      if (!SECTION_CONFIG[section]) continue
      if (typeof sectionData !== 'object' || sectionData === null) continue
      for (const [field, value] of Object.entries(sectionData as Record<string, unknown>)) {
        if (value === undefined || value === null || value === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        result.push({ section, field, value, key: `${section}.${field}` })
      }
    }
    return result.sort((a, b) => {
      const orderA = SECTION_CONFIG[a.section]?.order ?? 99
      const orderB = SECTION_CONFIG[b.section]?.order ?? 99
      return orderA - orderB
    })
  }, [extractedData])

  const [checked, setChecked] = useState<Set<string>>(() => new Set(fields.map(f => f.key)))

  const allChecked = checked.size === fields.length
  const noneChecked = checked.size === 0

  const toggleAll = () => {
    if (allChecked) {
      setChecked(new Set())
    } else {
      setChecked(new Set(fields.map(f => f.key)))
    }
  }

  const toggle = (key: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleConfirm = () => {
    // Build the confirmed data structure
    const confirmed: Record<string, Record<string, unknown>> = {}
    for (const f of fields) {
      if (!checked.has(f.key)) continue
      if (!confirmed[f.section]) confirmed[f.section] = {}
      confirmed[f.section][f.field] = f.value
    }
    onConfirm(confirmed)
  }

  // Group fields by section for display
  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedField[]>()
    for (const f of fields) {
      if (!map.has(f.section)) map.set(f.section, [])
      map.get(f.section)!.push(f)
    }
    return map
  }, [fields])

  if (fields.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-ink-3 mb-4">No data could be extracted from this PDF.</p>
        <button onClick={onCancel} className="text-sm text-brand-dark hover:underline">
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Review Extracted Data</h3>
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
        >
          {allChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {allChecked ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {Array.from(grouped.entries()).map(([section, sectionFields]) => (
          <div key={section}>
            <h4 className="text-xs font-semibold text-ink-4 uppercase tracking-wider mb-2">
              {SECTION_CONFIG[section]?.label || section}
            </h4>
            <div className="space-y-1.5">
              {sectionFields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggle(f.key)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    checked.has(f.key)
                      ? 'border-brand/30 bg-brand-tint/30'
                      : 'border-ink-6 bg-white hover:bg-bg-2'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {checked.has(f.key) ? (
                      <CheckSquare className="w-4 h-4 text-brand-dark" />
                    ) : (
                      <Square className="w-4 h-4 text-ink-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-ink">{FIELD_LABELS[f.field] || f.field}</div>
                    <div className="text-xs text-ink-3 mt-0.5 truncate">{formatValue(f.value)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-6">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={noneChecked}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-brand-dark rounded-lg hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
        >
          <Check className="w-3 h-3" /> Confirm & Save ({checked.size} field{checked.size !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  )
}
