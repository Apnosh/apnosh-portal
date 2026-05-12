'use client'

/**
 * Client settings — approval flow toggles.
 *
 * Each toggle saves on flip. No "Save" button; reduces cognitive
 * load for staff configuring during onboarding. Errors surface
 * inline below the row that flipped.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Check, AlertCircle, Settings as SettingsIcon } from 'lucide-react'
import type { ApprovalSettings } from '@/lib/work/approval-settings'

interface Props {
  clientId: string
  clientName: string
  initialSettings: ApprovalSettings
  defaults: ApprovalSettings
}

interface ToggleDef {
  key: keyof ApprovalSettings
  label: string
  description: string
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'media_required_before_approval',
    label: 'Media required before approval',
    description: 'Strategist can\'t mark a draft approved without a photo or video attached. Use this for clients who care about visuals being locked in early.',
  },
  {
    key: 'client_signoff_required',
    label: 'Client must sign off before publishing',
    description: 'After internal approval, the owner sees a preview and clicks "Looks good". Recommended for most clients.',
  },
  {
    key: 'allow_strategist_direct_publish',
    label: 'Strategist can publish without sign-off',
    description: 'Even when sign-off is required, a trusted strategist can override. Use for fast-moving clients who delegate fully.',
  },
  {
    key: 'auto_publish_on_signoff',
    label: 'Publish automatically when owner signs off',
    description: 'The moment the owner clicks "Looks good", the post goes live — no separate publish step.',
  },
]

export default function SettingsView({ clientId, clientName, initialSettings }: Props) {
  const [settings, setSettings] = useState<ApprovalSettings>(initialSettings)
  const [busyKey, setBusyKey] = useState<keyof ApprovalSettings | null>(null)
  const [errorKey, setErrorKey] = useState<{ key: keyof ApprovalSettings; msg: string } | null>(null)
  const [savedKey, setSavedKey] = useState<keyof ApprovalSettings | null>(null)

  const flip = useCallback(async (key: keyof ApprovalSettings) => {
    const next = !settings[key]
    setBusyKey(key); setErrorKey(null); setSavedKey(null)
    // Optimistic update — revert on error.
    setSettings(prev => ({ ...prev, [key]: next }))
    try {
      const res = await fetch(`/api/work/clients/${clientId}/approval-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setSettings(j.settings)
      setSavedKey(key)
      setTimeout(() => setSavedKey(curr => (curr === key ? null : curr)), 1500)
    } catch (e) {
      setSettings(prev => ({ ...prev, [key]: !next })) // revert
      setErrorKey({ key, msg: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setBusyKey(null)
    }
  }, [clientId, settings])

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
      <Link href={`/work/clients`} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> All clients
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-ink-7 text-ink-2 ring-1 ring-ink-6 flex-shrink-0">
            <SettingsIcon className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            {clientName} settings
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          How content moves from idea to live. Toggles save the moment you flip them.
        </p>
      </header>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Approval flow
        </h2>
        <ul className="space-y-2">
          {TOGGLES.map(t => {
            const on = settings[t.key]
            const busy = busyKey === t.key
            const err = errorKey?.key === t.key ? errorKey.msg : null
            const saved = savedKey === t.key
            return (
              <li key={t.key} className="rounded-2xl bg-white ring-1 ring-ink-6/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink leading-snug">{t.label}</p>
                    <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">{t.description}</p>
                  </div>
                  <button
                    onClick={() => flip(t.key)}
                    disabled={busy}
                    role="switch"
                    aria-checked={on}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      on ? 'bg-brand' : 'bg-ink-6'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        on ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {(busy || saved || err) && (
                  <div className="mt-2 text-[11px] inline-flex items-center gap-1">
                    {busy && <Loader2 className="w-3 h-3 animate-spin text-ink-4" />}
                    {saved && <><Check className="w-3 h-3 text-emerald-600" /><span className="text-emerald-700">Saved</span></>}
                    {err && <><AlertCircle className="w-3 h-3 text-rose-600" /><span className="text-rose-700">{err}</span></>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
