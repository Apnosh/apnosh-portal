/**
 * Upcoming events for a restaurant site.
 * Reads client_updates of type='event' where start_at >= today.
 */

import type { EventPayload } from '@/lib/updates/types'
import { Calendar, Users, Ticket } from 'lucide-react'

interface UpcomingEventsProps {
  events: EventPayload[]
}

export default function UpcomingEvents({ events }: UpcomingEventsProps) {
  if (events.length === 0) return null

  return (
    <section className="py-16 px-6 bg-stone-50">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-stone-900 mb-8 text-center">Upcoming events</h2>

        <div className="space-y-4">
          {events.map((e, i) => {
            const start = new Date(e.start_at)
            const end = new Date(e.end_at)
            return (
              <div key={i} className="bg-white rounded-xl border border-stone-200 p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {e.photoUrl && (
                    <div
                      className="w-full md:w-48 h-32 rounded-lg bg-cover bg-center shrink-0"
                      style={{ backgroundImage: `url(${e.photoUrl})` }}
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-stone-900 mb-2">{e.name}</h3>
                    <p className="text-stone-600 text-sm mb-4 leading-relaxed">{e.description}</p>

                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-700 mb-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-stone-500" />
                        {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}·{' '}
                        {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                        {' – '}
                        {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                      </div>
                      {e.capacity && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-stone-500" />
                          {e.capacity} seats
                        </div>
                      )}
                      {e.ticket_price && (
                        <div className="flex items-center gap-1.5">
                          <Ticket className="w-4 h-4 text-stone-500" />
                          ${(e.ticket_price / 100).toFixed(2)}
                        </div>
                      )}
                    </div>

                    {e.ticket_url && (
                      <a
                        href={e.ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 transition-colors"
                      >
                        Reserve a spot →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
