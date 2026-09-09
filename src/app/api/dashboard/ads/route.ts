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
  listAdAccounts, connectAds, boostPost, listAds, stopAd,
  listPostTargets, MAX_BOOST_USD, MAX_BOOST_DAYS,
} from '@/lib/channels/adapters/zernio'

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
      connected: accounts.length > 0,
      metaAccountId: meta.accountId,
      accounts, ads, candidates,
      limits: { maxUsd: MAX_BOOST_USD, maxDays: MAX_BOOST_DAYS },
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
      const r = await connectAds(clientId, meta.platform, { accountId: meta.accountId, adAccountIds: ids, returnTo: body.returnTo })
      return NextResponse.json({ ok: true, ...r })
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

      /* And the ad account has to be one this connection can actually reach. */
      const accounts = await listAdAccounts(clientId, meta.accountId)
      if (!accounts.some((a) => a.id === body.adAccountId)) {
        return NextResponse.json({ error: 'That ad account is not connected' }, { status: 400 })
      }

      const r = await boostPost(clientId, {
        platformPostId: body.platformPostId,
        accountId: meta.accountId,
        adAccountId: body.adAccountId,
        amount, days,
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
