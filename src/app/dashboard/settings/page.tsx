'use client'

import { useState } from 'react'
import {
  User, Shield, Bell, Link2, AlertTriangle, Eye, EyeOff,
  Check, Upload, Trash2, Power
} from 'lucide-react'

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
  // Profile state
  const [fullName, setFullName] = useState('Matt Butler')
  const [email] = useState('matt@casapriya.com')
  const [phone, setPhone] = useState('(503) 555-0142')

  // Security state
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [twoFactor, setTwoFactor] = useState(false)

  // Notification prefs
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [smsNotifs, setSmsNotifs] = useState(false)
  const [marketingUpdates, setMarketingUpdates] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(true)

  // Connected accounts
  const [googleConnected] = useState(true)

  const inputClass =
    'w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            <div className="relative group">
              <div className="w-16 h-16 rounded-full bg-brand-tint border-2 border-brand/20 flex items-center justify-center text-brand-dark text-lg font-bold">
                MB
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Upload className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <button className="text-sm font-medium text-brand-dark hover:underline">Change avatar</button>
              <p className="text-[11px] text-ink-4 mt-0.5">JPG, PNG or GIF. Max 2MB.</p>
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
            />
          </div>

          <div className="pt-1">
            <button className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <SectionCard title="Security" icon={Shield}>
        <div className="space-y-6">
          {/* Change password */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">Change Password</h3>

            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">Current Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="Enter current password"
                />
                <button
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink transition-colors"
                >
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">New Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="Enter new password"
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

            <button className="px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors">
              Update Password
            </button>
          </div>

          <div className="h-px bg-ink-6" />

          {/* 2FA */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-ink">Two-Factor Authentication</h3>
              <p className="text-[12px] text-ink-4 mt-0.5">
                Add an extra layer of security to your account by requiring a verification code on login.
              </p>
            </div>
            <Toggle enabled={twoFactor} onToggle={() => setTwoFactor(!twoFactor)} />
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
        </div>
      </SectionCard>

      {/* ── Connected Accounts ───────────────────────────────────────── */}
      <SectionCard title="Connected Accounts" icon={Link2}>
        <div className="space-y-4">
          {/* Google */}
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
                {googleConnected && (
                  <p className="text-[11px] text-ink-4">matt@casapriya.com</p>
                )}
              </div>
            </div>
            {googleConnected ? (
              <button className="px-3 py-1.5 rounded-lg border border-ink-6 text-[12px] font-medium text-ink-3 hover:bg-bg-2 transition-colors">
                Disconnect
              </button>
            ) : (
              <button className="px-3 py-1.5 rounded-lg bg-brand-tint text-[12px] font-medium text-brand-dark hover:bg-brand/10 transition-colors">
                Connect
              </button>
            )}
          </div>

          {/* Slack */}
          <div className="flex items-center justify-between gap-4 p-3 bg-bg-2 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-ink-6 flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#E01E5A" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Slack</p>
                <p className="text-[11px] text-ink-4">Not connected</p>
              </div>
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-brand-tint text-[12px] font-medium text-brand-dark hover:bg-brand/10 transition-colors">
              Connect
            </button>
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
                Permanently delete your account and all associated data. This action cannot be undone.
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
