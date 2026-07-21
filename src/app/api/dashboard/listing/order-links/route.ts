/**
 * /api/dashboard/listing/order-links — the honest read of the Order and Reserve
 * buttons, plus a PROPOSED link for each one found on the client's own website.
 *
 * This is what the post-ship "needs you" step reads, so the owner sees their real
 * situation and a pre-filled answer instead of a blank field.
 *
 * Two sources, both live, neither self-reported:
 *   the Google listing  — what the buttons do today (mybusinessplaceactions)
 *   the client website  — where their own ordering actually lives
 *
 * The business record is deliberately NOT consulted. It has no column for an ordering
 * url, and the fields it does have were contradicted by the live listing on the first
 * client checked (delivery_platforms said "none" against six DoorDash links). A
 * proposal here is always traceable to a link that exists on a page we fetched.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { listPlaceActionLinks } from '@/lib/gbp-place-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  diagnoseOrderLinks, findOrderingLinks, proposeFor, whatWeNeed,
  OWNABLE_TYPES, type FoundLink,
} from '@/lib/campaigns/order-links'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** The client's own site, fetched once. Best-effort: a dead or slow site just means
 *  no proposals, never a failed request — the diagnosis half still stands alone. */
async function crawlSite(url: string): Promise<{ links: FoundLink[]; error: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApnoshBot/1.0; +https://apnosh.com)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { links: [], error: `Your site returned ${res.status}.` }
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return { links: [], error: 'That address did not return a web page.' }
    // Cap the body: a huge page should not stall the request, and ordering links live
    // in the nav, which is near the top.
    const html = (await res.text()).slice(0, 600_000)
    return { links: findOrderingLinks(html, res.url), error: null }
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'Your site took too long to answer.' : 'We could not reach your site.'
    return { links: [], error: msg }
  }
}

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const listing = await listPlaceActionLinks(clientId)
  if (!listing.ok) return NextResponse.json({ error: listing.error }, { status: 502 })
  const read = diagnoseOrderLinks(listing.links)

  // The website is the only place a real ordering url has ever been found.
  let siteUrl: string | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('businesses').select('website_url').eq('client_id', clientId).maybeSingle()
    const raw = (data as { website_url?: string | null } | null)?.website_url ?? null
    if (raw) siteUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  } catch { /* no site on file → no proposals, which is an honest outcome */ }

  const crawl = siteUrl ? await crawlSite(siteUrl) : { links: [] as FoundLink[], error: null }

  // One proposal per button we could actually set. Absent when we found nothing:
  // a blank field with an honest reason beats a guessed url.
  const proposals = OWNABLE_TYPES.map((t) => {
    const p = proposeFor(t.type, crawl.links)
    return { type: t.type, label: t.label, proposed: p?.url ?? null, provider: p?.provider ?? null, because: p?.because ?? null }
  })

  // Whether they have ordering of their own is a question only the owner can settle,
  // so this reports the evidence and lets the caller ask. A storefront link found on
  // their site is strong evidence; nothing found is not proof of absence, which is a
  // mistake made earlier in this feature's life and worth not repeating.
  const foundOwnOrdering = crawl.links.some((l) => l.kind === 'storefront')
  const foundOwnBooking = crawl.links.some((l) => l.kind === 'booking')

  return NextResponse.json({
    headline: read.headline,
    ours: read.ours,
    locked: read.locked,
    emptySlots: read.emptySlots,
    needsOwnerCheck: read.needsOwnerCheck,
    fixableCount: read.fixableCount,
    proposals,
    site: { url: siteUrl, error: crawl.error, foundOwnOrdering, foundOwnBooking },
    // Optimistic read: if we found a storefront link, treat them as having ordering.
    // The intake still shows the field so the owner can correct us.
    needs: whatWeNeed(read, foundOwnOrdering),
  })
}
