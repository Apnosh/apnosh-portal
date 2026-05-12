/**
 * KnowledgeTab — structured client knowledge capture.
 *
 * Lives inside /admin/clients/[slug] as the Knowledge tab. Every
 * fact recorded here flows into the AI's retrieval context via
 * getClientContext() — see docs/AI-FIRST-PRINCIPLES.md principle #6.
 *
 * UX:
 *   - One-line add form at the top (category + fact + add)
 *   - Grouped by category
 *   - Each row: fact text, confidence chip, timestamp, delete button
 *   - Category filter chips
 *
 * The strategist should be capturing facts as they learn them —
 * during a client call, while reviewing performance, etc. Speed of
 * capture matters more than UI polish.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Plus, Loader2, X, Trash2, Tag, AlertCircle,
} from 'lucide-react'
// Import from fact-types directly (not get-facts) so this client
// component doesn't accidentally pull supabase/server into the bundle.
import {
  FACT_CATEGORIES, FACT_CATEGORY_LABELS,
  type FactCategory, type FactConfidence,
} from '@/lib/work/fact-types'

interface FactRow {
  id: string
  category: FactCategory
  fact: string
  source: string
  confidence: FactConfidence
  recorded_at: string
  active: boolean
}

interface Props {
  clientId: string
}

const CONFIDENCE_TONE: Record<FactConfidence, string> = {
  low:      'bg-ink-7 text-ink-4',
  medium:   'bg-sky-50 text-sky-700',
  high:     'bg-emerald-50 text-emerald-700',
  verified: 'bg-violet-50 text-violet-700',
}

const CATEGORY_HINTS: Record<FactCategory, string> = {
  history:        'When did they open? Original concept?',
  specialty:      'What do they do best?',
  customer:       'Who eats here? Demographics? Behavior?',
  voice:          'How does the owner talk? Tone preferences?',
  pet_peeve:      'What kind of post or copy makes them cringe?',
  seasonality:    'Slow weeks? Peak weeks? Annual patterns?',
  competitor:     'Who do they compete with? How are they different?',
  event:          'Anniversaries? Upcoming launches? Owner birthdays?',
  signature_item: 'The one thing every customer should try.',
  value_prop:     'One sentence — why a customer chooses them.',
  positioning:    'Premium / family / fast-casual / etc.',
  owner_quote:    'A line the owner actually said. Verbatim.',
  observation:    'Anything else worth remembering.',
}

export default function KnowledgeTab({ clientId }: Props) {
  const [facts, setFacts] = useState<FactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FactCategory | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [newCategory, setNewCategory] = useState<FactCategory>('observation')
  const [newFact, setNewFact] = useState('')
  const [newConfidence, setNewConfidence] = useState<FactConfidence>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/work/clients/${clientId}/facts`)
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = await res.json()
    setFacts((data.facts ?? []) as FactRow[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => {
    const map = new Map<FactCategory, FactRow[]>()
    for (const f of facts) {
      if (filter !== 'all' && f.category !== filter) continue
      if (!map.has(f.category)) map.set(f.category, [])
      map.get(f.category)!.push(f)
    }
    return map
  }, [facts, filter])

  const counts = useMemo(() => {
    const m = new Map<FactCategory, number>()
    for (const f of facts) m.set(f.category, (m.get(f.category) ?? 0) + 1)
    return m
  }, [facts])

  async function add() {
    if (!newFact.trim()) return
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/work/clients/${clientId}/facts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: newCategory,
        fact: newFact.trim(),
        confidence: newConfidence,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    setNewFact('')
    setAdding(false)
    void load()
  }

  async function remove(id: string) {
    if (!confirm('Remove this fact? It will be archived (not hard-deleted).')) return
    const res = await fetch(`/api/work/clients/${clientId}/facts/${id}`, { method: 'DELETE' })
    if (res.ok) void load()
  }

  return (
    <div className="space-y-4">
      {/* Header explainer */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-ink leading-snug">
              Every fact recorded here grounds every AI run
            </p>
            <p className="text-[12px] text-ink-3 mt-1 leading-snug max-w-2xl">
              When the strategist generates ideas, captions, or briefs for this client, these facts are retrieved automatically and inlined into the prompt. The more specific the facts, the better the output.
            </p>
          </div>
        </div>
      </div>

      {/* Add form */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border-2 border-dashed border-ink-6 hover:border-ink-4 bg-white py-3 text-[13px] font-semibold text-ink-3 hover:text-ink inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add a fact
        </button>
      ) : (
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold text-ink-2">New fact</p>
            <button onClick={() => { setAdding(false); setNewFact(''); setError(null) }} className="text-ink-4 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 mb-3">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as FactCategory)}
              className="px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 bg-white"
            >
              {FACT_CATEGORIES.map(c => (
                <option key={c} value={c}>{FACT_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <select
              value={newConfidence}
              onChange={e => setNewConfidence(e.target.value as FactConfidence)}
              className="px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 bg-white sm:w-[160px]"
            >
              <option value="low">Low confidence</option>
              <option value="medium">Medium confidence</option>
              <option value="high">High confidence</option>
              <option value="verified">Verified</option>
            </select>
          </div>
          <textarea
            value={newFact}
            onChange={e => setNewFact(e.target.value)}
            rows={2}
            autoFocus
            placeholder={CATEGORY_HINTS[newCategory] ?? 'One specific fact about this client…'}
            className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void add() }
            }}
          />
          {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={() => { setAdding(false); setNewFact('') }} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1">
              Cancel
            </button>
            <button
              onClick={add}
              disabled={submitting || !newFact.trim()}
              className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save fact <span className="opacity-60 ml-1">⌘↵</span>
            </button>
          </div>
        </div>
      )}

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`text-[11px] font-semibold rounded px-2 py-1 ${filter === 'all'
            ? 'bg-ink text-white'
            : 'bg-bg-1 border border-ink-6 text-ink-2 hover:border-ink-4'}`}
        >
          All · {facts.length}
        </button>
        {FACT_CATEGORIES.map(c => {
          const n = counts.get(c) ?? 0
          if (n === 0 && filter !== c) return null
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-[11px] font-semibold rounded px-2 py-1 ${filter === c
                ? 'bg-ink text-white'
                : 'bg-bg-1 border border-ink-6 text-ink-2 hover:border-ink-4'}`}
            >
              {FACT_CATEGORY_LABELS[c]} · {n}
            </button>
          )
        })}
      </div>

      {/* Facts list */}
      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-ink-4" />
        </div>
      ) : facts.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : grouped.size === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <p className="text-[13px] text-ink-3">No facts in this category yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([cat, rows]) => (
            <section key={cat}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2 inline-flex items-center gap-1.5">
                <Tag className="w-3 h-3" />
                {FACT_CATEGORY_LABELS[cat]} · {rows.length}
              </h3>
              <ul className="space-y-2">
                {rows.map(f => <FactRowCard key={f.id} f={f} onDelete={() => remove(f.id)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function FactRowCard({ f, onDelete }: { f: FactRow; onDelete: () => void }) {
  const tone = CONFIDENCE_TONE[f.confidence]
  return (
    <li
      className="rounded-xl border bg-white p-3 group"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-ink leading-snug whitespace-pre-wrap">{f.fact}</p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-ink-4">
            <span className={`uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tone}`}>
              {f.confidence}
            </span>
            <span>· {f.source.replace('_', ' ')}</span>
            <span>· {new Date(f.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-red-600 transition-opacity flex-shrink-0"
          title="Archive fact"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
        <AlertCircle className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No facts captured yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed mb-4">
        Capture what you learn about this client. Owner quotes, customer demographics, signature dishes, pet peeves about copy. AI uses every one to ground future generations.
      </p>
      <button onClick={onAdd} className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5">
        <Plus className="w-4 h-4" />
        Add first fact
      </button>
    </div>
  )
}
