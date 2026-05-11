'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Link as LinkIcon, Unlink, RefreshCw, Check, AlertCircle,
  Camera, ExternalLink, Globe, Tv, Briefcase,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PlatformConnection {
  id: string
  client_id: string
  platform: string
  profile_url: string | null
  username: string | null
  access_token: string | null
  ig_account_id: string | null
  page_id: string | null
  page_name: string | null
  connected_at: string
  expires_at: string | null
}

interface FacebookPage {
  id: string
  name: string
  access_token: string
}

const PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Camera,
    color: 'from-purple-500 via-pink-500 to-orange-400',
    description: 'Pull followers, reach, engagement, demographics, and post data.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: Globe,
    color: 'from-blue-600 to-blue-500',
    description: 'Pull Page followers, reach, impressions, and post engagement.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: Tv,
    color: 'from-gray-900 to-gray-700',
    description: 'Pull followers, video views, and engagement.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Briefcase,
    color: 'from-blue-700 to-blue-600',
    description: 'Pull followers, impressions, and post engagement.',
  },
]

interface ChannelConnection {
  id: string
  channel: string
  platform_account_name: string | null
  platform_url: string | null
  status: string
  sync_error: string | null
  last_sync_at: string | null
  connected_at: string
}

const CHANNEL_LABELS: Record<string, string> = {
  google_analytics: 'Google Analytics',
  google_search_console: 'Google Search Console',
  google_business_profile: 'Google Business Profile',
}

export default function ConnectionsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [connections, setConnections] = useState<PlatformConnection[]>([])
  const [channelConnections, setChannelConnections] = useState<ChannelConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  // Manual token input for Instagram (dev mode workaround)
  const [showManualIg, setShowManualIg] = useState(false)
  const [manualIgToken, setManualIgToken] = useState('')
  const [savingManualIg, setSavingManualIg] = useState(false)
  const [manualIgError, setManualIgError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [pc, cc] = await Promise.all([
      supabase
        .from('platform_connections')
        .select('*')
        .eq('client_id', clientId)
        .order('platform'),
      supabase
        .from('channel_connections')
        .select('id, channel, platform_account_name, platform_url, status, sync_error, last_sync_at, connected_at')
        .eq('client_id', clientId)
        .neq('platform_account_id', 'pending')
        .order('channel'),
    ])
    setConnections((pc.data ?? []) as PlatformConnection[])
    setChannelConnections((cc.data ?? []) as ChannelConnection[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function getConnection(platform: string) {
    return connections.find(c => c.platform === platform && c.access_token)
  }

  function isExpired(conn: PlatformConnection) {
    return conn.expires_at ? new Date(conn.expires_at) < new Date() : false
  }

  function expiresInDays(conn: PlatformConnection) {
    return conn.expires_at
      ? Math.max(0, Math.floor((new Date(conn.expires_at).getTime() - Date.now()) / 86400000))
      : null
  }

  async function handleConnectInstagram() {
    // Show manual token paste for local dev.
    // In production, this will use Instagram Direct Login:
    // window.location.href = `/api/auth/instagram-direct?clientId=${clientId}`
    setShowManualIg(true)
  }

  async function handleSaveManualIgToken() {
    if (!manualIgToken.trim()) return
    setSavingManualIg(true)
    setManualIgError(null)

    try {
      // Verify the token works by fetching profile
      const res = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,followers_count`, {
        headers: { Authorization: `Bearer ${manualIgToken.trim()}` },
      })
      const profile = await res.json()

      if (profile.error) {
        setManualIgError(profile.error.message || 'Invalid token')
        setSavingManualIg(false)
        return
      }

      // Store the connection
      const { data: existing } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'instagram')
        .maybeSingle()

      const connData = {
        client_id: clientId,
        platform: 'instagram',
        profile_url: `https://instagram.com/${profile.username}`,
        username: profile.username,
        access_token: manualIgToken.trim(),
        ig_account_id: profile.id,
        connected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
      }

      if (existing) {
        await supabase.from('platform_connections').update(connData).eq('id', existing.id)
      } else {
        await supabase.from('platform_connections').insert(connData)
      }

      setShowManualIg(false)
      setManualIgToken('')
      load()

      // Trigger a sync
      handleSync('instagram')
    } catch (err) {
      setManualIgError('Failed to verify token')
    }
    setSavingManualIg(false)
  }

  async function handleConnectFacebook() {
    // Same Meta OAuth flow — the callback stores both Facebook + Instagram connections
    window.location.href = `/api/auth/instagram?clientId=${clientId}`
  }

  // handleSelectPage removed — Facebook connects via OAuth callback now

  async function handleDisconnect(connId: string) {
    setDisconnecting(connId)
    await supabase.from('platform_connections').delete().eq('id', connId)
    setDisconnecting(null)
    load()
  }

  async function handleSync(platform?: string) {
    setSyncing(platform || 'all')
    setSyncResult(null)
    try {
      const res = await fetch('/api/social/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, platform }),
      })
      const data = await res.json()
      if (data.synced > 0) {
        setSyncResult(`Synced ${data.synced} platform(s) successfully`)
      } else if (data.failed > 0) {
        setSyncResult(`Sync failed: ${data.results?.[0]?.error || 'Unknown error'}`)
      } else {
        setSyncResult(data.message || 'Nothing to sync')
      }
    } catch {
      setSyncResult('Sync failed')
    }
    setSyncing(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Platform Connections</h2>
          <p className="text-xs text-ink-4 mt-0.5">
            Connect social media accounts to pull real performance data into the client&apos;s portal.
          </p>
        </div>
        <button
          onClick={() => handleSync()}
          disabled={syncing !== null}
          className="text-xs font-medium text-brand hover:text-brand-dark flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync all
        </button>
      </div>

      {syncResult && (
        <div className={`text-xs p-2.5 rounded-lg ${
          syncResult.includes('failed') || syncResult.includes('error')
            ? 'bg-red-50 text-red-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}>
          {syncResult}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map(platform => {
            const conn = getConnection(platform.id)
            const Icon = platform.icon
            const expired = conn ? isExpired(conn) : false
            const daysLeft = conn ? expiresInDays(conn) : null

            return (
              <div
                key={platform.id}
                className="bg-white rounded-xl border border-ink-6 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{platform.label}</h3>
                      {conn ? (
                        <div className="space-y-0.5 mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <Check className="w-3 h-3" /> Connected
                            </span>
                            <span className="text-xs text-ink-3">
                              {conn.username ? (conn.platform === 'facebook' ? conn.username : `@${conn.username}`) : conn.page_name || ''}
                            </span>
                          </div>
                          {expired && (
                            <p className="text-[10px] font-medium text-red-600">
                              Connection expired. Click Reconnect to refresh.
                            </p>
                          )}
                          {!expired && daysLeft !== null && daysLeft < 7 && (
                            <p className="text-[10px] font-medium text-amber-600">
                              Needs refresh soon
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-4 mt-0.5">
                          {platform.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {conn ? (
                      <>
                        <button
                          onClick={() => handleSync(platform.id)}
                          disabled={syncing !== null || expired}
                          className="text-xs font-medium text-brand hover:text-brand-dark flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          {syncing === platform.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Sync
                        </button>
                        <button
                          onClick={() => handleDisconnect(conn.id)}
                          disabled={disconnecting === conn.id}
                          className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                        >
                          {disconnecting === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={
                          platform.id === 'instagram' ? handleConnectInstagram :
                          platform.id === 'facebook' ? handleConnectFacebook :
                          platform.id === 'tiktok' ? () => { window.location.href = `/api/auth/tiktok?clientId=${clientId}` } :
                          platform.id === 'linkedin' ? () => { window.location.href = `/api/auth/linkedin?clientId=${clientId}` } :
                          undefined
                        }
                        className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors"
                      >
                        <LinkIcon className="w-3.5 h-3.5" /> Connect {platform.label}
                      </button>
                    )}
                  </div>
                </div>

                {/* Manual Instagram token input */}
                {platform.id === 'instagram' && showManualIg && !conn && (
                  <div className="mt-4 pt-4 border-t border-ink-6">
                    <p className="text-xs text-ink-2 mb-2">
                      Paste the Instagram token from{' '}
                      <a
                        href="https://developers.facebook.com/apps/972474978474759/use_cases/customize/API-Setup/?use_case_enum=INSTAGRAM_BUSINESS"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:text-brand-dark underline"
                      >
                        Meta Developer Dashboard → Instagram Use Case → Generate token
                      </a>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualIgToken}
                        onChange={e => setManualIgToken(e.target.value)}
                        placeholder="Paste Instagram token here..."
                        className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                      <button
                        onClick={handleSaveManualIgToken}
                        disabled={savingManualIg || !manualIgToken.trim()}
                        className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {savingManualIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Connect
                      </button>
                      <button
                        onClick={() => { setShowManualIg(false); setManualIgToken(''); setManualIgError(null) }}
                        className="text-xs text-ink-4 hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {manualIgError && (
                      <p className="text-xs text-red-600 mt-1.5">{manualIgError}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Google connections (GA4, Search Console, Business Profile) */}
          {channelConnections.length > 0 && (
            <div className="mt-4 pt-6 border-t border-ink-6">
              <h3 className="text-sm font-bold text-ink mb-3">Google Services</h3>
              <div className="space-y-2">
                {channelConnections.map((cc) => (
                  <div key={cc.id} className="bg-white rounded-xl border border-ink-6 p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-ink">
                          {CHANNEL_LABELS[cc.channel] || cc.channel}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          cc.status === 'active' ? 'bg-brand-tint text-brand-dark'
                            : cc.status === 'error' ? 'bg-red-50 text-red-600'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {cc.status}
                        </span>
                      </div>
                      {cc.platform_account_name && (
                        <p className="text-xs text-ink-3 truncate">{cc.platform_account_name}</p>
                      )}
                      {cc.last_sync_at && (
                        <p className="text-[11px] text-ink-4 mt-1">
                          Last sync: {new Date(cc.last_sync_at).toLocaleString()}
                        </p>
                      )}
                      {cc.sync_error && (
                        <p className="text-[11px] text-red-600 mt-1 flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span>{cc.sync_error}</span>
                        </p>
                      )}
                    </div>
                    {cc.platform_url && (
                      <a
                        href={cc.platform_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-4 hover:text-brand flex-shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-4 mt-3">
                These are connected by the client from the dashboard. To re-connect or change a property, the client must do it from <code className="text-[11px] bg-bg-2 px-1 rounded">/dashboard/connected-accounts</code>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
