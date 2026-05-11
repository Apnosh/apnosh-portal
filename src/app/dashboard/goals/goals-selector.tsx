'use client'

/**
 * Interactive client-side selector for the goals page.
 *
 * The owner picks up to 3 goals and orders them by priority 1, 2, 3.
 * Each catalog entry shows its rationale -- the educational moment that
 * makes Apnosh the anti-rip-off platform (per PRODUCT-SPEC.md cultural
 * principle).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, Sparkles, Target } from 'lucide-react'
import type { CatalogGoal, ClientGoal, GoalSlug } from '@/lib/goals/types'
import { setClientGoal, closeGoal } from '@/lib/goals/mutations'

interface Props {
  clientId: string
  catalog: CatalogGoal[]
  activeGoals: ClientGoal[]
  /** Where to send the user after save. Defaults to /dashboard. */
  nextHref?: string
}

export default function GoalsSelector({ clientId, catalog, activeGoals, nextHref = '/dashboard' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Ordered array of currently selected slugs. Index = priority - 1.
  // Initial seed from existing active goals.
  const initial: (GoalSlug | null)[] = [null, null, null]
  for (const g of activeGoals) {
    if (g.priority >= 1 && g.priority <= 3) initial[g.priority - 1] = g.goalSlug
  }
  const [picks, setPicks] = useState<(GoalSlug | null)[]>(initial)
  const [saving, setSaving] = useState(false)

  const pickedSet = new Set(picks.filter(Boolean) as GoalSlug[])
  const filledCount = picks.filter(Boolean).length

  function togglePick(slug: GoalSlug) {
    if (pickedSet.has(slug)) {
      // Unpick: drop and compact.
      setPicks(prev => {
        const next = prev.filter(s => s !== slug)
        while (next.length < 3) next.push(null)
        return next
      })
    } else {
      // Pick: append to first empty slot.
      setPicks(prev => {
        const next = [...prev]
        const slot = next.findIndex(s => s === null)
        if (slot === -1) return prev // already at 3
        next[slot] = slug
        return next
      })
    }
  }

  function priorityOf(slug: GoalSlug): number | null {
    const idx = picks.indexOf(slug)
    return idx === -1 ? null : idx + 1
  }

  async function handleSave() {
    setSaving(true)

    // Close goals that were unpicked.
    const newSet = new Set(picks.filter(Boolean) as GoalSlug[])
    for (const existing of activeGoals) {
      if (!newSet.has(existing.goalSlug)) {
        await closeGoal({ goalId: existing.id, outcome: 'abandoned' })
      }
    }

    // Set each picked goal at its priority slot.
    for (let i = 0; i < picks.length; i++) {
      const slug = picks[i]
      if (!slug) continue
      const priority = (i + 1) as 1 | 2 | 3
      await setClientGoal({
        clientId,
        goalSlug: slug,
        priority,
      })
    }

    setSaving(false)
    startTransition(() => router.push(nextHref))
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Target className="w-7 h-7 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Your goals</h1>
        <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
          Most owners say they want more sales. Marketing drives sales through specific levers.
          <strong> Pick up to 3 levers</strong> that matter most for you right now. Your strategist tailors the work to these.
        </p>
        <p className="text-xs text-ink-4 mt-3">
          You can change these anytime. We review together every 90 days.
        </p>
      </div>

      {/* Selection summary */}
      <div className="rounded-xl border border-ink-6 bg-bg-2 p-4 flex items-center gap-3 flex-wrap">
        <Sparkles className="w-4 h-4 text-emerald-700 flex-shrink-0" />
        <span className="text-sm text-ink-2 font-medium">
          {filledCount === 0 && 'Pick your top goal first'}
          {filledCount === 1 && 'Add up to 2 more (optional)'}
          {filledCount === 2 && 'Add 1 more (optional)'}
          {filledCount === 3 && 'All 3 set — ready to save'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {picks.map((slug, i) => (
            <span
              key={i}
              className={`text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                slug ? 'bg-emerald-600 text-white' : 'bg-ink-6 text-ink-4'
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Goal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {catalog.map(goal => {
          const priority = priorityOf(goal.slug)
          const active = priority !== null
          const disabled = !active && filledCount >= 3
          return (
            <button
              key={goal.slug}
              onClick={() => togglePick(goal.slug)}
              disabled={disabled}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                  : disabled
                  ? 'bg-bg-2 border-ink-6 opacity-50 cursor-not-allowed'
                  : 'bg-white border-ink-6 hover:border-emerald-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {active && (
                      <span className="text-[10px] font-bold w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                        {priority}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-ink">{goal.displayName}</p>
                    {active && <Check className="w-4 h-4 text-emerald-700 flex-shrink-0 ml-auto" />}
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">{goal.rationale}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-ink-6">
        <Link href="/dashboard" className="text-sm text-ink-3 hover:text-ink transition-colors">
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || pending || filledCount === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl px-6 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving || pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Save goals
        </button>
      </div>

      {/* Educational footer */}
      <div className="text-center text-xs text-ink-4 pt-2 max-w-lg mx-auto leading-relaxed">
        Pick fewer if you can. A focused 1–2 goals usually drives more progress in 90 days than a scattered 3.
        Your strategist will recommend the service mix for what you pick.
      </div>
    </div>
  )
}
