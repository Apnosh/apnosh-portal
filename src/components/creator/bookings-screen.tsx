'use client'

/**
 * BookingsScreen — the Bookings tab, now two views: a master Calendar (everything dated in one place)
 * and the Requests list (accept / price / reschedule). Calendar is the default so a creator opens to
 * "what's coming up" at a glance; the list stays for the actionable inbox.
 */

import { useState } from 'react'
import CreatorCalendar from './creator-calendar'
import BookingsList from './bookings-list'
import type { CalendarItem, IncomingBooking, QuoteRequest } from '@/lib/marketplace/creator-schedule-types'

export default function BookingsScreen({ calendar, initialVendor, initialBookings, initialQuotes }: {
  calendar: CalendarItem[]
  initialVendor: { name: string; slug: string } | null
  initialBookings: IncomingBooking[]
  initialQuotes: QuoteRequest[]
}) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const pending = initialBookings.filter((b) => b.status === 'held').length + initialQuotes.length
  return (
    <div style={{ background: '#f5f5f7', minHeight: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: '12px 14px 2px' }}>
        {(['calendar', 'list'] as const).map((v) => {
          const on = view === v
          const count = v === 'list' ? pending : 0
          return (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 10, border: `1px solid ${on ? '#4abd98' : '#e6e6ea'}`, background: on ? '#eaf7f3' : '#fff', color: on ? '#2e9a78' : '#6e6e73', fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>
              {v === 'calendar' ? 'Calendar' : 'Requests'}
              {count > 0 && <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: on ? '#4abd98' : '#eef0ef', color: on ? '#fff' : '#aeaeb2', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
            </button>
          )
        })}
      </div>
      {view === 'calendar'
        ? <CreatorCalendar items={calendar} />
        : <BookingsList initialVendor={initialVendor} initialBookings={initialBookings} initialQuotes={initialQuotes} />}
    </div>
  )
}
