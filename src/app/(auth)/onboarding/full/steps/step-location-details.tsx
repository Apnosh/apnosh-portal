'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type OnboardingData, type LocationDraft, DAYS } from '../data'
import { Question, Input, FieldLabel, Hint } from '../ui'
import { getBusinessPrefill } from '@/lib/onboarding-lookup'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

type Hours = Record<string, { open: string; close: string; closed: boolean }>

const DEFAULT_HOUR = { open: '09:00', close: '17:00', closed: false }

/** A compact week editor reused for each location's hours. */
function HoursEditor({ hours, onChange }: { hours: Hours; onChange: (h: Hours) => void }) {
  function setDay(day: string, field: 'open' | 'close' | 'closed', value: string | boolean) {
    const next = { ...hours }
    if (!next[day]) next[day] = { ...DEFAULT_HOUR }
    next[day] = { ...next[day], [field]: value }
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-2 mt-2">
      {DAYS.map((day) => {
        const hr = hours[day] || DEFAULT_HOUR
        return (
          <div key={day} className="flex items-center gap-2 max-sm:gap-1.5">
            <span className="w-9 text-sm font-medium flex-shrink-0" style={{ color: '#111' }}>
              {day}
            </span>
            <input
              type="time"
              value={hr.open}
              disabled={hr.closed}
              onChange={(e) => setDay(day, 'open', e.target.value)}
              className="w-[110px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-0 text-sm text-center rounded-[10px] px-2.5 max-sm:px-1.5 py-2 outline-none disabled:opacity-35"
              style={{ border: '1.5px solid #e0e0e0', fontFamily: 'DM Sans, sans-serif' }}
            />
            <span className="text-[13px] flex-shrink-0" style={{ color: '#999' }}>to</span>
            <input
              type="time"
              value={hr.close}
              disabled={hr.closed}
              onChange={(e) => setDay(day, 'close', e.target.value)}
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
                onChange={(e) => setDay(day, 'closed', e.target.checked)}
                className="accent-[#4abd98]"
              />
              Closed
            </label>
          </div>
        )
      })}
    </div>
  )
}

function hasOpenHours(h: Hours | undefined): boolean {
  return !!h && Object.values(h).some((d) => !d.closed)
}

export default function StepLocationDetails({ data, update, nav }: Props) {
  const isMulti = data.location_count === 'Multiple'
  // Pull each spot's hours and phone from Google once, on arrival, so the
  // owner reviews real numbers instead of typing from a blank slate.
  const [pulling, setPulling] = useState(false)
  const [pullNote, setPullNote] = useState('')
  const pulled = useRef(false)

  useEffect(() => {
    if (pulled.current) return
    pulled.current = true
    ;(async () => {
      await Promise.resolve()
      const jobs: Array<{ kind: 'primary' } | { kind: 'extra'; index: number }> = []
      if (data.primary_place_id && !hasOpenHours(data.hours)) jobs.push({ kind: 'primary' })
      data.locations.forEach((l, i) => {
        if (l.place_id && !hasOpenHours(l.hours)) jobs.push({ kind: 'extra', index: i })
      })
      if (!jobs.length) return

      setPulling(true)
      let filled = 0
      // Snapshot the roster so concurrent updates compose onto one array.
      let roster: LocationDraft[] = [...data.locations]
      for (const job of jobs) {
        if (job.kind === 'primary') {
          const p = await getBusinessPrefill(data.primary_place_id)
          if (p) {
            if (hasOpenHours(p.hours) && !hasOpenHours(data.hours)) { update('hours', p.hours); filled++ }
            if (p.phone && !data.phone.trim()) update('phone', p.phone)
          }
        } else {
          const loc = roster[job.index]
          if (!loc) continue
          const p = await getBusinessPrefill(loc.place_id)
          if (p) {
            const next = { ...loc }
            if (hasOpenHours(p.hours) && !hasOpenHours(loc.hours)) { next.hours = p.hours; filled++ }
            if (p.phone && !loc.phone.trim()) next.phone = p.phone
            roster = roster.map((r, idx) => (idx === job.index ? next : r))
            update('locations', roster)
          }
        }
      }
      setPulling(false)
      setPullNote(filled
        ? `Pulled hours for ${filled} location${filled > 1 ? 's' : ''} from Google. Review and tweak anything.`
        : 'Add your hours below. You can change these anytime from your dashboard.')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setPrimaryHours(h: Hours) { update('hours', h) }
  function setExtraHours(i: number, h: Hours) {
    update('locations', data.locations.map((l, idx) => (idx === i ? { ...l, hours: h } : l)))
  }
  function setExtraPhone(i: number, phone: string) {
    update('locations', data.locations.map((l, idx) => (idx === i ? { ...l, phone } : l)))
  }

  const primaryName = isMulti
    ? (data.primary_location_name.trim() || 'Location 1')
    : (data.biz_name.trim() || 'Your location')

  return (
    <>
      <Question
        title="Hours and phone"
        subtitle={isMulti
          ? 'We pulled what we could. Check each spot and fix anything.'
          : 'We pulled what we could. Check it over and fix anything.'}
      />

      {(pulling || pullNote) && (
        <div
          className="mt-4 text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5"
          style={{ background: '#f0faf6', color: '#0f6e56', borderLeft: '3px solid #4abd98' }}
        >
          {pulling ? 'Pulling hours and phone from Google...' : `✓ ${pullNote}`}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* Primary location card */}
        <div className="rounded-[10px] px-3.5 py-3.5" style={{ background: '#f5f5f2' }}>
          <div className="text-sm font-semibold" style={{ color: '#111' }}>{primaryName}</div>
          {data.full_address && (
            <div className="text-[12px] mt-0.5" style={{ color: '#999' }}>{data.full_address}</div>
          )}
          <div className="mt-3">
            <FieldLabel>Phone number</FieldLabel>
            <Input
              value={data.phone}
              onChange={(v) => update('phone', v)}
              placeholder="(555) 123-4567"
              type="tel"
            />
          </div>
          <div className="mt-3">
            <FieldLabel>Hours</FieldLabel>
            <HoursEditor hours={data.hours} onChange={setPrimaryHours} />
          </div>
        </div>

        {/* Additional location cards */}
        {isMulti && data.locations.map((loc, i) => (
          <div key={i} className="rounded-[10px] px-3.5 py-3.5" style={{ background: '#f5f5f2' }}>
            <div className="text-sm font-semibold" style={{ color: '#111' }}>
              {loc.name.trim() || `Location ${i + 2}`}
            </div>
            {loc.full_address && (
              <div className="text-[12px] mt-0.5" style={{ color: '#999' }}>{loc.full_address}</div>
            )}
            <div className="mt-3">
              <FieldLabel>Phone number</FieldLabel>
              <Input
                value={loc.phone}
                onChange={(v) => setExtraPhone(i, v)}
                placeholder="(555) 123-4567"
                type="tel"
              />
            </div>
            <div className="mt-3">
              <FieldLabel>Hours</FieldLabel>
              <HoursEditor hours={loc.hours} onChange={(h) => setExtraHours(i, h)} />
            </div>
          </div>
        ))}

        <Hint>You can edit hours and phone for any location later from your dashboard.</Hint>
      </div>
      {nav}
    </>
  )
}
