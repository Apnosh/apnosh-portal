/**
 * POST /api/dashboard/listing/order-links/advice — the AI lane's real contribution.
 *
 * The screen already says what the buttons do. When the answer is "you have no ordering
 * page", the owner's next question is one they cannot answer alone: what are my options?
 * This turns the live read into 2 to 4 grounded paths and names the first step.
 *
 * Pro-gated at the SERVER before any model call, so the gate protects the spend too.
 * A failure returns advice: null rather than an error, because the deterministic screen
 * underneath still works and is still honest without this.
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { listPlaceActionLinks } from '@/lib/gbp-place-actions'
import { diagnoseOrderLinks } from '@/lib/campaigns/order-links'
import { crawlSiteForOrdering, siteUrlOf } from '@/lib/campaigns/order-site-crawl'
import { buildAdvicePayload, renderAdvicePrompt, parseAdvice, ADVICE_SYSTEM, ORDER_ADVICE_MODEL } from '@/lib/campaigns/order-advice'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  // Pro gate before the model call, never after.
  let tier: string | null = null
  let businessName = 'Your restaurant'
  let websiteUrl: string | null = null
  try {
    const admin = createAdminClient()
    const [{ data: c }, { data: b }] = await Promise.all([
      admin.from('clients').select('tier, name').eq('id', clientId).maybeSingle(),
      admin.from('businesses').select('website_url').eq('client_id', clientId).maybeSingle(),
    ])
    tier = (c as { tier?: string | null } | null)?.tier ?? null
    businessName = (c as { name?: string | null } | null)?.name || businessName
    websiteUrl = siteUrlOf((b as { website_url?: string | null } | null)?.website_url)
  } catch {
    // Fail closed on the tier read: locked beats giving the paid lane away.
  }
  if (!isProTier(tier)) return NextResponse.json({ locked: true }, { status: 200 })

  const listing = await listPlaceActionLinks(clientId)
  if (!listing.ok) return NextResponse.json({ error: listing.error }, { status: 502 })
  const read = diagnoseOrderLinks(listing.links)

  const crawl = websiteUrl ? await crawlSiteForOrdering(websiteUrl) : { links: [], error: null, readable: false }

  // Their POS only if they actually told us. Never inferred: the prompt is explicit that
  // an assumed vendor is a lie that costs money.
  let posVendor: string | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('campaigns').select('execution').eq('client_id', clientId).not('execution', 'is', null).limit(20)
    for (const row of (data ?? []) as { execution?: { vendorInfo?: string } }[]) {
      const v = row.execution?.vendorInfo?.trim()
      if (v) { posVendor = v; break }
    }
  } catch { /* unknown stays unknown */ }

  const payload = buildAdvicePayload({
    businessName, websiteUrl, read,
    found: crawl.links, siteReadable: crawl.readable, posVendor,
  })

  try {
    const msg = await anthropic.messages.create({
      model: ORDER_ADVICE_MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      system: ADVICE_SYSTEM,
      messages: [{ role: 'user', content: renderAdvicePrompt(payload) }],
    })
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    const advice = parseAdvice(text, payload)
    // A malformed or ungrounded answer returns null, not nonsense. The screen below is
    // still correct without it.
    return NextResponse.json({ locked: false, advice, model: ORDER_ADVICE_MODEL })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'advice failed'
    return NextResponse.json({ locked: false, advice: null, error: message }, { status: 200 })
  }
}
