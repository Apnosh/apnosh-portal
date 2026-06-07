'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData } from '../data'
import { Question, FieldLabel, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

// Inline tag input: type + Enter/comma to add, click × or Backspace to remove.
function TagInput({
  tags,
  onChange,
  placeholder,
  prefix,
  clean,
}: {
  tags: string[]
  onChange: (next: string[]) => void
  placeholder: string
  prefix?: string
  clean: (raw: string) => string
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = clean(draft)
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v])
    }
    setDraft('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div
      className="flex flex-wrap gap-2 items-center rounded-[10px] px-2.5 py-2 transition-all"
      style={{ border: '1.5px solid #e0e0e0', background: 'white' }}
    >
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[16px] text-[13px]"
          style={{ background: '#f0faf6', color: '#0f6e56', fontWeight: 500 }}
        >
          {prefix}{t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-[13px] leading-none"
            style={{ color: '#4abd98' }}
            aria-label={`Remove ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[120px] text-[15px] px-1.5 py-1 outline-none"
        style={{ color: '#111', fontFamily: 'DM Sans, sans-serif' }}
      />
    </div>
  )
}

const cleanHashtag = (raw: string) => raw.trim().replace(/^#+/, '').replace(/\s+/g, '')
const cleanKeyword = (raw: string) => raw.trim().replace(/\s+/g, ' ')

export default function StepDiscovery({ data, update, nav }: Props) {
  return (
    <>
      <Question
        title="How should people find you?"
        subtitle="Optional. Helps us get you discovered, not just seen."
      />
      <div className="mt-4">
        <FieldLabel>Your hashtags</FieldLabel>
        <TagInput
          tags={data.brand_hashtags}
          onChange={(next) => update('brand_hashtags', next)}
          placeholder="Type a hashtag and press Enter"
          prefix="#"
          clean={cleanHashtag}
        />
        <Hint>Branded or local tags you want on posts, like #austineats or your restaurant name.</Hint>
      </div>
      <div className="mt-5">
        <FieldLabel>Search terms you want to rank for</FieldLabel>
        <TagInput
          tags={data.target_keywords}
          onChange={(next) => update('target_keywords', next)}
          placeholder="Type a phrase and press Enter"
          clean={cleanKeyword}
        />
        <Hint>What people Google to find a place like yours, e.g. &quot;best tacos near me.&quot;</Hint>
      </div>
      {nav}
    </>
  )
}
