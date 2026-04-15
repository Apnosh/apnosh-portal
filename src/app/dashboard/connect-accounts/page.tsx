'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Check, Loader2, Camera, Globe, Tv, Briefcase, Link as LinkIcon,
  ArrowRight, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

const PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Camera,
    color: 'from-purple-500 via-pink-500 to-orange-400',
    description: 'Connect so we can track your followers, reach, and engagement.',
    authPath: '/api/auth/instagram',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: Globe,
    color: 'from-blue-600 to-blue-500',
    description: 'Connect your Facebook Page so we can track performance.',
    authPath: '/api/auth/instagram', // Same Meta OAuth handles both
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: Tv,
    color: 'from-gray-900 to-gray-700',
    description: 'Connect so we can track video views and engagement.',
    authPath: '/api/auth/tiktok',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Briefcase,
    color: 'from-blue-700 to-blue-600',
    description: 'Connect your company page for follower and post tracking.',
    authPath: '/api/auth/linkedin',
  },
]

interface Connection {
  platform: string
  username: string | null
  page_name: string | null
}

export default function ConnectAccountsPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (clientLoading) return
    if (!client?.id) { setLoading(false); return }

    const clientId = client.id
    async function load() {
      const { data } = await supabase
        .from('platform_connections')
        .select('platform, username, page_name')
        .eq('client_id', clientId)
        .not('access_token', 'is', null)
      setConnections((data ?? []) as Connection[])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, clientLoading])

  function isConnected(platform: string) {
    return connections.some(c => c.platform === platform)
  }

  function getConnectionName(platform: string) {
    const c = connections.find(c => c.platform === platform)
    return c?.username || c?.page_name || ''
  }

  const connectedCount = PLATFORMS.filter(p => isConnected(p.id)).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center pt-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-tint flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-brand-dark" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
          Connect your accounts
        </h1>
        <p className="text-ink-3 text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Connect your social media accounts so we can track your results and post content for you. You can always change this later.
        </p>
      </div>

      {/* Progress */}
      {connectedCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-800 font-medium">
            {connectedCount} of {PLATFORMS.length} connected
          </span>
        </div>
      )}

      {/* Platform cards */}
      {loading || clientLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map(platform => {
            const connected = isConnected(platform.id)
            const name = getConnectionName(platform.id)
            const Icon = platform.icon

            return (
              <div
                key={platform.id}
                className={`bg-white rounded-xl border p-5 transition-all ${
                  connected ? 'border-emerald-200' : 'border-ink-6'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platform.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-ink">{platform.label}</h3>
                    {connected ? (
                      <p className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                        <Check className="w-3 h-3" /> Connected{name ? ` as ${name}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-3 mt-0.5">{platform.description}</p>
                    )}
                  </div>
                  {!connected && (
                    <a
                      href={`${platform.authPath}?clientId=${client?.id}`}
                      className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors flex-shrink-0"
                    >
                      <LinkIcon className="w-3.5 h-3.5" /> Connect
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Continue / Skip */}
      <div className="flex items-center justify-between pt-4">
        <Link
          href="/dashboard"
          className="text-sm text-ink-3 hover:text-ink transition-colors"
        >
          Skip for now
        </Link>
        <Link
          href="/dashboard"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors"
        >
          Continue to dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
