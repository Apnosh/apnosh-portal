'use client'

import { type ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import { type OnboardingData, DAYS, RHYTHM_LEVELS } from '../data'
import { Question } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const FULL_DAY: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
}

export default function StepRhythm({ data, update, nav }: Props) {
  function setDay(day: string, level: string) {
    const next = { ...data.slow_periods }
    if (next[day] === level) delete next[day]
    else next[day] = level
    update('slow_periods', next)
  }

  return (
    <>
      <Question
        title="When are you busy vs. slow?"
        subtitle="Optional."
        icon={<CalendarDays size={26} strokeWidth={2} />}
      />
      <div className="flex flex-col gap-1.5 mt-5 mb-1">
        {DAYS.map((day) => (
          <div key={day} className="flex items-center gap-2">
            <span className="text-[13px] w-[68px] shrink-0" style={{ color: '#48484a' }}>
              {FULL_DAY[day]}
            </span>
            <div className="flex gap-1.5 flex-1">
              {RHYTHM_LEVELS.map((lvl) => {
                const selected = data.slow_periods[day] === lvl.id
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setDay(day, lvl.id)}
                    className="flex-1 py-2 rounded-[10px] text-[12px] font-medium select-none"
                    style={{
                      border: selected ? `1.5px solid ${lvl.color}` : '1.5px solid #e6e6ea',
                      background: selected ? `${lvl.color}1a` : 'white',
                      color: selected ? lvl.color : '#6e6e73',
                      transition: 'all .15s ease',
                    }}
                  >
                    {lvl.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {nav}
    </>
  )
}
