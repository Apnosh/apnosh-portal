/**
 * GET /api/dashboard/review-summary?clientId=… — the FAST, deterministic
 * reputation data for the insights Reviews view. No model call, so it paints
 * instantly; the slower AI topic breakdown loads separately from
 * /api/dashboard/review-topics.
 *
 * All grounded in this restaurant's real reviews (google `reviews` + GBP
 * `local_reviews`):
 *   - split: positive / neutral / negative counts from the star ratings.
 *   - stars: the 1-5 star histogram.
 *   - byMonth: average rating AND review count per month (rating trend +
 *     review-velocity charts).
 *   - reply: replied vs waiting, with unanswered negatives flagged.
 *   - sources: which platforms the reviews come from (gbp folded into google).
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 10

interface RevRow { rating: number; at: string; replied: boolean; source: string }

// Page through a review table so every aggregate reflects all collected reviews.
async function fetchAll(admin: SupabaseClient, table: string, cols: string, dateCol: string, clientId: string): Promise<Record<string, unknown>[]> {
  const page = 1000
  const out: Record<string, unknown>[] = []
  for (let from = 0; from < 4000; from += page) {
    const res = await admin.from(table).select(cols).eq('client_id', clientId).order(dateCol, { ascending: false }).range(from, from + page - 1)
    const batch = (res.data ?? []) as unknown as Record<string, unknown>[]
    out.push(...batch)
    if (batch.length < page) break
  }
  return out
}

// Normalize raw source strings to one platform key. GBP reviews arrive under
// both 'google' and 'gbp'; merge them.
function normSource(s: string): string {
  const v = (s || '').toLowerCase()
  if (v === 'gbp' || v === 'google') return 'google'
  if (v === 'yelp') return 'yelp'
  if (v === 'tripadvisor') return 'tripadvisor'
  if (v === 'facebook') return 'facebook'
  if (v === 'apple_maps' || v === 'apple') return 'apple_maps'
  return 'other'
}

function ymKey(iso: string): string | null {
  // Literal YYYY-MM from the ISO string — timezone-agnostic, so a review
  // timestamped near midnight can't drift into the wrong month.
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()
  const [g, l] = await Promise.all([
    fetchAll(admin, 'reviews', 'rating, posted_at, response_text, source', 'posted_at', clientId),
    fetchAll(admin, 'local_reviews', 'rating, created_at_platform, reply_text, source', 'created_at_platform', clientId),
  ])

  const rows: RevRow[] = [
    ...g.map((r) => ({ rating: Number(r.rating ?? 0), at: String(r.posted_at ?? ''), replied: !!(r.response_text && String(r.response_text).trim()), source: String(r.source ?? '') })),
    ...l.map((r) => ({ rating: Number(r.rating ?? 0), at: String(r.created_at_platform ?? ''), replied: !!(r.reply_text && String(r.reply_text).trim()), source: String(r.source ?? '') })),
  ].filter((r) => r.rating > 0)

  // Ranges, not equality, so every rating in [1,5] lands in exactly one bucket.
  const split = {
    positive: rows.filter((r) => r.rating >= 4).length,
    neutral: rows.filter((r) => r.rating >= 3 && r.rating < 4).length,
    negative: rows.filter((r) => r.rating < 3).length,
    total: rows.length,
  }

  const stars: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of rows) { const s = Math.min(5, Math.max(1, Math.round(r.rating))); stars[s] += 1 }

  const monthMap = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const ym = ymKey(r.at); if (!ym) continue
    const m = monthMap.get(ym) ?? { sum: 0, count: 0 }
    m.sum += r.rating; m.count += 1; monthMap.set(ym, m)
  }
  const byMonth = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, m]) => ({ ym, avg: Math.round((m.sum / m.count) * 10) / 10, count: m.count }))
    .slice(-12)

  const repliedCount = rows.filter((r) => r.replied).length
  const reply = {
    total: rows.length,
    replied: repliedCount,
    unanswered: rows.length - repliedCount,
    unansweredNegative: rows.filter((r) => !r.replied && r.rating < 3).length,
  }

  const sources: Record<string, number> = {}
  for (const r of rows) { const k = normSource(r.source); sources[k] = (sources[k] ?? 0) + 1 }

  return NextResponse.json({ split, stars, byMonth, reply, sources })
}
