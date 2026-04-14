'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { type OnboardingData, LOCATION_COUNTS, DAYS } from '../data'
import { Question, Input, FieldLabel, SingleChipGroup, Hint } from '../ui'

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
}

export default function StepLocation({ data, update, nav }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)

  // Initialize Google Places autocomplete
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

  return (
    <>
      <Question title="Where are you located?" subtitle="Start typing and select your address" />
      <div className="mt-4 space-y-3">
        {/* Address input */}
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

        {/* City / State / Zip */}
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

        {/* Location count */}
        <div className="mt-5">
          <FieldLabel>How many locations total?</FieldLabel>
          <SingleChipGroup
            options={LOCATION_COUNTS}
            selected={data.location_count}
            onSelect={(v) => update('location_count', v)}
          />
        </div>

        {data.location_count && data.location_count !== 'Just 1' && (
          <div
            className="text-[13px] leading-relaxed rounded-[10px] px-3.5 py-3 mt-3"
            style={{ background: '#f5f5f2', color: '#555', borderLeft: '3px solid #4abd98' }}
          >
            You can add your other locations from the dashboard after setup.
          </div>
        )}

        {/* Business hours */}
        <div className="mt-5">
          <FieldLabel>Business hours</FieldLabel>
          <div className="flex flex-col gap-2 mt-2">
            {DAYS.map((day) => {
              const hr = data.hours[day] || { open: '09:00', close: '17:00', closed: false }
              return (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-9 text-sm font-medium flex-shrink-0" style={{ color: '#111' }}>
                    {day}
                  </span>
                  <input
                    type="time"
                    value={hr.open}
                    disabled={hr.closed}
                    onChange={(e) => updateHours(day, 'open', e.target.value)}
                    className="w-[110px] text-sm text-center rounded-[10px] px-2.5 py-2 outline-none disabled:opacity-35"
                    style={{ border: '1.5px solid #e0e0e0', fontFamily: 'DM Sans, sans-serif' }}
                  />
                  <span className="text-[13px]" style={{ color: '#999' }}>to</span>
                  <input
                    type="time"
                    value={hr.close}
                    disabled={hr.closed}
                    onChange={(e) => updateHours(day, 'close', e.target.value)}
                    className="w-[110px] text-sm text-center rounded-[10px] px-2.5 py-2 outline-none disabled:opacity-35"
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
