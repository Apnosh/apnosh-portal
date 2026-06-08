'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES, CUISINES } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import { extractFromWebsite } from '@/lib/onboarding-lookup'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Fast-forward to the review screen once the AI has filled the profile. */
  onJumpToReview?: () => void
}

// Common ways a website describes its food, mapped to a CUISINES chip. Keys
// are matched as substrings against the AI's free-form cuisine string.
const CUISINE_SYNONYMS: Record<string, string> = {
  taco: 'Mexican', taqueria: 'Mexican', burrito: 'Mexican', tex: 'Mexican',
  sushi: 'Japanese', ramen: 'Japanese', izakaya: 'Japanese',
  pizza: 'Italian', pasta: 'Italian', trattoria: 'Italian',
  burger: 'American', diner: 'American', grill: 'American', steakhouse: 'American',
  bbq: 'BBQ / Smokehouse', barbecue: 'BBQ / Smokehouse', smokehouse: 'BBQ / Smokehouse',
  pho: 'Vietnamese', banh: 'Vietnamese',
  'dim sum': 'Chinese', szechuan: 'Chinese', sichuan: 'Chinese',
  curry: 'Indian', tandoori: 'Indian',
  taqueria_es: 'Mexican',
  greek: 'Mediterranean', falafel: 'Mediterranean', kebab: 'Middle Eastern',
  bakery: 'Bakery / Desserts', pastry: 'Bakery / Desserts', dessert: 'Bakery / Desserts',
  cafe: 'American', coffee: 'American',
  vegan: 'Vegan / Vegetarian', vegetarian: 'Vegan / Vegetarian',
  seafood: 'Seafood', oyster: 'Seafood',
  soul: 'Soul / Southern', southern: 'Soul / Southern', cajun: 'Soul / Southern',
}

/** Resolve a free-form cuisine string to a CUISINES chip, or Other + the raw text. */
function matchCuisine(raw: string): { cuisine: string; other: string } {
  const v = raw.trim()
  if (!v) return { cuisine: '', other: '' }
  const lower = v.toLowerCase()
  const exact = CUISINES.find((c) => c.toLowerCase() === lower)
  if (exact) return { cuisine: exact, other: '' }
  const partial = CUISINES.find(
    (c) => c !== 'Other' && (lower.includes(c.toLowerCase()) || c.toLowerCase().includes(lower)),
  )
  if (partial) return { cuisine: partial, other: '' }
  for (const [needle, target] of Object.entries(CUISINE_SYNONYMS)) {
    if (lower.includes(needle)) return { cuisine: target, other: '' }
  }
  return { cuisine: 'Other', other: v }
}

/** A short line describing what a prefill pass populated, for the recap card. */
function summarize(found: string[]): string {
  if (!found.length) return ''
  if (found.length === 1) return found[0]
  return found.slice(0, -1).join(', ') + ' and ' + found[found.length - 1]
}

export default function StepBizName({ data, update, nav, onJumpToReview }: Props) {
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string>('')
  // True once a website scan has actually populated fields, so we can offer
  // a shortcut straight to the review screen instead of every step.
  const [filledSomething, setFilledSomething] = useState(false)

  async function runScan(url: string) {
    const target = (url || data.website).trim()
    if (!target) return
    setScanning(true)
    setScanNote('')
    const x = await extractFromWebsite(target)
    setScanning(false)
    if (!x) { setScanNote("Could not read that site. No problem, you can fill this in as we go."); return }

    const got: string[] = []
    if (x.description && !data.biz_desc) { update('biz_desc', x.description); got.push('a description') }
    if (x.cuisine && !data.cuisine) {
      const m = matchCuisine(x.cuisine)
      if (m.cuisine) {
        update('cuisine', m.cuisine)
        if (m.cuisine === 'Other') update('cuisine_other', m.other)
        got.push('cuisine')
      }
    }
    if (x.signature_items.length && !data.signature_items.some((s) => s.trim())) {
      update('signature_items', x.signature_items); got.push(`${x.signature_items.length} signature dishes`)
    }
    if (x.menu_items.length && !data.menu_items.length) {
      update('menu_items', x.menu_items); got.push(`${x.menu_items.length} menu items`)
    }
    if (x.specials.length && !data.specials.length) {
      update('specials', x.specials); got.push(`${x.specials.length} specials`)
    }
    if (got.length) setFilledSomething(true)
    setScanNote(got.length
      ? `From your site we drafted ${summarize(got)}. Review and tweak anything as you go.`
      : 'Read your site. Nothing new to pull, so we will fill this in together.')
  }

  const isFood = FOOD_BIZ_TYPES.includes(data.biz_type as typeof FOOD_BIZ_TYPES[number])

  return (
    <>
      <Question
        title="Tell us about your business"
        subtitle="Start with the basics. You will find and add your locations next."
      />
      <div className="mt-4 space-y-4">
        {/* Business name — the brand, kept separate from any one location's
            Google listing (those get searched on the next step). */}
        <div>
          <FieldLabel>Business name</FieldLabel>
          <Input
            value={data.biz_name}
            onChange={(v) => update('biz_name', v)}
            placeholder="e.g. The Golden Spoon"
            autoFocus
          />
          <Hint>Your brand name. You will add each location on the next step.</Hint>
        </div>

        {/* Single vs. multi up front, so the location step can show one
            address or a full roster of spots. We keep 'Just 1' as the single
            sentinel; 'Multiple' flips the location step into roster mode. */}
        <div>
          <FieldLabel>One spot or a few?</FieldLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { value: 'Just 1', label: 'One location', sub: 'A single spot' },
              { value: 'Multiple', label: 'Multiple locations', sub: 'Two or more' },
            ].map((opt) => {
              const selected = data.location_count === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('location_count', opt.value)}
                  className="text-left rounded-[12px] px-3.5 py-3 transition-all"
                  style={{
                    border: selected ? '1.5px solid #4abd98' : '1.5px solid #e0e0e0',
                    background: selected ? '#f0faf6' : '#fff',
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: selected ? '#0f6e56' : '#111' }}>
                    {opt.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#999' }}>{opt.sub}</div>
                </button>
              )
            })}
          </div>
          <Hint>You can change this anytime, and add each spot on the next step.</Hint>
        </div>

        {/* Website + optional scan — paste a site and we draft the story,
            menu, and specials so the owner is not typing it from scratch. */}
        <div>
          <FieldLabel>Website <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span></FieldLabel>
          <div className="flex gap-2">
            <Input
              value={data.website}
              onChange={(v) => update('website', v)}
              placeholder="https://yourbusiness.com"
              type="url"
            />
            <button
              type="button"
              onClick={() => runScan(data.website)}
              disabled={!data.website.trim() || scanning}
              className="flex-shrink-0 px-4 rounded-[10px] text-[13px] font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#4abd98' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#2e9a78' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#4abd98' }}
            >
              {scanning ? 'Reading...' : 'Scan site'}
            </button>
          </div>
          <Hint>
            {isFood
              ? 'Drop your site link and we will pull your menu, dishes, and story so you are not typing it all.'
              : 'Drop your site link and we will pull your story so you are not typing it from scratch.'}
          </Hint>
        </div>

        {/* Scan recap */}
        {scanNote && (
          <div
            className="text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5"
            style={{ background: '#f5f5f2', color: '#555', borderLeft: '3px solid #4abd98' }}
          >
            {scanNote}
          </div>
        )}

        <div>
          <FieldLabel>Phone number</FieldLabel>
          <Input
            value={data.phone}
            onChange={(v) => update('phone', v)}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>

        {/* Fast-forward: once the AI has filled fields, let the owner jump
            straight to the review screen instead of tapping every step. */}
        {filledSomething && onJumpToReview && (
          <button
            type="button"
            onClick={onJumpToReview}
            className="w-full py-3 rounded-[10px] text-[13px] font-semibold text-white transition-all"
            style={{ background: '#2e9a78' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1f7d61' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#2e9a78' }}
          >
            See everything we filled and finish faster →
          </button>
        )}
      </div>
      {nav}
    </>
  )
}
