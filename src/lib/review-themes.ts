/**
 * AI-extracted themes from a client's recent reviews.
 *
 * Runs Anthropic over the last 90 days of review text, groups
 * mentions into recurring topics ("staff", "wait time", "pho broth"),
 * and labels each as praise vs critical. Cached in `review_themes`
 * so the reviews page renders instantly without re-running the LLM
 * on every load.
 *
 * Regeneration policy: anything older than 7 days is stale. New
 * results overwrite — we keep one row per (client_id, location_id).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

const anthropic = new Anthropic()

export interface ReviewThemeExample {
  rating: number
  snippet: string
}

export interface ReviewTheme {
  theme: string
  mentions: number
  praise: number
  critical: number
  examples: ReviewThemeExample[]
}

export interface ReviewThemesResult {
  generatedAt: string
  windowStart: string
  windowEnd: string
  reviewCount: number
  themes: ReviewTheme[]
}

const STALE_AFTER_DAYS = 7
const WINDOW_DAYS = 90
const MAX_REVIEWS_TO_SAMPLE = 200

/* Pull the latest cached result for this client+location. Returns
   null when nothing's cached or the cache is older than 7 days. */
export async function getCachedThemes(
  clientId: string,
  locationId?: string | null,
): Promise<ReviewThemesResult | null> {
  const admin = createAdminClient()
  let q = admin
    .from('review_themes')
    .select('generated_at, window_start, window_end, themes, review_count')
    .eq('client_id', clientId)
    .order('generated_at', { ascending: false })
    .limit(1)
  q = locationId ? q.eq('location_id', locationId) : q.is('location_id', null)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const ageMs = Date.now() - new Date(data.generated_at).getTime()
  if (ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000) return null
  return {
    generatedAt: data.generated_at,
    windowStart: data.window_start,
    windowEnd: data.window_end,
    reviewCount: data.review_count,
    themes: data.themes as ReviewTheme[],
  }
}

interface ReviewRow {
  rating: number
  review_text: string | null
  created_at: string
}

/* Generate fresh themes, write to cache, return result. Errors
   propagate — caller decides whether to fall back to stale cache. */
export async function generateThemesForClient(
  clientId: string,
  locationId?: string | null,
): Promise<ReviewThemesResult> {
  const admin = createAdminClient()
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS)
  const startYmd = start.toISOString().slice(0, 10)
  const endYmd = end.toISOString().slice(0, 10)

  let q = admin
    .from('reviews')
    .select('rating, review_text, created_at')
    .eq('client_id', clientId)
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_REVIEWS_TO_SAMPLE)
  if (locationId) q = q.eq('location_id', locationId)
  const { data: reviews } = await q
  const rows = (reviews ?? []) as ReviewRow[]
  const withText = rows.filter(r => (r.review_text ?? '').trim().length >= 10)

  if (withText.length < 5) {
    /* Not enough text to extract meaningful themes. Cache an empty
       result so we don't keep retrying on every page load. */
    const empty: ReviewThemesResult = {
      generatedAt: new Date().toISOString(),
      windowStart: startYmd,
      windowEnd: endYmd,
      reviewCount: rows.length,
      themes: [],
    }
    await upsertCache(clientId, locationId, empty)
    return empty
  }

  const themes = await extractThemesViaAi(withText)

  const result: ReviewThemesResult = {
    generatedAt: new Date().toISOString(),
    windowStart: startYmd,
    windowEnd: endYmd,
    reviewCount: rows.length,
    themes,
  }
  await upsertCache(clientId, locationId, result)
  return result
}

async function upsertCache(
  clientId: string,
  locationId: string | null | undefined,
  result: ReviewThemesResult,
): Promise<void> {
  const admin = createAdminClient()
  /* Delete then insert — keeps one row per (client_id, location_id).
     onConflict can't express "null vs not null" cleanly on
     location_id, so manual cleanup is safer. */
  let del = admin.from('review_themes').delete().eq('client_id', clientId)
  del = locationId ? del.eq('location_id', locationId) : del.is('location_id', null)
  await del
  await admin.from('review_themes').insert({
    client_id: clientId,
    location_id: locationId ?? null,
    generated_at: result.generatedAt,
    window_start: result.windowStart,
    window_end: result.windowEnd,
    review_count: result.reviewCount,
    themes: result.themes,
  })
}

async function extractThemesViaAi(reviews: ReviewRow[]): Promise<ReviewTheme[]> {
  const reviewLines = reviews.map((r, i) =>
    `[${i}] (${r.rating}★) ${r.review_text!.replace(/\s+/g, ' ').slice(0, 400)}`,
  ).join('\n')

  const prompt = `You are analyzing customer reviews for a restaurant. Identify the recurring topics customers mention and how they feel about each one.

Output ONLY valid JSON matching this shape:
{
  "themes": [
    {
      "theme": "short noun phrase, lowercase (e.g. 'pho broth', 'wait time', 'staff friendliness')",
      "mentions": <integer count of reviews that touch this theme>,
      "praise": <integer count where the mention is positive>,
      "critical": <integer count where the mention is negative or complaining>,
      "examples": [
        { "rating": <1-5>, "snippet": "<verbatim 5-15 word excerpt>" }
      ]
    }
  ]
}

Rules:
- Return 5-10 themes, sorted by mentions descending.
- Only include themes mentioned by at least 2 different reviews.
- Theme labels are concrete (food items, service aspects, atmosphere) — not generic ("good food").
- praise + critical should equal mentions (or close to it). Neutral mentions count toward praise.
- Each theme gets 1-2 short example snippets, pulled verbatim from the reviews.
- No prose, no markdown, no commentary — JSON only.

Reviews:
${reviewLines}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  /* Strip any ``` fences just in case the model adds them. */
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(cleaned) as { themes?: ReviewTheme[] }
  return Array.isArray(parsed.themes) ? parsed.themes : []
}
