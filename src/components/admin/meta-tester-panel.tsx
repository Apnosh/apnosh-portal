'use client'

/**
 * Meta App Tester onboarding helper for the admin ConnectionsTab.
 *
 * Apnosh's Meta app is in Development mode (Standard Access) so each
 * client must be added as a tester before they can OAuth their IG / FB
 * accounts. This panel tracks where every client sits in that flow:
 *
 *   not_invited -> invited -> accepted
 *
 * Per platform (FB and IG run on separate Meta tester APIs). Deep links
 * jump the AM straight to the right Meta dashboard page so they don't
 * waste time navigating.
 */

import { useState, useEffect, useCallback } from 'react'
import { Camera, Globe, ExternalLink, Check, Clock, AlertCircle, Loader2, Copy } from 'lucide-react'
import { getMetaTesterStatus, updateMetaTesterStatus, type ClientMetaTesterStatus, type TesterStatus } from '@/lib/admin/meta-tester-status'

const META_APP_ID = '972474978474759'

const META_ROLES_URL = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/`
const META_TEST_USERS_URL = `https://developers.facebook.com/apps/${META_APP_ID}/roles/test-users/`

export default function MetaTesterPanel({ clientId, clientEmail }: { clientId: string; clientEmail?: string | null }) {
  const [status, setStatus] = useState<ClientMetaTesterStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await getMetaTesterStatus(clientId)
      setStatus(s)
    } catch {
      setStatus(null)
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function advance(platform: 'fb' | 'ig', next: TesterStatus) {
    setSaving(true)
    const input = platform === 'fb'
      ? { clientId, fbStatus: next }
      : { clientId, igStatus: next }
    await updateMetaTesterStatus(input)
    await load()
    setSaving(false)
  }

  async function saveIgUsername(username: string) {
    setSaving(true)
    await updateMetaTesterStatus({ clientId, igUsername: username || null })
    await load()
    setSaving(false)
  }

  function copyEmail() {
    if (!clientEmail) return
    navigator.clipboard.writeText(clientEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-32" />
      </div>
    )
  }

  const fbStatus: TesterStatus = status?.fbStatus ?? 'not_invited'
  const igStatus: TesterStatus = status?.igStatus ?? 'not_invited'
  const allDone = fbStatus === 'accepted' && igStatus === 'accepted'

  return (
    <div className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-ink-6 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
            <h3 className="text-[14px] font-semibold text-ink">Meta App tester onboarding</h3>
            {allDone ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                Ready
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Action needed
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-3 leading-relaxed">
            Until our Meta app is approved for production, each client must be added
            as a tester before they can connect Instagram or Facebook.
          </p>
        </div>
        {clientEmail && (
          <button
            onClick={copyEmail}
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-ink bg-bg-2 hover:bg-bg-3 px-2 py-1 rounded transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : clientEmail}
          </button>
        )}
      </div>

      {/* Facebook tester row */}
      <PlatformRow
        icon={Globe}
        iconTint="bg-sky-50 text-sky-700 ring-sky-100"
        label="Facebook"
        sub="Add by email under App roles -> Roles -> Add People -> Tester"
        status={fbStatus}
        dashboardUrl={META_ROLES_URL}
        onAdvance={(s) => advance('fb', s)}
        invitedAt={status?.fbInvitedAt}
        acceptedAt={status?.fbAcceptedAt}
        saving={saving}
      />

      {/* Instagram tester row */}
      <PlatformRow
        icon={Camera}
        iconTint="bg-rose-50 text-rose-700 ring-rose-100"
        label="Instagram"
        sub="Add by IG username under Test users. Client accepts in the IG app."
        status={igStatus}
        dashboardUrl={META_TEST_USERS_URL}
        onAdvance={(s) => advance('ig', s)}
        invitedAt={status?.igInvitedAt}
        acceptedAt={status?.igAcceptedAt}
        saving={saving}
        extra={
          <div className="mt-2">
            <label className="text-[11px] text-ink-3 block mb-1">
              Client&apos;s Instagram username
            </label>
            <input
              type="text"
              defaultValue={status?.igUsername ?? ''}
              placeholder="apnosh (no @)"
              onBlur={(e) => {
                const next = e.target.value.trim().replace(/^@/, '')
                if (next !== (status?.igUsername ?? '')) saveIgUsername(next)
              }}
              className="w-full text-[12px] text-ink bg-bg-2 rounded-md px-2 py-1.5 ring-1 ring-ink-6 focus:outline-none focus:ring-ink-3"
            />
          </div>
        }
      />
    </div>
  )
}

function PlatformRow({
  icon: Icon, iconTint, label, sub, status, dashboardUrl,
  onAdvance, invitedAt, acceptedAt, saving, extra,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconTint: string
  label: string
  sub: string
  status: TesterStatus
  dashboardUrl: string
  onAdvance: (next: TesterStatus) => void
  invitedAt: string | null | undefined
  acceptedAt: string | null | undefined
  saving: boolean
  extra?: React.ReactNode
}) {
  const StatusIcon = status === 'accepted' ? Check
    : status === 'invited' ? Clock
    : status === 'removed' ? AlertCircle
    : Clock
  const statusColor = status === 'accepted' ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
    : status === 'invited' ? 'text-amber-700 bg-amber-50 ring-amber-100'
    : status === 'removed' ? 'text-rose-700 bg-rose-50 ring-rose-100'
    : 'text-ink-3 bg-bg-2 ring-ink-6'
  const statusLabel = status === 'not_invited' ? 'Not invited'
    : status === 'invited' ? 'Invited, waiting'
    : status === 'accepted' ? 'Accepted'
    : 'Removed'

  return (
    <div className="px-5 py-4 border-b border-ink-6 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl ring-1 grid place-items-center flex-shrink-0 ${iconTint}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold text-ink">{label}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${statusColor}`}>
              <StatusIcon className="w-2.5 h-2.5" />
              {statusLabel}
            </span>
          </div>
          <p className="text-[11.5px] text-ink-3">{sub}</p>
          {invitedAt && (
            <p className="text-[10.5px] text-ink-4 mt-1">
              Invited {new Date(invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {acceptedAt && <> · accepted {new Date(acceptedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
            </p>
          )}
          {extra}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-2 hover:text-ink bg-bg-2 hover:bg-bg-3 px-2.5 py-1 rounded transition-colors"
        >
          Open Meta dashboard
          <ExternalLink className="w-3 h-3" />
        </a>
        {status === 'not_invited' && (
          <button
            onClick={() => onAdvance('invited')}
            disabled={saving}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-brand hover:bg-brand-dark px-2.5 py-1 rounded transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Mark invite sent
          </button>
        )}
        {status === 'invited' && (
          <button
            onClick={() => onAdvance('accepted')}
            disabled={saving}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Mark accepted
          </button>
        )}
        {status === 'accepted' && (
          <button
            onClick={() => onAdvance('not_invited')}
            disabled={saving}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-ink-2 px-2.5 py-1 rounded transition-colors disabled:opacity-60"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
