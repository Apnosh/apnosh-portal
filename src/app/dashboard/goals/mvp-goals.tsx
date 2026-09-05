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
  CheckCircle2, ChevronUp, ChevronDown, X,
} from 'lucide-react'
import type { CatalogGoal, ClientGoal, GoalSlug } from '@/lib/goals/types'
import { setClientGoal, closeGoal } from '@/lib/goals/mutations'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpSaveBar, C } from '@/components/mvp/mvp-detail'
import { gradOf, glow, hueOf, tint, type HueKey } from '@/components/mvp/hues'

/* every goal wears the same hue on every screen (the builder's goal colours) */
const GOAL_HUE: Record<GoalSlug, HueKey> = {
  more_foot_traffic: 'newfaces',
  regulars_more_often: 'regulars',
  more_online_orders: 'online',
  more_reservations: 'event',
  better_reputation: 'reviews',
  be_known_for: 'brand',
  fill_slow_times: 'nights',
  grow_catering: 'catering',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

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
      <div style={{ background: '#fff', minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
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
                    hue={GOAL_HUE[slug] ?? 'mint'}
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

          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15.5, fontWeight: 600, color: C.ink, letterSpacing: '-.01em', padding: '0 6px 8px' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: gradOf('mint') }} />{filledCount > 0 ? 'Add another goal' : 'Choose your goals'}</div>
            {/* goal tiles, two across, each in its own hue (portal redesign 2026-09-04) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {catalog.map(g => {
                const picked = pickedSet.has(g.slug)
                const disabled = !picked && filledCount >= 3
                const Icon = GOAL_ICONS[g.slug] ?? Star
                return (
                  <GoalTile
                    key={g.slug}
                    hue={GOAL_HUE[g.slug] ?? 'mint'}
                    icon={<Icon size={17} />}
                    title={g.displayName}
                    sub={g.ownerVoice ?? g.rationale}
                    picked={picked}
                    disabled={disabled}
                    onClick={() => toggle(g.slug)}
                  />
                )
              })}
            </div>
          </div>

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

function FocusRow({ n, title, sub, canUp, canDown, onUp, onDown, onRemove, hue }: { n: number; title: string; sub?: string; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; onRemove: () => void; hue: HueKey }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px 11px 14px' }}>
      <span style={{ width: 28, height: 28, borderRadius: 99, background: gradOf(hue), boxShadow: glow(hue, 0.3), color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
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

function GoalTile({ icon, title, sub, picked, disabled, onClick, hue }: { icon: React.ReactNode; title: string; sub: string; picked: boolean; disabled?: boolean; onClick: () => void; hue: HueKey }) {
  const [h1, h2] = hueOf(hue)
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={picked} className="mvp-press" style={{ position: 'relative', textAlign: 'left', padding: 12, borderRadius: 18, border: 'none', background: '#fff', boxShadow: picked ? `inset 0 0 0 2px ${h2}, 0 12px 30px ${tint(hue, 0.28, 1)}` : '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', minHeight: 108, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, font: 'inherit' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${h1}2e, ${h2}0f)` }} />
      <span style={{ position: 'relative', width: 34, height: 34, borderRadius: 11, background: gradOf(hue), boxShadow: glow(hue, 0.35), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ position: 'relative', fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.15, marginTop: 'auto' }}>{title}</span>
      <span style={{ position: 'relative', fontSize: 11, color: C.mute, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</span>
      {picked && <span style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, background: h2, color: '#fff', display: 'grid', placeItems: 'center' }}><CheckCircle2 size={13} /></span>}
    </button>
  )
}
