'use client'

/**
 * Event form for the unified updates system.
 *
 * Events are time-and-place specific: a wine pairing dinner, a
 * tasting menu night, live music, ticketed brunch. Different from
 * promotions (which are passive offers) -- events have a fixed start
 * time, often a capacity, often ticket sales.
 *
 * Fanout: GBP events, Facebook event, IG announcement, website event
 * page, email blast. Each platform has its own event format.
 */

import type { EventPayload } from '@/lib/updates/types'

interface Props {
  payload: EventPayload
  onChange: (next: EventPayload) => void
}

export default function EventForm({ payload, onChange }: Props) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-2">Event details</label>

      {/* Name */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Event name</label>
        <input
          type="text"
          value={payload.name}
          placeholder="Wine Pairing Dinner with Sommelier Anna"
          onChange={e => onChange({ ...payload, name: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
        />
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Starts</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.start_at)}
            onChange={e => onChange({ ...payload, start_at: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Ends</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.end_at)}
            onChange={e => onChange({ ...payload, end_at: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Description</label>
        <textarea
          value={payload.description}
          placeholder="Five-course tasting menu paired with hand-selected wines from..."
          rows={3}
          onChange={e => onChange({ ...payload, description: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg resize-none"
        />
      </div>

      {/* Capacity + Ticket price */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Capacity <span className="text-ink-4">(optional)</span></label>
          <input
            type="number"
            value={payload.capacity ?? ''}
            placeholder="40"
            onChange={e => onChange({ ...payload, capacity: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Ticket price ($) <span className="text-ink-4">(optional)</span></label>
          <input
            type="number"
            step="0.01"
            value={payload.ticket_price ? (payload.ticket_price / 100).toFixed(2) : ''}
            placeholder="125.00"
            onChange={e => onChange({ ...payload, ticket_price: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Photo URL <span className="text-ink-4">(optional)</span></label>
          <input
            type="url"
            value={payload.photoUrl ?? ''}
            placeholder="https://..."
            onChange={e => onChange({ ...payload, photoUrl: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Ticket URL */}
      <div>
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Ticket / RSVP URL <span className="text-ink-4">(optional)</span></label>
        <input
          type="url"
          value={payload.ticket_url ?? ''}
          placeholder="https://eventbrite.com/... or https://opentable.com/..."
          onChange={e => onChange({ ...payload, ticket_url: e.target.value || undefined })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
        />
      </div>
    </div>
  )
}

function toLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  if (isNaN(d.getTime())) return ''
  return d.toISOString()
}
