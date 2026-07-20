'use client'

/**
 * CampaignTeamCard — who actually handles this campaign.
 *
 * Every row here comes from the line items' real producer (lib/campaigns/doers.ts),
 * not from assumptions. Previously this card hardcoded an "Apnosh" row and derived
 * the creative crafts by string-matching line NAMES, so an AI-built or owner-run
 * campaign still showed a human team standing behind it. Now:
 *   - a campaign the owner runs shows "You"
 *   - a campaign the AI drafts shows "Apnosh AI" (and says you approve first)
 *   - only genuinely Apnosh-run work shows Apnosh
 *   - creator rows appear only when a line is actually creator-produced
 * A doer with no work in this campaign is not shown at all.
 *
 * The craft breakdown (video / photo / social / design) still uses the existing
 * matcher, but is now scoped to the Apnosh-run lines only — so it describes work
 * the team is really doing rather than every line on the plan.
 *
 * Message is offered only where there is a human on the other end: you don't
 * message yourself, and you don't message the AI.
 */
import { MessageCircle, Sparkles, User } from 'lucide-react'
import { C, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import { creativeRolesForCampaign, vibeForCampaign } from '@/lib/campaigns/creators'
import { doerGroups, type DoerKind } from '@/lib/campaigns/doers'
import type { SavedCampaign } from '@/lib/campaigns/view'

const DISC_WORK: Record<string, string> = { Video: 'Video & reels', Photo: 'Photos & shoots', Social: 'Social content', Design: 'Graphics & design' }

/** "A", "A and B", "A, B, and C", "A, B, and 2 more" — real line names only. */
function joinNames(names: string[], cap = 3): string {
  const shown = names.slice(0, cap)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')}, and ${rest} more`
  if (shown.length === 1) return shown[0]
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`
  return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`
}

function Avatar({ kind }: { kind: DoerKind }) {
  const base = { width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 } as const
  if (kind === 'apnosh') return <span style={{ ...base, background: GRAD, color: '#fff' }}>◆</span>
  if (kind === 'ai') return <span style={{ ...base, background: C.greenSoft, color: C.greenDk }}><Sparkles size={17} /></span>
  if (kind === 'you') return <span style={{ ...base, background: '#fff', border: `1px solid ${C.line}`, color: C.mute }}><User size={17} /></span>
  return <span style={{ ...base, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk }}>★</span>
}

export default function CampaignTeamCard({ camp, onMessage }: {
  camp: SavedCampaign
  /** Message the team directly (goes to Apnosh for now; per-creator later). */
  onMessage: () => void
}) {
  const groups = doerGroups(camp.draft.items)
  if (groups.length === 0) return null

  // Craft rows describe only the work Apnosh actually runs.
  const apnoshLines = groups.find((g) => g.kind === 'apnosh')?.lines ?? []
  const vibe = vibeForCampaign(camp.draft.goalKey, camp.draft.occasion)
  const roles = apnoshLines.length ? creativeRolesForCampaign(apnoshLines, camp.creatorChoices ?? {}, vibe) : []

  // Rows = one per doer, with the Apnosh craft breakdown folded in beneath Apnosh.
  const rowCount = groups.length + roles.length

  let rendered = 0
  const divider = () => (++rendered < rowCount ? `1px solid ${C.line}` : 'none')

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...EYEBROW, marginBottom: 10 }}>Your team</div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW_CARD, padding: '6px 14px' }}>
        {groups.map((g) => (
          <div key={g.kind}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: divider() }}>
              <Avatar kind={g.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{g.title}</div>
                <div style={{ fontSize: 11.5, color: C.mute }}>{g.sub}</div>
                {/* What this doer is actually on the hook for, by real line name. */}
                <div style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 1.4 }}>{joinNames(g.labels)}</div>
              </div>
              {g.messageable && <RowMessage onMessage={onMessage} label={g.title} />}
            </div>

            {/* Apnosh's craft breakdown, scoped to the lines Apnosh runs. */}
            {g.kind === 'apnosh' && roles.map(({ discipline }) => (
              <div key={discipline} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: divider() }}>
                <span style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{discipline[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{DISC_WORK[discipline] ?? discipline}</div>
                  <div style={{ fontSize: 11.5, color: C.mute }}>Apnosh creative team</div>
                </div>
                <RowMessage onMessage={onMessage} label={DISC_WORK[discipline] ?? discipline} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {roles.length > 0 && <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>Made by your Apnosh creative team, matched to your campaign.</div>}
    </div>
  )
}

/** The simple per-row Send Message action. Goes to Apnosh for now; when other
 *  creators exist it will address each one directly. */
function RowMessage({ onMessage, label }: { onMessage: () => void; label: string }) {
  return (
    <button onClick={onMessage} aria-label={`Message ${label}`} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px', borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      <MessageCircle size={13} /> Message
    </button>
  )
}
