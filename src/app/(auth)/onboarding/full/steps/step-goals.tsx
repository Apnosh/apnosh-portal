'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, GOAL_CHIPS } from '../data'
import { Question, scrollNavIntoView } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 3

/**
 * ONE question: pick your top three, as tappable cards.
 *
 * The data contract downstream is unchanged. primary_goal is still the first pick (ten files
 * read it), and the runners-up ride along in goal_detail, which already feeds the planner's
 * prompt as free text. No migration, nothing to re-map.
 *
 * At three picks the unpicked cards dim and a fourth tap does nothing except pulse the
 * counter chip. No alert, no silent swap: changing your mind means un-picking a card first,
 * which the helper line says in plain words.
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
    /* All three picked: the step is done, so bring Continue into view. */
    if (next.length === MAX) scrollNavIntoView()
  }

  return (
    <>
      <style>{'@keyframes goalCounterPulse { 0% { transform: scale(1) } 40% { transform: scale(1.14) } 100% { transform: scale(1) } }'}</style>
      <Question
        title="What matters most right now?"
        subtitle="Pick up to 3. We build your plan around them."
      />

      <div className="mt-4 flex items-center justify-between">
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
        {full && (
          <span className="text-[12px]" style={{ color: '#9aa1ab' }}>Tap a card to un-pick it.</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {GOAL_CHIPS.map((g) => {
          const isSel = picked.includes(g)
          const dimmed = full && !isSel
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className="relative text-left rounded-[12px] px-3.5 py-3 transition-all select-none"
              style={{
                border: isSel ? '2px solid #4abd98' : '1.5px solid #e0e0e0',
                background: isSel ? '#f0faf6' : '#fff',
                opacity: dimmed ? 0.5 : 1,
                minHeight: 44,
              }}
            >
              <span
                className="block text-[13px] font-medium leading-snug pr-5"
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

      <div className="mt-3 text-[12px]" style={{ color: '#9aa1ab' }}>
        {picked.length === 0
          ? 'Not sure? Skip it. We will suggest a starting point.'
          : full
            ? 'That is your top 3. Tap a card to change it.'
            : 'Add another, or keep going.'}
      </div>

      {nav}
    </>
  )
}
