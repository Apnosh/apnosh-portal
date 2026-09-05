'use client'
/**
 * /dashboard/preferences — "Your settings" (owner 2026-09-05). Three things, in plain words:
 * whether we post only after they say yes, what alerts they get, and light or dark.
 * Each row shows what it is set to. The approve-first switch saves on tap; alerts open the
 * alerts page; the look switches at once.
 */
import { useEffect, useState } from 'react'
import { Check, Bell, Moon, Loader2 } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, MvpToggle, C } from '@/components/mvp/mvp-detail'
import { useMvpTheme } from '@/components/mvp/mvp-theme'
import { useClient } from '@/lib/client-context'

export default function PreferencesPage() {
  const { client } = useClient()
  const { theme, setTheme } = useMvpTheme()
  const [approveFirst, setApproveFirst] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    fetch(`/api/dashboard/more?clientId=${client.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.settings) setApproveFirst(Boolean(j.settings.approveFirst)) }).catch(() => {})
    return () => { live = false }
  }, [client?.id])

  const flip = async () => {
    if (!client?.id || approveFirst == null || saving) return
    const next = !approveFirst
    setApproveFirst(next); setSaving(true); setNote(null)
    try {
      const r = await fetch('/api/dashboard/more', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, approveFirst: next }) })
      if (!r.ok) throw new Error()
      setNote(next ? 'Saved. We will ask you before anything goes out.' : 'Saved. We will post for you.')
    } catch { setApproveFirst(!next); setNote('That did not save. Try again.') }
    setSaving(false)
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Your settings" subtitle="How you want things to work" />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        <MvpGroup title="Before anything goes out" hue="mint">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', minHeight: 52 }}>
            <span style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.greenDk, flexShrink: 0 }}><Check size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink }}>Ask me first</span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{approveFirst == null ? 'Loading…' : approveFirst ? 'We post only after you say yes' : 'We post for you, no need to ask'}</span>
            </span>
            {saving ? <Loader2 size={18} className="mvp-spin" color={C.faint} /> : approveFirst != null && <MvpToggle on={approveFirst} onClick={flip} label="Ask me first" />}
          </div>
          {note && <div style={{ fontSize: 12.5, color: C.mute, padding: '0 2px 8px 50px' }}>{note}</div>}
        </MvpGroup>

        <MvpGroup title="Alerts" hue="amber">
          <MvpRow icon={<Bell size={18} />} hue="amber" label="What we send you" sub="Email and text" href="/dashboard/settings/notifications" />
        </MvpGroup>

        <MvpGroup title="Look" hue="nights">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', minHeight: 52 }}>
            <span style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b6fd4', flexShrink: 0 }}><Moon size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink }}>Dark mode</span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{theme === 'dark' ? 'On' : 'Off'}</span>
            </span>
            <MvpToggle on={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} label="Dark mode" />
          </div>
        </MvpGroup>
      </div>
    </MvpShell>
  )
}
