/**
 * Customer Eye View — "if I were a hungry customer researching this
 * place, what would I find?"
 *
 * Phase 1 (this file): text-only narrative for the primary client.
 * Fetches every customer-facing surface we have access to (GBP profile,
 * website HTML, recent reviews, recent posts, basic performance signals)
 * and asks Claude to walk through it from a potential customer's POV.
 *
 * Phase 2 will add headless-chrome screenshots so Claude can see the
 * actual visual presentation. Phase 3 will add nearby-competitor
 * comparison ("here's how you stack up against the 3 closest places").
 */

'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const MODEL = 'claude-sonnet-4-5-20250929'

export interface CustomerEyeViewReport {
  summary: string
  firstImpressions: string
  decisionJourney: string
  frictionPoints: Array<{ source: string; observation: string; severity: 'low' | 'medium' | 'high' }>
  trustSignals: Array<{ source: string; observation: string }>
  verdict: string
}

export interface CustomerEyeViewRun {
  id: string
  clientId: string
  ranAt: string
  persona: string
  searchIntent: string | null
  visitLikelihood: number | null
  report: CustomerEyeViewReport
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  costCents: number | null
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/* ── Source fetchers ──────────────────────────────────────────────── */

interface SourceData {
  restaurantName: string
  city: string | null
  gbp: {
    title: string | null
    phone: string | null
    website: string | null
    address: string | null
    primaryCategory: string | null
    additionalCategories: Array<{ displayName: string }> | null
    description: string | null
    hours: unknown
    photoCount: number | null
  }
  website: {
    url: string | null
    titleTag: string | null
    metaDescription: string | null
    bodyTextSample: string | null
    fetchError: string | null
  }
  reviews: {
    last30dCount: number
    last30dAvgRating: number | null
    last30dUnansweredCount: number
    sampleNegative: Array<{ rating: number; text: string; source: string; daysAgo: number }>
    samplePositive: Array<{ rating: number; text: string; source: string; daysAgo: number }>
  }
  recentPosts: number
  /* GBP search performance signals from gbp_metrics, 30d totals. */
  gbpImpressions: number | null
  gbpClicks: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherSourceData(admin: any, clientId: string): Promise<SourceData> {
  const [clientRes, profileRes, gbpRes, gbpMetricsRes, reviewsRes, postsRes] = await Promise.all([
    admin.from('clients').select('name, location, website').eq('id', clientId).maybeSingle(),
    admin.from('client_profiles').select('city, full_address').eq('client_id', clientId).maybeSingle(),
    admin.from('gbp_locations')
      .select('location_name, phone, website, address, primary_category, additional_categories, profile_description, hours')
      .eq('client_id', clientId).limit(1).maybeSingle(),
    admin.from('gbp_metrics')
      .select('photo_count, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, website_clicks, calls, directions, date')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(30),
    admin.from('local_reviews')
      .select('rating, body, source, status, created_at_platform')
      .eq('client_id', clientId)
      .gte('created_at_platform', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('created_at_platform', { ascending: false })
      .limit(50),
    admin.from('client_updates')
      .select('type, status, created_at')
      .eq('client_id', clientId)
      .eq('status', 'published')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ])

  const client = (clientRes.data ?? {}) as Record<string, string | null>
  const profile = (profileRes.data ?? {}) as Record<string, string | null>
  const gbp = (gbpRes.data ?? {}) as Record<string, unknown>
  const gbpMetrics = (gbpMetricsRes.data ?? []) as Array<{
    photo_count: number | null
    impressions_search_mobile?: number
    impressions_search_desktop?: number
    impressions_maps_mobile?: number
    impressions_maps_desktop?: number
    website_clicks?: number
    calls?: number
    directions?: number
  }>
  const reviews = (reviewsRes.data ?? []) as Array<{
    rating: number
    body: string | null
    source: string
    status: string
    created_at_platform: string
  }>
  const posts = (postsRes.data ?? []) as Array<{ type: string }>

  /* Website fetch — head + small chunk of body. */
  let websiteData: SourceData['website'] = {
    url: (client.website as string | null) ?? null,
    titleTag: null,
    metaDescription: null,
    bodyTextSample: null,
    fetchError: null,
  }
  if (websiteData.url) {
    let url = websiteData.url
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const html = (await res.text()).slice(0, 80_000)  // cap to keep prompt small
        websiteData.titleTag = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim() || null
        websiteData.metaDescription = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '').trim() || null
        /* Strip HTML to get rough body text. Not perfect but enough
           for Claude to evaluate copy quality. */
        const body = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        websiteData.bodyTextSample = body.slice(0, 3000)
      } else {
        websiteData.fetchError = `HTTP ${res.status}`
      }
    } catch (err) {
      websiteData.fetchError = (err as Error).message
    }
  }

  /* Reviews aggregation. */
  const r = reviews.length > 0 ? {
    last30dCount: reviews.length,
    last30dAvgRating: reviews.reduce((s, x) => s + (x.rating ?? 0), 0) / reviews.length,
    last30dUnansweredCount: reviews.filter(x => x.status === 'open').length,
    sampleNegative: reviews.filter(x => x.rating <= 3 && x.body).slice(0, 3).map(x => ({
      rating: x.rating,
      text: (x.body ?? '').slice(0, 280),
      source: x.source,
      daysAgo: Math.floor((Date.now() - new Date(x.created_at_platform).getTime()) / 86_400_000),
    })),
    samplePositive: reviews.filter(x => x.rating >= 4 && x.body).slice(0, 3).map(x => ({
      rating: x.rating,
      text: (x.body ?? '').slice(0, 280),
      source: x.source,
      daysAgo: Math.floor((Date.now() - new Date(x.created_at_platform).getTime()) / 86_400_000),
    })),
  } : { last30dCount: 0, last30dAvgRating: null, last30dUnansweredCount: 0, sampleNegative: [], samplePositive: [] }

  /* GBP photo count = highest recent value, since rows are daily snapshots. */
  const photoCount = gbpMetrics.find(m => m.photo_count != null)?.photo_count ?? null
  const gbpImpressions = gbpMetrics.length > 0
    ? gbpMetrics.reduce((s, m) => s + (m.impressions_search_mobile ?? 0) + (m.impressions_search_desktop ?? 0) + (m.impressions_maps_mobile ?? 0) + (m.impressions_maps_desktop ?? 0), 0)
    : null
  const gbpClicks = gbpMetrics.length > 0
    ? gbpMetrics.reduce((s, m) => s + (m.website_clicks ?? 0) + (m.calls ?? 0) + (m.directions ?? 0), 0)
    : null

  return {
    restaurantName: (client.name as string | null) ?? 'this restaurant',
    city: (profile.city as string | null) ?? (client.location as string | null),
    gbp: {
      title: (gbp.location_name as string | null) ?? null,
      phone: (gbp.phone as string | null) ?? null,
      website: (gbp.website as string | null) ?? null,
      address: (gbp.address as string | null) ?? (profile.full_address as string | null) ?? null,
      primaryCategory: (gbp.primary_category as string | null) ?? null,
      additionalCategories: (gbp.additional_categories as Array<{ displayName: string }> | null) ?? null,
      description: (gbp.profile_description as string | null) ?? null,
      hours: gbp.hours ?? null,
      photoCount,
    },
    website: websiteData,
    reviews: r,
    recentPosts: posts.filter(p => p.type === 'promotion' || p.type === 'event' || p.type === 'gbp_post').length,
    gbpImpressions,
    gbpClicks,
  }
}

/* ── Claude analyzer ──────────────────────────────────────────────── */

const SYSTEM = `You are role-playing a potential customer researching a restaurant on their phone. You are NOT writing a marketing audit. You are writing what an actual hungry customer would see, think, and feel as they decide whether to visit.

Your job: write a tight, honest report from this customer's POV. You will be given GBP profile data, website content, recent reviews, and basic performance signals. Walk through the customer's mental journey.

Structure your output as JSON matching this exact schema (no extra fields, no markdown fences):

{
  "summary": "2-3 sentences. Your overall impression, headline-style.",
  "firstImpressions": "What you see first on Google / Maps. Photos, name, rating, distance. ~80-120 words.",
  "decisionJourney": "Walk through clicking the listing, scanning reviews, maybe visiting the website. What attracts you? What confuses you? ~120-180 words.",
  "frictionPoints": [
    { "source": "GBP" | "Website" | "Reviews" | "Hours" | "Photos" | "Other", "observation": "What's confusing or off-putting", "severity": "low" | "medium" | "high" }
  ],
  "trustSignals": [
    { "source": "GBP" | "Website" | "Reviews" | "Photos" | "Other", "observation": "What builds trust or makes you want to visit" }
  ],
  "verdict": "1-2 sentences ending with: 'I'd be X% likely to visit.' Be specific about why."
}

RULES:
- Use plain English. No marketing-speak. Talk like a real person.
- Be specific. Reference actual review excerpts, photo counts, real findings.
- Be honest. If it looks unappealing, say so. If it looks great, say so.
- NEVER repeat the audit-style "47 reviews unanswered" framing. Talk feelings, perceptions, what a customer notices and reacts to.
- frictionPoints: list 2-5. trustSignals: list 2-5. Skip categories with no findings.
- Always end the verdict with "I'd be X% likely to visit." where X is a real integer 0-100.

You are smart, hungry, in your 30s, and have 30 seconds to decide.`

interface AnalyzeResult {
  report: CustomerEyeViewReport
  tokensIn: number
  tokensOut: number
}

async function analyzeWithClaude(data: SourceData): Promise<AnalyzeResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userPrompt = `Restaurant: ${data.restaurantName}
City: ${data.city ?? 'unknown'}

GOOGLE BUSINESS PROFILE
- Title: ${data.gbp.title ?? '(none)'}
- Phone: ${data.gbp.phone ?? '(none)'}
- Website: ${data.gbp.website ?? '(none)'}
- Address: ${data.gbp.address ?? '(none)'}
- Primary category: ${data.gbp.primaryCategory ?? '(none)'}
- Additional categories: ${data.gbp.additionalCategories ? data.gbp.additionalCategories.map(c => c.displayName).join(', ') : '(none)'}
- Description: ${data.gbp.description ?? '(none)'}
- Hours: ${data.gbp.hours ? JSON.stringify(data.gbp.hours).slice(0, 600) : '(none)'}
- Photo count: ${data.gbp.photoCount ?? '(unknown)'}

WEBSITE (${data.website.url ?? 'none on file'})
- Title tag: ${data.website.titleTag ?? '(none)'}
- Meta description: ${data.website.metaDescription ?? '(none)'}
- Body text sample: ${data.website.bodyTextSample?.slice(0, 1500) ?? '(empty or fetch failed)'}
${data.website.fetchError ? `- Fetch error: ${data.website.fetchError}` : ''}

REVIEWS (last 30 days)
- Total: ${data.reviews.last30dCount}
- Avg rating: ${data.reviews.last30dAvgRating?.toFixed(2) ?? 'n/a'}
- Unanswered: ${data.reviews.last30dUnansweredCount}
- Sample negative reviews: ${data.reviews.sampleNegative.length === 0 ? 'none' : ''}
${data.reviews.sampleNegative.map(r => `  ${r.rating}★ [${r.source}, ${r.daysAgo}d ago]: "${r.text}"`).join('\n')}
- Sample positive reviews: ${data.reviews.samplePositive.length === 0 ? 'none' : ''}
${data.reviews.samplePositive.map(r => `  ${r.rating}★ [${r.source}, ${r.daysAgo}d ago]: "${r.text}"`).join('\n')}

ACTIVITY
- Posts published in last 30 days: ${data.recentPosts}
- GBP impressions (30d): ${data.gbpImpressions ?? 'n/a'}
- GBP actions (clicks/calls/directions, 30d): ${data.gbpClicks ?? 'n/a'}

Write the customer eye view report as JSON only.`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content.find(b => b.type === 'text')
  const raw = block && block.type === 'text' ? block.text.trim() : ''
  /* Strip code fences if Claude added them. */
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  let report: CustomerEyeViewReport
  try {
    report = JSON.parse(json)
  } catch {
    throw new Error('Claude returned non-JSON output: ' + json.slice(0, 200))
  }

  return {
    report,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }
}

/* ── Orchestrator ─────────────────────────────────────────────────── */

/** Sonnet 4.5 rates: $3/M in, $15/M out. */
function computeCostCents(tokensIn: number, tokensOut: number): number {
  return Math.ceil((tokensIn / 1_000_000) * 3 * 100 + (tokensOut / 1_000_000) * 15 * 100)
}

function extractLikelihood(verdict: string): number | null {
  const m = verdict.match(/(\d{1,3})\s*%\s*likely/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 0 && n <= 100 ? n : null
}

export async function runCustomerEyeView(clientId: string): Promise<CustomerEyeViewRun> {
  const admin = getAdmin()
  const data = await gatherSourceData(admin, clientId)
  const { report, tokensIn, tokensOut } = await analyzeWithClaude(data)
  const visitLikelihood = extractLikelihood(report.verdict)
  const costCents = computeCostCents(tokensIn, tokensOut)

  const { data: row, error } = await admin
    .from('customer_eye_view_runs')
    .insert({
      client_id: clientId,
      persona: 'local_customer',
      search_intent: data.gbp.primaryCategory ? `${data.gbp.primaryCategory.toLowerCase()} near me` : null,
      visit_likelihood: visitLikelihood,
      report,
      model: MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_cents: costCents,
    })
    .select('id, ran_at')
    .single() as { data: { id: string; ran_at: string } | null; error: { message: string } | null }
  if (error || !row) throw new Error(error?.message ?? 'Failed to persist run')

  return {
    id: row.id,
    clientId,
    ranAt: row.ran_at,
    persona: 'local_customer',
    searchIntent: data.gbp.primaryCategory ? `${data.gbp.primaryCategory.toLowerCase()} near me` : null,
    visitLikelihood,
    report,
    model: MODEL,
    tokensIn,
    tokensOut,
    costCents,
  }
}

export async function getLatestCustomerEyeView(clientId: string): Promise<CustomerEyeViewRun | null> {
  const admin = getAdmin()
  const { data } = await admin
    .from('customer_eye_view_runs')
    .select('*')
    .eq('client_id', clientId)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: {
      id: string
      client_id: string
      ran_at: string
      persona: string
      search_intent: string | null
      visit_likelihood: number | null
      report: CustomerEyeViewReport
      model: string | null
      tokens_in: number | null
      tokens_out: number | null
      cost_cents: number | null
    } | null }
  if (!data) return null
  return {
    id: data.id,
    clientId: data.client_id,
    ranAt: data.ran_at,
    persona: data.persona,
    searchIntent: data.search_intent,
    visitLikelihood: data.visit_likelihood,
    report: data.report,
    model: data.model,
    tokensIn: data.tokens_in,
    tokensOut: data.tokens_out,
    costCents: data.cost_cents,
  }
}
