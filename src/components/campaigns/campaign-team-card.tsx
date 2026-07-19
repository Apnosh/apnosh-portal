'use client'

/**
 * CampaignTeamCard — who handles everything, right on the campaign page. Setup and the day-to-day run
 * on Apnosh, and the creative crafts (photos, video, design, social) are made by the Apnosh creative
 * team, matched to the campaign's style. (Honest v1: there is no per-creator marketplace yet, so no
 * invented individuals or ratings.) The header's Message link opens the full team page.
 */
import { MessageCircle } from 'lucide-react'
import { C, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import { creativeRolesForCampaign, vibeForCampaign } from '@/lib/campaigns/creators'
import type { SavedCampaign } from '@/lib/campaigns/view'

const DISC_WORK: Record<string, string> = { Video: 'Video & reels', Photo: 'Photos & shoots', Social: 'Social content', Design: 'Graphics & design' }

export default function CampaignTeamCard({ camp, onMessage }: {
  camp: SavedCampaign
  /** Message the team directly (goes to Apnosh for now; per-creator later). */
  onMessage: () => void
}) {
  const items = camp.draft.items.filter((i) => i.included && !i.optOut)
  const vibe = vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)
  const roles = creativeRolesForCampaign(items, camp.creatorChoices ?? {}, vibe)

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>Your team</div>

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

      {/* Message the team directly — goes to Apnosh for now. When there are other
          creators, each will get its own Send Message on its row. */}
      <button onClick={onMessage} style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        <MessageCircle size={15} /> Send Message
      </button>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 7, textAlign: 'center', lineHeight: 1.45 }}>Goes straight to your Apnosh team.</div>
    </div>
  )
}
