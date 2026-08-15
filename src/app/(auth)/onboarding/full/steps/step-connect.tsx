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

  /* The GBP callback returns with ?gbp=connected|pending|cancelled|error. The handler for
   * these lived on the retired location step, so in the live flow the params were silently
   * dropped — a cancelled Google login looked identical to never trying. */
  const [gbpNote, setGbpNote] = useState<string | null>(null)
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('gbp')
      if (v === 'connected') setGbpNote('Google connected. Your data is loading now.')
      else if (v === 'pending') setGbpNote('Google sign-in worked. One more step: choose your business location from the dashboard, and data starts flowing.')
      else if (v === 'cancelled') setGbpNote('Google connect was cancelled. Nothing was changed; try again whenever you like.')
      else if (v === 'error') setGbpNote('Google connect hit an error. Nothing was broken on your side; try once more, and if it repeats, we will look into it.')
      if (v) window.history.replaceState(null, '', window.location.pathname)
    } catch { /* ignore */ }
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

  /* RE-ASK WHEN THE OWNER COMES BACK. The connect finishes in ANOTHER tab (or app), so this
   * tab's one on-mount read is guaranteed stale at exactly the moment it matters. Refresh on
   * focus and visibility, which is when a human returns from the vendor page — the chip flips
   * to Connected without anyone having to know to reload. */
  useEffect(() => {
    if (!clientId) return
    let busy = false
    const refresh = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const connected = await getConnectedPlatforms(clientId)
        if (Object.keys(connected).length > 0) {
          update('connected', { ...data.connected, ...connected })
          /* CONNECTED IS NOT DONE — DATA IS DONE. The row is born pending and only a SYNC
           * flips it active and fills the tables; until now the first sync waited for the
           * nightly cron or a dashboard visit, so the owner saw "Connected" next to "pending
           * data" (2026-08-14). Fire the first sync the moment a connect is seen. The route
           * claims its own window atomically, so repeat focus events cost one cheap
           * "already fresh" reply rather than duplicate syncs. Fire-and-forget: the chip must
           * not wait ten seconds on a metrics pull. */
          fetch(`/api/dashboard/social-refresh?clientId=${clientId}&force=1`).catch(() => {})
        }
      } catch { /* keep the chips we have */ }
      busy = false
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

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
    const url = `${authPath}${authPath.includes('?') ? '&' : '?'}clientId=${clientId}&returnTo=${encodeURIComponent('/onboarding/full')}`
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
    /* JUST TRY IT. The previous version detected a phone and refused to navigate, showing a
     * paragraph of instructions instead. The owner's verdict was blunt and correct: it is a bad
     * flow. It also assumed failure — a phone without the Instagram app installed connects
     * fine, and those owners were being handed a chore for a problem they do not have.
     *
     * So every device attempts the connect. When the OS hands it to the app instead, the owner
     * comes back to a portal that is still here, and the one quiet line under the list tells
     * them the honest thing: skip it, finish setup, do this from a computer. Connecting has
     * never been required to finish onboarding (canContinue in data.ts only blocks on role and
     * business name), so "later" is a real answer rather than a consolation. */
    const tab = window.open(url, '_blank', 'noopener')
    if (!tab) window.location.href = url
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
      {gbpNote && (
        <div className="mt-4 rounded-[12px] px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: '#f2faf7', border: '1px solid #d8ece4', color: '#2f8f70' }}>
          {gbpNote}
        </div>
      )}

      {/* ONE LINE, NOT A LECTURE. Shown always, so it reads as a note about how phones behave
          rather than as an error report about something the owner just did wrong. */}
      <div className="mt-4 text-[12px] leading-relaxed" style={{ color: '#9aa1ab' }}>
        Some phones open the Instagram or TikTok app instead of signing you in. If that happens,
        skip it — you can connect from your dashboard on a computer in a few seconds.
        {connectUrl && (
          <>
            {' '}
            <button
              type="button"
              onClick={copyConnectLink}
              style={{ border: 'none', background: 'none', padding: 0, color: '#2f8f70', fontWeight: 600, fontSize: 12 }}
            >
              {copied ? 'Link copied' : 'Or copy the link'}
            </button>
          </>
        )}
      </div>

      {nav}
    </>
  )
}
