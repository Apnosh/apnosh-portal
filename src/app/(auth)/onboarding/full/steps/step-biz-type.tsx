'use client'

/**
 * "Business type" — its own screen, first of the about-you questions, because
 * everything after it depends on the answer (a restaurant gets cuisine and
 * vibe; a salon does not). Tapping a type advances on its own; "Other" opens
 * a field and waits. Google often pre-picks this from the listing.
 *
 * Drawn as a two-column grid of coloured tiles so the whole list fits one
 * screen; every type keeps its colour through the rest of setup.
 */

import { type ReactNode } from 'react'
import {
  Store, UtensilsCrossed, Coffee, Wine, ShoppingBag, Scissors, Dumbbell, Briefcase, HeartPulse,
  Home, Wrench, Ticket, MoreHorizontal, type LucideIcon,
} from 'lucide-react'
import { type OnboardingData, BIZ_TYPES } from '../data'
import { Question, Input, hueOf, gradOf, DISPLAY, CARD_SHADOW } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Reports the single-choice answer so the wizard can advance after a short beat. */
  onAnswered?: () => void
}

/* Keys are the exact BIZ_TYPES strings (stored values, never changed). */
const TYPE_META: Record<string, { icon: LucideIcon; hue: string }> = {
  'Restaurant': { icon: UtensilsCrossed, hue: 'announce' },
  'Café / coffee shop': { icon: Coffee, hue: 'regulars' },
  'Bar / nightlife': { icon: Wine, hue: 'event' },
  'Retail store': { icon: ShoppingBag, hue: 'newfaces' },
  'Salon / spa / beauty': { icon: Scissors, hue: 'catering' },
  'Fitness / gym / wellness': { icon: Dumbbell, hue: 'online' },
  'Professional services': { icon: Briefcase, hue: 'nights' },
  'Healthcare / medical': { icon: HeartPulse, hue: 'reviews' },
  'Real estate': { icon: Home, hue: 'brand' },
  'Home services': { icon: Wrench, hue: 'deal' },
  'Entertainment / events': { icon: Ticket, hue: 'event' },
  'Other': { icon: MoreHorizontal, hue: 'mint' },
}

export default function StepBizType({ data, update, nav, onAnswered }: Props) {
  return (
    <>
      <Question title="What kind of place?" subtitle="Pick the closest. You can change it later." icon={<Store size={28} strokeWidth={2} />} hue="announce" />
      <div className="grid grid-cols-2 gap-2.5 mt-2 mb-2">
        {BIZ_TYPES.map((b) => {
          const meta = TYPE_META[b] ?? { icon: Store, hue: 'mint' }
          const Icon = meta.icon
          const [light, deep] = hueOf(meta.hue)
          const on = data.biz_type === b
          return (
            <button
              key={b}
              type="button"
              onClick={() => {
                update('biz_type', b)
                if (b !== 'Other') onAnswered?.()
              }}
              className="ob-card relative text-left rounded-[18px] p-3.5 select-none flex flex-col gap-2"
              style={{
                border: 'none',
                minHeight: 104,
                background: `linear-gradient(135deg, ${light}2e, ${deep}12), #fff`,
                boxShadow: on ? `inset 0 0 0 2px ${deep}, 0 12px 30px ${deep}45` : CARD_SHADOW,
                transition: 'all .18s ease',
              }}
            >
              {on && (
                <span aria-hidden className="absolute flex items-center justify-center" style={{ top: 10, right: 10, width: 22, height: 22, borderRadius: 11, background: deep }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
              <span aria-hidden className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: gradOf(meta.hue), color: '#fff', boxShadow: `0 6px 14px ${deep}59` }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <span className="text-[14.5px] leading-tight" style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f', marginTop: 'auto' }}>{b}</span>
            </button>
          )
        })}
      </div>
      {data.biz_type === 'Other' && (
        <div className="mt-3">
          <Input value={data.biz_other} onChange={(v) => update('biz_other', v)} placeholder="Tell us what kind" />
        </div>
      )}
      {nav}
    </>
  )
}
