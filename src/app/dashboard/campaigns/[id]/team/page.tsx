'use client'

/**
 * /dashboard/campaigns/[id]/team — "Your team": the people on THIS campaign. Assigned creators come
 * from the campaign's real pieces (creator lane on the work orders); the Apnosh crew rows are the
 * message contacts (strategist / billing / support). HONEST v1: there is no direct owner-to-creator
 * chat yet, so every Message button opens the matching Apnosh team thread (a creator's row routes to
 * their discipline's contact, e.g. the videographer thread for a reel, with the creator + campaign
 * pre-filled in the composer) and the team loops the creator in — the note under the list says
 * exactly that. Enrichment (specialty, rating) comes from the
 * creator pool when the name resolves; otherwise the row stays plain. Same 480 shell as /ready.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Compass, CreditCard, Loader2, MessageCircle } from 'lucide-react'
import { C, DISPLAY, EYEBROW, GRAD, SHADOW_CARD } from '@/components/campaigns/ui'
import MotionStyles from '@/components/campaigns/motion-styles'
import { creativeRolesForCampaign, vibeForCampaign } from '@/lib/campaigns/creators'
import type { SavedCampaign } from '@/lib/campaigns/view'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

/** channel -> the message contact key that owns that craft (mvp-messages CONTACTS). */
const CHANNEL_CONTACT: Record<string, string> = { Video: 'videographer', Photo: 'photographer', Design: 'designer', Social: 'strategist' }
const OUT = new Set(['posted', 'gathering', 'dropped'])

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [camp, setCamp] = useState<SavedCampaign | null>(null)
  const [pieces, setPieces] = useState<TrackerPiece[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/campaigns/${id}`)
      if (!r.ok) throw new Error()
      const j = await r.json()
      setCamp((j.campaign as SavedCampaign) ?? null)
      setPieces((j.pieces as TrackerPiece[]) ?? [])
    } catch { setError(true) }
  }, [id])
  useEffect(() => { load() }, [load])

  // draft pre-fills the composer so the team knows which person/campaign it's about.
  const msg = (to: string, draft?: string) =>
    router.push(`/dashboard/messages?to=${to}${draft ? `&draft=${encodeURIComponent(draft)}` : ''}`)

  // YOUR CREATORS = the people from the marketplace: anyone with real work on this campaign
  // ("Making: ..."), plus the campaign's matched creators from the builder even while your in-house
  // team makes the pieces ("Matched for your video work" — honest: matched, not making). One row each.
  const makers: { key: string; title: string; making: string; to: string }[] = []
  let teamPieces: TrackerPiece[] = []
  if (pieces) {
    const byWho = new Map<string, TrackerPiece[]>()
    for (const p of pieces) {
      const k = p.lane === 'creator' && p.who !== 'Your team' ? p.who : 'Your team'
      byWho.set(k, [...(byWho.get(k) ?? []), p])
    }
    teamPieces = byWho.get('Your team') ?? []
    for (const [who, list] of byWho) {
      if (who === 'Your team') continue
      const active = list.find((p) => !OUT.has(p.stage)) ?? list[0]
      const verb = OUT.has(active.stage) ? 'Made' : 'Making'
      makers.push({
        key: who, title: who,
        making: `${verb}: ${active.label}${list.length > 1 ? ` +${list.length - 1} more` : ''}`,
        to: CHANNEL_CONTACT[active.channel] ?? 'strategist',
      })
    }
  }
  if (camp) {
    const items = camp.draft.items.filter((i) => i.included && !i.optOut)
    const roles = creativeRolesForCampaign(items, camp.creatorChoices ?? {}, vibeForCampaign(camp.draft.goalKey, camp.draft.occasion))
    for (const r of roles) {
      if (makers.some((m) => m.key === r.creator.name)) continue
      makers.push({
        key: r.creator.name, title: r.creator.name,
        making: `Matched for your ${r.discipline.toLowerCase()} work`,
        to: CHANNEL_CONTACT[r.discipline] ?? 'strategist',
      })
    }
  }

  // The in-house maker joins the Apnosh crew (it IS Apnosh), above the standing contacts.
  const teamActive = teamPieces.find((p) => !OUT.has(p.stage)) ?? teamPieces[0]
  const crew = [
    ...(teamActive ? [{ key: 'content-team', to: CHANNEL_CONTACT[teamActive.channel] ?? 'strategist', icon: '◆', title: 'Your content team', sub: `${OUT.has(teamActive.stage) ? 'Made' : 'Making'}: ${teamActive.label}${teamPieces.length > 1 ? ` +${teamPieces.length - 1} more` : ''}` }] : []),
    { key: 'strategist', to: 'strategist', icon: <Compass size={18} color={C.greenDk} />, title: 'Your strategist', sub: 'The plan, setup help, anything' },
    { key: 'account', to: 'account', icon: <CreditCard size={18} color={C.greenDk} />, title: 'Account & billing', sub: 'Your bill and payments' },
    { key: 'support', to: 'support', icon: <MessageCircle size={18} color={C.greenDk} />, title: 'Support', sub: 'Anything else' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
          <button onClick={() => router.push(`/dashboard/campaigns/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.mute, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px' }}>
          <MotionStyles />
          {error ? <div style={{ color: C.red, fontSize: 13.5, padding: '20px 0', textAlign: 'center' }}>Could not load your team.</div>
            : pieces === null ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: C.faint }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
            : (
              <>
                <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: '-.02em', margin: '0 0 2px', lineHeight: 1.15 }}>Your team</h1>
                <p style={{ fontSize: 13, color: C.mute, margin: '0 0 16px' }}>{camp?.draft.name || 'This campaign'}</p>

                {makers.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ ...EYEBROW, marginBottom: 10 }}>Your creators</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {makers.map((m) => (
                        <div key={m.key} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 14, boxShadow: SHADOW_CARD, padding: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>◆</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{m.title}</div>
                            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.making}</div>
                          </div>
                          <button onClick={() => msg(m.to, `About ${m.title} on ${camp?.draft.name || 'this campaign'}: `)} className="cw-press" style={{ flexShrink: 0, border: 'none', height: 44, borderRadius: 10, padding: '0 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: GRAD, color: '#fff' }}>Message</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ ...EYEBROW, marginBottom: 10 }}>Your Apnosh crew</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {crew.map((m) => (
                      <div key={m.key} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 14, boxShadow: SHADOW_CARD, padding: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 40, height: 40, borderRadius: 20, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{m.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{m.title}</div>
                          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{m.sub}</div>
                        </div>
                        <button onClick={() => msg(m.to)} className="cw-press" style={{ flexShrink: 0, border: 'none', height: 44, borderRadius: 10, padding: '0 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: GRAD, color: '#fff' }}>Message</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>Messages go to your Apnosh team. They answer fast and loop your creator in.</div>
              </>
            )}
        </div>
      </div>
    </div>
  )
}
