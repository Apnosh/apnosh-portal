'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, TONE_CHIPS, EMOJI_LEVELS, CONTENT_CHIPS, AVOID_CHIPS } from '../data'
import { Question, ChipGroup, FieldLabel, Input, OptionCard } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

// Combined brand screen: how you sound (tone + custom + tones to avoid +
// emojis), the content you like (+ reference accounts), and topics to avoid.
export default function StepBrandVoice({ data, update, nav }: Props) {
  const [showRefs, setShowRefs] = useState(!!data.ref_accounts)

  function toggle<K extends keyof OnboardingData>(field: K, val: string) {
    const arr = [...(data[field] as string[])]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update(field, arr as OnboardingData[K])
  }

  return (
    <>
      <Question title="How should your brand sound?" subtitle="Your voice, the content you like, and what to avoid" />

      {/* Tone */}
      <div className="mt-4">
        <FieldLabel>Pick up to 3 tones, or describe your own</FieldLabel>
        <ChipGroup options={TONE_CHIPS} selected={data.tones} onToggle={(v) => toggle('tones', v)} max={3} />
        <div className="mt-3">
          <Input
            value={data.custom_tone}
            onChange={(v) => update('custom_tone', v)}
            placeholder="e.g. Witty but never sarcastic, like a cool neighbor"
          />
        </div>
      </div>

      {/* Tones to avoid */}
      <div className="mt-5">
        <FieldLabel>Anything to steer away from? (optional)</FieldLabel>
        <ChipGroup options={TONE_CHIPS} selected={data.avoid_tones} onToggle={(v) => toggle('avoid_tones', v)} />
      </div>

      {/* Emojis */}
      <div className="mt-5">
        <FieldLabel>How do you feel about emojis?</FieldLabel>
        <div className="flex flex-col gap-2">
          {EMOJI_LEVELS.map((e) => {
            const selected = data.emoji_usage === e.id
            return (
              <OptionCard key={e.id} selected={selected} onClick={() => update('emoji_usage', e.id)}>
                <div className="text-[13px] font-medium" style={{ color: selected ? '#0f6e56' : '#111' }}>
                  {e.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#999' }}>{e.desc}</div>
              </OptionCard>
            )
          })}
        </div>
      </div>

      {/* Content likes */}
      <div className="mt-6">
        <FieldLabel>What content appeals to you?</FieldLabel>
        <ChipGroup options={CONTENT_CHIPS} selected={data.content_likes} onToggle={(v) => toggle('content_likes', v)} />
        <button
          type="button"
          onClick={() => setShowRefs(!showRefs)}
          className="text-[13px] font-medium mt-3 inline-block"
          style={{ color: '#4abd98' }}
        >
          + Any accounts you admire?
        </button>
        {showRefs && (
          <div className="mt-3">
            <Input
              value={data.ref_accounts}
              onChange={(v) => update('ref_accounts', v)}
              placeholder="Instagram handles or business names"
            />
          </div>
        )}
      </div>

      {/* Topics to avoid */}
      <div className="mt-6">
        <FieldLabel>Anything to stay away from?</FieldLabel>
        <ChipGroup options={AVOID_CHIPS} selected={data.avoid_list} onToggle={(v) => toggle('avoid_list', v)} />
      </div>
      {nav}
    </>
  )
}
