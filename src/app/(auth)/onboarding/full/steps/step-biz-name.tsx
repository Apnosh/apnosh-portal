'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES, CUISINES } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import {
  isLookupEnabled,
  searchBusinesses,
  getBusinessPrefill,
  extractFromWebsite,
  type PlaceCandidate,
} from '@/lib/onboarding-lookup'

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
  const [lookupOn, setLookupOn] = useState(false)
  const [query, setQuery] = useState(data.biz_name)
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [recap, setRecap] = useState<string>('')
  const [scanNote, setScanNote] = useState<string>('')
  // True once a lookup or scan has actually populated fields, so we can offer
  // a shortcut straight to the review screen instead of every step.
  const [filledSomething, setFilledSomething] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPicked = useRef<string>('')

  useEffect(() => {
    isLookupEnabled().then(setLookupOn)
  }, [])

  // Debounced business search as the owner types their name.
  useEffect(() => {
    if (!lookupOn) return
    const q = query.trim()
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      if (q.length < 3 || q === lastPicked.current) {
        setCandidates([])
        return
      }
      setSearching(true)
      const results = await searchBusinesses(q)
      setCandidates(results)
      setSearching(false)
    }, 400)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, lookupOn])

  async function pick(c: PlaceCandidate) {
    lastPicked.current = c.name
    setQuery(c.name)
    setCandidates([])
    setPulling(true)
    setRecap('')

    const p = await getBusinessPrefill(c.placeId)
    if (!p) { setPulling(false); return }

    const found: string[] = []
    update('biz_name', p.name || c.name)
    if (p.website) { update('website', p.website); found.push('website') }
    if (p.phone) { update('phone', p.phone); found.push('phone') }
    if (p.full_address) {
      update('full_address', p.full_address)
      update('city', p.city)
      update('state', p.state)
      update('zip', p.zip)
      found.push('address')
    }
    if (Object.values(p.hours).some((h) => !h.closed)) {
      update('hours', p.hours)
      found.push('hours')
    }
    if (p.price_range) { update('price_range', p.price_range); found.push('price range') }
    if (p.is_food && !data.biz_type) {
      update('biz_type', FOOD_BIZ_TYPES[0])
    }
    setRecap(found.length ? `Pulled your ${summarize(found)}.` : 'Found it.')
    if (found.length) setFilledSomething(true)
    setPulling(false)

    // Chain the website scan automatically when we got a site URL.
    if (p.website) await runScan(p.website)
  }

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
        title="Let's fill this in for you"
        subtitle={lookupOn
          ? 'Search your name or paste your site. We do the typing.'
          : 'Paste your website and we will pull what we can.'}
      />
      <div className="mt-4 space-y-4">
        {/* Name + (when enabled) live search dropdown */}
        <div className="relative">
          <Input
            value={query}
            onChange={(v) => { setQuery(v); update('biz_name', v) }}
            placeholder="e.g. The Golden Spoon"
            autoFocus
          />
          {lookupOn && (searching || candidates.length > 0) && (
            <div
              className="absolute left-0 right-0 top-full mt-1 z-10 rounded-[10px] overflow-hidden bg-white"
              style={{ border: '1.5px solid #e0e0e0', boxShadow: '0 6px 20px rgba(0,0,0,0.1)' }}
            >
              {searching && (
                <div className="px-3.5 py-2.5 text-[13px]" style={{ color: '#999' }}>Searching...</div>
              )}
              {candidates.map((c) => (
                <button
                  key={c.placeId}
                  type="button"
                  onClick={() => pick(c)}
                  className="w-full text-left px-3.5 py-2.5 transition-colors"
                  style={{ borderTop: '1px solid #f0f0f0' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0faf6' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                >
                  <div className="text-sm font-medium" style={{ color: '#111' }}>{c.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#999' }}>{c.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Prefill recap */}
        {(pulling || recap) && (
          <div
            className="text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5"
            style={{ background: '#f0faf6', color: '#0f6e56', borderLeft: '3px solid #4abd98' }}
          >
            {pulling ? 'Looking you up...' : `✓ ${recap}`}
          </div>
        )}

        <div>
          <FieldLabel>Website URL</FieldLabel>
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
