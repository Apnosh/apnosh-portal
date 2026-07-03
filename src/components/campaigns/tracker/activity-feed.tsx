'use client'

/**
 * ActivityFeed — the "Latest" list: every real production event, newest first. Each event is backed by
 * a real timestamp (from getCampaignActivity); approximate ones (from updated_at) are marked "~". Returns
 * null when there's nothing real to show — no empty shell.
 */
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { C, EYEBROW } from '@/components/campaigns/ui'
import type { ActivityEvent } from '@/lib/campaigns/tracker/types'

// One color grammar: green = done/out, amber = touched the owner (delivered for OK, changes asked),
// gray = the team quietly working. No off-grammar blues/purples.
const KIND_DOT: Record<ActivityEvent['kind'], string> = {
  sent: C.faint,
  making: C.faint,
  delivered: C.amber,
  approved: C.green,
  revision: C.amber,
  scheduled: C.faint,
  posted: C.green,
  started: C.faint,
  dropped: C.amber,   // a piece lost its maker — the owner should notice
}

function relTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  if (h < 48) return 'yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [showAll, setShowAll] = useState(false)
  if (!events.length) return null
  const capped = events.slice(0, 40)   // most-recent 40; older stay off-screen rather than a giant list
  const shown = showAll ? capped : capped.slice(0, 5)

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>Latest</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: KIND_DOT[e.kind] ?? C.faint, flexShrink: 0, marginTop: 5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.35 }}>
                {e.text}
                {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>view <ExternalLink size={10} /></a>}
              </div>
              {e.piece && <div style={{ fontSize: 11, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.piece}</div>}
            </div>
            <span style={{ flexShrink: 0, fontSize: 11, color: C.faint }}>{e.precise ? '' : '~ '}{relTime(e.atISO)}</span>
          </div>
        ))}
      </div>
      {!showAll && capped.length > 5 && (
        <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '13px 0 5px', fontSize: 12.5, fontWeight: 600, color: C.greenDk }}>Show all ({capped.length})</button>
      )}
    </div>
  )
}
