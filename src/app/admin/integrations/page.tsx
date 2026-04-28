'use client'

/**
 * Admin → Integrations
 *
 * Status + controls for the agency-wide Google integrations stored in
 * the `integrations` table (one row per provider, shared across all
 * Apnosh clients):
 *
 *   - Google Drive (existing)
 *   - Google Business Profile (new — agency-wide token used by the
 *     daily Vercel cron at /api/cron/gbp-api-sync)
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cloud, MapPin, CheckCircle2, AlertCircle, Loader2, Link as LinkIcon, RefreshCw } from 'lucide-react'
import { getAgencyIntegrationsStatus, runGbpAgencySyncNow } from '@/lib/integration-actions'

interface Status {
  drive: { connected: boolean; email: string | null }
  gbp: {
    connected: boolean
    email: string | null
    locationsCount: number | null
    lastSyncAt: string | null
  }
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const refresh = async () => {
    setLoading(true)
    const res = await getAgencyIntegrationsStatus()
    if (res.success) setStatus(res.data)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null)
    const res = await runGbpAgencySyncNow()
    setSyncing(false)
    if (res.success) {
      const d = res.data
      setSyncResult({
        ok: true,
        msg: `Synced ${d.metricsImported} metrics across ${d.locationsMatched} clients (${d.locationsTotal} locations seen, ${d.locationsUnmatched.length} unmatched, ${d.errors.length} errors).`,
      })
      refresh()
    } else {
      setSyncResult({ ok: false, msg: res.error })
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-1">Integrations</h1>
        <p className="text-sm text-ink-3">
          Agency-wide Google connections that power the cron jobs and Drive features. Each
          connection is a single OAuth grant shared across all Apnosh clients.
        </p>
      </div>

      {loading && (
        <div className="text-sm text-ink-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading status...
        </div>
      )}

      {!loading && status && (
        <>
          {/* Drive card */}
          <Card
            icon={Cloud}
            title="Google Drive"
            subtitle="Pulls client folder contents (brand assets, briefs, contracts) for the per-client Drive tab."
            connected={status.drive.connected}
            email={status.drive.email}
            connectHref="/api/auth/google-drive"
            connectLabel={status.drive.connected ? 'Reconnect' : 'Connect Google Drive'}
          />

          {/* GBP card */}
          <Card
            icon={MapPin}
            title="Google Business Profile (Agency)"
            subtitle="Pulls daily Local SEO metrics (impressions, calls, directions, website clicks) for every location the granting Google account holds Manager on. Powers the daily /api/cron/gbp-api-sync."
            connected={status.gbp.connected}
            email={status.gbp.email}
            connectHref="/api/auth/google-business-agency"
            connectLabel={status.gbp.connected ? 'Reconnect with new account' : 'Connect Google Business'}
            extra={
              status.gbp.connected ? (
                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-ink-6 text-xs">
                  <div>
                    <div className="text-ink-3">Locations visible</div>
                    <div className="font-bold text-sm">{status.gbp.locationsCount ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">Last sync</div>
                    <div className="font-bold text-sm">
                      {status.gbp.lastSyncAt ? new Date(status.gbp.lastSyncAt).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-3">
                  Sign in with the Google account that holds Manager access on your client GBP
                  locations (today: apnosh@gmail.com with 21 verified locations).
                </p>
              )
            }
            footer={
              status.gbp.connected ? (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-ink-6">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {syncing
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</>
                      : <><RefreshCw className="w-3 h-3" /> Sync yesterday now</>}
                  </button>
                  {syncResult && (
                    <span className={`text-xs ${syncResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {syncResult.msg}
                    </span>
                  )}
                </div>
              ) : null
            }
          />

          <div className="text-xs text-ink-3 pt-2">
            <Link href="/admin/gbp/backfill" className="underline">
              Bulk CSV backfill page →
            </Link>
            {' '}for one-shot historical imports without API access.
          </div>
        </>
      )}
    </div>
  )
}

function Card({
  icon: Icon, title, subtitle, connected, email, connectHref, connectLabel, extra, footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  connected: boolean
  email: string | null
  connectHref: string
  connectLabel: string
  extra?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-ink" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-ink">{title}</h2>
              {connected
                ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="w-3 h-3" /> Not connected</span>}
            </div>
            <p className="text-xs text-ink-3 mb-1">{subtitle}</p>
            {connected && email && (
              <p className="text-xs text-ink-3">
                Granted by <span className="font-medium text-ink">{email}</span>
              </p>
            )}
          </div>
        </div>
        <Link
          href={connectHref}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2 inline-flex items-center gap-1.5"
        >
          <LinkIcon className="w-3 h-3" /> {connectLabel}
        </Link>
      </div>
      {extra}
      {footer}
    </div>
  )
}
