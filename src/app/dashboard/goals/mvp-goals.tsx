'use client'

/**
 * MvpGoals — the owner "Your goals" page in the apnosh-mvp design.
 *
 * Pick up to 3 goals from the 8-goal catalog, ordered by priority (1, 2, 3).
 * Reuses the existing setClientGoal / closeGoal mutations and the same pick
 * model as goals-selector.tsx (which stays for the onboarding flow). The order
 * of the picks is the priority, so the "Your focus" list lets the owner reorder.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Footprints, Repeat, ShoppingBag, CalendarCheck, Star, Award, Clock, ChefHat,
  CheckCircle2, Circle, ChevronUp, ChevronDown, X,
} from 'lucide-react'
import type { CatalogGoal, ClientGoal, GoalSlug } from '@/lib/goals/types'
import { setClientGoal, closeGoal } from '@/lib/goals/mutations'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpSaveBar, C } from '@/components/mvp/mvp-detail'

const GOAL_ICONS: Record<GoalSlug, React.ComponentType<{ size?: number }>> = {
  more_foot_traffic: Footprints,
  regulars_more_often: Repeat,
  more_online_orders: ShoppingBag,
  more_reservations: CalendarCheck,
  better_reputation: Star,
  be_known_for: Award,
  fill_slow_times: Clock,
  grow_catering: ChefHat,
}

export default function MvpGoals({ clientId, catalog, activeGoals }: { clientId: string; catalog: CatalogGoal[]; activeGoals: ClientGoal[] }) {
  const router = useRouter()

  // Seed compacted (no interior gaps) so the picks array index always equals
  // the displayed priority, even if the stored goals had a missing priority.
  const initial = useMemo<(GoalSlug | null)[]>(() => {
    const a: (GoalSlug | null)[] = [null, null, null]
    const sorted = [...activeGoals].sort((x, y) => x.priority - y.priority)
    sorted.forEach((g, i) => { if (i < 3) a[i] = g.goalSlug })
    return a
  }, [activeGoals])

  const [picks, setPicks] = useState<(GoalSlug | null)[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bySlug = useMemo(() => {
    const m = {} as Record<GoalSlug, CatalogGoal>
    for (const g of catalog) m[g.slug] = g
    return m
  }, [catalog])

  const filled = picks.filter(Boolean) as GoalSlug[]
  const filledCount = filled.length
  const pickedSet = new Set(filled)
  const dirty = JSON.stringify(picks) !== JSON.stringify(initial)

  function toggle(slug: GoalSlug) {
    setSaved(false); setError(null)
    setPicks(prev => {
      if (prev.includes(slug)) {
        const next = prev.filter(s => s !== slug)
        while (next.length < 3) next.push(null)
        return next
      }
      const slot = prev.findIndex(s => s === null)
      if (slot === -1) return prev
      const next = [...prev]; next[slot] = slug
      return next
    })
  }

  function move(i: number, dir: -1 | 1) {
    setSaved(false)
    setPicks(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length || !prev[i] || !prev[j]) return prev
      const next = [...prev]
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp
      return next
    })
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      // Target = the final (slug, priority) set. Because setClientGoal supersedes
      // only by priority, we close every active goal that isn't preserved at the
      // exact same slug+priority (covers removals AND reprioritizations, so no
      // orphaned duplicate stays active), then insert only what actually changed.
      const target = filled.map((slug, i) => ({ slug, priority: (i + 1) as 1 | 2 | 3 }))
      for (const ex of activeGoals) {
        const preserved = target.some(t => t.slug === ex.goalSlug && t.priority === ex.priority)
        if (!preserved) await closeGoal({ goalId: ex.id, outcome: 'abandoned' })
      }
      for (const t of target) {
        const already = activeGoals.some(ex => ex.goalSlug === t.slug && ex.priority === t.priority)
        if (!already) await setClientGoal({ clientId, goalSlug: t.slug, priority: t.priority })
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const hint = filledCount === 0
    ? 'Pick at least one goal'
    : saved && !dirty
      ? 'Saved'
      : filledCount < 3
        ? `Add up to ${3 - filledCount} more, or save`
        : undefined

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Your goals" subtitle="What you want us to focus on" />}>
      <div style={{ background: '#f5f5f7', minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '14px 14px 10px' }}>
          <p style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, margin: '2px 6px 16px' }}>
            Pick up to 3 things to focus on. We tailor your marketing to these and review them with you every 90 days.
          </p>

          {filledCount > 0 && (
            <MvpGroup title="Your focus">
              {filled.map((slug, i) => {
                const g = bySlug[slug]
                return (
                  <FocusRow
                    key={slug}
                    n={i + 1}
                    title={g?.displayName ?? slug}
                    sub={g?.ownerVoice}
                    canUp={i > 0}
                    canDown={i < filledCount - 1}
                    onUp={() => move(i, -1)}
                    onDown={() => move(i, 1)}
                    onRemove={() => toggle(slug)}
                  />
                )
              })}
            </MvpGroup>
          )}

          <MvpGroup title={filledCount > 0 ? 'Add another goal' : 'Choose your goals'}>
            {catalog.map(g => {
              const picked = pickedSet.has(g.slug)
              const disabled = !picked && filledCount >= 3
              const Icon = GOAL_ICONS[g.slug] ?? Star
              return (
                <ChoiceRow
                  key={g.slug}
                  icon={<Icon size={18} />}
                  title={g.displayName}
                  rationale={g.rationale}
                  picked={picked}
                  disabled={disabled}
                  onClick={() => toggle(g.slug)}
                />
              )
            })}
          </MvpGroup>

          {error && <p style={{ fontSize: 13, color: C.coral, textAlign: 'center', margin: '4px 8px 0' }}>{error}</p>}

          <p style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', lineHeight: 1.5, margin: '14px 16px 0' }}>
            Fewer is fine. A focused 1 to 2 goals usually beats a scattered 3.
          </p>
        </div>

        <MvpSaveBar onClick={handleSave} label="Save goals" disabled={!dirty || filledCount === 0} saving={saving} hint={hint} />
      </div>
    </MvpShell>
  )
}

function IconBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: disabled ? C.line : C.faint, cursor: disabled ? 'default' : 'pointer', padding: 0 }}>
      {children}
    </button>
  )
}

function FocusRow({ n, title, sub, canUp, canDown, onUp, onDown, onRemove }: { n: number; title: string; sub?: string; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px 11px 14px' }}>
      <span style={{ width: 26, height: 26, borderRadius: 99, background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        <IconBtn onClick={onUp} disabled={!canUp} label="Move up"><ChevronUp size={18} /></IconBtn>
        <IconBtn onClick={onDown} disabled={!canDown} label="Move down"><ChevronDown size={18} /></IconBtn>
        <IconBtn onClick={onRemove} label="Remove"><X size={18} /></IconBtn>
      </div>
    </div>
  )
}

function ChoiceRow({ icon, title, rationale, picked, disabled, onClick }: { icon: React.ReactNode; title: string; rationale: string; picked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="mvp-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{title}</span>
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>{rationale}</span>
      </span>
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        {picked ? <CheckCircle2 size={21} color={C.greenDk} /> : <Circle size={21} color={C.faint} />}
      </span>
    </button>
  )
}
