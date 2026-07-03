'use client'

/**
 * CampaignTeamCard — who handles everything, right on the campaign page. Setup and the day-to-day run
 * on Apnosh by default (fixed for now). Creative work shows the marketplace people: auto-matched
 * best-first per craft (photos, video, design...), and the owner can tap Change to pick a different
 * creator from the marketplace sheet — same picker as the builder. Honest: a change applies to new
 * pieces, never to work already in flight. The header's Message link opens the full team page.
 */
import { useState } from 'react'
import { Star, ChevronRight } from 'lucide-react'
import { C, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import CreatorMarket from './creator-market'
import { creativeRolesForCampaign, vibeForCampaign, type Disc } from '@/lib/campaigns/creators'
import type { SavedCampaign } from '@/lib/campaigns/view'

const DISC_WORK: Record<string, string> = { Video: 'Video & reels', Photo: 'Photos & shoots', Social: 'Social content', Design: 'Graphics & design' }

export default function CampaignTeamCard({ camp, onChoose, onOpenTeam }: {
  camp: SavedCampaign
  onChoose: (discipline: string, creatorId: string) => void
  onOpenTeam: () => void
}) {
  const items = camp.draft.items.filter((i) => i.included && !i.optOut)
  const vibe = vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)
  const roles = creativeRolesForCampaign(items, camp.creatorChoices ?? {}, vibe)
  const [openDisc, setOpenDisc] = useState<Disc | null>(null)
  const open = openDisc ? roles.find((r) => r.discipline === openDisc) : null

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

        {/* the creative crafts: matched from the marketplace, changeable */}
        {roles.map(({ discipline, creator, recommended }, i) => {
          const initials = creator.name.split(' ').map((x) => x[0]).join('')
          return (
            <div key={discipline} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: i < roles.length - 1 ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{initials}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{creator.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: C.mute }}>
                    <Star size={10} style={{ fill: C.gold, color: C.gold }} /> {creator.rating}
                  </span>
                  {recommended && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 7px' }}>Best match</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.mute }}>{DISC_WORK[discipline] ?? discipline}</div>
              </div>
              <button onClick={() => setOpenDisc(discipline)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: C.greenDk, padding: '13px 10px', margin: '-13px -8px -13px 0' }}>Change</button>
            </div>
          )
        })}
      </div>
      {roles.length > 0 && <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>Matched for you. A change applies to new pieces, not work already going.</div>}

      {openDisc && (
        <CreatorMarket
          discipline={openDisc}
          currentId={open?.creator.id ?? ''}
          vibe={vibe}
          onChoose={(cid) => { onChoose(openDisc, cid); setOpenDisc(null) }}
          onClose={() => setOpenDisc(null)}
        />
      )}
    </div>
  )
}
