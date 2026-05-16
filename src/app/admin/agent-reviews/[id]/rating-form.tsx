'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Star } from 'lucide-react'
import { submitStrategistRating } from '@/lib/admin/agent-reviews'

const TAG_OPTIONS = [
  'on_brand', 'off_brand',
  'great_tool_choice', 'wrong_tool',
  'specific', 'too_generic',
  'good_escalation', 'should_have_escalated',
  'hallucination', 'fabricated_data',
  'great_recovery', 'lost_context',
] as const

interface InitialRating {
  overall: number
  notes: string
  tags: string[]
}

export default function RatingForm({
  conversationId, initial, alreadyRated,
}: {
  conversationId: string
  initial: InitialRating | null
  alreadyRated: boolean
}) {
  const router = useRouter()
  const [intent, setIntent] = useState<number>(0)
  const [tool, setTool] = useState<number>(0)
  const [brand, setBrand] = useState<number>(0)
  const [escalation, setEscalation] = useState<number>(0)
  const [overall, setOverall] = useState<number>(initial?.overall ?? 0)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [notes, setNotes] = useState<string>(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (overall === 0) {
      setError('Overall rating is required')
      return
    }
    setSaving(true)
    setError(null)
    const res = await submitStrategistRating({
      conversationId,
      understoodIntent: intent || undefined,
      pickedRightTool: tool || undefined,
      outputOnBrand: brand || undefined,
      escalatedAppropriately: escalation || undefined,
      overall,
      tags,
      notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (res.success) {
      setSaved(true)
      setTimeout(() => router.refresh(), 500)
    } else {
      setError(res.error)
    }
  }

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <h2 className="text-sm font-semibold text-ink mb-3">
        {alreadyRated ? 'Update your rating' : 'Rate this conversation'}
      </h2>
      {alreadyRated && (
        <div className="mb-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
          You&apos;ve already rated this. Save again to overwrite.
        </div>
      )}

      <div className="space-y-3.5">
        <ScaleRow label="Understood intent" value={intent} onChange={setIntent} />
        <ScaleRow label="Picked right tool" value={tool} onChange={setTool} />
        <ScaleRow label="Output on brand" value={brand} onChange={setBrand} />
        <ScaleRow label="Escalated appropriately" value={escalation} onChange={setEscalation} />
        <ScaleRow label="Overall *" value={overall} onChange={setOverall} required />

        <div>
          <div className="text-[11px] font-medium text-ink-3 mb-1.5">Tags</div>
          <div className="flex flex-wrap gap-1">
            {TAG_OPTIONS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={[
                  'text-[10.5px] font-medium px-2 py-0.5 rounded-full border',
                  tags.includes(t)
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-ink-3 border-ink-6 hover:bg-bg-2',
                ].join(' ')}
              >
                {t.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-3 mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="What stood out? Any prompt tweaks we should consider?"
            className="w-full px-2.5 py-1.5 rounded-lg border border-ink-6 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>

        {error && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || saved}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <CheckCircle2 className="w-3.5 h-3.5" />
            : null}
          {saving ? 'Saving...' : saved ? 'Saved' : alreadyRated ? 'Update rating' : 'Submit rating'}
        </button>
      </div>
    </div>
  )
}

function ScaleRow({
  label, value, onChange, required,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  required?: boolean
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-ink-3 mb-1.5">{label}</div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? 0 : n)}
            className={[
              'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
              value >= n ? 'bg-amber-400 text-white' : 'bg-bg-2 text-ink-4 hover:bg-ink-7',
            ].join(' ')}
          >
            <Star className={`w-3.5 h-3.5 ${value >= n ? 'fill-white' : ''}`} />
          </button>
        ))}
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="text-[10px] text-ink-4 hover:text-ink-2 ml-2"
          >
            clear
          </button>
        )}
        {required && value === 0 && (
          <span className="text-[10px] text-rose-600 ml-2">required</span>
        )}
      </div>
    </div>
  )
}
