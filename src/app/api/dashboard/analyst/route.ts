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

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { buildAnalystPayload } from '@/lib/insights/analyst-payload'
import { runAnalyst, funnelFromPayload } from '@/lib/insights/analyst'
import type { InsightsWindow } from '@/lib/insights/compute-stages'

export const maxDuration = 30

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
  if (!refresh) {
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('analyst_reports')
        .select('read, funnel, business, reputation, generated_at')
        .eq('client_id', clientId).eq('window', window)
        .maybeSingle()
      const row = data as { read: unknown; funnel: unknown; business: unknown; reputation: unknown; generated_at: string } | null
      if (row?.read && row.generated_at && Date.now() - new Date(row.generated_at).getTime() < CACHE_FRESH_MS) {
        return NextResponse.json({
          locked: false,
          read: row.read,
          funnel: row.funnel,
          reputation: row.reputation,
          business: row.business,
          window,
          generatedAt: row.generated_at,
          cached: true,
        })
      }
    } catch { /* no cache → generate live */ }
  }

  try {
    const payload = await buildAnalystPayload(clientId, window)
    const funnel = funnelFromPayload(payload)
    const { read, costCents } = await runAnalyst(payload)
    const generatedAt = new Date().toISOString()

    // store the fresh read (best-effort; a failure never blocks the response)
    try {
      const admin = createAdminClient()
      await admin.from('analyst_reports').upsert({
        client_id: clientId,
        window,
        read,
        funnel,
        business: payload.business,
        reputation: payload.reputation,
        model: 'claude-sonnet-4-5-20250929',
        cost_cents: costCents,
        generated_at: generatedAt,
      })
    } catch { /* cache write is optional */ }

    return NextResponse.json({
      locked: false,
      read,
      funnel,
      reputation: payload.reputation,
      business: payload.business,
      window,
      generatedAt,
      costCents,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'analyst failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
