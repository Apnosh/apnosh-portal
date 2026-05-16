/**
 * Admin org-wide connection health view.
 *
 * Lists every channel_connection across all clients that's currently
 * errored, grouped by client. Run the probe button kicks the daily
 * health cron manually for ad-hoc checks.
 */

import Link from 'next/link'
import { Plug, AlertCircle, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { runConnectionHealthProbe } from '@/lib/connection-health'

export default async function ConnectionHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ probe?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams

  let probeReport: Awaited<ReturnType<typeof runConnectionHealthProbe>> | null = null
  if (params.probe === '1') {
    probeReport = await runConnectionHealthProbe()
  }

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('id, client_id, channel, platform_account_name, platform_url, status, sync_error, last_sync_at, connected_at, connected_by, clients(name, slug)')
    .in('channel', ['google_search_console', 'google_analytics', 'google_business_profile'])
    .order('status', { ascending: false })
    .order('last_sync_at', { ascending: false, nullsFirst: false }) as { data: Array<{
      id: string
      client_id: string
      channel: string
      platform_account_name: string | null
      platform_url: string | null
      status: string
      sync_error: string | null
      last_sync_at: string | null
      connected_at: string | null
      connected_by: string | null
      clients: { name: string; slug: string } | Array<{ name: string; slug: string }> | null
    }> | null }

  const conns = (rows ?? []).map(r => ({
    ...r,
    client: Array.isArray(r.clients) ? r.clients[0] : r.clients,
  }))
  const errored = conns.filter(c => c.status === 'error')
  const active = conns.filter(c => c.status === 'active')
  const pending = conns.filter(c => c.status !== 'active' && c.status !== 'error')

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Plug className="w-6 h-6 text-brand" />
          Connection health
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Every Google channel connection across all clients. The daily probe runs at 9:30am UTC;
          state changes (active → error) post a notification to whoever connected the account.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/admin/connection-health?probe=1"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Run probe now
        </Link>
        <div className="text-[12px] text-ink-3 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> {active.length} active</span>
          <span className="inline-flex items-center gap-1"><AlertCircle className="w-3 h-3 text-rose-600" /> {errored.length} errored</span>
          {pending.length > 0 && <span className="text-ink-4">+ {pending.length} pending</span>}
        </div>
      </div>

      {probeReport && (
        <div className="bg-bg-2 rounded-xl border border-ink-6 p-4 text-[12px] text-ink-2">
          <strong className="text-ink">Probe finished.</strong>{' '}
          Scanned {probeReport.scanned}. Recovered {probeReport.recovered}.
          Newly errored {probeReport.newlyErrored}. Still errored {probeReport.stillErrored}.
          Notifications sent: {probeReport.notificationsCreated}.
          {probeReport.failures.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-rose-700">{probeReport.failures.length} probe failures</summary>
              <ul className="mt-1 space-y-0.5 text-[11px] text-ink-3">
                {probeReport.failures.map((f, i) => (
                  <li key={i}>· [{f.channel}] {f.id.slice(0, 8)} — {f.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {errored.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-10 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-2">All connections healthy.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold text-ink-2 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            Needs attention ({errored.length})
          </h2>
          {errored.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-rose-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={`/admin/clients/${c.client?.slug}`} className="text-[13.5px] font-semibold text-ink hover:text-brand">
                      {c.client?.name ?? '(unknown client)'}
                    </Link>
                    <span className="text-[10px] text-ink-4">·</span>
                    <span className="text-[11.5px] font-mono text-ink-3">{labelFor(c.channel)}</span>
                    <span className="text-[10px] text-ink-4">·</span>
                    <span className="text-[11px] text-ink-3 truncate">{c.platform_account_name ?? c.platform_url}</span>
                  </div>
                  <div className="mt-2 text-[12.5px] text-rose-700">{c.sync_error ?? '(no error message)'}</div>
                  <div className="mt-1 text-[11px] text-ink-3">
                    Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'never'}
                    {c.connected_at && ` · Connected ${new Date(c.connected_at).toLocaleDateString()}`}
                  </div>
                </div>
                <Link
                  href={`/admin/clients/${c.client?.slug}/connections`}
                  className="text-[11.5px] font-medium text-ink-3 hover:text-ink inline-flex items-center gap-1"
                  title="View this client's connections"
                >
                  Open client
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-[14px] font-semibold text-ink-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Healthy ({active.length})
        </h2>
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-ink-3">
              <tr>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Client</th>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Channel</th>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Account</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {active.map(c => (
                <tr key={c.id} className="border-t border-ink-6">
                  <td className="py-2 px-4 text-[12.5px] text-ink-2">{c.client?.name ?? '—'}</td>
                  <td className="py-2 px-4 text-[12px] text-ink-3 font-mono">{labelFor(c.channel)}</td>
                  <td className="py-2 px-4 text-[12px] text-ink-3 truncate max-w-md">{c.platform_account_name ?? c.platform_url}</td>
                  <td className="py-2 px-4 text-[11.5px] text-ink-3 text-right">{c.last_sync_at ? relativeTime(c.last_sync_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function labelFor(channel: string): string {
  switch (channel) {
    case 'google_search_console': return 'Search Console'
    case 'google_analytics': return 'Analytics'
    case 'google_business_profile': return 'Business Profile'
    default: return channel
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
