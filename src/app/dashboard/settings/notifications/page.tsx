'use client'

/**
 * Owner Notification preferences — apnosh-mvp surface. Linked from Settings.
 * Email on/off + digest frequency + per-category toggles, persisted to
 * notification_preferences (upsert by user_id). Wiring unchanged from the
 * legacy page; only the presentation is the mvp shell now.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NotificationPreferences, EmailDigestFrequency } from '@/types/database'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpToggle, MvpSaveBar, C } from '@/components/mvp/mvp-detail'

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
  { key: 'notify_messages', label: 'Messages', description: 'When your team sends a message' },
  { key: 'notify_reports', label: 'Monthly reports', description: 'When your monthly report is ready' },
  { key: 'notify_billing', label: 'Billing and invoices', description: 'Invoice due, payment success, plan changes' },
  { key: 'notify_system', label: 'System updates', description: 'Important account changes or announcements' },
]

const FREQUENCIES: { value: EmailDigestFrequency; label: string; description: string }[] = [
  { value: 'immediate', label: 'As they happen', description: 'Email me right away for each one' },
  { value: 'daily', label: 'Daily digest', description: 'One email a day with everything new' },
  { value: 'weekly', label: 'Weekly digest', description: 'One email a week with a summary' },
  { value: 'off', label: 'Off', description: 'Do not send me any emails' },
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
    const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle()
    if (data) {
      const rest = { ...(data as NotificationPreferences) } as Partial<NotificationPreferences>
      delete rest.user_id
      delete rest.updated_at
      setPrefs(rest as Omit<NotificationPreferences, 'user_id' | 'updated_at'>)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSaving(true); setSaved(false)
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: user.id, ...prefs })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  const toggle = (key: keyof typeof DEFAULT_PREFS) => setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Notifications" subtitle="What to be notified about, and how" backHref="/dashboard/settings" backLabel="Settings" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ marginTop: 4 }}>
            {[120, 220].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
            <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
          </div>
        ) : (
          <>
            {/* Email */}
            <MvpGroup title="Email">
              <div style={{ padding: 14 }}>
                <Row label="Email notifications" desc="Get notifications in your inbox." on={prefs.email_enabled} onToggle={() => setPrefs((p) => ({ ...p, email_enabled: !p.email_enabled }))} />
                {prefs.email_enabled && (
                  <div style={{ marginTop: 8, borderTop: `0.5px solid ${C.line}`, paddingTop: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, margin: '6px 0 2px' }}>Frequency</div>
                    {FREQUENCIES.map((f) => {
                      const on = prefs.email_digest_frequency === f.value
                      return (
                        <button key={f.value} type="button" onClick={() => setPrefs((p) => ({ ...p, email_digest_frequency: f.value }))}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${on ? C.green : C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />}
                          </span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink }}>{f.label}</span>
                            <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{f.description}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </MvpGroup>

            {/* Categories */}
            <MvpGroup title="What to notify me about">
              <div style={{ padding: 14 }}>
                {CATEGORIES.map((cat, i) => (
                  <div key={cat.key} style={i > 0 ? { borderTop: `0.5px solid ${C.line}` } : undefined}>
                    <Row label={cat.label} desc={cat.description} on={Boolean(prefs[cat.key])} onToggle={() => toggle(cat.key)} />
                  </div>
                ))}
              </div>
            </MvpGroup>
          </>
        )}
      </div>
      {!loading && <MvpSaveBar onClick={handleSave} saving={saving} label="Save preferences" hint={saved ? 'Saved' : undefined} />}
    </MvpShell>
  )
}

function Row({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>{desc}</div>
      </div>
      <MvpToggle on={on} onClick={onToggle} label={label} />
    </div>
  )
}
