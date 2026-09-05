'use client'

/**
 * /dashboard/team on the mobile kit (portal redesign 2026-09-04): the strategist as a card
 * with a gradient avatar and one Message button, everyone else as role tiles in the role's
 * colour, the open requests as rows, and the ask box (the same one as before) underneath.
 * The swap modal is the old one too — nothing about requests changed, only the look.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Camera, Video, Image as ImageIcon, PenLine, Share2, Compass, Users, Megaphone, Search, Clapperboard, Star, ArrowLeftRight, MessageCircle, ChevronRight, Clock } from 'lucide-react'
import type { TeamMember } from '@/lib/dashboard/get-team'
import type { TeamRequest } from '@/lib/dashboard/get-team-requests'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'
import { gradOf, glow, hueOf, tint, type HueKey } from '@/components/mvp/hues'
import { Mark } from '@/components/mvp/mark'
import { AskPrompt, SwapModal, messageHref } from './team-view'

const ROLE_HUE: Record<string, HueKey> = {
  strategist: 'mint', photographer: 'catering', videographer: 'event', designer: 'announce', editor: 'newfaces',
  copywriter: 'nights', social_media_manager: 'nights', community_mgr: 'regulars', ad_buyer: 'deal', paid_media: 'deal',
  seo_specialist: 'online', influencer: 'brand', admin: 'grey',
}
const ROLE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  strategist: Compass, photographer: Camera, videographer: Video, designer: ImageIcon, editor: Clapperboard, copywriter: PenLine,
  social_media_manager: Share2, community_mgr: Users, ad_buyer: Megaphone, paid_media: Megaphone, seo_specialist: Search, influencer: Star, admin: Users,
}
const leadRole = (m: TeamMember) => m.roles.find((r) => ROLE_HUE[r]) ?? m.roles[0] ?? 'admin'
const BACKEND_ROLES = new Set(['editor', 'ad_buyer', 'seo_specialist', 'designer', 'paid_media'])
const ACTIVITY_RECENCY_MS = 30 * 24 * 60 * 60 * 1000

function Avatar({ m, size, hue }: { m: TeamMember; size: number; hue: HueKey }) {
  const initials = m.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
  if (m.avatarUrl) return <img src={m.avatarUrl} alt={m.displayName} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: glow(hue, 0.3) }} />
  return <span style={{ width: size, height: size, borderRadius: '50%', color: hueOf(hue)[1], fontFamily: DISPLAY, fontSize: Math.round(size * 0.34), fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>
}

const AVAIL: Record<TeamMember['availability'], { label: string; color: string }> = {
  available: { label: 'Available', color: '#2e9a78' }, limited: { label: 'Limited', color: '#d99a1e' }, full: { label: 'Booked up', color: '#8a928e' },
}

export default function TeamMvp({ clientId, team, openRequests }: { clientId: string; team: TeamMember[]; openRequests: TeamRequest[] }) {
  const [swapTarget, setSwapTarget] = useState<{ personId: string; role: string; personName: string } | null>(null)
  const visible = useMemo(() => {
    const now = Date.now()
    return team.filter((m) => {
      if (m.isPrimaryContact) return true
      if (!m.roles.every((r) => BACKEND_ROLES.has(r))) return true
      return !!m.lastActivityAt && now - new Date(m.lastActivityAt).getTime() < ACTIVITY_RECENCY_MS
    })
  }, [team])
  const primary = visible.find((m) => m.isPrimaryContact)
  const others = visible.filter((m) => !m.isPrimaryContact)
  const H2: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15.5, fontWeight: 600, color: C.ink, letterSpacing: '-.01em', padding: '0 6px 8px' }
  const dot = (h: HueKey) => <span style={{ width: 8, height: 8, borderRadius: 4, background: gradOf(h) }} />

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Your team" subtitle="The people working on your marketing" />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {team.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', padding: '26px 18px', textAlign: 'center' }}>
            <Mark hue="mint" size={48} style={{ marginBottom: 10 }}><Users size={22} /></Mark>
            <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink }}>Your team is being set up</div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>Your strategist shows up here first. Say hello in Messages any time.</div>
          </div>
        )}

        {primary && (() => {
          const hue = ROLE_HUE[leadRole(primary)] ?? 'mint'
          const av = AVAIL[primary.availability]
          return (
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', padding: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar m={primary} size={54} hue={hue} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary.displayName}</div>
                  <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>Your strategist{primary.roleLabels.length > 1 ? ` · ${primary.roleLabels.filter((l) => l !== 'Strategist').join(', ')}` : ''}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: av.color, marginTop: 4 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: av.color }} />{av.label}</div>
                </div>
              </div>
              {primary.bio && <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 10 }}>{primary.bio}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Link href={messageHref(primary)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 20, background: gradOf('mint'), boxShadow: glow('mint', 0.35), color: '#fff', fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}><MessageCircle size={16} /> Message</Link>
                <button type="button" onClick={() => setSwapTarget({ personId: primary.personId, role: leadRole(primary), personName: primary.displayName })} aria-label="Request a different strategist" style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: '#f0f0f2', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeftRight size={16} /></button>
              </div>
            </div>
          )
        })()}

        {others.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={H2}>{dot('catering')}Also on your account</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {others.map((m) => {
                const role = leadRole(m)
                const hue = ROLE_HUE[role] ?? 'mint'
                const [h1, h2] = hueOf(hue)
                const Icon = ROLE_ICON[role] ?? Users
                return (
                  <div key={m.personId} style={{ position: 'relative', borderRadius: 18, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', padding: 12, minHeight: 112, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${h1}2e, ${h2}0f)` }} />
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Mark hue={hue} size={34}><Icon size={17} /></Mark>
                      <button type="button" onClick={() => setSwapTarget({ personId: m.personId, role, personName: m.displayName })} aria-label={`Request a different ${m.roleLabels[0] ?? 'person'}`} style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'rgba(255,255,255,.7)', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeftRight size={13} /></button>
                    </div>
                    <div style={{ position: 'relative', marginTop: 'auto' }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>{m.roleLabels[0] ?? 'Team'}</div>
                      <div style={{ fontSize: 11, color: C.mute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}{m.specialties.length ? ` · ${m.specialties.slice(0, 2).join(', ')}` : ''}</div>
                    </div>
                    <Link href={messageHref(m)} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: h2, textDecoration: 'none' }}>Message <ChevronRight size={13} /></Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {openRequests.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={H2}>{dot('amber')}Open requests</div>
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', overflow: 'hidden' }}>
              {openRequests.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? `0.5px solid ${C.line}` : 'none' }}>
                  <Mark hue="amber" size={40}><Clock size={18} /></Mark>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink }}>{r.title}</span>
                    {r.preview && <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.preview}</span>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '3px 8px', background: tint('amber', 0.16), color: hueOf('amber')[1], flexShrink: 0 }}>{r.statusLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <div style={H2}>{dot('mint')}Need someone else?</div>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', padding: 4 }}>
            <AskPrompt clientId={clientId} primaryName={primary?.displayName ?? null} />
          </div>
        </div>
      </div>

      {swapTarget && <SwapModal clientId={clientId} target={swapTarget} onClose={() => setSwapTarget(null)} />}
    </MvpShell>
  )
}
