'use client'
import { C } from './ui'
import { creativeRolesForCampaign, type Style } from '@/lib/campaigns/creators'
import type { LineItem } from '@/lib/campaigns/types'

/**
 * "Your content team" — the crafts a campaign's creative pieces need, each made by
 * the Apnosh creative team and matched to the campaign's style. Renders nothing when
 * the campaign has no creative work. (Honest v1: there is no per-creator marketplace
 * yet, so we show the craft + team, not invented named individuals or ratings.)
 */
const CRAFT: Record<string, string> = { Video: 'Video & reels', Photo: 'Photos & shoots', Social: 'Social content', Design: 'Graphics & design' }

export default function CreatorsCard({ items, overrides, vibe }: {
  items: LineItem[]
  overrides: Record<string, string>
  vibe: Style | null
  onChoose: (discipline: string, creatorId: string) => void
}) {
  const roles = creativeRolesForCampaign(items, overrides, vibe)
  if (!roles.length) return null
  return (
    <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.green, marginBottom: 4 }}>
        Your content team
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 12 }}>
        Apnosh&apos;s creative team makes each piece, matched to your campaign&apos;s style.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {roles.map(({ discipline, reason }) => (
          <div key={discipline} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 16, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{discipline[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{CRAFT[discipline] ?? discipline}</div>
              <div style={{ fontSize: 11.5, color: C.mute }}>{reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
