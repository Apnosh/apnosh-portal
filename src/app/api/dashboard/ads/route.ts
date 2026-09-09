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
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listAdAccounts, connectAds, boostPost, listAds, stopAd, searchGeo, reachEstimate,
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
function buildSpec(t: { geoKey?: string; geoType?: string; radiusMiles?: number; ageMin?: number; ageMax?: number; country?: string }): Record<string, unknown> {
  const spec: Record<string, unknown> = {}
  const radius = Math.max(1, Math.min(50, Number(t.radiusMiles) || 10))
  if (t.geoKey && (t.geoType === 'city' || !t.geoType)) {
    spec.cities = [{ key: t.geoKey, radius, distanceUnit: 'mile' }]
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

/** Boosting is Meta only for now: Facebook and Instagram is where this audience is. */
const BOOSTABLE = new Set(['facebook', 'instagram'])

/** A post has to have done something before it is worth money. */
const MIN_INTERACTIONS = 1

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
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
    const meta = targets.find((t) => t.platform === 'facebook') ?? targets.find((t) => t.platform === 'instagram')
    if (!meta) {
      return NextResponse.json({ connected: false, reason: 'no_meta_account', accounts: [], ads: [], candidates: [] })
    }

    const [accounts, ads] = await Promise.all([
      listAdAccounts(clientId, meta.accountId).catch(() => []),
      listAds(clientId, meta.accountId).catch(() => []),
    ])

    /* WHICH ACCOUNT PAYS IS A CHOICE, NOT A DEFAULT.
       The first version treated "we can see ad accounts" as "connected", which
       skipped the picker entirely. Reading Apnosh's own connection back, the
       Facebook login can see THREE ad accounts, one of them personal and in
       someone's own name. Defaulting to whichever we happened to see first, on
       the one screen that spends money, is exactly the wrong instinct. So the
       choice is stored, and until it is there is nothing to boost with. */
    const adminRead = createAdminClient()
    const { data: conn } = await adminRead.from('channel_connections')
      .select('metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
    const chosenAdAccount = (conn?.metadata as Record<string, unknown> | null)?.ad_account_id
    const payer = typeof chosenAdAccount === 'string' && accounts.some((a) => a.id === chosenAdAccount)
      ? chosenAdAccount
      : null

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
          platformPostId: String(p.external_id),
          platform: String(p.platform),
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
      /* Connected means "an ad account has been chosen to pay", not "an ad
         account is visible". */
      connected: payer !== null,
      payer,
      metaAccountId: meta.accountId,
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
    const meta = targets.find((t) => t.platform === 'facebook') ?? targets.find((t) => t.platform === 'instagram')
    if (!meta) return NextResponse.json({ error: 'No Facebook or Instagram account is connected' }, { status: 400 })

    if (body.action === 'connect') {
      /* Scoped on purpose. Without adAccountIds this connection can reach every
         ad account the login can see, which for anyone who has ever managed
         another business is more than they meant to hand over. */
      const ids = (body.adAccountIds ?? []).map(String).filter((x) => /^[A-Za-z0-9_]{3,64}$/.test(x))
      if (!ids.length) return NextResponse.json({ error: 'Pick which ad account to use' }, { status: 400 })
      /* Reachable is not the same as chosen, and only one of them is a
         decision. Verify it is really theirs, then remember it. */
      const reachable = await listAdAccounts(clientId, meta.accountId)
      if (!reachable.some((a) => a.id === ids[0])) {
        return NextResponse.json({ error: 'That ad account is not on this connection' }, { status: 400 })
      }
      const r = await connectAds(clientId, meta.platform, { accountId: meta.accountId, adAccountIds: ids, returnTo: body.returnTo })
      const adminW = createAdminClient()
      const { data: row } = await adminW.from('channel_connections')
        .select('id, metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
      if (row?.id) {
        await adminW.from('channel_connections')
          .update({ metadata: { ...(row.metadata as Record<string, unknown> ?? {}), ad_account_id: ids[0], ad_account_chosen_at: new Date().toISOString() } })
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
      const payer = (connRow?.metadata as Record<string, unknown> | null)?.ad_account_id
      if (typeof payer !== 'string') return NextResponse.json({ available: false })
      const r = await reachEstimate(clientId, {
        accountId: meta.accountId, adAccountId: payer, spec: buildSpec(body.targeting ?? {}),
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
      if (amount / days < MIN_DAILY_USD) {
        return NextResponse.json({ error: `That works out under $${MIN_DAILY_USD} a day, which is too thin to deliver. Spend more or run it for fewer days.` }, { status: 400 })
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

      /* AND IT PAYS FROM THE ACCOUNT THEY CHOSE, not one the browser names.
         The request body is what an attacker controls, and "which account pays"
         is the field where that matters most. */
      const { data: connRow } = await admin.from('channel_connections')
        .select('metadata').eq('client_id', clientId).eq('channel', 'zernio').maybeSingle()
      const payer = (connRow?.metadata as Record<string, unknown> | null)?.ad_account_id
      if (typeof payer !== 'string' || !payer) {
        return NextResponse.json({ error: 'Choose which ad account pays before boosting' }, { status: 400 })
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
        platformPostId: body.platformPostId,
        accountId: meta.accountId,
        adAccountId: payer,
        amount, days,
        targeting: buildSpec(body.targeting),
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
