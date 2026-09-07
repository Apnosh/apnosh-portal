'use client'

import { type ReactNode } from 'react'
import { Wallet } from 'lucide-react'
import { type OnboardingData, BUDGET_CHIPS } from '../data'
import { NO_CAP_BUDGET_CHIPS } from '@/lib/goals/defaults'
import { Question, OptionCard } from '../ui'
import { useLang } from '@/components/mvp/mvp-language'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Solo screens advance themselves one beat after the tap. */
  onAnswered?: () => void
}

/* One question, one tap. The answer becomes businesses.monthly_budget, which the Create
 * shelf uses to draw the line between "you can order this today" and "above what you set".
 * Without it the store shows a $990 logo to someone with $150, which is how a first visit
 * ends. "Not sure yet" is a real answer: no cap is asserted and nothing is hidden. */
export default function StepBudget({ data, update, nav, onAnswered }: Props) {
  const { T } = useLang()
  return (
    <>
      <Question
        title={T('What feels right to start?')}
        subtitle={T('You can change it any time. Nothing is charged now.')}
        icon={<Wallet size={26} strokeWidth={2} />}
        hue="online"
      />
      <div className="flex flex-col gap-2 mt-5">
        {BUDGET_CHIPS.map((b) => {
          const selected = data.marketing_budget === b
          // The top chip and "Not sure yet" both save NO cap. The Create sheet says what that
          // means in those words, and this screen asks the same question, so it says it too.
          const noCap = NO_CAP_BUDGET_CHIPS.includes(b)
          return (
            <OptionCard
              key={b}
              selected={selected}
              hue="online"
              onClick={() => { update('marketing_budget', b); onAnswered?.() }}
            >
              <div className="text-[15px] font-medium" style={{ color: selected ? '#1c6b52' : '#1d1d1f' }}>{T(b)}</div>
              {noCap && <div className="text-[12.5px] mt-0.5" style={{ color: '#6e6e73' }}>{T('No cap set. Everything shows.')}</div>}
            </OptionCard>
          )
        })}
      </div>
      {nav}
    </>
  )
}
