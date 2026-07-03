'use client'

/**
 * CampaignTeamCard — who handles everything, right on the campaign page. Setup and the day-to-day run
 * on Apnosh, and the creative crafts (photos, video, design, social) are made by the Apnosh creative
 * team, matched to the campaign's style. (Honest v1: there is no per-creator marketplace yet, so no
 * invented individuals or ratings.) The header's Message link opens the full team page.
 */
import { ChevronRight } from 'lucide-react'
import { C, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import { creativeRolesForCampaign, vibeForCampaign } from '@/lib/campaigns/creators'
import type { SavedCampaign } from '@/lib/campaigns/view'

const DISC_WORK: Record<string, string> = { Video: 'Video & reels', Photo: 'Photos & shoots', Social: 'Social content', Design: 'Graphics & design' }

export default function CampaignTeamCard({ camp, onOpenTeam }: {
  camp: SavedCampaign
  onChoose: (discipline: string, creatorId: string) => void
  onOpenTeam: () => void
}) {
  const items = camp.draft.items.filter((i) => i.included && !i.optOut)
  const vibe = vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)
  const roles = creativeRolesForCampaign(items, camp.creatorChoices ?? {}, vibe)

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ ...EYEBROW }}>Your team</div>
        <button onClick={onOpenTeam} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.greenDk, padding: '12px 0 12px 12px', margin: '-12px 0' }}>
          Message <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW_CARD, padding: '6px 14px' }}>
        {/* setup + the run: Apnosh, by default */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: roles.length ? `1px solid ${C.line}` : 'none' }}>
          <span style={{ width: 40, height: 40, borderRadius: 20, background: GRAD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>◆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Apnosh</div>
            <div style={{ fontSize: 11.5, color: C.mute }}>Setup, posting, and the day-to-day</div>
          </div>
        </div>

        {/* the creative crafts: made by the Apnosh creative team, matched to your style */}
        {roles.map(({ discipline }, i) => (
          <div key={discipline} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: i < roles.length - 1 ? `1px solid ${C.line}` : 'none' }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{discipline[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{DISC_WORK[discipline] ?? discipline}</div>
              <div style={{ fontSize: 11.5, color: C.mute }}>Apnosh creative team</div>
            </div>
          </div>
        ))}
      </div>
      {roles.length > 0 && <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>Made by your Apnosh creative team, matched to your campaign.</div>}
    </div>
  )
}
