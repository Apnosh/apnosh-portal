'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Camera, Globe, Tv, Briefcase, BarChart3, Search, MapPin,
  CheckCircle2, AlertCircle, Clock, Loader2, Link as LinkIcon,
  RefreshCw, Trash2, ExternalLink, Plus, HelpCircle, Star,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getConnectionsForClient, disconnectPlatform, syncConnection, type UnifiedConnection } from '@/lib/connection-actions'

/* ------------------------------------------------------------------ */
/*  Platform catalog                                                   */
/* ------------------------------------------------------------------ */

interface PlatformCatalog {
  id: string
  label: string
  icon: typeof Camera
  color: string
  description: string
  authPath: string
  category: 'social' | 'google' | 'reviews'
}

const CATALOG: PlatformCatalog[] = [
  { id: 'instagram', label: 'Instagram', icon: Camera, color: 'from-purple-500 via-pink-500 to-orange-400', description: 'Track followers, reach, and engagement.', authPath: '/api/auth/instagram-direct', category: 'social' },
  { id: 'facebook', label: 'Facebook', icon: Globe, color: 'from-blue-600 to-blue-500', description: 'Track Page performance and engagement. Also pulls Instagram if your Page has it linked.', authPath: '/api/auth/instagram', category: 'social' },
  { id: 'tiktok', label: 'TikTok', icon: Tv, color: 'from-gray-900 to-gray-700', description: 'Track video views and engagement.', authPath: '/api/auth/tiktok', category: 'social' },
  { id: 'linkedin', label: 'LinkedIn', icon: Briefcase, color: 'from-blue-700 to-blue-600', description: 'Track followers and post engagement.', authPath: '/api/auth/linkedin', category: 'social' },
  { id: 'google_analytics', label: 'Google Analytics', icon: BarChart3, color: 'from-orange-500 to-yellow-500', description: 'Website visitors, traffic sources, top pages.', authPath: '/api/auth/google', category: 'google' },
  { id: 'google_search_console', label: 'Google Search Console', icon: Search, color: 'from-blue-500 to-teal-500', description: 'What people search to find your site.', authPath: '/api/auth/google-search-console', category: 'google' },
  { id: 'google_business_profile', label: 'Google Business Profile', icon: MapPin, color: 'from-sky-500 to-blue-600', description: 'Directions, calls, website clicks, search views.', authPath: '/api/auth/google-business', category: 'google' },
  { id: 'yelp', label: 'Yelp', icon: Star, color: 'from-red-500 to-red-600', description: 'Your Yelp rating and review count over time.', authPath: '/dashboard/connected-accounts/yelp', category: 'reviews' },
]

const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social Media',
  google: 'Google Services',
  reviews: 'Reviews & Reputation',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function statusStyles(status: UnifiedConnection['status']) {
  switch (status) {
    case 'connected': return { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2, iconColor: 'text-emerald-500' }
    case 'expired':
    case 'error': return { bg: 'bg-amber-50', text: 'text-amber-800', icon: AlertCircle, iconColor: 'text-amber-500' }
    case 'pending':
    case 'setting_up': return { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock, iconColor: 'text-blue-500' }
    default: return { bg: 'bg-ink-6', text: 'text-ink-3', icon: AlertCircle, iconColor: 'text-ink-4' }
  }
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function ConnectionCard({ conn, clientId, onDisconnect, onSynced }: {
  conn: UnifiedConnection
  clientId: string
  onDisconnect: () => void
  onSynced: () => void
}) {
  const catalog = CATALOG.find((c) => c.id === conn.platform)
  const Icon = catalog?.icon || LinkIcon
  const { bg, text, icon: StatusIcon, iconColor } = statusStyles(conn.status)

  const [disconnecting, setDisconnecting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  async function handleDisconnect() {
    setDisconnecting(true)
    const res = await disconnectPlatform(conn.source, conn.id)
    setDisconnecting(false)
    if (res.success) onDisconnect()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMessage(null)
    const res = await syncConnection(conn.source, conn.id)
    setSyncing(false)
    if (res.success) {
      const bits: string[] = []
      if (res.locationsDiscovered) bits.push(`${res.locationsDiscovered} ${res.locationsDiscovered === 1 ? 'location' : 'locations'}`)
      if (res.metricsImported) bits.push(`${res.metricsImported} day's metrics`)
      if (res.reviewsImported) bits.push(`${res.reviewsImported} review${res.reviewsImported === 1 ? '' : 's'}`)
      setSyncMessage(bits.length > 0 ? `Pulled ${bits.join(', ')}` : 'Nothing new yet — try again later')
      onSynced()
    } else {
      setSyncMessage(res.error)
    }
    /* Clear the toast after a few seconds so it doesn't linger. */
    setTimeout(() => setSyncMessage(null), 6000)
  }

  /* Platforms that have a per-client sync path in connection-actions:
     GBP (gbp-client-sync), GA (web-analytics-sync), GSC (web-analytics-sync). */
  const canSync = conn.source === 'channel_connections'
    && ['google_business_profile', 'google_analytics', 'google_search_console'].includes(conn.platform)

  const needsAttention = conn.status === 'expired' || conn.status === 'error'

  return (
    <div className={`bg-white rounded-xl border ${needsAttention ? 'border-amber-200 ring-1 ring-amber-100' : 'border-ink-6'} p-5`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${catalog?.color || 'from-ink-4 to-ink-3'} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-sm font-semibold text-ink truncate">{conn.label}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bg} ${text} flex items-center gap-1 flex-shrink-0`}>
                  <StatusIcon className={`w-2.5 h-2.5 ${iconColor}`} />
                  {conn.friendlyStatus}
                </span>
              </div>
              {conn.accountName && (
                <p className="text-xs text-ink-3 truncate">{conn.accountName}</p>
              )}
            </div>
            {conn.profileUrl && (
              <a href={conn.profileUrl} target="_blank" rel="noopener noreferrer" className="text-ink-4 hover:text-brand flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-ink-4 mt-2">
            {conn.lastSyncAt !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last sync: {formatRelativeTime(conn.lastSyncAt)}
              </span>
            )}
          </div>

          {conn.syncError && (
            <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{conn.syncError}</p>
            </div>
          )}

          {syncMessage && (
            <div className="mt-3 px-3 py-2 bg-emerald-50 rounded-lg text-xs text-emerald-800 leading-relaxed">
              {syncMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {canSync && !needsAttention && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink border border-ink-6 rounded-lg transition-colors disabled:opacity-50"
              >
                {syncing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {needsAttention && conn.actions.canReconnect && conn.actions.reconnectUrl && (
              <a
                href={`${conn.actions.reconnectUrl}?clientId=${clientId}&returnTo=/dashboard/connected-accounts`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Reconnect
              </a>
            )}
            {conn.actions.canDisconnect && !showConfirm && (
              <button
                onClick={() => setShowConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-red-600 border border-ink-6 rounded-lg transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Disconnect
              </button>
            )}
            {showConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-3">Disconnect {conn.label}?</span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50"
                >
                  {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, disconnect'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={disconnecting}
                  className="px-3 py-1.5 text-xs font-medium text-ink-3"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AddCard({ platform, clientId }: { platform: PlatformCatalog; clientId: string }) {
  const Icon = platform.icon
  return (
    <a
      href={`${platform.authPath}?clientId=${clientId}&returnTo=/dashboard/connected-accounts`}
      className="bg-white rounded-xl border border-ink-6 p-4 hover:border-brand hover:bg-brand-tint/30 transition-colors flex items-center gap-3 group"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink group-hover:text-brand-dark">{platform.label}</p>
        <p className="text-xs text-ink-4 truncate">{platform.description}</p>
      </div>
      <Plus className="w-4 h-4 text-ink-5 group-hover:text-brand flex-shrink-0" />
    </a>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ConnectedAccountsPage() {
  const { client, loading: clientLoading } = useClient()
  const [connections, setConnections] = useState<UnifiedConnection[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getConnectionsForClient()
    setConnections(data)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (clientLoading || loading) {
    return (
      <div className="max-w-[840px] mx-auto px-6 max-sm:px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-ink-6 rounded w-64" />
          <div className="h-20 bg-ink-6 rounded-xl" />
          <div className="h-32 bg-ink-6 rounded-xl" />
          <div className="h-32 bg-ink-6 rounded-xl" />
        </div>
      </div>
    )
  }

  const clientId = client?.id || ''
  const connectedIds = new Set(connections.map((c) => c.platform))
  const unconnected = CATALOG.filter((p) => !connectedIds.has(p.id))

  // Health summary
  const connectedCount = connections.filter((c) => c.status === 'connected').length
  const needsAttentionCount = connections.filter((c) => c.status === 'expired' || c.status === 'error').length
  const pendingCount = connections.filter((c) => c.status === 'pending' || c.status === 'setting_up').length

  let healthPill: { bg: string; text: string; label: string }
  if (needsAttentionCount > 0) {
    healthPill = { bg: 'bg-amber-50', text: 'text-amber-800', label: `${needsAttentionCount} needs attention` }
  } else if (pendingCount > 0 && connectedCount === 0) {
    healthPill = { bg: 'bg-blue-50', text: 'text-blue-700', label: `${pendingCount} setting up` }
  } else if (connectedCount > 0) {
    healthPill = { bg: 'bg-emerald-50', text: 'text-emerald-700', label: `${connectedCount} connected` }
  } else {
    healthPill = { bg: 'bg-ink-6', text: 'text-ink-3', label: 'Nothing connected yet' }
  }

  // Group connections by category
  const byCategory: Record<string, UnifiedConnection[]> = {}
  for (const c of connections) {
    if (!byCategory[c.category]) byCategory[c.category] = []
    byCategory[c.category].push(c)
  }

  // Group unconnected by category
  const unconnectedByCategory: Record<string, PlatformCatalog[]> = {}
  for (const p of unconnected) {
    if (!unconnectedByCategory[p.category]) unconnectedByCategory[p.category] = []
    unconnectedByCategory[p.category].push(p)
  }

  return (
    <div className="max-w-[840px] mx-auto px-6 max-sm:px-4 pb-20">
      {/* Header */}
      <div className="pt-8 mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Connected Accounts</h1>
        <p className="text-sm text-ink-3">Your data sources in one place.</p>
      </div>

      {/* Health summary */}
      <div className="bg-white rounded-xl border border-ink-6 p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${healthPill.bg} flex items-center justify-center`}>
            {needsAttentionCount > 0 ? (
              <AlertCircle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">
              {connections.length === 0 ? 'No accounts connected yet' : `${connections.length} account${connections.length > 1 ? 's' : ''} connected`}
            </p>
            <p className="text-xs text-ink-3">
              {connections.length === 0
                ? 'Connect your first platform below.'
                : `${connectedCount} working${needsAttentionCount > 0 ? ` · ${needsAttentionCount} need attention` : ''}${pendingCount > 0 ? ` · ${pendingCount} setting up` : ''}`}
            </p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${healthPill.bg} ${healthPill.text}`}>
          {healthPill.label}
        </span>
      </div>

      {/* Connected accounts by category */}
      {connections.length > 0 && (
        <div className="space-y-8 mb-8">
          {(['social', 'google', 'reviews'] as const).map((cat) => {
            const list = byCategory[cat]
            if (!list || list.length === 0) return null
            return (
              <section key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-3">{CATEGORY_LABELS[cat]}</h2>
                <div className="space-y-3">
                  {list.map((conn) => (
                    <ConnectionCard key={`${conn.source}-${conn.id}`} conn={conn} clientId={clientId} onDisconnect={load} onSynced={load} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Add more */}
      {unconnected.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-4 mb-3">
            {connections.length === 0 ? 'Connect an account' : 'Add more'}
          </h2>
          <div className="space-y-6">
            {(['social', 'google', 'reviews'] as const).map((cat) => {
              const list = unconnectedByCategory[cat]
              if (!list || list.length === 0) return null
              return (
                <div key={cat}>
                  <p className="text-[11px] font-medium text-ink-4 mb-2">{CATEGORY_LABELS[cat]}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {list.map((p) => (
                      <AddCard key={p.id} platform={p} clientId={clientId} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Help */}
      <div className="mt-12 flex items-start gap-3 p-4 bg-bg-2 rounded-xl">
        <HelpCircle className="w-4 h-4 text-ink-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-ink mb-0.5">Need help with a connection?</p>
          <p className="text-xs text-ink-3">
            Your account manager can sort this out. Just message us from the <a href="/dashboard" className="text-brand hover:underline">dashboard</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
