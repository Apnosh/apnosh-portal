'use client'

/**
 * "Since you were here" — a short recap of what changed since the owner's
 * last visit (posts that went live, reviews, team activity), pulled from
 * the events feed. Renders nothing when there's no news, so it leads the
 * home only when there's actually something worth coming back for.
 *
 * Data comes from getSinceLastChecked() and is already fetched by the
 * dashboard load route; this just surfaces it. Visual language matches the
 * other mobile-home sections (.sx / .list / .row / .chip).
 */

import { MhIcon } from './mh-icons'

export interface SinceEvent {
  id: string
  whenLabel: string
  text: string
  emphasis: 'win' | 'info' | 'mute'
  big: boolean
  extra?: string
}

export function SinceLastChecked({ events }: { events: SinceEvent[] }) {
  if (!events.length) return null
  return (
    <section className="sx slc">
      <div className="sx-head">
        <p className="t-eyebrow">Since you were here</p>
      </div>
      <ul className="list">
        {events.map(e => (
          <li key={e.id}>
            <div className="row slc-row">
              <span className={`slc-dot ${e.emphasis}${e.big ? ' big' : ''}`} aria-hidden>
                {e.big && e.emphasis === 'win' ? <MhIcon name="check" sw={2.6} size={11} /> : null}
              </span>
              <p className="rowt">
                {e.text}
                {e.extra ? <span className="muted"> · {e.extra}</span> : null}
              </p>
              <span className="chip slc-when">{e.whenLabel}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
