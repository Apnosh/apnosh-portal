/**
 * /api/dashboard/analyst — the premium AI Data Analyst.
 *
 * POST { clientId, window? } → reads the whole funnel and returns a plain-English
 * read PLUS the authoritative funnel numbers (rendered by the page from the
 * grounded payload, not from the model).
 *
 * Gated to the Pro tier at the SERVER (never trust the client UI alone): a
 * non-Pro caller gets { locked: true } and no model call is ever made, so the
 * gate also protects the AI spend.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { buildAnalystPayload } from '@/lib/insights/analyst-payload'
import { runAnalyst, funnelFromPayload, ANALYST_MODEL, READ_VERSION } from '@/lib/insights/analyst'
import type { InsightsWindow } from '@/lib/insights/compute-stages'

// the full report reads the whole account and researches outside it: well over 30s
export const maxDuration = 300

/**
 * Just the counted review stats, for a cache hit. Cheap (one indexed read) and
 * deliberately separate from the full payload build, which is the expensive part.
 */
async function loadReviewDigestForStats(clientId: string, window: InsightsWindow) {
  try {
    const { buildReviewStats } = await import('@/lib/insights/analyst-payload')
    return await buildReviewStats(clientId, window)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const w = body.window
  const window: InsightsWindow = w === '7d' || w === '90d' || w === '12m' ? w : '30d'
  const refresh = body.refresh === true

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  // Pro gate — enforced here, before any model call (protects the AI spend too).
  let tier: string | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
    tier = (data as { tier?: string | null } | null)?.tier ?? null
  } catch {
    /* if we can't read the tier, fail closed (locked) rather than give it away */
  }
  if (!isProTier(tier)) {
    return NextResponse.json({ locked: true }, { status: 200 })
  }

  // ── Cache (Phase D): serve the stored read when it's fresh, so opening the
  //    page doesn't re-bill the AI. Only an explicit Refresh regenerates.
  //    Best-effort on both sides: a missing table (migration 207 not applied
  //    yet) or any read/write hiccup just falls through to a live generate. ──
  const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000 // a week
  const PENDING_STALE_MS = 4 * 60 * 1000 // a job older than this without a result is presumed dead
  type Row = { read: Record<string, unknown> | null; funnel: unknown; business: unknown; reputation: unknown; generated_at: string }
  const admin = createAdminClient()
  let row: Row | null = null
  try {
    const { data } = await admin
      .from('analyst_reports')
      .select('read, funnel, business, reputation, generated_at')
      .eq('client_id', clientId).eq('report_window', window)
      .maybeSingle()
    row = data as Row | null
  } catch { /* no cache table → generate */ }
  const readVersion = Number(row?.read?.version ?? 1)
  const pendingSince = row?.read?.pending ? Date.parse(String(row.read.startedAt ?? row.generated_at)) : NaN
  const pendingAlive = Number.isFinite(pendingSince) && Date.now() - pendingSince < PENDING_STALE_MS
  // a job is already writing this report: say so, the page keeps its working screen and polls
  if (pendingAlive && !refresh) return NextResponse.json({ pending: true, startedAt: new Date(pendingSince).toISOString() })
  // a finished, fresh, current-shape read: serve it (only an explicit Refresh regenerates)
  if (!refresh && row?.read && !row.read.pending && !row.read.failed && readVersion >= READ_VERSION && row.generated_at && Date.now() - new Date(row.generated_at).getTime() < CACHE_FRESH_MS) {
    const digest = await loadReviewDigestForStats(clientId, window)
    return NextResponse.json({ locked: false, read: row.read, funnel: row.funnel, reviewStats: digest, reputation: row.reputation, business: row.business, window, generatedAt: row.generated_at, cached: true })
  }
  // the last job died: tell the page why, once; the next call (or Refresh) starts a new one
  if (!refresh && row?.read?.failed && Number.isFinite(pendingSince) && Date.now() - pendingSince < PENDING_STALE_MS) {
    return NextResponse.json({ error: String(row.read.failed) }, { status: 502 })
  }
  /* START THE JOB (2026-09-04). A researched report can take a minute or two — far too long
     for one request to hold open through a gateway and a phone. So: mark the row pending,
     answer now, and do the reading + writing AFTER the response inside this same function's
     time budget. The page polls every few seconds and lands on the finished read. */
  const startedAt = new Date().toISOString()
  try {
    await admin.from('analyst_reports').upsert({
      client_id: clientId, report_window: window,
      read: { pending: true, version: 0, startedAt },
      funnel: row?.funnel ?? [], business: row?.business ?? null, reputation: row?.reputation ?? null,
      model: ANALYST_MODEL, cost_cents: 0, generated_at: startedAt,
    })
  } catch { /* without the table we cannot hand off; fall through to a live generate below */ }
  const generate = async () => {
    const payload = await buildAnalystPayload(clientId, window)
    const funnel = funnelFromPayload(payload)
    const { read: written, costCents } = await runAnalyst(payload)
    // the visuals are drawn from these, not from the model's words
    const read = { ...written, numbers: { trends: payload.trends, rhythm: payload.rhythm, standouts: payload.standouts, launches: payload.launches } }
    const generatedAt = new Date().toISOString()
    await admin.from('analyst_reports').upsert({
      client_id: clientId, report_window: window, read, funnel,
      business: payload.business, reputation: payload.reputation,
      model: ANALYST_MODEL, cost_cents: costCents, generated_at: generatedAt,
    })
    return { read, funnel, payload, generatedAt }
  }
  after(async () => {
    try { await generate() } catch (e) {
      const msg = e instanceof Error ? e.message : 'analyst failed'
      try { await admin.from('analyst_reports').upsert({ client_id: clientId, report_window: window, read: { pending: false, failed: msg, version: 0, startedAt }, funnel: [], business: null, reputation: null, model: ANALYST_MODEL, cost_cents: 0, generated_at: startedAt }) } catch { /* nothing more to do */ }
    }
  })
  return NextResponse.json({ pending: true, startedAt })
}
