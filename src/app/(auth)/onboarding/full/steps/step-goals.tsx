'use client'

import { type ReactNode, useState } from 'react'
import {
  type LucideIcon, Target, CalendarClock, Footprints, MapPin, Megaphone, Heart,
  Star, Rocket, Lightbulb, Trophy, ShoppingBag, Repeat, Truck, Camera, Sparkles,
} from 'lucide-react'
import { type OnboardingData, GOAL_CHIPS } from '../data'
import { Question, hueOf, gradOf, DISPLAY, CARD_SHADOW } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 3

/* One glyph and one colour per goal, so the grid reads at a glance and the colour
 * matches the goal rail on the Create page. Keys are the exact GOAL_CHIPS strings
 * (they are stored values and must never change). */
const GOAL_META: Record<string, { icon: LucideIcon; hue: string; sub: string }> = {
  'More customers on slow days': { icon: CalendarClock, hue: 'nights', sub: 'Fill the quiet nights' },
  'More foot traffic overall': { icon: Footprints, hue: 'newfaces', sub: 'More people through the door' },
  'Build local awareness': { icon: MapPin, hue: 'brand', sub: 'Be known nearby' },
  'Promote a specific offering': { icon: Megaphone, hue: 'announce', sub: 'A dish, a service, a night' },
  'Grow social following': { icon: Heart, hue: 'catering', sub: 'More people following along' },
  'Improve online reputation': { icon: Star, hue: 'reviews', sub: 'A higher rating, answered reviews' },
  'Launch something new': { icon: Rocket, hue: 'announce', sub: 'A menu, a look, an opening' },
  'Stay top of mind': { icon: Lightbulb, hue: 'regulars', sub: 'Be remembered between visits' },
  'Compete with nearby businesses': { icon: Trophy, hue: 'newfaces', sub: 'Win the block' },
  'More bookings or orders': { icon: ShoppingBag, hue: 'online', sub: 'Online, direct where you can' },
  'Turn first-timers into regulars': { icon: Repeat, hue: 'regulars', sub: 'One visit into ten' },
  'Grow catering orders': { icon: Truck, hue: 'catering', sub: 'Group and office orders' },
  'Better photos of my food': { icon: Camera, hue: 'event', sub: 'Plates that sell themselves' },
  'Reach a younger crowd': { icon: Sparkles, hue: 'brand', sub: 'Where they actually look' },
}

/**
 * ONE question: pick your top three, as coloured tiles.
 *
 * The data contract downstream is unchanged. primary_goal is still the first pick (ten files
 * read it), and the runners-up ride along in goal_detail, which already feeds the planner's
 * prompt as free text. No migration, nothing to re-map.
 *
 * At three picks the unpicked tiles dim and a fourth tap does nothing except pulse the
 * counter chip. No alert, no silent swap: changing your mind means un-picking a tile first.
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
        subtitle="Pick up to three."
        icon={<Target size={28} strokeWidth={2} />}
        hue="event"
      />

      <div className="flex justify-center" style={{ marginTop: -8 }}>
        <span
          key={bump}
          className="inline-flex items-center gap-2 text-[13px] font-semibold rounded-[17px] px-3.5"
          style={{
            height: 34,
            background: '#eaf7f3',
            color: '#1c6b52',
            animation: bump ? 'goalCounterPulse .35s ease' : undefined,
          }}
        >
          <span aria-hidden className="inline-flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i < picked.length ? '#4abd98' : '#e3e6e4', display: 'block' }} />
            ))}
          </span>
          {picked.length} of {MAX} picked
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {GOAL_CHIPS.map((g) => {
          const isSel = picked.includes(g)
          const dimmed = full && !isSel
          const meta = GOAL_META[g] ?? { icon: Target, hue: 'mint', sub: '' }
          const Icon = meta.icon
          const [light, deep] = hueOf(meta.hue)
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className="ob-card relative rounded-[18px] p-3.5 select-none flex flex-col gap-2 text-left"
              style={{
                border: 'none',
                minHeight: 118,
                background: `linear-gradient(135deg, ${light}2e, ${deep}12), #fff`,
                boxShadow: isSel ? `inset 0 0 0 2px ${deep}, 0 12px 30px ${deep}45` : CARD_SHADOW,
                opacity: dimmed ? 0.5 : 1,
                transition: 'all .15s ease',
              }}
            >
              {isSel && (
                <span aria-hidden className="absolute flex items-center justify-center" style={{ top: 10, right: 10, width: 22, height: 22, borderRadius: 11, background: deep }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
              <span aria-hidden className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: gradOf(meta.hue), color: '#fff', boxShadow: `0 6px 14px ${deep}59` }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <span className="block text-[14.5px] leading-tight" style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f', marginTop: 'auto' }}>{g}</span>
              {meta.sub && <span className="block text-[11.5px]" style={{ color: '#6e6e73', marginTop: -4 }}>{meta.sub}</span>}
            </button>
          )
        })}
      </div>

      {nav}
    </>
  )
}
