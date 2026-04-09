'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Loader2, Save, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { NotificationPreferences, EmailDigestFrequency } from '@/types/database'

const DEFAULT_PREFS: Omit<NotificationPreferences, 'user_id' | 'updated_at'> = {
  email_enabled: true,
  email_digest_frequency: 'immediate',
  notify_approvals: true,
  notify_content_ready: true,
  notify_reviews: true,
  notify_messages: true,
  notify_reports: true,
  notify_billing: true,
  notify_system: true,
}

const CATEGORIES: { key: keyof typeof DEFAULT_PREFS; label: string; description: string }[] = [
  { key: 'notify_approvals', label: 'Approvals needed', description: 'When content is ready for you to review' },
  { key: 'notify_content_ready', label: 'Content ready', description: 'When a post or campaign is delivered' },
  { key: 'notify_reviews', label: 'New reviews', description: 'When a customer leaves a review' },
  { key: 'notify_messages', label: 'Messages', description: 'When your account manager sends a message' },
  { key: 'notify_reports', label: 'Monthly reports', description: 'When your monthly report is ready' },
  { key: 'notify_billing', label: 'Billing & invoices', description: 'Invoice due, payment success, plan changes' },
  { key: 'notify_system', label: 'System updates', description: 'Important account changes or announcements' },
]

const FREQUENCIES: { value: EmailDigestFrequency; label: string; description: string }[] = [
  { value: 'immediate', label: 'As they happen', description: 'Email me immediately for each notification' },
  { value: 'daily', label: 'Daily digest', description: 'One email per day with everything new' },
  { value: 'weekly', label: 'Weekly digest', description: 'One email per week with a summary' },
  { value: 'off', label: 'Off', description: 'Don&apos;t send me any emails' },
]

export default function NotificationPreferencesPage() {
  const supabase = createClient()

  const [prefs, setPrefs] = useState<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      const { user_id, updated_at, ...rest } = data as NotificationPreferences
      setPrefs(rest)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSaving(true)
    setSaved(false)

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...prefs })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  function toggle(key: keyof typeof DEFAULT_PREFS) {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        <div className="bg-white rounded-xl border border-ink-6 h-64" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/settings" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
            <Bell className="w-6 h-6 text-ink-4" />
            Notification Preferences
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">Choose what to be notified about and how.</p>
        </div>
      </div>

      {/* Email settings */}
      <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Email notifications</h2>
            <p className="text-xs text-ink-3 mt-0.5">Get notifications delivered to your inbox.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.email_enabled}
              onChange={() => setPrefs(p => ({ ...p, email_enabled: !p.email_enabled }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-6 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand/30 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-ink-5 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand" />
          </label>
        </div>

        {prefs.email_enabled && (
          <div className="pt-2 border-t border-ink-6 space-y-2">
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Frequency</label>
            <div className="space-y-1.5">
              {FREQUENCIES.map(f => (
                <label
                  key={f.value}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    prefs.email_digest_frequency === f.value ? 'bg-brand-tint/30 border border-brand/30' : 'border border-ink-6 hover:bg-bg-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={f.value}
                    checked={prefs.email_digest_frequency === f.value}
                    onChange={() => setPrefs(p => ({ ...p, email_digest_frequency: f.value }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{f.label}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{f.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-1">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-ink">What to notify me about</h2>
          <p className="text-xs text-ink-3 mt-0.5">Applies to both email and in-portal notifications.</p>
        </div>
        {CATEGORIES.map(cat => (
          <div
            key={cat.key}
            className="flex items-center justify-between gap-3 py-3 border-t border-ink-6 first:border-t-0"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink">{cat.label}</div>
              <div className="text-xs text-ink-3 mt-0.5">{cat.description}</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={Boolean(prefs[cat.key])}
                onChange={() => toggle(cat.key)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-6 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand/30 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-ink-5 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand" />
            </label>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Preferences
        </button>
      </div>
    </div>
  )
}
