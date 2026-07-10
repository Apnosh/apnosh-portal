/**
 * POST /api/campaigns/:id/gbp-fixed — completion stamp for the self-serve
 * Google-profile task (the gbp card's free "I do it myself" version).
 *
 * The ONLY writer of execution.gbpFixedAt. The key is deliberately NOT in the
 * owner PATCH whitelist (same guarantee as wrapUpSentAt): this route re-runs
 * the read-only diagnosis engine ITSELF and stamps only when the owner's live
 * profile came back fully readable with every section good. So "self-checking,
 * never self-claimed" holds at the server boundary — the stamp cannot be
 * forged, backdated, or cleared with a hand-rolled request.
 *
 * Idempotent + first-writer-wins: once stamped, later calls return the
 * original time and never overwrite it (a revisit to the fixer page can never
 * move when the task was actually finished).
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign } from '@/lib/campaigns/server'
import { diagnoseGbp } from '@/lib/gbp-diagnose'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Only a campaign that actually carries the owner-run walkthrough has this task.
  const diyGbp = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'gbp-setup' && it.producer === 'diy')
  if (!diyGbp) return NextResponse.json({ error: 'this campaign has no self-serve Google profile task' }, { status: 400 })

  // Already stamped: return the ORIGINAL completion time unchanged.
  const existing = campaign.execution?.gbpFixedAt
  if (existing) return NextResponse.json({ ok: true, fixedAt: existing, already: true })

  // The honesty gate, enforced HERE: a fresh server-side read of the live profile
  // must be fully successful (connected, nothing unreadable) and every section good.
  const diag = await diagnoseGbp(campaign.clientId).catch(() => null)
  const allGood = !!diag && diag.connected && !diag.readFailed
    && diag.sections.length > 0 && diag.sections.every((s) => s.status === 'good')
  if (!allGood) return NextResponse.json({ error: 'the profile did not check out all good on a fresh read' }, { status: 409 })

  // Race-proof claim (the wrap-up stamp pattern): merge into the stored execution
  // jsonb, guarded on the key still being absent so only the first stamp wins.
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: cur, error: readErr } = await admin.from('campaigns').select('execution').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const exec = (cur?.execution && typeof cur.execution === 'object' ? cur.execution : {}) as Record<string, unknown>
  if (typeof exec.gbpFixedAt === 'string' && exec.gbpFixedAt) return NextResponse.json({ ok: true, fixedAt: exec.gbpFixedAt, already: true })
  const { data: claimed, error } = await admin
    .from('campaigns')
    .update({ execution: { ...exec, gbpFixedAt: nowIso }, updated_at: nowIso })
    .eq('id', id)
    .filter('execution->>gbpFixedAt', 'is', null)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!claimed) {
    // Lost the race to another stamp — report the winner's time, never a second write.
    const { data } = await admin.from('campaigns').select('execution').eq('id', id).maybeSingle()
    const won = ((data?.execution ?? {}) as Record<string, unknown>).gbpFixedAt
    return NextResponse.json({ ok: true, fixedAt: typeof won === 'string' && won ? won : nowIso, already: true })
  }
  return NextResponse.json({ ok: true, fixedAt: nowIso })
}
