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
import { Check, TrendingUp, Square, MapPin } from 'lucide-react'
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
interface GeoOption { key: string; name: string; type: string; region?: string; country?: string }
interface Reach { available: boolean; lower: number | null; upper: number | null; daily: number | null }
interface Candidate {
  platformPostId: string; platform: string; caption: string
  image: string | null; permalink: string | null; postedAt: string
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
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [ads, setAds] = useState<RunningAd[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
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

  const totalRunning = useMemo(() => ads.filter((a) => a.status?.toUpperCase() === 'ACTIVE').length, [ads])
  const total = daily * days

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
    if (!picked || !place) { setReach(null); return }
    let live = true
    setReaching(true)
    const id = setTimeout(() => {
      void fetch('/api/dashboard/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, action: 'estimate', targeting: { geoKey: place.key, geoType: place.type, radiusMiles: radius, ageMin, ageMax } }),
      }).then((r) => r.json()).then((j) => { if (live) setReach(j as Reach) })
        .catch(() => { if (live) setReach(null) })
        .finally(() => { if (live) setReaching(false) })
    }, 260)
    return () => { live = false; clearTimeout(id) }
  }, [clientId, picked, place, radius, ageMin, ageMax])

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
        {!loading && !connected && (
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

            {accounts.length === 0 ? (
              <div style={{ marginTop: 16 }}>
                <MvpEmpty text="No ad account was found on your Facebook connection. You need a Facebook Page with an ad account attached." />
              </div>
            ) : (
              <>
                <Head hue="brand">Which ad account pays</Head>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {accounts.map((a) => {
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
                  <MvpButton full busy={busy} disabled={!pickedAccount} label="Turn on ads"
                    onClick={() => void (async () => {
                      const j = await act({ action: 'connect', adAccountIds: [pickedAccount], returnTo: '/dashboard/boost' })
                      if (!j) return
                      if (typeof j.authUrl === 'string' && j.authUrl) window.location.href = j.authUrl
                      else void load()
                    })()} />
                </MvpActions>
              </>
            )}
          </>
        )}

        {/* ── PICK A POST ───────────────────────────────────────────────────── */}
        {!loading && connected && !picked && (
          <>
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
              </>
            )}

            <Head hue="brand">Your posts, best first</Head>
            {candidates.length === 0 ? (
              <MvpEmpty text="Nothing to boost yet. Once a few posts have some likes and comments on them, the strongest will show up here." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {candidates.map((p) => {
                  const c = brandTone(p.platform)?.solid ?? C.green
                  return (
                    <button key={p.platformPostId} type="button" onClick={() => setPicked(p)}
                      style={{ display: 'flex', alignItems: 'stretch', gap: 0, width: '100%', textAlign: 'left', font: 'inherit', padding: 0,
                        borderRadius: R.box, overflow: 'hidden', cursor: 'pointer', background: '#fff', border: `1px solid ${C.line}` }}>
                      {p.image
                        ? <img src={p.image} alt="" style={{ width: 76, height: 76, objectFit: 'cover', flexShrink: 0, background: '#eee' }} />
                        : <span style={{ width: 76, height: 76, flexShrink: 0, background: `linear-gradient(160deg, ${tint('mint', .12)}, ${tint('brand', .12)})` }} />}
                      <span style={{ flex: 1, minWidth: 0, padding: '11px 13px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <BrandOrMark provider={p.platform} size={13} />
                          {p.timesMedian && p.timesMedian >= 1.5 && (
                            <span style={{ fontFamily: DISPLAY, fontSize: T.note, fontWeight: 700, color: '#fff', background: gradOf('brand'), padding: '2px 8px', borderRadius: R.pill }}>
                              {p.timesMedian}× your usual
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: T.label, color: C.ink, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                          {p.caption || 'No caption'}
                        </span>
                        <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 4 }}>
                          {p.interactions.toLocaleString()} likes and comments{p.reach ? ` · ${p.reach.toLocaleString()} reached` : ''}
                        </span>
                      </span>
                      <span style={{ width: 3, background: alpha(c, .5), flexShrink: 0 }} />
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', borderRadius: R.box, border: `1px solid ${C.line}`, overflow: 'hidden', marginTop: 8 }}>
              {picked.image && <img src={picked.image} alt="" style={{ width: 64, height: 64, objectFit: 'cover', flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0, padding: '10px 12px 10px 0' }}>
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
            <Head hue="mint">Who sees it</Head>
            {place ? (
              <button type="button" onClick={() => { setPlace(null); setPlaceQ('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit',
                  padding: '12px 14px', borderRadius: R.box, cursor: 'pointer', background: tint('mint', .07), border: `1px solid ${C.green}` }}>
                <MapPin size={15} color={C.greenDk} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.control, fontWeight: 600, color: C.ink }}>
                    Within {radius} miles of {place.name}
                  </span>
                  <span style={{ display: 'block', fontSize: T.note, color: C.mute, marginTop: 1 }}>
                    {place.region ? `${place.region} · ` : ''}Tap to change
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
                    {places.slice(0, 6).map((g) => (
                      <button key={g.key} type="button" onClick={() => { setPlace(g); setPlaces([]) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', font: 'inherit',
                          padding: '10px 12px', borderRadius: R.cell, cursor: 'pointer', background: '#fff', border: `1px solid ${C.line}` }}>
                        <MapPin size={13} color={C.mute} />
                        <span style={{ fontSize: T.control, color: C.ink }}>{g.name}</span>
                        {g.region && <span style={{ fontSize: T.note, color: C.mute }}>{g.region}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {place && (
              <>
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

                {/* HOW MANY PEOPLE, BEFORE ANY MONEY. Meta's own estimate. */}
                <div style={{ marginTop: 10, padding: '13px 15px', borderRadius: R.box, background: '#fff', border: `1px solid ${C.line}` }}>
                  {reaching ? (
                    <span style={{ fontSize: T.control, color: C.mute }}>Checking how many people…</span>
                  ) : reach?.available && reach.lower && reach.upper ? (
                    <>
                      <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: T.big, fontWeight: 600, color: C.ink }}>
                        {reach.lower.toLocaleString()} to {reach.upper.toLocaleString()} people
                      </span>
                      <span style={{ display: 'block', fontSize: T.label, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>
                        are reachable there. Meta&apos;s own estimate of the room, not a promise about
                        how many will see it.
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: T.label, color: C.mute, lineHeight: 1.5 }}>
                      Meta could not size that audience. It usually means the area is very small.
                    </span>
                  )}
                </div>
              </>
            )}

            {/* ── HOW MUCH, PER DAY ─────────────────────────────────────────
                Daily rather than a lump sum, because the per-day number is what
                decides whether an ad delivers at all. The old screen offered
                "$20 over 5 days" and never mentioned that this is $4 a day,
                which on Meta reaches almost nobody. */}
            <Head hue="brand" note={`$${limits.minDaily} a day minimum`}>How much a day</Head>
            <div style={{ display: 'flex', gap: 8 }}>
              {DAILY.map((a) => {
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
            <div style={{ marginTop: 20, padding: '15px 16px', borderRadius: R.box, background: tint('brand', .06), border: `1px solid ${tint('brand', .3)}` }}>
              <div style={{ fontFamily: DISPLAY, fontSize: T.hero, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>
                ${total}
              </div>
              <div style={{ fontSize: T.label, color: C.mute, marginTop: 5, lineHeight: 1.5 }}>
                ${daily} a day for {days} day{days === 1 ? '' : 's'}{place ? `, within ${radius} miles of ${place.name}` : ''}.
                That is the most it can spend. It stops on its own, and you can stop it sooner here.
              </div>
              {total > limits.maxUsd && (
                <div style={{ fontSize: T.label, color: C.coral, marginTop: 8, fontWeight: 600 }}>
                  Over the ${limits.maxUsd} cap. Shorten it or spend less a day.
                </div>
              )}
            </div>

            <MvpActions>
              <MvpButton full busy={busy} disabled={!place || total > limits.maxUsd} label={place ? `Spend $${total}` : 'Pick an area first'}
                onClick={() => void (async () => {
                  const j = await act({
                    action: 'boost', platformPostId: picked.platformPostId,
                    adAccountId: pickedAccount,
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
