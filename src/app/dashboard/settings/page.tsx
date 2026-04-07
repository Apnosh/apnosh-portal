'use client'

import { useEffect, useState } from 'react'
import {
  User, Shield, Bell, Link2, AlertTriangle, Eye, EyeOff,
  Check, Upload, Trash2, Power, Loader2, CheckCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Toggle Component ────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${
        enabled ? 'bg-brand' : 'bg-ink-5'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${
          enabled ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Section Card ────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  danger,
  children,
}: {
  title: string
  icon: typeof User
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${danger ? 'border-red-200' : 'border-ink-6'}`}>
      <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${danger ? 'border-red-200 bg-red-50/50' : 'border-ink-6 bg-bg-2'}`}>
        <Icon className={`w-4 h-4 ${danger ? 'text-red-500' : 'text-ink-3'}`} />
        <h2 className={`text-sm font-semibold ${danger ? 'text-red-700' : 'text-ink'}`}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Profile state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [initials, setInitials] = useState('')

  // Security state
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Notification prefs
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [smsNotifs, setSmsNotifs] = useState(false)
  const [marketingUpdates, setMarketingUpdates] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(true)

  // Approval preferences
  const [approvalGlobal, setApprovalGlobal] = useState(false)
  const [approvalTypes, setApprovalTypes] = useState<Record<string, boolean>>({
    graphic: false,
    caption: false,
    video: false,
    email: false,
    branding: false,
  })
  const [approvalSaving, setApprovalSaving] = useState(false)

  useEffect(() => {
    async function fetchProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name || '')
        setEmail(profile.email || user.email || '')
        setPhone((profile as Record<string, unknown>).phone as string || '')
        setInitials(
          (profile.full_name || '')
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'U'
        )
      } else {
        setEmail(user.email || '')
      }

      // Load approval preferences
      const { data: biz } = await supabase
        .from('businesses')
        .select('approval_preferences')
        .eq('owner_id', user.id)
        .single()

      if (biz?.approval_preferences) {
        const prefs = biz.approval_preferences as Record<string, unknown>
        if (typeof prefs.auto_approve === 'boolean') setApprovalGlobal(prefs.auto_approve)
        if (prefs.types && typeof prefs.types === 'object') {
          setApprovalTypes(prev => ({ ...prev, ...(prefs.types as Record<string, boolean>) }))
        }
      }

      setLoading(false)
    }
    fetchProfile()
  }, [])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    if (error) {
      showToast('error', error.message)
    } else {
      showToast('success', 'Profile updated.')
      setInitials(fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U')
    }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    if (!newPw || newPw !== confirmPw) {
      showToast('error', 'Passwords do not match.')
      return
    }
    if (newPw.length < 8) {
      showToast('error', 'Password must be at least 8 characters.')
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      showToast('error', error.message)
    } else {
      showToast('success', 'Password updated.')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }
    setPwSaving(false)
  }

  const handleSaveApprovalPrefs = async () => {
    setApprovalSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setApprovalSaving(false); return }

    const prefs = { auto_approve: approvalGlobal, types: approvalTypes }
    const { error } = await supabase
      .from('businesses')
      .update({ approval_preferences: prefs })
      .eq('owner_id', user.id)

    if (error) {
      showToast('error', error.message)
    } else {
      showToast('success', 'Approval preferences saved.')
    }
    setApprovalSaving(false)
  }

  const inputClass =
    'w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-ink-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Settings</h1>
        <p className="text-ink-3 text-sm mt-1">Manage your account preferences and security.</p>
      </div>

      {/* ── Profile Settings ─────────────────────────────────────────── */}
      <SectionCard title="Profile Settings" icon={User}>
        <div className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-tint border-2 border-brand/20 flex items-center justify-center text-brand-dark text-lg font-bold">
              {initials}
            </div>
            <div>
              <p className="text-[11px] text-ink-4 mt-0.5">Avatar from your login provider.</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Email Address</label>
            <div className="relative mt-1.5">
              <input
                type="email"
                value={email}
                readOnly
                className={`${inputClass} bg-bg-2 text-ink-3 cursor-not-allowed pr-24`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3" /> Verified
              </span>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="pt-1">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <SectionCard title="Security" icon={Shield}>
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">Change Password</h3>

            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">New Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="Enter new password (min 8 characters)"
                />
                <button
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Confirm New Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="Confirm new password"
                />
                <button
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
                >
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleChangePassword}
              disabled={pwSaving || !newPw}
              className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Password
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Notification Preferences ─────────────────────────────────── */}
      <SectionCard title="Notification Preferences" icon={Bell}>
        <div className="space-y-5">
          {[
            {
              label: 'Email Notifications',
              description: 'Receive emails when new deliverables are ready or approvals are needed.',
              enabled: emailNotifs,
              toggle: () => setEmailNotifs(!emailNotifs),
            },
            {
              label: 'SMS Notifications',
              description: 'Get text messages for urgent updates and time-sensitive approvals.',
              enabled: smsNotifs,
              toggle: () => setSmsNotifs(!smsNotifs),
            },
            {
              label: 'Marketing Updates',
              description: 'Tips, product updates, and news from the Apnosh team.',
              enabled: marketingUpdates,
              toggle: () => setMarketingUpdates(!marketingUpdates),
            },
            {
              label: 'Weekly Digest Report',
              description: 'A summary of your analytics and activity delivered every Monday.',
              enabled: weeklyDigest,
              toggle: () => setWeeklyDigest(!weeklyDigest),
            },
          ].map((pref) => (
            <div key={pref.label} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{pref.label}</p>
                <p className="text-[12px] text-ink-4 mt-0.5">{pref.description}</p>
              </div>
              <Toggle enabled={pref.enabled} onToggle={pref.toggle} />
            </div>
          ))}
          <p className="text-[11px] text-ink-4">Notification preferences will apply to future notifications.</p>
        </div>
      </SectionCard>

      {/* ── Content Approvals ──────────────────────────────────────── */}
      <SectionCard title="Content Approvals" icon={CheckCircle}>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Auto-Approve All Content</p>
              <p className="text-[12px] text-ink-4 mt-0.5">Skip review for all deliverables. Your team posts directly.</p>
            </div>
            <Toggle enabled={approvalGlobal} onToggle={() => setApprovalGlobal(!approvalGlobal)} />
          </div>

          <div className="h-px bg-ink-6" />

          <div>
            <p className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-3">Auto-Approve by Content Type</p>
            <div className="space-y-3">
              {[
                { key: 'graphic', label: 'Social Posts (Graphics)', desc: 'Feed posts, carousels, and story graphics' },
                { key: 'caption', label: 'Blog Posts (Captions)', desc: 'Written content and blog articles' },
                { key: 'video', label: 'Video Content', desc: 'Reels, TikToks, and video edits' },
                { key: 'email', label: 'Email Campaigns', desc: 'Newsletters and email sequences' },
                { key: 'branding', label: 'Branding Assets', desc: 'Logos, brand materials, and design assets' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-[12px] text-ink-4 mt-0.5">{item.desc}</p>
                  </div>
                  <Toggle
                    enabled={approvalGlobal || approvalTypes[item.key]}
                    onToggle={() => {
                      if (!approvalGlobal) {
                        setApprovalTypes(prev => ({ ...prev, [item.key]: !prev[item.key] }))
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {approvalGlobal && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Global auto-approve is on. All content types will be approved automatically.
            </p>
          )}

          <div className="pt-1">
            <button
              onClick={handleSaveApprovalPrefs}
              disabled={approvalSaving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {approvalSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Preferences
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Connected Accounts ───────────────────────────────────────── */}
      <SectionCard title="Connected Accounts" icon={Link2}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 bg-bg-2 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-ink-6 flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Google</p>
                <p className="text-[11px] text-ink-4">{email || 'Not connected'}</p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Connected</span>
          </div>
        </div>
      </SectionCard>

      {/* ── Danger Zone ──────────────────────────────────────────────── */}
      <SectionCard title="Danger Zone" icon={AlertTriangle} danger>
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-ink">Deactivate Account</h3>
              <p className="text-[12px] text-ink-4 mt-0.5">
                Temporarily disable your account. You can reactivate anytime by signing in.
              </p>
            </div>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-3 hover:bg-bg-2 transition-colors w-fit">
              <Power className="w-4 h-4" />
              Deactivate
            </button>
          </div>

          <div className="h-px bg-red-100" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-red-600">Delete Account</h3>
              <p className="text-[12px] text-ink-4 mt-0.5">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors w-fit">
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
