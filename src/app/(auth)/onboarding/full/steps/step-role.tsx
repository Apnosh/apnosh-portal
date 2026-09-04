'use client'

import { Users, Store, ClipboardList, Laptop, Handshake, Zap, type LucideIcon } from 'lucide-react'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { type OnboardingData, ROLES } from '../data'
import { Question, OptionCard, Badge, IconTile, CheckDot, DISPLAY } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Reports the single-choice answer so the wizard can advance after a short beat. */
  onAnswered?: () => void
}

/* Each role keeps one colour and one glyph; the colour is the Create page's hue set,
 * so what an owner picks here looks the same when it comes back later. */
const ROLE_META: Record<string, { icon: LucideIcon; hue: string }> = {
  owner: { icon: Store, hue: 'mint' },
  manager: { icon: ClipboardList, hue: 'event' },
  employee: { icon: Laptop, hue: 'nights' },
  agency: { icon: Handshake, hue: 'newfaces' },
  freelancer: { icon: Zap, hue: 'announce' },
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
      <Question title="Who are you?" icon={<Users size={28} strokeWidth={2} />} />
      <div className="flex flex-col gap-2.5 mt-6 mb-2">
        {ROLES.map((r) => {
          const meta = ROLE_META[r.id] ?? { icon: Store, hue: 'mint' }
          const Icon = meta.icon
          const on = data.role === r.id
          return (
            <OptionCard
              key={r.id}
              selected={on}
              onClick={() => pick(r.id)}
              disabled={!!r.disabled}
              className="min-h-[64px]"
              hue={meta.hue}
            >
              {!!r.disabled && <Badge>Soon</Badge>}
              <div className="flex items-center gap-3.5">
                <IconTile hue={meta.hue}><Icon size={21} strokeWidth={2.2} /></IconTile>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px]" style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.01em' }}>{r.title}</div>
                  <div className="text-[12.5px]" style={{ color: '#6e6e73', marginTop: 1 }}>{r.desc}</div>
                </div>
                <CheckDot on={on} hue={meta.hue} />
              </div>
            </OptionCard>
          )
        })}
      </div>
      {nav}
    </>
  )
}
