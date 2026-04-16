'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Sparkles, AlertCircle, Check, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateInsights } from '@/lib/dashboard/generate-insights'

interface Connection {
  id: string
  source: 'social' | 'channel'
  platform: string            // display key: instagram, facebook, google_analytics, google_search_console, google_business_profile, ...
  account_name: string | null // display name (username, page name, property name, location name)
  last_sync_at: string | null
  sync_status: string
  sync_error: string | null
}

// Maps channel key -> { label, edgeFunction }
const CHANNEL_META: Record<string, { label: string; edgeFunction: string | null }> = {
  instagram: { label: 'Instagram', edgeFunction: 'sync-social-metrics' },
  facebook: { label: 'Facebook', edgeFunction: 'sync-social-metrics' },
  tiktok: { label: 'TikTok', edgeFunction: 'sync-social-metrics' },
  linkedin: { label: 'LinkedIn', edgeFunction: 'sync-social-metrics' },
  google_analytics: { label: 'Google Analytics', edgeFunction: 'sync-ga4-metrics' },
  google_search_console: { label: 'Search Console', edgeFunction: 'sync-gsc-metrics' },
  google_business_profile: { label: 'Business Profile', edgeFunction: 'sync-gbp-metrics' },
}

export default function SyncControls({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [insightResult, setInsightResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [social, channel] = await Promise.all([
      supabase
        .from('social_connections')
        .select('id, platform, platform_account_name, last_sync_at, sync_status, sync_error')
        .eq('client_id', clientId),
      supabase
        .from('channel_connections')
        .select('id, channel, platform_account_name, last_sync_at, sync_error, status')
        .eq('client_id', clientId)
        .neq('platform_account_id', 'pending'),
    ])

    const conns: Connection[] = []
    for (const r of social.data ?? []) {
      conns.push({
        id: r.id,
        source: 'social',
        platform: r.platform,
        account_name: r.platform_account_name,
        last_sync_at: r.last_sync_at,
        sync_status: r.sync_status,
        sync_error: r.sync_error,
      })
    }
    for (const r of channel.data ?? []) {
      conns.push({
        id: r.id,
        source: 'channel',
        platform: r.channel,
        account_name: r.platform_account_name,
        last_sync_at: r.last_sync_at,
        sync_status: r.status,
        sync_error: r.sync_error,
      })
    }

    setConnections(conns)
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  const handleSync = async (edgeFunction: string, label: string) => {
    setSyncing(edgeFunction)
    setSyncResult(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edgeFunction}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ client_id: clientId }),
        }
      )
      const data = await res.json()
      if (data.error) {
        setSyncResult(`${label}: ${data.error}`)
      } else if (data.pending > 0 && data.synced === 0) {
        setSyncResult(`${label}: awaiting API approval (${data.pending} pending)`)
      } else {
        setSyncResult(`${label}: synced ${data.synced ?? 0} connection(s)`)
      }
      load()
    } catch (err) {
      setSyncResult(`${label}: sync failed — ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setSyncing(null)
  }

  const handleRegenerateInsights = async () => {
    setRegenerating(true)
    setInsightResult(null)
    try {
      await generateInsights(clientId)
      setInsightResult('Insights regenerated')
    } catch (err) {
      setInsightResult('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
    setRegenerating(false)
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-brand-tint text-brand-dark',
      pending: 'bg-amber-50 text-amber-700',
      error: 'bg-red-50 text-red-600',
      disconnected: 'bg-ink-6 text-ink-3',
    }
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? colors.pending}`}>
        {status}
      </span>
    )
  }

  // Group unique edge functions we can trigger, based on connected platforms
  const triggerableEndpoints = Array.from(
    new Set(
      connections
        .map((c) => CHANNEL_META[c.platform]?.edgeFunction)
        .filter((ef): ef is string => !!ef)
    )
  ).map((ef) => {
    // Find label: use the CHANNEL_META label of the first platform that uses this edge function
    const platformEntry = Object.entries(CHANNEL_META).find(([, v]) => v.edgeFunction === ef)
    return { edgeFunction: ef, label: platformEntry?.[1].label || ef }
  })

  if (loading) return <div className="h-24 bg-ink-6 rounded-xl animate-pulse" />

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Data Sync</h3>
        <p className="text-xs text-ink-3">Manage metric syncing and insight generation.</p>
      </div>

      {/* Connected platforms */}
      {connections.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 divide-y divide-ink-6">
          {connections.map((conn) => (
            <div key={`${conn.source}-${conn.id}`} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {CHANNEL_META[conn.platform]?.label || conn.platform}
                </span>
                {conn.account_name && (
                  <span className="text-xs text-ink-3 truncate max-w-[280px]">{conn.account_name}</span>
                )}
                {statusBadge(conn.sync_status)}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-3">
                {conn.last_sync_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(conn.last_sync_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
          {connections.some((c) => c.sync_error) && (
            <div className="px-4 py-3 bg-red-50 space-y-1">
              {connections.filter((c) => c.sync_error).map((c) => (
                <div key={`err-${c.id}`} className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">
                    <strong>{CHANNEL_META[c.platform]?.label || c.platform}:</strong> {c.sync_error}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {connections.length === 0 && (
        <div className="text-sm text-ink-3 bg-bg-2 rounded-xl p-4 text-center">
          No active connections for this client yet.
        </div>
      )}

      {/* Sync action buttons — one per distinct edge function */}
      <div className="flex flex-wrap gap-3">
        {triggerableEndpoints.map((ep) => (
          <button
            key={ep.edgeFunction}
            onClick={() => handleSync(ep.edgeFunction, ep.label)}
            disabled={syncing !== null}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-ink text-white hover:bg-ink-2 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${syncing === ep.edgeFunction ? 'animate-spin' : ''}`} />
            {syncing === ep.edgeFunction ? 'Syncing...' : `Sync ${ep.label}`}
          </button>
        ))}

        <button
          onClick={handleRegenerateInsights}
          disabled={regenerating}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-ink-5 hover:bg-bg-2 transition-colors disabled:opacity-40"
        >
          <Sparkles className={`w-4 h-4 ${regenerating ? 'animate-pulse' : ''}`} />
          {regenerating ? 'Generating...' : 'Regenerate insights'}
        </button>
      </div>

      {/* Results */}
      {syncResult && (
        <div className="flex items-center gap-2 text-xs">
          <Check className="w-3.5 h-3.5 text-brand" />
          <span className="text-ink-3">{syncResult}</span>
        </div>
      )}
      {insightResult && (
        <div className="flex items-center gap-2 text-xs">
          <Check className="w-3.5 h-3.5 text-brand" />
          <span className="text-ink-3">{insightResult}</span>
        </div>
      )}
    </div>
  )
}
