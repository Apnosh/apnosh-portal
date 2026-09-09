/**
 * BOOST A POST THAT ALREADY WORKED.
 * =================================
 * GET  ?clientId=…                    → connection state, ad accounts, what is running,
 *                                       and the posts worth putting money behind
 * POST { action: 'connect' }          → turn ads on, scoped to chosen ad accounts
 * POST { action: 'boost', … }         → SPENDS MONEY
 * POST { action: 'stop', adId }       → pause a running boost
 *
 * WHY BOOST AND NOTHING ELSE. Zernio exposes about 110 ads endpoints: campaigns,
 * ad sets, audiences, keyword planning, bid strategies, lift studies. All real,
 * and all aimed at somebody whose job is running ads. A restaurant owner has
 * never once wanted a portfolio bid strategy. What they can answer is "this
 * photo did four times your usual, want more people to see it?" -- and we are
 * one of the few places that can ask it, because we already hold the organic
 * numbers that make the claim true.
 *
 * THE MONEY RULES ARE HERE AS WELL AS IN THE ADAPTER. Not duplication for its
 * own sake: the adapter protects any caller, and this protects against a request
 * body, which is the thing an attacker controls. A cap that lives only in the UI
 * is not a cap.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { AD_RULES, adPlatformFor, CONNECT_SLUG, type AdPlatform } from '@/lib/channels/ad-rules'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listAdAccounts, connectAds, boostPost, listAds, stopAd, searchGeo, reachEstimate, adPreviews,
  listPostTargets, MAX_BOOST_USD, MAX_BOOST_DAYS, MIN_DAILY_USD,
} from '@/lib/channels/adapters/zernio'

/**
 * WHO SEES IT, built from what the owner picked.
 *
 * A radius around a place, an age range, and nothing else. Interests and
 * behaviours are where ad accounts go to die: a restaurant owner picking
 * "foodies" narrows their audience to people Meta has labelled, not to people
 * who will walk in, and the result is a higher price for a smaller room.
 * Distance from the door is the targeting that matters for a restaurant.
 */
function buildSpec(t: { geoKey?: string; geoType?: string; radiusMiles?: number; ageMin?: number; ageMax?: number; country?: string }, ad: AdPlatform = 'meta'): Record<string, unknown> {
  const spec: Record<string, unknown> = {}
  const radius = Math.max(1, Math.min(50, Number(t.radiusMiles) || 10))
  if (t.geoKey && (t.geoType === 'city' || !t.geoType)) {
    /* The radius is dropped where the platform ignores it, rather than sent and
       silently discarded. A field the vendor throws away is a field the screen
       must not have promised. */
    spec.cities = AD_RULES[ad].cityRadius
      ? [{ key: t.geoKey, radius, distanceUnit: 'mile' }]
      : [{ key: t.geoKey }]
  } else if (t.geoKey && t.geoType === 'region') {
    spec.regions = [{ key: t.geoKey }]
  } else if (t.geoKey && t.geoType === 'zip') {
    spec.zips = [{ key: t.geoKey }]
  } else if (t.geoKey && t.geoType === 'metro') {
    spec.metros = [{ key: t.geoKey }]
  } else {
    spec.countries = [t.country || 'US']
  }
  const lo = Math.max(18, Math.min(65, Number(t.ageMin) || 18))
  const hi = Math.max(lo, Math.min(65, Number(t.ageMax) || 65))
  spec.ageMin = lo
  spec.ageMax = hi
  return spec
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/* A boost can take minutes: Zernio re-hosts an Instagram video through Meta
   before the ad exists. The default function timeout would cut the request off
   mid-flight and report a failure for an ad that was still being created. */
export const maxDuration = 120

/** Every posting platform we can put money behind. */
const BOOSTABLE = new Set(Object.values(AD_RULES).flatMap((r) => r.posts))

/**
 * The account that posts on this ad platform, which is also the account its ad
 * calls are made through. TikTok needs its own; Meta rides on Facebook.
 */
function posterFor(targets: Array<{ platform: string; accountId: string }>, ad: AdPlatform) {
  const want = AD_RULES[ad].posts
  for (const p of want) {
    const t = targets.find((x) => x.platform === p)
    if (t) return t
  }
  return null
}

/** Where each platform's chosen payer lives on the connection. */
function payerOf(metadata: unknown, ad: AdPlatform): string | null {
  const m = (metadata ?? {}) as Record<string, unknown>
  const perPlatform = (m.ad_accounts ?? {}) as Record<string, unknown>
  const v = perPlatform[ad]
  if (typeof v === 'string' && v) return v
  /* The first version stored one id under ad_account_id, before there was more
     than one platform to store. Still honoured, as Meta's. */
  if (ad === 'meta' && typeof m.ad_account_id === 'string' && m.ad_account_id) return m.ad_account_id
  return null
}

/** A post has to have done something before it is worth money. */
const MIN_INTERACTIONS = 1

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  /* ?preview=<adId> — Meta's own rendering of a running ad, per placement.
     Meta only: /generatepreviews has no TikTok equivalent. */
  const previewAd = req.nextUrl.searchParams.get('preview')
  if (previewAd) {
    const targets = await listPostTargets(clientId)
    const meta = targets.find((t) => t.platform === 'facebook') ?? targets.find((t) => t.platform === 'instagram')
    if (!meta) return NextResponse.json({ previews: [] })
    /* Theirs, verified, before we render anything. */
    const mine = await listAds(clientId, meta.accountId)
    if (!mine.some((a) => a.id === previewAd)) return NextResponse.json({ previews: [] })
    return NextResponse.json({ previews: await adPreviews(clientId, previewAd) })
  }

  /* ?places=seattle — resolve a typed place to the platform's own id, which is
     the only thing targeting accepts. Read-only and cheap. */
  const places = req.nextUrl.searchParams.get('places')
  if (places !== null) {
    const targets = await listPostTargets(clientId)
    const meta = targets.find((t) => t.platform === 'facebook') ?? targets.find((t) => t.platform === 'instagram')
    if (!meta) return NextResponse.json({ places: [] })
    return NextResponse.json({ places: await searchGeo(clientId, meta.accountId, places) })
  }

  try {
    const targets = await listPostTargets(clientId)
    const adminRead0 = createAdminClient()
    const { data: conn0 } = await adminRead0.from('channel_connections')
      .select('metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()

    /* ONE ENTRY PER AD PLATFORM. Meta and TikTok differ in ways that change what
       the screen may honestly offer -- TikTok's floor is twenty times Meta's, it
       ignores a city radius, and it cannot size an audience before you pay -- so
       each reports its own state rather than sharing one. */
    const platforms = await Promise.all((Object.keys(AD_RULES) as AdPlatform[]).map(async (ad) => {
      const poster = posterFor(targets, ad)
      const rules = AD_RULES[ad]
      if (!poster) return { platform: ad, ...rules, available: false, accounts: [], ads: [], payer: null }
      const [accounts, ads] = await Promise.all([
        listAdAccounts(clientId, poster.accountId).catch(() => []),
        listAds(clientId, poster.accountId).catch(() => []),
      ])
      const stored = payerOf(conn0?.metadata, ad)
      return {
        platform: ad, ...rules, available: true, accounts, ads,
        payer: stored && accounts.some((a) => a.id === stored) ? stored : null,
      }
    }))

    const meta = posterFor(targets, 'meta')
    if (!meta && !posterFor(targets, 'tiktok')) {
      return NextResponse.json({ connected: false, reason: 'no_account', platforms, accounts: [], ads: [], candidates: [] })
    }
    const accounts = platforms.find((p) => p.platform === 'meta')?.accounts ?? []
    const ads = platforms.flatMap((p) => p.ads)

    /* WHICH ACCOUNT PAYS IS A CHOICE, NOT A DEFAULT.
       The first version treated "we can see ad accounts" as "connected", which
       skipped the picker entirely. Reading Apnosh's own connection back, the
       Facebook login can see THREE ad accounts, one of them personal and in
       someone's own name. Defaulting to whichever we happened to see first, on
       the one screen that spends money, is exactly the wrong instinct. So the
       choice is stored, and until it is there is nothing to boost with. */
    const payer = platforms.find((p) => p.platform === 'meta')?.payer ?? null

    /* THE CANDIDATES ARE THE WHOLE PITCH. Ranked against this client's OWN
       median, not an industry number, because "four times your usual" is a
       claim we can actually stand behind and "above average engagement" is not.
       Read from social_posts, which the nightly sync fills whether or not the
       post came from us -- so a photo the owner put up themselves is boostable. */
    const admin = createAdminClient()
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const { data: posts } = await admin.from('social_posts')
      .select('external_id, platform, caption, media_url, thumbnail_url, permalink, posted_at, total_interactions, reach, likes, comments')
      .eq('client_id', clientId)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(60)

    const usable = (posts ?? []).filter((p) => BOOSTABLE.has(String(p.platform)) && p.external_id)
    const scores = usable.map((p) => Number(p.total_interactions ?? 0)).filter((n) => n > 0).sort((a, b) => a - b)
    const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0

    const candidates = usable
      .filter((p) => Number(p.total_interactions ?? 0) >= MIN_INTERACTIONS)
      .map((p) => {
        const n = Number(p.total_interactions ?? 0)
        return {
            /* Named external_id in the table, but it holds ZERNIO's post id. */
          zernioPostId: String(p.external_id),
          platform: String(p.platform),
          adPlatform: adPlatformFor(String(p.platform)),
          caption: String(p.caption ?? '').slice(0, 160),
          image: p.thumbnail_url ?? p.media_url ?? null,
          permalink: p.permalink ?? null,
          postedAt: p.posted_at,
          interactions: n,
          reach: Number(p.reach ?? 0),
          /* How many times this beat their own middle post. Null when we have
             too little history to say, rather than a made-up 1.0x. */
          timesMedian: median > 0 && scores.length >= 5 ? Math.round((n / median) * 10) / 10 : null,
        }
      })
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 12)

    return NextResponse.json({
      /* Connected means "at least one ad platform has an account chosen to
         pay", not "an ad account is visible". */
      connected: platforms.some((p) => p.payer !== null),
      platforms,
      payer,
      metaAccountId: meta?.accountId ?? null,
      accounts, ads, candidates,
      limits: { maxUsd: MAX_BOOST_USD, maxDays: MAX_BOOST_DAYS, minDaily: MIN_DAILY_USD },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load ads' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string; action?: string
    adAccountIds?: string[]; returnTo?: string
    platformPostId?: string; adAccountId?: string; amount?: number; days?: number; name?: string
    targeting?: { geoKey?: string; geoType?: string; geoName?: string; radiusMiles?: number; ageMin?: number; ageMax?: number; country?: string }
    adPlatform?: string
    adId?: string
  }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  try {
    const targets = await listPostTargets(clientId)
    const ad: AdPlatform = body.adPlatform === 'tiktok' ? 'tiktok' : 'meta'
    const rules = AD_RULES[ad]
    const meta = posterFor(targets, ad)
    if (!meta) {
      return NextResponse.json({ error: `No ${rules.name} account is connected` }, { status: 400 })
    }

    if (body.action === 'connect') {
      /* Scoped on purpose. Without adAccountIds this connection can reach every
         ad account the login can see, which for anyone who has ever managed
         another business is more than they meant to hand over. */
      const ids = (body.adAccountIds ?? []).map(String).filter((x) => /^[A-Za-z0-9_]{3,64}$/.test(x))
      const reachable = await listAdAccounts(clientId, meta.accountId).catch(() => [])

      /* TIKTOK'S FIRST CALL HAS NOTHING TO NAME YET. It is a separate-token
         platform, so until its own OAuth is done there are no advertiser
         accounts to choose between. That first call exists to get the login
         URL; the choice happens on the way back. */
      if (!ids.length || ids[0] === 'pending') {
        if (!rules.ownLogin && reachable.length) {
          return NextResponse.json({ error: 'Pick which ad account to use' }, { status: 400 })
        }
        const started = await connectAds(clientId, CONNECT_SLUG[ad], { accountId: meta.accountId, returnTo: body.returnTo })
        return NextResponse.json({ ok: true, ...started })
      }

      /* Reachable is not the same as chosen, and only one of them is a
         decision. Verify it is really theirs, then remember it. */
      if (!reachable.some((a) => a.id === ids[0])) {
        return NextResponse.json({ error: 'That ad account is not on this connection' }, { status: 400 })
      }
      const r = await connectAds(clientId, CONNECT_SLUG[ad], { accountId: meta.accountId, adAccountIds: ids, returnTo: body.returnTo })
      const adminW = createAdminClient()
      const { data: row } = await adminW.from('channel_connections')
        .select('id, metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
      if (row?.id) {
        const m = (row.metadata as Record<string, unknown>) ?? {}
        const existing = (m.ad_accounts ?? {}) as Record<string, unknown>
        await adminW.from('channel_connections')
          .update({ metadata: { ...m, ad_accounts: { ...existing, [ad]: ids[0] }, ad_account_chosen_at: new Date().toISOString() } })
          .eq('id', row.id)
      }
      return NextResponse.json({ ok: true, ...r })
    }

    /* ── HOW MANY PEOPLE, BEFORE ANY MONEY ─────────────────────────────
       Meta answers this from its own delivery_estimate. Read-only: no ad, no
       campaign, no spend. */
    if (body.action === 'estimate') {
      const { data: connRow } = await createAdminClient().from('channel_connections')
        .select('metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
      const payer = payerOf(connRow?.metadata, ad)
      if (!payer) return NextResponse.json({ available: false })
      /* TikTok has no pre-flight reach API at all, so this says so rather than
         asking and reporting an empty answer as if it were a small audience. */
      if (!rules.reachEstimate) return NextResponse.json({ available: false })
      const r = await reachEstimate(clientId, {
        accountId: meta.accountId, adAccountId: payer, spec: buildSpec(body.targeting ?? {}, ad),
      })
      return NextResponse.json(r)
    }

    if (body.action === 'stop') {
      if (!body.adId) return NextResponse.json({ error: 'adId required' }, { status: 400 })
      /* Verified against this client's own list first, so an id from elsewhere
         cannot be used to pause a stranger's ad. */
      const mine = await listAds(clientId, meta.accountId)
      if (!mine.some((a) => a.id === body.adId)) {
        return NextResponse.json({ error: 'That is not one of your boosts' }, { status: 404 })
      }
      await stopAd(clientId, body.adId)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'boost') {
      const amount = Number(body.amount)
      const days = Number(body.days)
      if (!Number.isFinite(amount) || amount < 1 || amount > MAX_BOOST_USD) {
        return NextResponse.json({ error: `A boost has to be between $1 and $${MAX_BOOST_USD}` }, { status: 400 })
      }
      /* Meta will accept a budget it cannot actually deliver on. Below a dollar
         a day it simply does not show the ad, which looks like the money
         vanished. */
      /* Per platform, not one number. TikTok will not deliver under $20 a day
         and Meta will run on one, so a single floor would either block real
         Meta boosts or wave through TikTok ones that never show. */
      if (amount / days < rules.minDaily) {
        return NextResponse.json({ error: `${rules.name} needs at least $${rules.minDaily} a day. That works out at $${(amount / days).toFixed(2)}.` }, { status: 400 })
      }
      if (!Number.isFinite(days) || days < 1 || days > MAX_BOOST_DAYS) {
        return NextResponse.json({ error: `A boost runs between 1 and ${MAX_BOOST_DAYS} days` }, { status: 400 })
      }
      if (!body.platformPostId || !body.adAccountId) {
        return NextResponse.json({ error: 'Pick a post and an ad account' }, { status: 400 })
      }
      /* The post has to be one of theirs. The browser sends an id; without this
         it could send anybody's. */
      const admin = createAdminClient()
      const { data: owned } = await admin.from('social_posts')
        .select('external_id, caption, platform')
        .eq('client_id', clientId).eq('external_id', body.platformPostId).maybeSingle()
      if (!owned) return NextResponse.json({ error: 'That post is not one of yours' }, { status: 404 })
      if (adPlatformFor(String(owned.platform)) !== ad) {
        return NextResponse.json({ error: `That post is not on ${rules.name}` }, { status: 400 })
      }

      /* AND IT PAYS FROM THE ACCOUNT THEY CHOSE, not one the browser names.
         The request body is what an attacker controls, and "which account pays"
         is the field where that matters most. */
      const { data: connRow } = await admin.from('channel_connections')
        .select('metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
      const payer = payerOf(connRow?.metadata, ad)
      if (!payer) {
        return NextResponse.json({ error: `Choose which ${rules.name} ad account pays before boosting` }, { status: 400 })
      }
      if (body.adAccountId !== payer) {
        return NextResponse.json({ error: 'That is not the ad account set up to pay' }, { status: 400 })
      }
      const accounts = await listAdAccounts(clientId, meta.accountId)
      if (!accounts.some((a) => a.id === payer)) {
        return NextResponse.json({ error: 'That ad account is no longer reachable' }, { status: 400 })
      }

      /* A BOOST WITHOUT A PLACE IS MONEY BURNED. The first version sent no
         targeting at all, which leaves the platform to decide, and for a
         single-location restaurant that is people who will never walk in.
         Refused rather than defaulted, because a silent default here is the
         expensive kind. */
      if (!body.targeting?.geoKey && !body.targeting?.country) {
        return NextResponse.json({ error: 'Choose the area this should reach first' }, { status: 400 })
      }

      const r = await boostPost(clientId, {
        zernioPostId: body.platformPostId,
        accountId: meta.accountId,
        adAccountId: payer,
        amount, days,
        targeting: buildSpec(body.targeting, ad),
        name: (body.name || `Apnosh boost · ${new Date().toISOString().slice(0, 10)}`).slice(0, 120),
      })

      /* Recorded before we answer, because this one spent money and a spend with
         no local trace is exactly the hole the composer was in. */
      await admin.from('content_drafts').insert({
        client_id: clientId,
        status: 'published',
        idea: `Boosted a post for $${amount} over ${days} day${days === 1 ? '' : 's'}`,
        caption: String(owned.caption ?? '').slice(0, 500) || null,
        target_platforms: [String(owned.platform)],
        media_urls: [],
        proposed_by: access.userId ?? null,
        proposed_via: 'owner_composer',
        published_post_id: r.id,
        published_at: new Date().toISOString(),
        outcome_summary: `boost:${amount}usd:${days}d:${r.id ?? 'no-id'}`,
      }).then(({ error }) => { if (error) console.error('[ads] could not record the boost:', error.message) })

      return NextResponse.json({ ok: true, ...r, spent: amount, days })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not do that' }, { status: 502 })
  }
}
