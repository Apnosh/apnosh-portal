'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Sparkles, AlertCircle, Check, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateInsights } from '@/lib/dashboard/generate-insights'

interface Connection {
  id: string
  platform: string
  platform_account_name: string | null
  last_sync_at: string | null
  sync_status: string
  sync_error: string | null
}

export default function SyncControls({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [insightResult, setInsightResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('social_connections')
      .select('id, platform, platform_account_name, last_sync_at, sync_status, sync_error')
      .eq('client_id', clientId)

    setConnections((data ?? []) as Connection[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-social-metrics`,
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
      setSyncResult(`Synced ${data.synced ?? 0} connection(s)`)
      load()
    } catch (err) {
      setSyncResult('Sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
    setSyncing(false)
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

  if (loading) {
    return <div className="h-24 bg-ink-6 rounded-xl animate-pulse" />
  }

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
            <div key={conn.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium capitalize">{conn.platform}</span>
                {conn.platform_account_name && (
                  <span className="text-xs text-ink-3">@{conn.platform_account_name}</span>
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
          {connections.some((c) => c.sync_status === 'error') && (
            <div className="px-4 py-3 bg-red-50 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">
                {connections.find((c) => c.sync_status === 'error')?.sync_error}
              </p>
            </div>
          )}
        </div>
      )}

      {connections.length === 0 && (
        <div className="text-sm text-ink-3 bg-bg-2 rounded-xl p-4 text-center">
          No social connections for this client yet.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSync}
          disabled={syncing || connections.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-ink text-white hover:bg-ink-2 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync social metrics now'}
        </button>

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
