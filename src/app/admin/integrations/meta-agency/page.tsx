'use client'

/**
 * Admin → Integrations → Meta Agency
 *
 * One-time setup screen for the agency Meta OAuth token. Once Apnosh
 * has granted access, this page shows every Facebook Page the
 * granting account administers and lets the AM bind each Page to an
 * Apnosh client. The mapping writes per-client rows into
 * `platform_connections` so the existing analytics pull keeps working
 * with no changes elsewhere.
 *
 * Big win: clients no longer need to OAuth their own Instagram /
 * Facebook accounts. One AM grant covers every restaurant they manage.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe, Camera, CheckCircle2, AlertCircle, Loader2, ArrowLeft,
  Link as LinkIcon, X, ExternalLink,
} from 'lucide-react'
import {
  getMetaAgencyStatus, listAgencyPages, mapAgencyPageToClient,
  unmapAgencyPageFromClient, listClientsForMapping,
  type MetaAgencyStatus, type AgencyPage,
} from '@/lib/admin/meta-agency'

interface ClientOption { id: string; name: string }

export default function MetaAgencyPage() {
  const [status, setStatus] = useState<MetaAgencyStatus | null>(null)
  const [pages, setPages] = useState<AgencyPage[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPageId, setBusyPageId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, ps, cs] = await Promise.all([
        getMetaAgencyStatus(),
        listAgencyPages(),
        listClientsForMapping(),
      ])
      setStatus(s)
      setPages(ps)
      setClients(cs)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleMap(pageId: string, clientId: string) {
    setBusyPageId(pageId)
    setFeedback(null)
    const r = await mapAgencyPageToClient({ clientId, pageId })
    if (!r.success) setFeedback(r.error)
    await load()
    setBusyPageId(null)
  }

  async function handleUnmap(pageId: string, clientId: string) {
    setBusyPageId(pageId)
    setFeedback(null)
    const r = await unmapAgencyPageFromClient(clientId)
    if (!r.success) setFeedback(r.error)
    await load()
    setBusyPageId(null)
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/integrations"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to integrations
        </Link>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Integrations
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Globe className="w-6 h-6 text-blue-600" />
          Meta agency access
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          One Apnosh staff Facebook account, access to every client&apos;s Page and Instagram. Clients never have to OAuth themselves.
        </p>
      </div>

      {/* Status card */}
      {loading ? (
        <div className="rounded-2xl border border-ink-6 bg-white p-5 animate-pulse h-28" />
      ) : status?.connected ? (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-white p-5 flex items-start gap-4">
          <span className="w-10 h-10 rounded-xl bg-emerald-100 ring-1 ring-emerald-200 grid place-items-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-ink">Connected</p>
            <p className="text-[12px] text-ink-3 mt-0.5">
              Granted by <span className="font-medium text-ink-2">{status.facebookUserName || 'unknown'}</span>
              {status.grantedAt && <> on {new Date(status.grantedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}
              {status.expiresAt && (() => {
                const daysLeft = Math.round((new Date(status.expiresAt).getTime() - Date.now()) / 86_400_000)
                return <> · Token valid for ~{daysLeft} more days</>
              })()}
            </p>
          </div>
          <a
            href="/api/auth/instagram-agency"
            className="text-[12px] font-medium text-ink-3 hover:text-ink bg-bg-2 hover:bg-bg-3 px-3 py-1.5 rounded transition-colors flex-shrink-0"
          >
            Reconnect
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-white p-5 flex items-start gap-4">
          <span className="w-10 h-10 rounded-xl bg-amber-100 ring-1 ring-amber-200 grid place-items-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-ink">Not connected yet</p>
            <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">
              Sign in with the Apnosh staff Facebook account that has Page Admin or Editor access on every client&apos;s Facebook Page (via Meta Business Manager).
              One grant covers them all.
            </p>
          </div>
          <a
            href="/api/auth/instagram-agency"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 flex-shrink-0"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Connect Facebook
          </a>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-800 px-4 py-2">
          {feedback}
        </div>
      )}

      {/* Pages list */}
      {status?.connected && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-bold text-ink tracking-tight">
              Pages we can access ({pages.length})
            </h2>
            <p className="text-[11.5px] text-ink-4">
              Map each Page to an Apnosh client to pull their analytics.
            </p>
          </div>

          {pages.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-ink-6 bg-white p-10 text-center">
              <Globe className="w-7 h-7 text-ink-4 mx-auto mb-3" />
              <p className="text-[13px] font-semibold text-ink">No Pages found</p>
              <p className="text-[11.5px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
                The connected account doesn&apos;t manage any Facebook Pages. Make sure they have an
                Admin or Editor role on each client Page in Meta Business Manager.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pages.map(page => (
                <PageRow
                  key={page.id}
                  page={page}
                  clients={clients}
                  busy={busyPageId === page.id}
                  onMap={(clientId) => handleMap(page.id, clientId)}
                  onUnmap={() => page.mappedClientId && handleUnmap(page.id, page.mappedClientId)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function PageRow({
  page, clients, busy, onMap, onUnmap,
}: {
  page: AgencyPage
  clients: ClientOption[]
  busy: boolean
  onMap: (clientId: string) => void
  onUnmap: () => void
}) {
  const [selected, setSelected] = useState('')
  const mapped = !!page.mappedClientId

  return (
    <li className="rounded-xl border border-ink-6 bg-white p-4 flex items-center gap-4 flex-wrap">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 grid place-items-center">
        <Globe className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-ink truncate">{page.name}</p>
        <p className="text-[11px] text-ink-4 truncate">
          Page ID {page.id}
          {page.instagramUsername && (
            <>
              {' · '}
              <Camera className="w-3 h-3 inline-block text-rose-500 mb-0.5" />
              @{page.instagramUsername}
            </>
          )}
        </p>
      </div>

      {mapped ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" />
            {page.mappedClientName || 'Mapped'}
          </span>
          <button
            disabled={busy}
            onClick={onUnmap}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-rose-600 bg-bg-2 hover:bg-rose-50 px-2 py-1 rounded transition-colors disabled:opacity-60"
            title="Disconnect from this client"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Unmap
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            disabled={busy}
            className="text-[12px] text-ink bg-bg-2 ring-1 ring-ink-6 hover:ring-ink-4 rounded px-2 py-1 focus:outline-none focus:ring-ink-3"
          >
            <option value="">Choose client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            disabled={busy || !selected}
            onClick={() => onMap(selected)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-brand hover:bg-brand-dark px-3 py-1 rounded transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
            Map
          </button>
          {page.mappedClientName && (
            <span className="text-[11px] text-ink-4 inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              {page.mappedClientName}
            </span>
          )}
        </div>
      )}
    </li>
  )
}
