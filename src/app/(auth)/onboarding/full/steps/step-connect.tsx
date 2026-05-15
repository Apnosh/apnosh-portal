'use client'

import { type ReactNode, useEffect, useCallback, useState } from 'react'
import { type OnboardingData, PLATFORMS } from '../data'
import { Question, Hint } from '../ui'
import { ensureClientForBusiness, getConnectedPlatforms } from '@/lib/onboarding-actions'

// Map platform display names to OAuth paths
// Instagram uses the direct Instagram login (simpler, no Facebook Page required)
// Facebook uses the Meta OAuth flow (connects Facebook Page + linked IG)
const OAUTH_PATHS: Record<string, string> = {
  Instagram: '/api/auth/instagram-direct',
  Facebook: '/api/auth/instagram',
  TikTok: '/api/auth/tiktok',
  LinkedIn: '/api/auth/linkedin',
}

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  businessId: string | null
}

export default function StepConnect({ data, update, nav, businessId }: Props) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)

  // Ensure a clients record exists for OAuth
  useEffect(() => {
    if (!businessId) {
      console.log('[connect] No businessId yet')
      return
    }
    async function init() {
      console.log('[connect] Ensuring client for business:', businessId)
      try {
        const cId = await ensureClientForBusiness(businessId!)
        console.log('[connect] Got clientId:', cId)
        setClientId(cId)
        // Also load any already-connected platforms
        if (cId) {
          const connected = await getConnectedPlatforms(cId)
          console.log('[connect] Connected platforms:', connected)
          if (Object.keys(connected).length > 0) {
            update('connected', { ...data.connected, ...connected })
          }
        }
      } catch (err) {
        console.error('[connect] Error:', err)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  // Listen for OAuth popup callback messages
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'oauth-callback') {
      const { connected: platforms, error } = event.data as { connected: string[]; error: string | null }
      if (error) {
        console.error('OAuth error:', error)
        setConnectingPlatform(null)
        return
      }
      // Update connected state
      const updated = { ...data.connected }
      for (const p of platforms || []) {
        // Map lowercase platform names from callback to display names
        const name = p.charAt(0).toUpperCase() + p.slice(1)
        // Handle "facebook" -> "Facebook", "instagram" -> "Instagram"
        updated[name] = true
      }
      update('connected', updated)
      setConnectingPlatform(null)
    }
  }, [data.connected, update])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  function connectPlatform(name: string) {
    const authPath = OAUTH_PATHS[name]
    console.log('[connect] Platform:', name, 'authPath:', authPath, 'clientId:', clientId)
    if (!authPath || !clientId) {
      if (!authPath) {
        // No OAuth available (Google Business, Yelp) — just toggle visual state
        const connected = { ...data.connected }
        connected[name] = !connected[name]
        update('connected', connected)
      } else {
        console.error('[connect] clientId is null — cannot start OAuth')
      }
      return
    }

    setConnectingPlatform(name)
    setLoading(true)

    // Full-page redirect to OAuth (more reliable than popups for Meta)
    // The callback will redirect back to /onboarding after connecting
    const url = `${authPath}?clientId=${clientId}&returnTo=/onboarding`
    console.log('[connect] Redirecting to:', url)
    window.location.href = url
  }

  return (
    <>
      <Question title="Connect your accounts" subtitle="Link the platforms you want us to manage" />
      <div className="mt-4 space-y-2">
        {PLATFORMS.map((p) => {
          const isConn = !!data.connected[p.name]
          const isConnecting = connectingPlatform === p.name
          const hasOAuth = !!OAUTH_PATHS[p.name]

          return (
            <div
              key={p.name}
              className="flex items-center gap-3.5 px-4 py-3 rounded-[10px]"
              style={{
                border: isConn ? '1.5px solid #9fe1cb' : '1.5px solid #e0e0e0',
                background: isConn ? '#f0faf6' : 'white',
              }}
            >
              <div
                className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: p.color + '1a' }}
              >
                {p.emoji}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: '#111' }}>{p.name}</div>
                <div className="text-xs" style={{ color: '#999' }}>{p.desc}</div>
              </div>
              {isConn ? (
                <span
                  className="text-xs font-medium rounded-[20px] px-3 py-1 whitespace-nowrap"
                  style={{ color: '#0f6e56', background: '#f0faf6', border: '1px solid #9fe1cb' }}
                >
                  Connected
                </span>
              ) : isConnecting ? (
                <span className="text-xs font-medium rounded-[20px] px-3 py-1 whitespace-nowrap text-gray-400 border border-gray-200">
                  Connecting...
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => connectPlatform(p.name)}
                  disabled={loading && !isConnecting}
                  className="text-xs font-semibold rounded-[20px] px-3.5 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
                  style={{ color: '#4abd98', border: '1.5px solid #4abd98' }}
                >
                  {hasOAuth ? 'Connect' : 'Coming soon'}
                </button>
              )}
            </div>
          )
        })}
        <Hint>You can always connect more accounts from your dashboard later.</Hint>
      </div>
      {nav}
    </>
  )
}
