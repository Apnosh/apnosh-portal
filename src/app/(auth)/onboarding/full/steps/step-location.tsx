'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type OnboardingData, FOOD_BIZ_TYPES } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import { matchCuisine } from '../cuisine'
import { ensureClientForBusiness } from '@/lib/onboarding-actions'
import { getGBPLocationsForOnboarding, type OnboardingGBPLocation } from '@/lib/gbp-actions'
import { isLookupEnabled, searchBusinesses, getBusinessPrefill, extractFromWebsite, type PlaceCandidate } from '@/lib/onboarding-lookup'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
}

/** A short line listing what the autofill populated, for the recap note. */
function summarize(found: string[]): string {
  if (!found.length) return ''
  if (found.length === 1) return found[0]
  return found.slice(0, -1).join(', ') + ' and ' + found[found.length - 1]
}

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  businessId: string | null
  /** Persist current progress before the OAuth redirect leaves the wizard. */
  onSaveBeforeRedirect: () => Promise<void>
}

export default function StepLocation({ data, update, nav, businessId, onSaveBeforeRedirect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)

  // Google Business Profile import state.
  const [gbpBusy, setGbpBusy] = useState(false)
  const [gbpNote, setGbpNote] = useState('')
  const [candidates, setCandidates] = useState<OnboardingGBPLocation[] | null>(null)
  const [picked, setPicked] = useState<Record<number, boolean>>({})
  const gbpHandled = useRef(false)

  // Search-to-prefill state: type a name, pick a result, we fill the address,
  // hours, and phone from Google Places. The roster fields stay editable so
  // typing by hand is always available as a fallback.
  const [lookupOn, setLookupOn] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [searchNote, setSearchNote] = useState('')
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // How many spots — chosen at the top of this step. 'Not open yet' is treated
  // as a single planned location. Everything below the choice stays hidden
  // until one is picked, so the search lands after the decision.
  const isMulti = data.location_count === 'Multiple'
  const isNotOpen = data.location_count === 'Not open yet'
  const hasChoice = !!data.location_count

  useEffect(() => {
    isLookupEnabled().then(setLookupOn)
  }, [])

  // Debounced business search as the owner types a spot's name.
  useEffect(() => {
    if (!lookupOn) return
    const q = query.trim()
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      if (q.length < 3) { setResults([]); return }
      setSearching(true)
      const r = await searchBusinesses(q)
      setResults(r)
      setSearching(false)
    }, 400)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [query, lookupOn])

  // Pick a search result -> pull its details and drop them into the roster.
  // The first pick fills the primary address (and, when empty, the business
  // name, type, website, phone, hours) and then reads the site to draft the
  // story, cuisine, menu, and specials -- one tap fills as much as we can.
  // Every pick after the first is appended as another spot.
  async function pickResult(c: PlaceCandidate) {
    setQuery('')
    setResults([])
    setPulling(true)
    const p = await getBusinessPrefill(c.placeId)
    if (!p) {
      setPulling(false)
      setSearchNote("We couldn't pull that one. You can type it in below.")
      return
    }
    const hasHours = Object.values(p.hours).some((h) => !h.closed)
    const name = p.name || c.name

    // A spot is already in place when the primary address is filled.
    const primaryFilled = isMulti
      ? data.primary_location_name.trim() || data.full_address.trim()
      : data.full_address.trim()

    if (primaryFilled) {
      // Additional spot -> append to the roster, leave the rest of the
      // profile alone.
      update('locations', [
        ...data.locations,
        {
          name, full_address: p.full_address,
          city: p.city, state: p.state, zip: p.zip, place_id: c.placeId,
          phone: p.phone || '', hours: hasHours ? p.hours : {},
        },
      ])
      setPulling(false)
      setSearchNote(`Added ${name}.`)
      return
    }

    // First spot -> fill the address plus any empty profile basics.
    if (isMulti) update('primary_location_name', name)
    update('primary_place_id', c.placeId)
    update('full_address', p.full_address)
    update('city', p.city)
    update('state', p.state)
    update('zip', p.zip)
    if (p.phone) update('phone', p.phone)
    if (hasHours) update('hours', p.hours)
    if (!data.biz_name.trim()) update('biz_name', name)
    if (p.website && !data.website.trim()) update('website', p.website)
    if (!data.biz_type && p.is_food) update('biz_type', FOOD_BIZ_TYPES[0])

    const got = ['address', 'hours']
    if (p.phone) got.push('phone')

    // Read the website to draft the story, cuisine, menu, and specials.
    const site = (p.website || data.website).trim()
    if (site) {
      const x = await extractFromWebsite(site)
      if (x) {
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
      }
    }

    setPulling(false)
    setSearchNote(`Added ${name}. Drafted ${summarize(got)}. Review and tweak anything as you go.`)
  }

  // Kick off OAuth: save progress (survives the full-page redirect), make sure
  // a client row exists to hang the token on, then bounce to Google.
  async function connectGoogleBusiness() {
    if (!businessId || gbpBusy) return
    setGbpBusy(true)
    setGbpNote('')
    try {
      await onSaveBeforeRedirect()
      const clientId = await ensureClientForBusiness(businessId)
      if (!clientId) {
        setGbpBusy(false)
        setGbpNote("We couldn't start the Google connection. You can enter your address by hand.")
        return
      }
      window.location.href =
        `/api/auth/google-business?clientId=${clientId}&origin=onboarding&returnTo=${encodeURIComponent('/onboarding/full')}`
    } catch {
      setGbpBusy(false)
      setGbpNote("Something went wrong starting the Google connection. You can enter your address by hand.")
    }
  }

  // On return from Google (?gbp=...), read the pending token and offer the
  // owner their locations to import. Runs once; waits for businessId to load.
  useEffect(() => {
    if (gbpHandled.current) return
    const params = new URLSearchParams(window.location.search)
    const gbp = params.get('gbp')
    if (!gbp) return
    // Wait for businessId to load before handling the post-OAuth return.
    if (gbp === 'connected' && !businessId) return

    gbpHandled.current = true
    window.history.replaceState({}, '', '/onboarding/full')

    // All state updates live inside the async body so none fire synchronously
    // in the effect (avoids cascading-render lint + churn).
    ;(async () => {
      if (gbp === 'cancelled') {
        setGbpNote('Google sign-in was cancelled. You can enter your address by hand or try again.')
        return
      }
      if (gbp === 'error') {
        setGbpNote("We couldn't reach Google Business. You can enter your address by hand or try again.")
        return
      }
      // gbp === 'connected'
      setGbpBusy(true)
      const clientId = await ensureClientForBusiness(businessId!)
      if (!clientId) {
        setGbpBusy(false)
        setGbpNote("We couldn't load your locations. You can enter them by hand.")
        return
      }
      const res = await getGBPLocationsForOnboarding(clientId)
      setGbpBusy(false)
      if (!res.success) {
        setGbpNote("We couldn't read your locations from Google. You can enter them by hand.")
        return
      }
      if (!res.data.length) {
        setGbpNote("We didn't find any locations on that Google account. You can enter them by hand.")
        return
      }
      setCandidates(res.data)
      setPicked(Object.fromEntries(res.data.map((_, i) => [i, true])))
    })()
  }, [businessId])

  // Pull the checked GBP locations into the wizard: first becomes the primary
  // (flat fields), the rest fill the additional-locations roster.
  function applyImport() {
    if (!candidates) return
    const chosen = candidates.filter((_, i) => picked[i])
    if (!chosen.length) { setCandidates(null); return }
    const [primary, ...rest] = chosen
    update('full_address', primary.full_address)
    update('city', primary.city)
    update('state', primary.state)
    update('zip', primary.zip)
    if (primary.phone) update('phone', primary.phone)
    if (primary.hours) update('hours', primary.hours)
    if (isMulti && primary.title) update('primary_location_name', primary.title)
    if (isMulti && rest.length) {
      update('locations', [
        ...data.locations,
        ...rest.map((l) => ({
          name: l.title, full_address: l.full_address,
          city: l.city, state: l.state, zip: l.zip, place_id: '',
          phone: l.phone || '', hours: l.hours || {},
        })),
      ])
    }
    setCandidates(null)
    setGbpNote(`Imported ${chosen.length} location${chosen.length > 1 ? 's' : ''} from Google.`)
  }

  // Initialize Google Places autocomplete on the primary address field
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    if (!apiKey || autocompleteRef.current) return

    function init() {
      if (!inputRef.current || !window.google?.maps?.places) return
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place?.address_components) return
        update('full_address', place.formatted_address || '')
        const get = (type: string) =>
          place.address_components?.find((c: any) => c.types.includes(type))
        const city = get('locality') || get('sublocality_level_1') || get('administrative_area_level_3')
        const state = get('administrative_area_level_1')
        const zip = get('postal_code')
        if (city) update('city', city.long_name)
        if (state) update('state', state.short_name)
        if (zip) update('zip', zip.long_name)
      })
      autocompleteRef.current = ac
    }

    if (window.google?.maps?.places) {
      init()
    } else {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      script.async = true
      script.onload = init
      document.head.appendChild(script)
    }
  }, [update])

  function addLocation() {
    update('locations', [
      ...data.locations,
      { name: '', full_address: '', city: '', state: '', zip: '', place_id: '', phone: '', hours: {} },
    ])
  }

  function updateLocation(i: number, field: 'name' | 'full_address', value: string) {
    update('locations', data.locations.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  function removeLocation(i: number) {
    update('locations', data.locations.filter((_, idx) => idx !== i))
  }

  // The primary address field carries the Google Places autocomplete. It is
  // rendered once — inside the roster's first card when multi, bare when single.
  const primaryAddressInput = (
    <input
      ref={inputRef}
      type="text"
      value={data.full_address}
      onChange={(e) => update('full_address', e.target.value)}
      placeholder="Start typing your address..."
      autoComplete="off"
      className="w-full text-[15px] rounded-[10px] px-3.5 py-3 outline-none transition-all"
      style={{ border: '1.5px solid #e0e0e0', fontFamily: 'DM Sans, sans-serif' }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.1)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#e0e0e0'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )

  const cityStateZip = (
    <div className="grid grid-cols-[5fr_2fr_3fr] gap-3">
      <div>
        <FieldLabel>City</FieldLabel>
        <Input value={data.city} onChange={(v) => update('city', v)} placeholder="City" />
      </div>
      <div>
        <FieldLabel>State</FieldLabel>
        <Input value={data.state} onChange={(v) => update('state', v)} placeholder="State" />
      </div>
      <div>
        <FieldLabel>Zip</FieldLabel>
        <Input value={data.zip} onChange={(v) => update('zip', v)} placeholder="Zip" />
      </div>
    </div>
  )

  return (
    <>
      <Question
        title={isMulti ? 'Where are your spots?' : 'Where are you located?'}
        subtitle={isNotOpen
          ? 'Add your planned address. Search may not find you yet.'
          : isMulti
          ? 'Search each spot to fill it in, or type them by hand.'
          : 'Search your spot to fill it in, or type it by hand.'}
      />

      {/* Choice first: how many spots (or not open yet). The search and the
          rest of the section stay hidden until this is picked. */}
      <div className="mt-4">
        <FieldLabel>How many spots?</FieldLabel>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { value: 'Just 1', label: 'One spot', sub: 'A single location' },
            { value: 'Multiple', label: 'A few', sub: 'Two or more' },
            { value: 'Not open yet', label: 'Not open yet', sub: 'Opening soon' },
          ].map((opt) => {
            const selected = data.location_count === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update('location_count', opt.value)}
                className="text-left rounded-[12px] px-3 py-3 transition-all"
                style={{
                  border: selected ? '1.5px solid #4abd98' : '1.5px solid #e0e0e0',
                  background: selected ? '#f0faf6' : '#fff',
                }}
              >
                <div className="text-sm font-semibold" style={{ color: selected ? '#0f6e56' : '#111' }}>
                  {opt.label}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: '#999' }}>{opt.sub}</div>
              </button>
            )
          })}
        </div>
        <Hint>You can change this anytime and edit locations later from your dashboard.</Hint>
      </div>

      {/* Search-first: find a spot by name and we pull its address, hours,
          and phone. The roster below stays editable for manual entry. */}
      {hasChoice && lookupOn && (
        <div className="mt-4">
          <FieldLabel>{isMulti ? 'Search for a spot' : 'Search for your spot'}</FieldLabel>
          <div className="relative">
            <Input
              value={query}
              onChange={setQuery}
              placeholder="Search by name, e.g. The Golden Spoon"
            />
            {(searching || results.length > 0) && (
              <div
                className="absolute left-0 right-0 top-full mt-1 z-10 rounded-[10px] overflow-hidden bg-white"
                style={{ border: '1.5px solid #e0e0e0', boxShadow: '0 6px 20px rgba(0,0,0,0.1)' }}
              >
                {searching && (
                  <div className="px-3.5 py-2.5 text-[13px]" style={{ color: '#999' }}>Searching...</div>
                )}
                {results.map((c) => (
                  <button
                    key={c.placeId}
                    type="button"
                    onClick={() => pickResult(c)}
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
          {(pulling || searchNote) && (
            <div
              className="mt-2 text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5"
              style={{ background: '#f0faf6', color: '#0f6e56', borderLeft: '3px solid #4abd98' }}
            >
              {pulling ? 'Pulling the details...' : `✓ ${searchNote}`}
            </div>
          )}
          <Hint>
            {isMulti
              ? 'Find each spot to fill it in. The first one fills your main details and reads your site too.'
              : 'Find your spot to fill in your address, hours, and details from your site.'}
          </Hint>
        </div>
      )}

      {hasChoice && (
      <>
      {/* Google Business import: connect once, pull every location's address,
          hours, and phone instead of typing them by hand. */}
      {candidates ? (
        <div className="mt-4 rounded-[10px] px-3.5 py-3.5" style={{ border: '1.5px solid #9fe1cb', background: '#f0faf6' }}>
          <div className="text-sm font-semibold mb-0.5" style={{ color: '#0f6e56' }}>
            We found {candidates.length} location{candidates.length > 1 ? 's' : ''} on Google
          </div>
          <div className="text-xs mb-3" style={{ color: '#2e9a78' }}>
            Pick the ones to add. We will fill in the details.
          </div>
          <div className="space-y-1.5">
            {candidates.map((c, i) => (
              <label
                key={i}
                className="flex items-start gap-2.5 cursor-pointer rounded-[8px] px-2.5 py-2 bg-white"
                style={{ border: '1px solid #e3f5ee' }}
              >
                <input
                  type="checkbox"
                  checked={!!picked[i]}
                  onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                  className="mt-0.5 accent-[#4abd98] flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: '#111' }}>
                    {c.title || c.full_address || 'Location'}
                  </div>
                  {c.full_address && (
                    <div className="text-[11px] truncate" style={{ color: '#999' }}>{c.full_address}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={applyImport}
              disabled={Object.values(picked).filter(Boolean).length === 0}
              className="flex-1 py-2.5 rounded-[10px] text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#4abd98' }}
            >
              Add {Object.values(picked).filter(Boolean).length || ''} location{Object.values(picked).filter(Boolean).length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => setCandidates(null)}
              className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold transition-colors"
              style={{ color: '#999', border: '1.5px solid #e0e0e0' }}
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mt-4 rounded-[10px] px-3.5 py-3 flex items-center gap-3"
          style={{ border: '1.5px solid #e0e0e0', background: '#fafafa' }}
        >
          <div
            className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: '#4abd981a' }}
          >
            🔍
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: '#111' }}>Connect Google Business</div>
            <div className="text-xs" style={{ color: '#999' }}>
              {isMulti
                ? 'Pull all your spots, hours, and phone in one tap.'
                : 'Pull your address, hours, and phone automatically.'}
            </div>
          </div>
          <button
            type="button"
            onClick={connectGoogleBusiness}
            disabled={!businessId || gbpBusy}
            className="text-xs font-semibold rounded-[20px] px-3.5 py-1.5 whitespace-nowrap text-white transition-colors disabled:opacity-50"
            style={{ background: '#4abd98' }}
          >
            {gbpBusy ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}

      {gbpNote && (
        <div
          className="mt-2 text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5"
          style={{ background: '#f5f5f2', color: '#555', borderLeft: '3px solid #4abd98' }}
        >
          {gbpNote}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {!isMulti ? (
          <>
            {primaryAddressInput}
            {cityStateZip}
          </>
        ) : (
          <div className="space-y-2">
            {/* Location 1 — the primary, anchored to the main business record */}
            <div className="rounded-[10px] px-3 py-3 space-y-2" style={{ background: '#f5f5f2' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
                  Location 1
                </span>
              </div>
              <Input
                value={data.primary_location_name}
                onChange={(v) => update('primary_location_name', v)}
                placeholder="Name this spot, e.g. Downtown"
              />
              {primaryAddressInput}
              {cityStateZip}
            </div>

            {/* Location 2…N — the additional spots */}
            {data.locations.map((loc, i) => (
              <div
                key={i}
                className="rounded-[10px] px-3 py-3 space-y-2"
                style={{ background: '#f5f5f2' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
                    Location {i + 2}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLocation(i)}
                    className="ml-auto text-xs font-medium"
                    style={{ color: '#d9655a' }}
                  >
                    Remove
                  </button>
                </div>
                <Input
                  value={loc.name}
                  onChange={(v) => updateLocation(i, 'name', v)}
                  placeholder="Name this spot, e.g. Alki or Bellevue"
                />
                <Input
                  value={loc.full_address}
                  onChange={(v) => updateLocation(i, 'full_address', v)}
                  placeholder="Street address, city, state"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addLocation}
              className="w-full py-2.5 rounded-[10px] text-[13px] font-semibold transition-colors"
              style={{ background: '#f0faf6', color: '#2e9a78', border: '1.5px dashed #4abd98' }}
            >
              + Add {data.locations.length ? 'another' : 'a'} location
            </button>
            <p className="text-[11px]" style={{ color: '#aaa' }}>
              You can always add or edit locations later from your dashboard.
            </p>
          </div>
        )}
      </div>
      </>
      )}
      {nav}
    </>
  )
}
