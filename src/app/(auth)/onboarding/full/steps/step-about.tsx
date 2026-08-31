'use client'

/**
 * "About your business" — the few questions that make everything downstream
 * better, kept as easy as taps: what you are, your one-liner, who you want
 * coming in. All optional; chips over typing wherever possible. Brand
 * materials (step-assets) render below on the same screen.
 */

import { type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { type OnboardingData, BIZ_TYPES, CUISINES, SERVICE_STYLES, CUSTOMER_TYPES, FOOD_BIZ_TYPES } from '../data'
import { Question, TextArea, FieldLabel, SingleChipGroup, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepAbout({ data, update, nav }: Props) {
  const isFood = FOOD_BIZ_TYPES.includes(data.biz_type as typeof FOOD_BIZ_TYPES[number])
  return (
    <>
      <Question
        title="About your business"
        subtitle="Tap what fits. Skip anything."
        icon={<Sparkles size={26} strokeWidth={2} />}
      />
      <div className="mt-5 space-y-5">
        <div>
          <FieldLabel>What kind of place is it?</FieldLabel>
          <SingleChipGroup
            options={BIZ_TYPES as unknown as string[]}
            selected={data.biz_type}
            onSelect={(v) => update('biz_type', v)}
          />
        </div>

        {isFood && (
          <div>
            <FieldLabel>What kind of food?</FieldLabel>
            <SingleChipGroup
              options={CUISINES as unknown as string[]}
              selected={data.cuisine}
              onSelect={(v) => update('cuisine', v)}
            />
          </div>
        )}

        {isFood && (
          <div>
            <FieldLabel>How would you describe the vibe?</FieldLabel>
            <ChipGroup
              options={SERVICE_STYLES as unknown as string[]}
              selected={data.service_styles}
              onToggle={(v) => update('service_styles',
                data.service_styles.includes(v)
                  ? data.service_styles.filter((x) => x !== v)
                  : [...data.service_styles, v])}
            />
          </div>
        )}

        <div>
          <FieldLabel>Your mission, in a line</FieldLabel>
          <TextArea
            value={data.biz_desc}
            onChange={(v) => update('biz_desc', v)}
            placeholder="Like: Korean BBQ worth crossing town for."
            rows={2}
          />
        </div>

        <div>
          <FieldLabel>Who do you want coming in?</FieldLabel>
          <ChipGroup
            options={CUSTOMER_TYPES as unknown as string[]}
            selected={data.customer_types}
            onToggle={(v) => update('customer_types',
              data.customer_types.includes(v)
                ? data.customer_types.filter((x) => x !== v)
                : [...data.customer_types, v])}
          />
        </div>
      </div>
      {nav}
    </>
  )
}
