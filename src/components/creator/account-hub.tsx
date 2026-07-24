'use client'

/**
 * The creator's account hub (/creator/account) — the missing "You" surface. Reached from the avatar
 * in the creator shell's top header. Built with the owner app's row kit (MvpGroup/MvpRow) so it
 * matches /dashboard/more: identity card, view/edit profile, get paid, hours, agreement, help, and
 * the sign-out that the creator app had nowhere to put.
 */

import { Eye, Pencil, Wallet, Clock, FileText, LifeBuoy, LogOut } from 'lucide-react'
import { signOut } from '@/lib/supabase/hooks'
import { MvpGroup, MvpRow, MvpPill, C, DISPLAY } from '@/components/mvp/mvp-detail'
import { labelsForSkills } from '@/lib/marketplace/creator-skills'
import type { MyProfile } from '@/lib/marketplace/creator-store-actions'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'C'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function AccountHub({ profile }: { profile: MyProfile }) {
  const skillLine = labelsForSkills(profile.skills).slice(0, 3).join(' · ') || 'Creator'
  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '16px 14px 32px', boxSizing: 'border-box' }}>
      {/* identity */}
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 13, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: profile.avatarUrl ? `center/cover no-repeat url("${profile.avatarUrl}")` : C.greenSoft, border: `1px solid ${C.green}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.greenDk, flexShrink: 0 }}>{profile.avatarUrl ? '' : initialsOf(profile.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name || 'Your studio'}</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skillLine}</div>
        </div>
        <MvpPill tone={profile.bookable ? 'good' : 'warn'} label={profile.bookable ? 'Live' : 'Under review'} dot />
      </div>

      <MvpGroup title="Your profile">
        {profile.bookable
          ? <MvpRow icon={<Eye size={18} />} label="View public profile" sub="How restaurants see you" href={`/marketplace/${profile.slug}`} external />
          : <MvpRow icon={<Eye size={18} />} label="Public profile" sub="Goes live once Apnosh approves you" />}
        <MvpRow icon={<Pencil size={18} />} label="Edit your shop" sub="Photos, bio, skills, links" href="/creator/account/profile" />
      </MvpGroup>

      <MvpGroup title="Work and money">
        <MvpRow icon={<Wallet size={18} />} label="Get paid" sub="Earnings and bank" href="/creator/earnings" />
        <MvpRow icon={<Clock size={18} />} label="Your hours" sub="When you take bookings" href="/creator/availability" />
      </MvpGroup>

      <MvpGroup title="Legal and help">
        <MvpRow icon={<FileText size={18} />} label="Creator Agreement" href="/creator-terms" external />
        <MvpRow icon={<LifeBuoy size={18} />} label="Help" sub="Email the Apnosh team" href="mailto:apnosh@gmail.com?subject=Creator%20help" external />
      </MvpGroup>

      <MvpGroup>
        <MvpRow icon={<LogOut size={18} />} label="Sign out" danger onClick={() => { void signOut() }} />
      </MvpGroup>
    </div>
  )
}
