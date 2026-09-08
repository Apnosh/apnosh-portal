'use client'

import { type ReactNode } from 'react'
import { Store } from 'lucide-react'
import { type OnboardingData } from '../data'
import { Question, OptionCard, FieldLabel } from '../ui'
import { SHELF_SHAPES, SHAPE_LABEL, inferShelfShape } from '@/lib/clients/shape'
import { useLang } from '@/components/mvp/mvp-language'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

/* One question. Most owners never really answer it: the styles they picked above already say
 * truck, two places or catering, so this arrives pre-picked and they tap Continue. The two we
 * cannot read from anything else, delivery-only and seasonal, are why the question exists.
 *
 * The answer decides what the store may show them: a truck gets the where-are-you card and no
 * "get directions" promise, a delivery kitchen gets no Reserve button. */
export default function StepShape({ data, update, nav }: Props) {
  const { T } = useLang()
  const suggested = inferShelfShape({
    service_styles: data.service_styles,
    location_count: data.location_count,
    locations: data.locations,
  })
  const picked = data.shape || suggested

  return (
    <>
      <Question
        title={T('How does it run?')}
        subtitle={T('This decides what we show you and what we never will.')}
        icon={<Store size={26} strokeWidth={2} />}
        // MINT, like the ring below it. The glyph took the newfaces purple while everything else
        // on this screen was mint, which is the split the ring fix already closed. Chrome never
        // wears a goal colour (hues.ts, first paragraph). step-budget and step-role keep their
        // own hues on purpose: those screens are hued end to end, not half and half.
        hue="mint"
        small
      />
      <div className="mt-4">
        <FieldLabel>{T('Pick the closest one')}</FieldLabel>
        <div className="flex flex-col gap-2">
          {SHELF_SHAPES.map((s) => {
            const selected = picked === s
            // The picked ring is MINT. It took the newfaces purple, which is the colour of a goal,
            // on a screen whose glyph, text and check are all mint: chrome never wears a goal
            // colour (hues.ts says so in its first paragraph).
            return (
              <OptionCard key={s} selected={selected} onClick={() => update('shape', s)}>
                <div className="text-[15px] font-medium" style={{ color: selected ? '#1c6b52' : '#1d1d1f' }}>
                  {T(SHAPE_LABEL[s].title)}
                </div>
                <div className="text-[12.5px] mt-0.5" style={{ color: '#6e6e73' }}>{T(SHAPE_LABEL[s].sub)}</div>
              </OptionCard>
            )
          })}
        </div>
      </div>
      {nav}
    </>
  )
}
