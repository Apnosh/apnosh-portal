'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import { matchCuisine } from '../cuisine'
import { extractFromWebsite } from '@/lib/onboarding-lookup'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Fast-forward to the review screen once the AI has filled the profile. */
  onJumpToReview?: () => void
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
    if (!x) { setScanNote("We could not read that site automatically. Some sites load their menu with code we cannot scan yet. No problem, we will fill this in together as we go."); return }

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
    if (x.service_styles.length && !data.service_styles.length) {
      update('service_styles', x.service_styles); got.push('how you serve')
    }
    if (x.dietary_options.length && !data.dietary_options.length) {
      update('dietary_options', x.dietary_options); got.push('dietary options')
    }
    if (x.reservations_platform && !data.reservations_platform) {
      update('reservations_platform', x.reservations_platform); got.push('reservations')
    }
    if (x.delivery_platforms.length && !data.delivery_platforms.length) {
      update('delivery_platforms', x.delivery_platforms); got.push('delivery')
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
