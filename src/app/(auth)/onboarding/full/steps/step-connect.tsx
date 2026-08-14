'use client'

import { type ReactNode, useEffect, useCallback, useState } from 'react'
import { type OnboardingData, PLATFORMS } from '../data'
import { Question, Hint } from '../ui'
import { ensureClientForBusiness, getConnectedPlatforms } from '@/lib/onboarding-actions'

// Every social connect goes through the vendor lane (the same per-platform hosted
// login the Connected accounts page uses); the old direct OAuth routes are retired.
const OAUTH_PATHS: Record<string, string> = {
  Instagram: '/api/channels/social/start?platform=instagram',
  Facebook: '/api/channels/social/start?platform=facebook',
  TikTok: '/api/channels/social/start?platform=tiktok',
  LinkedIn: '/api/channels/social/start?platform=linkedin',
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
  const [connectUrl, setConnectUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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
      // No OAuth for this platform here: do NOTHING. Coming soon means coming soon —
      // flipping a green "Connected" chip with no real connection behind it made owners
      // believe their reviews were syncing when nothing was.
      if (authPath) console.error('[connect] clientId is null — cannot start OAuth')
      return
    }

    setConnectingPlatform(name)
    setLoading(true)

    /* WHY THIS IS NOT A PLAIN REDIRECT ANY MORE.
     *
     * This used to be `window.location.href = url`. That is a TOP-LEVEL navigation which ends
     * up on an instagram.com URL, and both iOS and Android treat those as Universal / App
     * Links: the OS yanks the navigation out of the browser and hands it to the installed
     * Instagram app. The app cannot complete an OAuth handshake it did not start, so the owner
     * sees the Instagram app open and immediately show an error (reported 2026-08-13).
     *
     * A web page cannot switch that OS behaviour off. What it CAN do is (a) not lose the
     * portal when the hand-off happens, by opening in a separate tab, and (b) always leave a
     * way to finish the job in a browser, which is the one path the OS does not intercept.
     * The copy-link escape hatch below is that path, and it is shown to everyone rather than
     * hidden behind a failure, because by the time you have seen the error you have already
     * lost the tab that would have explained it. */
    const url = `${authPath}${authPath.includes('?') ? '&' : '?'}clientId=${clientId}&returnTo=/onboarding`
    setConnectUrl(new URL(url, window.location.origin).toString())

    const tab = window.open(url, '_blank', 'noopener')
    /* Popup blocked (common when the tap is not seen as a direct gesture): fall back to the
     * old behaviour rather than appearing to do nothing. */
    if (!tab) window.location.href = url
    else setLoading(false)
  }

  async function copyConnectLink() {
    if (!connectUrl) return
    try {
      await navigator.clipboard.writeText(connectUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard refused (older browsers, insecure context): the input below is selectable,
       * so there is still a way through. */
    }
  }

  return (
    <>
      <Question title="Connect your accounts" subtitle="Link the platforms you want us to manage" />
      <div className="mt-4 space-y-2">
        {PLATFORMS.map((p) => {
          const hasOAuth = !!OAUTH_PATHS[p.name]
          // A platform with no OAuth can never really be connected here — ignore any stale
          // persisted flag from the old fake toggle so "Connected" is never a lie.
          const isConn = !!data.connected[p.name] && hasOAuth
          const isConnecting = connectingPlatform === p.name

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
              ) : hasOAuth ? (
                <button
                  type="button"
                  onClick={() => connectPlatform(p.name)}
                  disabled={loading && !isConnecting}
                  className="text-xs font-semibold rounded-[20px] px-3.5 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
                  style={{ color: '#4abd98', border: '1.5px solid #4abd98' }}
                >
                  Connect
                </button>
              ) : (
                <span
                  className="text-xs font-medium rounded-[20px] px-3 py-1 whitespace-nowrap"
                  style={{ color: '#999', border: '1px solid #e0e0e0' }}
                >
                  Coming soon
                </span>
              )}
            </div>
          )
        })}
        <Hint>You can always connect more accounts from your dashboard later.</Hint>
      </div>
      {/* THE BROWSER PATH. Shown as soon as a connect is attempted, because the phone may have
          already jumped to the Instagram app by then and the owner needs somewhere to land when
          they come back. Copying the link and pasting it into Safari or Chrome is the one route
          the OS does not intercept. */}
      {connectUrl && (
        <div className="mt-4 rounded-[14px] p-3.5" style={{ background: '#f7f7f9', border: '0.5px solid #e8e9ec' }}>
          <div className="text-[13px] font-semibold" style={{ color: '#16181d' }}>
            Did the Instagram app open and show an error?
          </div>
          <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: '#6b7280' }}>
            Phones hand Instagram links to the app, which cannot finish signing you in. Copy the
            link below, paste it into Safari or Chrome, and it will work there.
          </div>
          <button
            type="button"
            onClick={copyConnectLink}
            className="w-full mt-2.5 rounded-[12px] text-[13px] font-semibold"
            style={{ minHeight: 44, border: '1px solid #d8ece4', background: copied ? '#e8f6f0' : '#fff', color: '#2f8f70' }}
          >
            {copied ? 'Copied. Now paste it in your browser.' : 'Copy the sign-in link'}
          </button>
        </div>
      )}

      {nav}
    </>
  )
}
