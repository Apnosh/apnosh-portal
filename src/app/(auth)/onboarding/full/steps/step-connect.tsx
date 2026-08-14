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
  /* youtube is in ZERNIO_PLATFORMS (adapters/zernio.ts:38) and its metrics already flow, so
   * this is the same hosted lane as the rest — it was simply never listed here. */
  YouTube: '/api/channels/social/start?platform=youtube',
  /* GOOGLE BUSINESS WAS NEVER "COMING SOON". The OAuth route has existed and worked all along
   * (api/auth/google-business), and its callback even has a dedicated onboarding branch that
   * returns to the wizard. Its only entry point in setup lived on the LOCATION step, and the
   * six-screen redesign removed that step — so a working connect silently vanished and the
   * chip fell through to the coming-soon branch. origin=onboarding is what makes the callback
   * come back here instead of dropping the owner on the dashboard location picker mid-setup. */
  'Google Business': '/api/auth/google-business?origin=onboarding',
  /* THE REGISTERS. Both have had real OAuth start routes and token exchange since the channels
   * work, and both are live on the dashboard's Connected accounts page — they were simply never
   * offered during setup. Connecting the register is what turns the funnel's Orders stage from
   * "we cannot see sales yet" into a real number, so asking here is worth a row. */
  Square: '/api/channels/square/start',
  Clover: '/api/channels/clover/start',
}

/** Platforms whose connect is a plain Google redirect: no app on the phone intercepts
 *  accounts.google.com, so these navigate directly and never need the copy-link path. */
const DIRECT_NAV = new Set(['Google Business', 'Square', 'Clover'])

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  businessId: string | null
}

export default function StepConnect({ data, update, nav, businessId }: Props) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  /* WHAT IS ACTUALLY CONNECTABLE, ASKED RATHER THAN ASSUMED.
   * Availability used to be implied by whether a platform had an entry in the map above, which
   * is a hand-kept list in a component nobody edits when a key is added to Vercel. That is how
   * Google Business showed "Coming soon" for a route that worked. The server reports which
   * adapters have their keys, so a Connect button exists only where it can succeed. */
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    fetch('/api/channels/available')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return
        setAvailable({
          Instagram: !!j.socialPerPlatform, Facebook: !!j.socialPerPlatform,
          TikTok: !!j.socialPerPlatform, LinkedIn: !!j.socialPerPlatform,
          YouTube: !!j.socialPerPlatform,
          Square: !!j.channels?.square, Clover: !!j.channels?.clover,
          /* GBP is its own Google OAuth route, not a channels adapter, so it is not in the
           * report. It is configured wherever the app can talk to Google at all. */
          'Google Business': true,
          Yelp: false,
        })
      })
      .catch(() => { /* leave null: fall back to the map, which is the old behaviour */ })
  }, [])

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
    setLoading(false)

    /* ON A PHONE, DO NOT NAVIGATE. Opening in a new tab was the first attempt and it did not
     * help: the OS intercepts the instagram.com hop wherever it happens, hands it to the app,
     * and the app errors. There is no navigation a web page can perform that avoids this.
     *
     * What DOES work is pasting the link into the address bar. iOS deliberately does not apply
     * Universal Links to a URL typed or pasted into Safari, which is the one gap in the
     * hand-off. So on a phone the copy panel IS the flow, not a fallback for when the flow
     * fails — offering the tap first just spends the owner's patience on a path that cannot
     * succeed. Desktop is unaffected and still opens directly. */
    if (isPhone() && !DIRECT_NAV.has(name)) return

    const tab = window.open(url, '_blank', 'noopener')
    if (!tab) window.location.href = url
  }

  /** Coarse pointer OR narrow screen. Deliberately loose: a false positive costs one extra tap
   *  on the "open it directly" link, a false negative costs a dead end. */
  function isPhone(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(pointer: coarse)')?.matches === true || window.innerWidth < 820
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
          /* A route must exist AND its keys must be set. Either missing means no button. */
          const hasOAuth = !!OAUTH_PATHS[p.name] && (available === null || available[p.name] !== false)
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
      {connectUrl && !DIRECT_NAV.has(connectingPlatform ?? '') && (
        <div className="mt-4 rounded-[14px] p-3.5" style={{ background: '#f7f7f9', border: '0.5px solid #e8e9ec' }}>
          <div className="text-[13px] font-semibold" style={{ color: '#16181d' }}>
            One more step: finish this in your browser
          </div>
          <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: '#6b7280' }}>
            Tapping a link sends your phone to the Instagram app, which cannot sign you in.
            Pasting the same link into Safari or Chrome does work. Copy it, open your browser,
            and paste it in the address bar.
          </div>
          <button
            type="button"
            onClick={copyConnectLink}
            className="w-full mt-2.5 rounded-[12px] text-[13px] font-semibold"
            style={{ minHeight: 44, border: '1px solid #d8ece4', background: copied ? '#e8f6f0' : '#fff', color: '#2f8f70' }}
          >
            {copied ? 'Copied. Now paste it in your browser.' : 'Copy the sign-in link'}
          </button>
          {/* Still offered, because a phone without the app installed connects fine by tapping,
              and this component's phone check is deliberately loose. */}
          <a
            href={connectUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="block text-center text-[12px] mt-2"
            style={{ color: '#9aa1ab', minHeight: 32, paddingTop: 7 }}
          >
            Or try opening it directly
          </a>
        </div>
      )}

      {nav}
    </>
  )
}
