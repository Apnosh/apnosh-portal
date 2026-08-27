'use client'

import { Store, ClipboardList, Laptop, Handshake, Zap } from 'lucide-react'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { type OnboardingData, ROLES } from '../data'
import { Question, OptionCard, Badge } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Reports the single-choice answer so the wizard can advance after a short beat. */
  onAnswered?: () => void
}

export default function StepRole({ data, update, nav, onAnswered }: Props) {
  const router = useRouter()
  // Freelancer is the fork: it leaves the restaurant flow for the creator setup right away, before
  // any business row is written. Every other role continues the business flow as before.
  const pick = (id: string) => {
    if (id === 'freelancer') { router.push('/onboarding/creator'); return }
    update('role', id)
    onAnswered?.()
  }
  return (
    <>
      <Question title="Who are you?" subtitle="This helps us tailor your experience" />
      <div className="grid grid-cols-2 gap-2.5 mt-4 mb-2">
        {/* one crisp mark per role; emoji reads like a sticker next to the
            platform logos, a stroke icon reads like the system */}
        {ROLES.map((r) => (
          <OptionCard
            key={r.id}
            selected={data.role === r.id}
            onClick={() => pick(r.id)}
            disabled={!!r.disabled}
            className={ROLES.length % 2 === 1 && r.id === ROLES[ROLES.length - 1].id ? 'col-span-2 min-h-[104px]' : 'min-h-[148px]'}
          >
            {!!r.disabled && <Badge>Soon</Badge>}
            {/* Soft tinted glyph, echoing the order sheet's head. */}
            <div
              aria-hidden
              className="flex items-center justify-center text-lg mb-2"
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(150deg, rgba(74,189,152,0.14), rgba(74,189,152,0.05))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
              }}
            >
              {{
                owner: <Store size={19} color="#2e9a78" />,
                manager: <ClipboardList size={19} color="#2e9a78" />,
                employee: <Laptop size={19} color="#2e9a78" />,
                agency: <Handshake size={19} color="#2e9a78" />,
                freelancer: <Zap size={19} color="#2e9a78" />,
              }[r.id] ?? r.emoji}
            </div>
            <div
              className="text-sm font-semibold mb-0.5"
              style={{ color: data.role === r.id ? '#0f6e56' : '#1d1d1f' }}
            >
              {r.title}
            </div>
            <div className="text-xs leading-snug" style={{ color: '#6e6e73' }}>
              {r.desc}
            </div>
          </OptionCard>
        ))}
      </div>
      {nav}
    </>
  )
}
