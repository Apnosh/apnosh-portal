'use client'
import { useState } from 'react'
import { Star } from 'lucide-react'
import { C } from './ui'
import { creativeRolesForCampaign, type Disc, type Style } from '@/lib/campaigns/creators'
import CreatorMarket from './creator-market'
import type { LineItem } from '@/lib/campaigns/types'

/**
 * "Your team" — the creators for a campaign's creative pieces. Each shows the
 * recommended (auto-matched) creator with the reason it was picked, plus a
 * Change button that opens the marketplace (ranked best-first) for that
 * discipline. Renders nothing when the campaign has no creative work.
 */
export default function CreatorsCard({ items, overrides, vibe, onChoose }: {
  items: LineItem[]
  overrides: Record<string, string>
  vibe: Style | null
  onChoose: (discipline: string, creatorId: string) => void
}) {
  const roles = creativeRolesForCampaign(items, overrides, vibe)
  const [openDisc, setOpenDisc] = useState<Disc | null>(null)
  if (!roles.length) return null
  const open = openDisc ? roles.find((r) => r.discipline === openDisc) : null
  return (
    <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.green, marginBottom: 4 }}>
        {roles.length > 1 ? 'Your creators' : 'Your creator'}
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 12 }}>
        Matched to your campaign from vetted creators who make content for restaurants like yours. Tap Change to pick a different one.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {roles.map(({ discipline, creator, reason, recommended }) => {
          const initials = creator.name.split(' ').map((x) => x[0]).join('')
          return (
            <div key={discipline} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: 16, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{initials}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{creator.name}</span>
                  {recommended && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: C.greenSoft, borderRadius: 5, padding: '1px 5px' }}>Best match</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.mute }}>{discipline} · {reason}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: C.mute, flexShrink: 0 }}>
                <Star size={11} style={{ fill: '#f5a623', color: '#f5a623' }} /> {creator.rating}
              </span>
              <button onClick={() => setOpenDisc(discipline)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: C.greenDk, padding: '4px 2px' }}>Change</button>
            </div>
          )
        })}
      </div>
      {openDisc && (
        <CreatorMarket
          discipline={openDisc}
          currentId={open?.creator.id ?? ''}
          vibe={vibe}
          onChoose={(id) => { onChoose(openDisc, id); setOpenDisc(null) }}
          onClose={() => setOpenDisc(null)}
        />
      )}
    </div>
  )
}
