'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import { matchCuisine } from '../cuisine'
import { extractFromWebsite, isLookupEnabled, searchBusinesses, getBusinessPrefill, type PlaceCandidate } from '@/lib/onboarding-lookup'

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
  /* GOOGLE MATCHES, ASKED FOR HERE RATHER THAN SIX SCREENS LATER.
   * The Places lookup already existed, but it only ran on the LOCATION step, which for a
   * restaurant sits after cuisine, price range, signature dishes, ordering and the menu — all
   * things Google or their own site can answer. The owner was being interrogated for facts we
   * could already see. Asking at the name, where the name is, means every later step arrives
   * pre-filled and is mostly a confirmation. */
  const [lookupOn, setLookupOn] = useState(false)
  useEffect(() => { isLookupEnabled().then(setLookupOn) }, [])
  const [matches, setMatches] = useState<PlaceCandidate[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [pickedNote, setPickedNote] = useState('')

  async function findOnGoogle() {
    const q = data.biz_name.trim()
    if (!q || !lookupOn) return
    setFinding(true); setMatches(null); setPickedNote('')
    try {
      const found = await searchBusinesses(q)
      setMatches(found.slice(0, 4))
      if (!found.length) setPickedNote('No Google match yet. Keep going and we will fill this in as we go.')
    } catch {
      setPickedNote('Could not reach Google just now. Keep going, nothing is lost.')
    }
    setFinding(false)
  }

  async function usePlace(c: PlaceCandidate) {
    setFinding(true)
    const p = await getBusinessPrefill(c.placeId).catch(() => null)
    setFinding(false)
    if (!p) { setPickedNote('Could not read that listing. Keep going and we will fill it in together.'); return }

    /* Only ever fill BLANKS. Anything already typed is the owner's and outranks Google. */
    const got: string[] = []
    update('primary_place_id', c.placeId)
    if (!data.biz_name.trim() && p.name) update('biz_name', p.name)
    if (p.full_address) { update('full_address', p.full_address); got.push('address') }
    if (p.city) update('city', p.city)
    if (p.state) update('state', p.state)
    if (p.zip) update('zip', p.zip)
    if (p.phone && !data.phone) { update('phone', p.phone); got.push('phone') }
    if (p.website && !data.website.trim()) { update('website', p.website); got.push('website') }
    if (p.price_range && !data.price_range) { update('price_range', p.price_range); got.push('price range') }
    if (p.hours && Object.keys(p.hours).length && !Object.keys(data.hours || {}).length) {
      update('hours', p.hours); got.push('opening hours')
    }
    if (!data.biz_type && p.is_food) update('biz_type', FOOD_BIZ_TYPES[0])
    if (got.length) setFilledSomething(true)

    /* Their own site answers the things Google cannot: cuisine, signature dishes, the menu.
     * Run it straight away so the owner never has to think about a second button. */
    if (p.website) await runScan(p.website)

    setPickedNote(got.length
      ? `Got your ${summarize(got)} from Google. Everything below is already filled in. Change anything that looks off.`
      : 'Found your listing. We will fill the rest in as we go.')
    setMatches(null)
  }
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

          {/* One tap, and most of what follows is already answered. */}
          {lookupOn && data.biz_name.trim().length > 1 && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={findOnGoogle}
                disabled={finding || scanning}
                className="w-full rounded-[12px] border text-[13px] font-semibold disabled:opacity-50"
                style={{ borderColor: '#d8ece4', background: '#f0faf6', color: '#2e9a78', minHeight: 50 }}
              >
                {finding || scanning ? 'Looking you up…' : 'Find us on Google and fill this in'}
              </button>

              {matches && matches.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-[12px]" style={{ color: '#98989d' }}>Which one is you?</div>
                  {matches.map((m) => (
                    <button
                      key={m.placeId}
                      type="button"
                      onClick={() => usePlace(m)}
                      className="w-full text-left rounded-[12px] border bg-white px-3 py-2.5"
                      style={{ borderColor: '#e6e6ea', minHeight: 52 }}
                    >
                      <div className="text-[14px] font-semibold" style={{ color: '#1d1d1f' }}>{m.name}</div>
                      <div className="text-[12px]" style={{ color: '#98989d' }}>{m.address}</div>
                    </button>
                  ))}
                </div>
              )}

              {pickedNote && (
                <div className="mt-2 text-[12px] leading-relaxed" style={{ color: '#6e6e73' }}>{pickedNote}</div>
              )}
            </div>
          )}
        </div>

        {/* Website + optional scan — paste a site and we draft the story,
            menu, and specials so the owner is not typing it from scratch. */}
        <div>
          <FieldLabel>Website <span style={{ color: '#98989d', fontWeight: 400 }}>(optional)</span></FieldLabel>
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
              className="flex-shrink-0 px-4 rounded-[12px] text-[13px] font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)', boxShadow: '0 4px 14px rgba(74,189,152,0.30)' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'linear-gradient(135deg, #3fae8b, #23815f)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #4abd98, #2e9a78)' }}
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
            className="text-[13px] leading-relaxed rounded-[12px] px-3.5 py-2.5"
            style={{ background: '#f5f5f7', color: '#48484a', borderLeft: '3px solid #4abd98' }}
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
            className="w-full py-3 rounded-[12px] text-[13px] font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #2e9a78, #0f6e56)', boxShadow: '0 6px 18px rgba(46,154,120,0.30)', minHeight: 52, borderRadius: 26 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #23815f, #0a5a45)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #2e9a78, #0f6e56)' }}
          >
            See everything we filled and finish faster →
          </button>
        )}
      </div>
      {nav}
    </>
  )
}
