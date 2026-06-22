'use client'

/**
 * Owner Settings — apnosh-mvp surface. Reached from More -> Settings.
 *
 * Kept lean and de-duplicated: Profile (name + verified email), Security
 * (password change with a current-password re-auth), and Content approvals
 * (the live auto-approve gate). Notification preferences and Connected accounts
 * link OUT to the dedicated screens that already own those flows, so the owner
 * never sees two doors to the same thing. Cancellation routes to the team
 * (managed-service model: 30 days notice), not a dead delete button.
 *
 * Note: there is no profiles.phone column, so no phone field here. The business
 * phone lives in Business info -> contact.
 */

import { useEffect, useState } from 'react'
import { Bell, Plug, Eye, EyeOff, LifeBuoy, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, MvpToggle, MvpPill, C, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import { EditorField } from '../business-info/editor-shell'

const APPROVAL_TYPES = [
  { key: 'graphic', label: 'Social posts', desc: 'Feed posts, carousels, stories' },
  { key: 'caption', label: 'Captions and blogs', desc: 'Written content' },
  { key: 'video', label: 'Video', desc: 'Reels, TikToks, edits' },
  { key: 'email', label: 'Email campaigns', desc: 'Newsletters and sequences' },
  { key: 'branding', label: 'Branding assets', desc: 'Logos and design files' },
]

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)

  // Profile
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('U')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Security
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Approvals
  const [approvalGlobal, setApprovalGlobal] = useState(false)
  const [approvalTypes, setApprovalTypes] = useState<Record<string, boolean>>({ graphic: false, caption: false, video: false, email: false, branding: false })
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [approvalMsg, setApprovalMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    async function run() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
      const name = profile?.full_name || ''
      setFullName(name)
      setEmail(profile?.email || user.email || '')
      setInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U')

      const { data: biz } = await supabase.from('businesses').select('approval_preferences').eq('owner_id', user.id).single()
      if (biz?.approval_preferences) {
        const prefs = biz.approval_preferences as Record<string, unknown>
        if (typeof prefs.auto_approve === 'boolean') setApprovalGlobal(prefs.auto_approve)
        if (prefs.types && typeof prefs.types === 'object') setApprovalTypes((prev) => ({ ...prev, ...(prefs.types as Record<string, boolean>) }))
      }
      setLoading(false)
    }
    run()
  }, [])

  async function handleSaveProfile() {
    setProfileSaving(true); setProfileMsg(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfileSaving(false); return }
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
    if (error) setProfileMsg({ ok: false, text: error.message })
    else { setProfileMsg({ ok: true, text: 'Saved.' }); setInitials(fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U') }
    setProfileSaving(false)
  }

  async function handleChangePassword() {
    setPwMsg(null)
    if (!currentPw) { setPwMsg({ ok: false, text: 'Enter your current password.' }); return }
    if (!newPw || newPw !== confirmPw) { setPwMsg({ ok: false, text: 'New passwords do not match.' }); return }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return }
    setPwSaving(true)
    const supabase = createClient()
    // Re-auth: verify the current password before changing it.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (reauthErr) { setPwMsg({ ok: false, text: 'Current password is incorrect.' }); setPwSaving(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: 'Password updated.' }); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
    setPwSaving(false)
  }

  async function handleSaveApprovals() {
    setApprovalSaving(true); setApprovalMsg(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setApprovalSaving(false); return }
    const { error } = await supabase.from('businesses').update({ approval_preferences: { auto_approve: approvalGlobal, types: approvalTypes } }).eq('owner_id', user.id)
    if (error) setApprovalMsg({ ok: false, text: error.message })
    else setApprovalMsg({ ok: true, text: 'Saved.' })
    setApprovalSaving(false)
  }

  const btn = (busy: boolean): React.CSSProperties => ({ width: '100%', height: 44, marginTop: 14, borderRadius: 12, border: 'none', background: busy ? '#bfe7da' : C.green, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 })

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Settings" subtitle="Your account and preferences" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ marginTop: 4 }}>
            {[140, 180, 200].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
            <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
          </div>
        ) : (
          <>
            {/* Profile */}
            <MvpGroup title="Profile">
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
                  <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
                  <span style={{ fontSize: 12.5, color: C.faint }}>Avatar comes from your login.</span>
                </div>
                <EditorField label="Full name" value={fullName} onChange={setFullName} placeholder="Your name" />
                <div style={{ marginBottom: 4 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>Email</label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#f5f5f7', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px' }}>
                    <span style={{ fontSize: 15, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                    <MvpPill tone="good" label="Verified" />
                  </div>
                </div>
                {profileMsg && <Msg msg={profileMsg} />}
                <button type="button" onClick={handleSaveProfile} disabled={profileSaving} style={btn(profileSaving)}>
                  {profileSaving && <Loader2 size={16} className="mvp-spin" />}Save
                </button>
              </div>
            </MvpGroup>

            {/* Security */}
            <MvpGroup title="Security">
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 12 }}>Change password</div>
                <PwField label="Current password" value={currentPw} onChange={setCurrentPw} show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} placeholder="Current password" />
                <PwField label="New password" value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew((v) => !v)} placeholder="At least 8 characters" />
                <PwField label="Confirm new password" value={confirmPw} onChange={setConfirmPw} show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} placeholder="Re-enter new password" />
                {pwMsg && <Msg msg={pwMsg} />}
                <button type="button" onClick={handleChangePassword} disabled={pwSaving} style={btn(pwSaving)}>
                  {pwSaving && <Loader2 size={16} className="mvp-spin" />}Update password
                </button>
              </div>
            </MvpGroup>

            {/* Content approvals */}
            <MvpGroup title="Content approvals">
              <div style={{ padding: 14 }}>
                <ToggleRow label="Auto-approve all content" desc="Skip review. Your team posts directly." on={approvalGlobal} onToggle={() => setApprovalGlobal((v) => !v)} />
                <div style={{ height: '0.5px', background: C.line, margin: '12px 0' }} />
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, marginBottom: 10 }}>Auto-approve by type</div>
                {APPROVAL_TYPES.map((t) => (
                  <ToggleRow key={t.key} label={t.label} desc={t.desc} on={approvalGlobal || approvalTypes[t.key]} dimmed={approvalGlobal}
                    onToggle={() => { if (!approvalGlobal) setApprovalTypes((prev) => ({ ...prev, [t.key]: !prev[t.key] })) }} />
                ))}
                {approvalGlobal && (
                  <div style={{ fontSize: 11.5, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 10, padding: '8px 11px', marginTop: 10 }}>Auto-approve is on. Everything is approved automatically.</div>
                )}
                {approvalMsg && <Msg msg={approvalMsg} />}
                <button type="button" onClick={handleSaveApprovals} disabled={approvalSaving} style={btn(approvalSaving)}>
                  {approvalSaving && <Loader2 size={16} className="mvp-spin" />}Save preferences
                </button>
              </div>
            </MvpGroup>

            {/* Link-outs (the real homes for these) */}
            <MvpGroup title="More">
              <MvpRow icon={<Bell size={18} />} label="Notifications" sub="Email and SMS preferences" href="/dashboard/settings/notifications" />
              <MvpRow icon={<Plug size={18} />} label="Connected accounts" sub="Instagram, Google, Yelp" href="/dashboard/connected-accounts" />
            </MvpGroup>

            {/* Cancellation routes to the team, not a delete button */}
            <MvpGroup title="Account">
              <MvpRow icon={<LifeBuoy size={18} />} label="Pause or cancel" sub="30 days notice, through your team" href="/dashboard/messages" />
            </MvpGroup>
          </>
        )}
      </div>
    </MvpShell>
  )
}

function Msg({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: msg.ok ? C.greenSoft : C.coralSoft, color: msg.ok ? C.greenDk : C.coral, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>
      {msg.text}
    </div>
  )
}

function ToggleRow({ label, desc, on, onToggle, dimmed }: { label: string; desc: string; on: boolean; onToggle: () => void; dimmed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', opacity: dimmed ? 0.55 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>{desc}</div>
      </div>
      <MvpToggle on={on} onClick={onToggle} label={label} />
    </div>
  )
}

function PwField({ label, value, onChange, show, onToggle, placeholder }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mvp-input"
          style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 44px 12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
        />
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4, display: 'flex' }}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}
