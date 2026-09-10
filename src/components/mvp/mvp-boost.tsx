'use client'

/**
 * BOOST — put money behind a post that already worked.
 * ====================================================
 * The only ads screen in the portal, deliberately. Zernio exposes about 110 ads
 * endpoints and almost all of them are aimed at someone whose job is running
 * ads. This asks the one question a restaurant owner can answer:
 *
 *     "This photo did 4x your usual. Want more people to see it?"
 *
 * We can ask it because we already hold their organic numbers. An ad platform
 * cannot: it knows what its own ads did, not what their Tuesday lunch photo did.
 *
 * EVERY SCREEN THAT SPENDS MONEY OWES THE SAME THREE THINGS, and they are the
 * reason this file is longer than it looks like it should be:
 *   the exact number, before the press, in a sentence and not a field;
 *   a ceiling that is visible rather than discovered;
 *   and a way to stop it afterwards that is on the same screen, not in support.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, TrendingUp, Square, MapPin, Eye, Play, Image as ImageIcon } from 'lucide-react'
import MvpShell from './mvp-shell'
import { MvpButton, MvpActions, MvpEmpty, MvpMsg } from './mvp-detail'
import { BrandOrMark, brandTone } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, tint, alpha } from './hues'
import { CARD_SHADOW } from './kit'

const R = { cell: 12, box: 14, card: 20, pill: 99 } as const
const T = { note: 11.5, label: 12.5, control: 13.5, body: 14, big: 17, hero: 22 } as const

interface AdAccount { id: string; name: string; currency: string; selectable: boolean; status: string }
interface RunningAd { id: string; name: string; status: string; spend: number; impressions: number; clicks: number }
interface GeoOption { key: string; name: string; type: string; where: string; targetable: boolean }
interface Reach { available: boolean; lower: number | null; upper: number | null; daily: number | null; untargetable?: boolean }
interface AdPreview { format: string; html: string | null }

/**
 * TAKE THE URL, NOT THE HTML.
 *
 * Meta returns its preview as an <iframe> snippet "embeddable directly", and
 * dangerouslySetInnerHTML would do exactly that -- putting third-party markup
 * into our page and trusting it forever. Pulling out the src and rendering our
 * own sandboxed iframe means only a URL crosses the boundary, and only if it is
 * really Facebook's. Costs nothing and closes the hole.
 */
function previewSrc(html: string | null): string | null {
  if (!html) return null
  const m = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(html)
  if (!m) return null
  const raw = m[1].replace(/&amp;/g, '&')
  try {
    const u = new URL(raw, 'https://www.facebook.com')
    if (u.protocol !== 'https:') return null
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null
    return u.toString()
  } catch { return null }
}
interface PlatformState {
  platform: 'meta' | 'tiktok'; name: string; available: boolean
  minDaily: number; cityRadius: boolean; reachEstimate: boolean; previews: boolean
  ownLogin: boolean; note: string
  accounts: AdAccount[]; ads: RunningAd[]; payer: string | null
}
interface Candidate {
  /* Zernio's post id, whatever the database column is called. */
  zernioPostId: string; platform: string; adPlatform: 'meta' | 'tiktok' | null; caption: string
  image: string | null; isVideo: boolean; permalink: string | null; postedAt: string
  interactions: number; reach: number; timesMedian: number | null
}

/* A DAILY amount and a length, not a lump sum. "$20 over 5 days" hid the number
   that decides whether an ad delivers at all, which is what it spends per day.
   Four dollars a day reaches almost nobody, and the old screen never said so. */
const DAILY = [5, 10, 20, 35]
const LENGTHS = [3, 7, 14, 30]
const RADII = [3, 5, 10, 25]

function Head({ hue, children, note }: { hue: 'brand' | 'mint' | 'amber'; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '26px 2px 9px' }}>
      <span style={{ width: 3, height: 13, borderRadius: R.pill, background: gradOf(hue, 180), flexShrink: 0 }} />
      <span style={{ fontSize: T.label, fontWeight: 600, color: C.mute }}>{children}</span>
      {note != null && <span style={{ marginLeft: 'auto', fontSize: T.note, color: C.mute }}>{note}</span>}
    </div>
  )
}

export default function MvpBoost({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  /* Set up one platform and the setup screen goes away, which would leave no
     way to add the second. This forces it back. */
  const [addingPlatform, setAddingPlatform] = useState(false)
  /* Best first is the pitch; newest first is how somebody looks for the post
     they are actually thinking of. */
  const [order, setOrder] = useState<'best' | 'new'>('best')
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [ads, setAds] = useState<RunningAd[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [platforms, setPlatforms] = useState<PlatformState[]>([])
  /* Which platform the connect step is setting up. */
  const [setupOf, setSetupOf] = useState<'meta' | 'tiktok'>('meta')
  const [limits, setLimits] = useState({ maxUsd: 500, maxDays: 30, minDaily: 1 })

  const [pickedAccount, setPickedAccount] = useState<string | null>(null)
  const [picked, setPicked] = useState<Candidate | null>(null)
  const [daily, setDaily] = useState(10)
  const [days, setDays] = useState(7)
  const [radius, setRadius] = useState(10)
  /* Age is sent but not yet offered as a control. 18-65 is everyone Meta will
     serve a restaurant ad to, so the default is the honest one, and a narrower
     range is a decision nobody has asked for yet. */
  const ageMin = 18
  const ageMax = 65
  const [placeQ, setPlaceQ] = useState('')
  const [places, setPlaces] = useState<GeoOption[]>([])
  const [place, setPlace] = useState<GeoOption | null>(null)
  const [reach, setReach] = useState<Reach | null>(null)
  const [reaching, setReaching] = useState(false)
  /* Meta's own rendering of a running ad, fetched only when asked for. */
  const [previewOf, setPreviewOf] = useState<string | null>(null)
  const [previews, setPreviews] = useState<AdPreview[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ spent: number; days: number } | null>(null)

  const load = useCallback(() => {
    setErr(null)
    return fetch(`/api/dashboard/ads?clientId=${clientId}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'Could not load'); return j }))
      .then((j) => {
        setConnected(j.connected === true)
        setAccounts((j.accounts ?? []) as AdAccount[])
        setAds((j.ads ?? []) as RunningAd[])
        setCandidates((j.candidates ?? []) as Candidate[])
        setPlatforms((j.platforms ?? []) as PlatformState[])
        if (j.limits) setLimits(j.limits)
        /* The stored choice, or nothing. Not "the only one we can see": the
           point of the picker is that seeing three ad accounts and paying from
           one of them are different facts. */
        setPickedAccount(typeof j.payer === 'string' ? j.payer : null)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...payload }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'That did not work')
      return j as Record<string, unknown>
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not work')
      return null
    } finally { setBusy(false) }
  }

  /* Only posts on a platform that has an account set up to pay. Offering a
     TikTok video before TikTok ads are connected is offering a button that
     cannot work. */
  const liveCandidates = useMemo(() => {
    const list = candidates.filter((c) => c.adPlatform && platforms.some((p) => p.platform === c.adPlatform && p.payer))
    return order === 'best'
      ? list
      : [...list].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
  }, [candidates, platforms, order])
  const setupRules = useMemo(() => platforms.find((p) => p.platform === setupOf) ?? null, [platforms, setupOf])
  const setupAccounts = setupRules?.accounts ?? []
  const totalRunning = useMemo(() => ads.filter((a) => a.status?.toUpperCase() === 'ACTIVE').length, [ads])
  const total = daily * days

  /* THE POST DECIDES THE PLATFORM. Picking a TikTok video is choosing TikTok,
     and every rule below follows from that rather than from a separate switch
     the owner has to keep in sync with what they picked. */
  const ad = picked?.adPlatform ?? 'meta'
  const rules = useMemo(() => platforms.find((p) => p.platform === ad) ?? null, [platforms, ad])
  const minDaily = rules?.minDaily ?? 1
  /* TikTok's floor is $20, so its cheapest choices are not $5 and $10. */
  const dailyChoices = useMemo(() => DAILY.filter((d) => d >= minDaily).slice(0, 4).length >= 3
    ? DAILY.filter((d) => d >= minDaily).slice(0, 4)
    : [minDaily, minDaily * 2, minDaily * 3, minDaily * 5], [minDaily])

  /* A TikTok post picked after a Meta one must not inherit a $10 a day that
     TikTok will simply refuse. */
  useEffect(() => { setDaily((d) => (d < minDaily ? dailyChoices[0] : d)) }, [minDaily, dailyChoices])

  /* Look up a place as they type. Debounced, because this is a network call per
     keystroke otherwise and the answer is not urgent. */
  useEffect(() => {
    if (!placeQ.trim() || placeQ.trim().length < 2) { setPlaces([]); return }
    const id = setTimeout(() => {
      void fetch(`/api/dashboard/ads?clientId=${clientId}&places=${encodeURIComponent(placeQ.trim())}`, { cache: 'no-store' })
        .then((r) => r.json()).then((j) => setPlaces((j.places ?? []) as GeoOption[])).catch(() => setPlaces([]))
    }, 320)
    return () => clearTimeout(id)
  }, [placeQ, clientId])

  /* HOW MANY PEOPLE, before any money. Re-asked whenever the audience changes,
     because an estimate that lags the controls is worse than none. */
  useEffect(() => {
    if (!picked || !place || !rules?.reachEstimate) { setReach(null); return }
    let live = true
    setReaching(true)
    const id = setTimeout(() => {
      void fetch('/api/dashboard/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, action: 'estimate', adPlatform: ad, targeting: { geoKey: place.key, geoType: place.type, radiusMiles: radius, ageMin, ageMax } }),
      }).then((r) => r.json()).then((j) => { if (live) setReach(j as Reach) })
        .catch(() => { if (live) setReach(null) })
        .finally(() => { if (live) setReaching(false) })
    }, 260)
    return () => { live = false; clearTimeout(id) }
  }, [clientId, picked, place, radius, ageMin, ageMax, ad, rules])

  /* ── Spent ──────────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <MvpShell active="home" back="/dashboard" title="Boosted" focus>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Check size={28} color={C.greenDk} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: T.hero, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 7 }}>It is running</div>
          <div style={{ fontSize: T.body, color: C.mute, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
            ${done.spent} over {done.days} day{done.days === 1 ? '' : 's'}. That is the most it can ever spend, and you can stop it here at any time.
          </div>
          <div style={{ marginTop: 22 }}>
            <MvpButton label="See it running" onClick={() => { setDone(null); setPicked(null); void load() }} />
          </div>
        </div>
      </MvpShell>
    )
  }

  return (
    <MvpShell active="home" back="/dashboard" title={picked ? 'Boost this post' : 'Boost a post'} focus>
      <div style={{ padding: '6px 16px 0' }}>

        {loading && <div style={{ fontSize: T.control, color: C.mute, padding: '20px 2px' }}>Loading…</div>}
        {err && <div style={{ marginTop: 12 }}><MvpMsg ok={false} text={err} /></div>}

        {/* ── NOT CONNECTED ─────────────────────────────────────────────────
            One ad account, chosen explicitly. Not "connect everything you can
            see": an owner who has ever helped run another business's page can
            reach ad accounts they did not mean to hand over. */}
        {!loading && (!connected || addingPlatform) && (
          <>
            <div style={{ background: '#fff', borderRadius: R.card, boxShadow: CARD_SHADOW, padding: 20, marginTop: 8 }}>
              <div style={{ width: 42, height: 42, borderRadius: R.cell, background: gradOf('brand'), display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <TrendingUp size={20} color="#fff" />
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: T.big, fontWeight: 600, marginBottom: 6 }}>Put money behind what already works</div>
              <div style={{ fontSize: T.control, color: C.mute, lineHeight: 1.5 }}>
                We already know which of your posts did best. Boosting shows one of them to more
                people nearby. It keeps the likes and comments it already has.
              </div>
            </div>

            {/* ONE SETUP PER PLATFORM, because they are genuinely separate:
                Meta rides on the Facebook token we already hold, TikTok needs
                its own login. */}
            {platforms.filter((p) => p.available).length > 1 && (
              <>
                <Head hue="brand">Set up</Head>
                <div style={{ display: 'flex', gap: 8 }}>
                  {platforms.filter((p) => p.available).map((p) => {
                    const on = setupOf === p.platform
                    return (
                      <button key={p.platform} type="button" onClick={() => setSetupOf(p.platform)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: R.box,
                          cursor: 'pointer', font: 'inherit', fontFamily: DISPLAY, fontSize: T.control, fontWeight: on ? 700 : 500,
                          color: on ? '#fff' : C.ink, background: on ? C.ink : '#fff', border: `1px solid ${on ? 'transparent' : C.line}` }}>
                        <BrandOrMark provider={p.platform === 'meta' ? 'facebook' : 'tiktok'} size={14} />
                        {p.name}
                        {p.payer && <Check size={12} color={on ? '#fff' : C.greenDk} />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {setupAccounts.length === 0 ? (
              <div style={{ marginTop: 16 }}>
                <MvpEmpty text={setupRules?.ownLogin
                  ? `No ${setupRules.name} advertiser account was found. TikTok ads need their own login, which happens when you press below.`
                  : 'No ad account was found on your Facebook connection. You need a Facebook Page with an ad account attached.'} />
                {setupRules?.ownLogin && (
                  <MvpActions>
                    <MvpButton full busy={busy} label={`Log in to ${setupRules.name} ads`}
                      onClick={() => void (async () => {
                        const j = await act({ action: 'connect', adPlatform: setupOf, adAccountIds: ['pending'], returnTo: '/dashboard/boost' })
                        if (j && typeof j.authUrl === 'string' && j.authUrl) window.location.href = j.authUrl
                      })()} />
                  </MvpActions>
                )}
              </div>
            ) : (
              <>
                <Head hue="brand">Which ad account pays</Head>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {setupAccounts.map((a) => {
                    const on = pickedAccount === a.id
                    return (
                      <button key={a.id} type="button" disabled={!a.selectable} onClick={() => setPickedAccount(a.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', font: 'inherit',
                          padding: '13px 14px', borderRadius: R.box, cursor: a.selectable ? 'pointer' : 'default',
                          background: on ? tint('brand', .07) : '#fff', border: `1px solid ${on ? C.green : C.line}`, opacity: a.selectable ? 1 : .45 }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: `1px solid ${on ? 'transparent' : C.line}`, background: on ? gradOf('brand') : '#fff' }}>
                          {on && <Check size={10} color="#fff" strokeWidth={3} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink }}>{a.name}</span>
                          <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 1 }}>
                            {a.currency}{a.selectable ? '' : ' · not usable'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <MvpActions>
                  <MvpButton full busy={busy} disabled={!pickedAccount} label={`Turn on ${setupRules?.name ?? ''} ads`}
                    onClick={() => void (async () => {
                      const j = await act({ action: 'connect', adPlatform: setupOf, adAccountIds: [pickedAccount], returnTo: '/dashboard/boost' })
                      if (!j) return
                      if (typeof j.authUrl === 'string' && j.authUrl) window.location.href = j.authUrl
                      else { setAddingPlatform(false); void load() }
                    })()} />
                </MvpActions>
              </>
            )}
          </>
        )}

        {/* ── PICK A POST ───────────────────────────────────────────────────── */}
        {!loading && connected && !addingPlatform && !picked && (
          <>
            {/* The platform that is set up, and the one that is not. */}
            {platforms.some((p) => p.available && !p.payer) && (
              <button type="button"
                onClick={() => { const next = platforms.find((p) => p.available && !p.payer); if (next) { setSetupOf(next.platform); setAddingPlatform(true) } }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', font: 'inherit', marginTop: 10,
                  padding: '12px 14px', borderRadius: R.box, cursor: 'pointer', background: '#fff', border: `1px dashed ${C.line}` }}>
                <BrandOrMark provider={platforms.find((p) => p.available && !p.payer)?.platform === 'tiktok' ? 'tiktok' : 'facebook'} size={15} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink }}>
                    Turn on {platforms.find((p) => p.available && !p.payer)?.name} too
                  </span>
                  <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 1 }}>
                    So those posts can be boosted as well
                  </span>
                </span>
              </button>
            )}

            {ads.length > 0 && (
              <>
                <Head hue="mint" note={totalRunning ? `${totalRunning} running` : null}>Already boosted</Head>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ads.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: R.box, background: '#fff', border: `1px solid ${C.line}` }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 2 }}>
                          ${a.spend.toFixed(2)} spent · {a.impressions.toLocaleString()} seen · {a.status.toLowerCase()}
                        </span>
                      </span>
                      <button type="button"
                        onClick={() => void (async () => {
                          if (previewOf === a.id) { setPreviewOf(null); setPreviews(null); return }
                          setPreviewOf(a.id); setPreviews(null)
                          const r = await fetch(`/api/dashboard/ads?clientId=${clientId}&preview=${encodeURIComponent(a.id)}`, { cache: 'no-store' })
                          const j = await r.json().catch(() => ({}))
                          setPreviews((j.previews ?? []) as AdPreview[])
                        })()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: 'inherit', fontFamily: DISPLAY, fontSize: T.note, fontWeight: 600,
                          color: C.mute, background: '#f0f1f0', border: 'none', padding: '7px 12px', borderRadius: R.pill, cursor: 'pointer' }}>
                        <Eye size={11} /> {previewOf === a.id ? 'Hide' : 'See it'}
                      </button>
                      {a.status?.toUpperCase() === 'ACTIVE' && (
                        <button type="button" disabled={busy}
                          onClick={() => void (async () => { if (await act({ action: 'stop', adId: a.id })) void load() })()}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: 'inherit', fontFamily: DISPLAY, fontSize: T.note, fontWeight: 600,
                            color: C.coral, background: C.coralSoft, border: 'none', padding: '7px 12px', borderRadius: R.pill, cursor: 'pointer' }}>
                          <Square size={10} fill={C.coral} /> Stop
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* META'S OWN RENDERING, not our approximation of it. The same
                    post reads differently in a feed and in a Story, and somebody
                    who has just spent money should be able to see both. */}
                {previewOf && (
                  <div style={{ marginTop: 10 }}>
                    {previews === null ? (
                      <div style={{ fontSize: T.control, color: C.mute, padding: '10px 2px' }}>Asking Meta how it looks…</div>
                    ) : previews.length === 0 ? (
                      <MvpEmpty text="Meta did not return a preview for this one. It usually means the ad is still being reviewed." />
                    ) : (
                      <div className="bst-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                        {previews.map((p) => ({ ...p, src: previewSrc(p.html) })).filter((p) => p.src).map((p) => (
                          <div key={p.format} style={{ flexShrink: 0, borderRadius: R.box, overflow: 'hidden', border: `1px solid ${C.line}`, background: '#fff' }}>
                            <div style={{ fontSize: T.note, fontWeight: 600, color: C.mute, padding: '8px 12px', borderBottom: `1px solid ${C.line}` }}>
                              {p.format.replace(/_/g, ' ').toLowerCase()}
                            </div>
                            <iframe src={p.src as string} title={p.format} sandbox="allow-scripts allow-same-origin"
                              style={{ width: 340, height: 520, border: 'none', display: 'block' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <Head hue="brand" note={liveCandidates.length ? `${liveCandidates.length} posts` : null}>Pick a post</Head>
            {/* TWO COLUMNS AND A REAL SHAPE. The first version showed a 76px
                SQUARE crop, on an account where three quarters of the posts are
                vertical video: a Reel became a slice of its own middle and the
                owner could not tell one from another. Portrait thumbnails at
                4:5, which is the tallest an Instagram feed accepts and the
                closest honest frame for both a photo and a Reel. */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {([['best', 'Best first'], ['new', 'Newest first']] as const).map(([k, label]) => {
                const on = order === k
                return (
                  <button key={k} type="button" onClick={() => setOrder(k)}
                    style={{ font: 'inherit', fontFamily: DISPLAY, fontSize: T.note, fontWeight: 600, padding: '6px 12px',
                      borderRadius: R.pill, cursor: 'pointer', color: on ? '#fff' : C.mute,
                      background: on ? C.ink : '#fff', border: `1px solid ${on ? 'transparent' : C.line}` }}>
                    {label}
                  </button>
                )
              })}
            </div>
            {liveCandidates.length === 0 ? (
              <MvpEmpty text="Nothing to boost yet. Posts show up here once they have been synced." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {liveCandidates.map((p) => {
                  const c = brandTone(p.platform)?.solid ?? C.green
                  const strong = p.timesMedian != null && p.timesMedian >= 1.5
                  return (
                    <button key={p.zernioPostId} type="button" onClick={() => setPicked(p)}
                      style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', font: 'inherit', padding: 0,
                        borderRadius: R.box, overflow: 'hidden', cursor: 'pointer', background: '#fff',
                        /* Grid items stretch to the tallest in their row by
                           default, and a flex column will spend that height on
                           the picture -- so a two-line caption next door made
                           this thumbnail taller than 4:5 and the crops stopped
                           matching. Start-aligned, and the picture does not
                           give any height away. */
                        alignSelf: 'start',
                        border: `1px solid ${strong ? alpha(c, .55) : C.line}` }}>
                      <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '4 / 5', flexShrink: 0, background: `linear-gradient(160deg, ${tint('mint', .12)}, ${tint('brand', .12)})` }}>
                        {p.image ? (
                          <img src={p.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          /* Four of this client's posts have no thumbnail at all.
                             An empty tinted box reads as a loading failure. */
                          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint }}>
                            <ImageIcon size={20} />
                          </span>
                        )}
                        {/* A play badge, because a still frame of a video looks
                            exactly like a photo and they cost different things
                            to boost. */}
                        {p.isVideo && (
                          <span style={{ position: 'absolute', left: 8, top: 8, width: 22, height: 22, borderRadius: '50%',
                            background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Play size={10} color="#fff" fill="#fff" />
                          </span>
                        )}
                        <span style={{ position: 'absolute', right: 8, top: 8, width: 22, height: 22, borderRadius: '50%',
                          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>
                          <BrandOrMark provider={p.platform} size={12} />
                        </span>
                        {strong && (
                          <span style={{ position: 'absolute', left: 8, bottom: 8, fontFamily: DISPLAY, fontSize: T.note, fontWeight: 700,
                            color: '#fff', background: gradOf('brand'), padding: '3px 9px', borderRadius: R.pill }}>
                            {p.timesMedian}× your usual
                          </span>
                        )}
                      </span>
                      <span style={{ padding: '9px 11px 11px' }}>
                        <span style={{ fontSize: T.note, color: C.ink, lineHeight: 1.4, overflow: 'hidden',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                          {p.caption || 'No caption'}
                        </span>
                        <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 5 }}>
                          {p.interactions.toLocaleString()} likes and comments
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── SPEND ─────────────────────────────────────────────────────────── */}
        {!loading && connected && picked && (
          <>
            {/* THE POST IS THE SUBJECT OF THIS SCREEN, so it gets the card and
                the shadow rather than a thin strip. Everything under it is a
                decision about this picture. */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', background: '#fff', borderRadius: R.card, border: `1px solid ${C.line}`, boxShadow: CARD_SHADOW, overflow: 'hidden', marginTop: 8 }}>
              {/* Same 4:5 as the grid, so the thing they tapped still looks like
                  the thing they tapped. */}
              {picked.image && (
                <span style={{ position: 'relative', width: 84, flexShrink: 0, aspectRatio: '4 / 5', display: 'block' }}>
                  <img src={picked.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {picked.isVideo && (
                    <span style={{ position: 'absolute', left: 5, top: 5, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={8} color="#fff" fill="#fff" />
                    </span>
                  )}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, padding: '12px 14px 12px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <BrandOrMark provider={picked.platform} size={13} />
                  {picked.timesMedian != null && picked.timesMedian >= 1.5 && (
                    <span style={{ fontFamily: DISPLAY, fontSize: T.note, fontWeight: 700, color: '#fff', background: gradOf('brand'), padding: '2px 8px', borderRadius: R.pill }}>
                      {picked.timesMedian}× your usual
                    </span>
                  )}
                </span>
                <span style={{ fontSize: T.label, color: C.ink, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                  {picked.caption || 'No caption'}
                </span>
                <button type="button" onClick={() => setPicked(null)}
                  style={{ marginTop: 5, padding: 0, background: 'none', border: 'none', font: 'inherit', fontFamily: DISPLAY, fontSize: T.note, fontWeight: 600, color: C.greenDk, cursor: 'pointer' }}>
                  Choose a different one
                </button>
              </span>
            </div>

            {/* ── WHO SEES IT ────────────────────────────────────────────
                The thing the first version left out entirely, and the most
                expensive omission possible: with no area, the platform decides,
                and for a single-location restaurant that is people who will
                never walk in. */}
            {rules?.note && (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, padding: '11px 13px', borderRadius: R.box, background: tint('mint', .06), border: `1px solid ${tint('mint', .3)}` }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}><BrandOrMark provider={picked.platform} size={14} /></span>
                <span style={{ fontSize: T.label, color: C.ink, lineHeight: 1.5 }}>{rules.note}</span>
              </div>
            )}

            <Head hue="mint">Who sees it</Head>
            {place ? (
              <button type="button" onClick={() => { setPlace(null); setPlaceQ('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit',
                  padding: '12px 14px', borderRadius: R.box, cursor: 'pointer', background: tint('mint', .07), border: `1px solid ${C.green}` }}>
                <MapPin size={15} color={C.greenDk} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink }}>
                    {rules?.cityRadius ? `Within ${radius} miles of ${place.name}` : place.name}
                  </span>
                  <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 1 }}>
                    {place.where ? `${place.where} · ` : ''}Tap to change
                  </span>
                </span>
              </button>
            ) : (
              <>
                <input className="cmp-in" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)}
                  placeholder="Your town or city"
                  style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: R.box, padding: '11px 12px', fontSize: T.body, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                {places.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {/* WHICH Wallingford. Searching that word returns four of
                        them, two in England, and the list used to show the name
                        alone. Meta's own breadcrumb is the only way to tell. */}
                    {places.filter((g) => g.targetable).slice(0, 6).map((g) => (
                      <button key={g.key} type="button" onClick={() => { setPlace(g); setPlaces([]) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit',
                          padding: '11px 13px', borderRadius: R.cell, cursor: 'pointer', background: '#fff', border: `1px solid ${C.line}` }}>
                        <MapPin size={14} color={C.greenDk} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink }}>{g.name}</span>
                          {g.where && <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 1 }}>{g.where}</span>}
                        </span>
                        <span style={{ fontSize: T.note, color: C.faint }}>{g.type}</span>
                      </button>
                    ))}
                    {/* A NEIGHBOURHOOD CANNOT BE TARGETED, and saying nothing
                        about it is how somebody ends up thinking we ignored what
                        they typed. Meta's search offers them; its targeting has
                        no field for them. */}
                    {places.some((g) => !g.targetable) && places.filter((g) => g.targetable).length === 0 && (
                      <div style={{ fontSize: T.label, color: C.mute, lineHeight: 1.5, padding: '10px 2px' }}>
                        {places[0].name} is a neighbourhood, and ads cannot be aimed at one.
                        Search for the city instead and set a radius.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {place && (
              <>
                {/* THE RADIUS IS META ONLY, and the vendor says so: "radius is
                    only honoured on platforms whose capability map allows city
                    radius (Meta)". Showing this slider on TikTok would promise a
                    ring around the restaurant and quietly deliver the whole
                    city, which is exactly the kind of lie a screen should not
                    tell about somebody's money. */}
                {rules?.cityRadius ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {RADII.map((r) => {
                    const on = radius === r
                    return (
                      <button key={r} type="button" onClick={() => setRadius(r)}
                        style={{ flex: 1, padding: '9px 0', borderRadius: R.cell, cursor: 'pointer', font: 'inherit', fontFamily: DISPLAY,
                          fontSize: T.control, fontWeight: on ? 700 : 500, color: on ? '#fff' : C.ink,
                          background: on ? C.ink : '#fff', border: `1px solid ${on ? 'transparent' : C.line}` }}>
                        {r} mi
                      </button>
                    )
                  })}
                </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: T.label, color: C.mute, lineHeight: 1.5, padding: '0 2px' }}>
                    {rules?.name} targets the whole city rather than a ring around you. There is no
                    radius to set.
                  </div>
                )}

                {/* HOW MANY PEOPLE, BEFORE ANY MONEY. Meta's own estimate, and
                    a plain "no" where the platform has no such API. */}
                {rules?.reachEstimate ? (
                <div style={{ marginTop: 10, padding: '14px 16px', borderRadius: R.box, background: '#fff', border: `1px solid ${C.line}`, boxShadow: CARD_SHADOW }}>
                  {reaching ? (
                    <span style={{ fontSize: T.control, color: C.mute }}>Checking how many people…</span>
                  ) : reach?.untargetable ? (
                    <span style={{ fontSize: T.label, color: C.coral, lineHeight: 1.5 }}>
                      That kind of place cannot be targeted. Pick a city, a postcode or a state.
                    </span>
                  ) : reach?.available && reach.lower && reach.upper ? (
                    <>
                      <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.big, fontWeight: 600, color: C.ink }}>
                        {reach.lower.toLocaleString()} to {reach.upper.toLocaleString()} people
                      </span>
                      <span style={{ display: 'block', fontSize: T.label, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>
                        live there and use Facebook or Instagram. This is the size of the room, not
                        how many will see the post.
                      </span>
                      {/* WHAT THE MONEY BUYS, said plainly and only where it can
                          be stood behind. Meta prices delivery at auction, so a
                          predicted click count on a $70 boost would be a number
                          we made up. What IS true is how the budget compares to
                          the room. */}
                      {reach.upper > 0 && (
                        <span style={{ display: 'block', fontSize: T.label, color: C.mute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}`, lineHeight: 1.5 }}>
                          At ${daily} a day, expect to reach a small share of them. Meta sells this at
                          auction, so nobody can promise a number before it runs, and anyone who does
                          is guessing.
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: T.label, color: C.mute, lineHeight: 1.5 }}>
                      Meta could not size that audience. It usually means the area is very small.
                    </span>
                  )}
                </div>
                ) : (
                  <div style={{ marginTop: 10, padding: '13px 15px', borderRadius: R.box, background: '#fff', border: `1px solid ${C.line}` }}>
                    <span style={{ fontSize: T.label, color: C.mute, lineHeight: 1.5 }}>
                      {rules?.name} cannot say how many people that reaches before you pay. Meta can;
                      TikTok has no such tool, and a made-up number would be worse than none.
                    </span>
                  </div>
                )}
              </>
            )}

            {/* ── HOW MUCH, PER DAY ─────────────────────────────────────────
                Daily rather than a lump sum, because the per-day number is what
                decides whether an ad delivers at all. The old screen offered
                "$20 over 5 days" and never mentioned that this is $4 a day,
                which on Meta reaches almost nobody. */}
            <Head hue="brand" note={`$${minDaily} a day minimum on ${rules?.name ?? 'this'}`}>How much a day</Head>
            <div style={{ display: 'flex', gap: 8 }}>
              {dailyChoices.map((a) => {
                const on = daily === a
                return (
                  <button key={a} type="button" onClick={() => setDaily(a)}
                    style={{ flex: 1, padding: '13px 0', borderRadius: R.box, cursor: 'pointer', font: 'inherit', fontFamily: DISPLAY,
                      fontSize: T.big, fontWeight: on ? 700 : 500, color: on ? '#fff' : C.ink,
                      background: on ? gradOf('brand') : '#fff', border: `1px solid ${on ? 'transparent' : C.line}` }}>
                    ${a}
                  </button>
                )
              })}
            </div>

            <Head hue="amber">For how long</Head>
            <div style={{ display: 'flex', gap: 8 }}>
              {LENGTHS.map((d) => {
                const on = days === d
                return (
                  <button key={d} type="button" onClick={() => setDays(d)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: R.box, cursor: 'pointer', font: 'inherit', fontFamily: DISPLAY,
                      fontSize: T.control, fontWeight: on ? 700 : 500, color: on ? '#fff' : C.ink,
                      background: on ? C.ink : '#fff', border: `1px solid ${on ? 'transparent' : C.line}` }}>
                    {d === 30 ? 'a month' : `${d} days`}
                  </button>
                )
              })}
            </div>

            {/* THE NUMBER, IN A SENTENCE, BEFORE THE PRESS. */}
            <div style={{ marginTop: 20, borderRadius: R.card, background: '#fff', border: `1px solid ${tint('brand', .35)}`, boxShadow: `0 6px 20px ${tint('brand', .13, 1)}`, overflow: 'hidden' }}>
              <div style={{ height: 3, background: gradOf('brand') }} />
              <div style={{ padding: '16px 17px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, color: C.ink, letterSpacing: '-.02em', lineHeight: 1 }}>
                  ${total}
                </span>
                <span style={{ fontSize: T.label, color: C.mute }}>in total</span>
              </div>
              <div style={{ fontSize: T.label, color: C.mute, marginTop: 5, lineHeight: 1.5 }}>
                ${daily} a day for {days} day{days === 1 ? '' : 's'}
                {place ? (rules?.cityRadius ? `, within ${radius} miles of ${place.name}` : `, in ${place.name}`) : ''}.
                That is the most it can spend on ads. It stops on its own, and you can stop it
                sooner here.
              </div>
              {/* TAX IS NOT OURS TO CALCULATE AND NOT OURS TO HIDE. Meta bills
                  the ad account directly and adds sales tax or VAT on top
                  depending on the billing address. Neither we nor Zernio see
                  that number, so the honest thing is to say the total is the ad
                  spend and the card will be charged a little more. */}
              <div style={{ fontSize: T.note, color: C.mute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${tint('brand', .25)}`, lineHeight: 1.5 }}>
                {rules?.name} bills this to your own ad account and may add sales tax on top, so the
                card is charged a little more than ${total}.
              </div>
              {total > limits.maxUsd && (
                <div style={{ fontSize: T.label, color: C.coral, marginTop: 8, fontWeight: 600 }}>
                  Over the ${limits.maxUsd} cap. Shorten it or spend less a day.
                </div>
              )}
              </div>
            </div>

            <MvpActions>
              <MvpButton full busy={busy} disabled={!place || total > limits.maxUsd} label={place ? `Spend $${total}` : 'Pick an area first'}
                onClick={() => void (async () => {
                  const j = await act({
                    action: 'boost', platformPostId: picked.zernioPostId,
                    adPlatform: ad,
                    adAccountId: rules?.payer ?? pickedAccount,
                    amount: total, days,
                    targeting: { geoKey: place?.key, geoType: place?.type, geoName: place?.name, radiusMiles: radius, ageMin, ageMax },
                  })
                  if (j) setDone({ spent: total, days })
                })()} />
              <MvpButton full variant="quiet" label="Not now" onClick={() => setPicked(null)} />
            </MvpActions>
          </>
        )}
      </div>
    </MvpShell>
  )
}
