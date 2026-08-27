'use client'

import { type ReactNode, useState } from 'react'
import {
  type LucideIcon, Target, CalendarClock, Footprints, MapPin, Megaphone, Heart,
  Star, Rocket, Lightbulb, Trophy, ShoppingBag, Repeat, Truck, Camera, Sparkles,
} from 'lucide-react'
import { type OnboardingData, GOAL_CHIPS } from '../data'
import { Question } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 3

/* One stroke glyph per goal so the grid reads at a glance. Keys are the exact
 * GOAL_CHIPS strings (they are stored values and must never change). */
const GOAL_ICONS: Record<string, LucideIcon> = {
  'More customers on slow days': CalendarClock,
  'More foot traffic overall': Footprints,
  'Build local awareness': MapPin,
  'Promote a specific offering': Megaphone,
  'Grow social following': Heart,
  'Improve online reputation': Star,
  'Launch something new': Rocket,
  'Stay top of mind': Lightbulb,
  'Compete with nearby businesses': Trophy,
  'More bookings or orders': ShoppingBag,
  'Turn first-timers into regulars': Repeat,
  'Grow catering orders': Truck,
  'Better photos of my food': Camera,
  'Reach a younger crowd': Sparkles,
}

/**
 * ONE question: pick your top three, as tappable cards.
 *
 * The data contract downstream is unchanged. primary_goal is still the first pick (ten files
 * read it), and the runners-up ride along in goal_detail, which already feeds the planner's
 * prompt as free text. No migration, nothing to re-map.
 *
 * At three picks the unpicked cards dim and a fourth tap does nothing except pulse the
 * counter chip. No alert, no silent swap: changing your mind means un-picking a card first.
 */
export default function StepGoals({ data, update, nav }: Props) {
  const picked = data.top_goals.length ? data.top_goals : (data.primary_goal ? [data.primary_goal] : [])
  const full = picked.length >= MAX

  /* Bumped when a tap is blocked at three picks. The counter chip is keyed on
   * this, so the remount replays its pulse animation as the gentle "no". */
  const [bump, setBump] = useState(0)

  function toggle(val: string) {
    const isSel = picked.includes(val)
    if (!isSel && full) {
      setBump((b) => b + 1)
      return
    }
    const next = isSel ? picked.filter((g) => g !== val) : [...picked, val]
    update('top_goals', next)
    /* Keep the old contract alive: first pick is THE goal, the rest are context. */
    update('primary_goal', next[0] ?? '')
    update('goal_detail', next.slice(1).join(', '))
  }

  return (
    <>
      <style>{'@media (prefers-reduced-motion: no-preference) { @keyframes goalCounterPulse { 0% { transform: scale(1) } 40% { transform: scale(1.14) } 100% { transform: scale(1) } } }'}</style>
      <Question
        title="What matters most right now?"
        subtitle="Pick up to 3."
        icon={<Target size={26} strokeWidth={2} />}
      />

      <div className="mt-4 flex justify-center">
        <span
          key={bump}
          className="inline-flex items-center text-[12px] font-semibold rounded-[20px] px-3 py-1"
          style={{
            background: '#f0faf6',
            color: '#0f6e56',
            border: '1px solid #9fe1cb',
            animation: bump ? 'goalCounterPulse .35s ease' : undefined,
          }}
        >
          {picked.length} of {MAX} picked
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3 [grid-auto-rows:1fr]">
        {GOAL_CHIPS.map((g) => {
          const isSel = picked.includes(g)
          const dimmed = full && !isSel
          const Icon = GOAL_ICONS[g]
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className="relative rounded-[14px] px-3 py-3.5 select-none flex flex-col items-center justify-center gap-2"
              style={{
                border: isSel ? '1.5px solid #4abd98' : '1.5px solid #e6e6ea',
                background: isSel ? '#f0faf6' : '#fff',
                opacity: dimmed ? 0.5 : 1,
                minHeight: 84,
                transition: 'all .15s ease',
              }}
            >
              {Icon && (
                <Icon aria-hidden size={20} strokeWidth={2} color={isSel ? '#0f6e56' : '#2e9a78'} />
              )}
              <span
                className="block text-[13px] font-medium leading-snug text-center"
                style={{ color: isSel ? '#0f6e56' : '#333' }}
              >
                {g}
              </span>
              {isSel && (
                <span
                  className="absolute top-2 right-2 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                  style={{ background: '#4abd98' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M1.5 5.3 4 7.6 8.5 2.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {nav}
    </>
  )
}
