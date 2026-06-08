'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type OnboardingData, DAYS } from '../data'
import { Question, Input, FieldLabel } from '../ui'
import { ensureClientForBusiness } from '@/lib/onboarding-actions'
import { getGBPLocationsForOnboarding, type OnboardingGBPLocation } from '@/lib/gbp-actions'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
  }
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

  // Single vs. multi is decided up front on the business-name step.
  const isMulti = !!data.location_count && data.location_count !== 'Just 1'

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

  function updateHours(day: string, field: 'open' | 'close' | 'closed', value: string | boolean) {
    const hours = { ...data.hours }
    if (!hours[day]) hours[day] = { open: '09:00', close: '17:00', closed: false }
    hours[day] = { ...hours[day], [field]: value }
    update('hours', hours)
  }

  function addLocation() {
    update('locations', [
      ...data.locations,
      { name: '', full_address: '', city: '', state: '', zip: '', place_id: '' },
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
        subtitle={isMulti
          ? 'Add each location so every one gets its own listing and reviews.'
          : 'Start typing and select your address'}
      />

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
                <span
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ color: '#0f6e56', background: '#e3f5ee' }}
                >
                  Main
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

        {/* Business hours */}
        <div className="mt-5">
          <FieldLabel>
            {isMulti ? 'Hours (main location)' : 'Business hours'}
          </FieldLabel>
          <div className="flex flex-col gap-2 mt-2">
            {DAYS.map((day) => {
              const hr = data.hours[day] || { open: '09:00', close: '17:00', closed: false }
              return (
                <div key={day} className="flex items-center gap-2 max-sm:gap-1.5">
                  <span className="w-9 text-sm font-medium flex-shrink-0" style={{ color: '#111' }}>
                    {day}
                  </span>
                  <input
                    type="time"
                    value={hr.open}
                    disabled={hr.closed}
                    onChange={(e) => updateHours(day, 'open', e.target.value)}
                    className="w-[110px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-0 text-sm text-center rounded-[10px] px-2.5 max-sm:px-1.5 py-2 outline-none disabled:opacity-35"
                    style={{ border: '1.5px solid #e0e0e0', fontFamily: 'DM Sans, sans-serif' }}
                  />
                  <span className="text-[13px] flex-shrink-0" style={{ color: '#999' }}>to</span>
                  <input
                    type="time"
                    value={hr.close}
                    disabled={hr.closed}
                    onChange={(e) => updateHours(day, 'close', e.target.value)}
                    className="w-[110px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-0 text-sm text-center rounded-[10px] px-2.5 max-sm:px-1.5 py-2 outline-none disabled:opacity-35"
                    style={{ border: '1.5px solid #e0e0e0', fontFamily: 'DM Sans, sans-serif' }}
                  />
                  <label
                    className="text-[13px] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    style={{ color: '#555' }}
                  >
                    <input
                      type="checkbox"
                      checked={hr.closed}
                      onChange={(e) => updateHours(day, 'closed', e.target.checked)}
                      className="accent-[#4abd98]"
                    />
                    Closed
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {nav}
    </>
  )
}
