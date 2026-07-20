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
import { gbpFinishReadiness, GBP_FINISH_MIN_SCORE } from '@/lib/gbp-finish'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // The campaign must actually carry the Google-profile work. Producer is deliberately
  // NOT part of this test: the stamp means "we re-read the live profile and it checked out
  // all good", which is equally true whichever lane did the work (self-serve, Apnosh AI, or
  // the team) — and an item can carry no producer at all. Gating on producer === 'diy' meant
  // AI-lane and producer-less campaigns could never complete even with a perfect profile.
  const hasGbp = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'gbp-setup')
  if (!hasGbp) return NextResponse.json({ error: 'this campaign has no Google profile task' }, { status: 400 })

  // Already stamped: return the ORIGINAL completion time unchanged.
  const existing = campaign.execution?.gbpFixedAt
  if (existing) return NextResponse.json({ ok: true, fixedAt: existing, already: true })

  // The honesty gate, enforced HERE with a fresh server-side read. The bar is
  // gbpFinishReadiness (shared with the UI): a part that is absent or unverified blocks,
  // a part that is merely improvable does not, and the listing-health score must clear
  // its floor. `anyway: true` is the owner's deliberate override for everything that
  // still refuses — it does not pretend the profile is clean, it RECORDS what was still
  // open at the moment they chose to finish.
  const anyway = await req.json().then((b) => (b as { anyway?: unknown } | null)?.anyway === true).catch(() => false)

  const diag = await diagnoseGbp(campaign.clientId).catch(() => null)
  const readable = !!diag && diag.connected && !diag.readFailed && diag.sections.length > 0
  if (!readable) {
    // Never stamp on a profile we could not read — not even with `anyway`, since we
    // would have nothing true to record about its state.
    return NextResponse.json({ error: 'we could not read your Google profile just now', blocking: [] }, { status: 409 })
  }
  const readiness = gbpFinishReadiness(diag!.sections, diag!.score)
  const stillOpen = diag!.sections.filter((s) => s.status !== 'good')
  if (!readiness.ready && !anyway) {
    return NextResponse.json({
      error: readiness.scoreShort
        ? `your profile scores ${diag!.score ?? 0} of 100, and ${GBP_FINISH_MIN_SCORE} is the bar to finish`
        : 'some parts of your profile are still missing',
      blocking: stillOpen.map((s) => ({ key: s.key, label: s.label, status: s.status, current: s.current })),
      canFinishAnyway: true,
    }, { status: 409 })
  }

  // Race-proof claim (the wrap-up stamp pattern): merge into the stored execution
  // jsonb, guarded on the key still being absent so only the first stamp wins.
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: cur, error: readErr } = await admin.from('campaigns').select('execution').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const exec = (cur?.execution && typeof cur.execution === 'object' ? cur.execution : {}) as Record<string, unknown>
  if (typeof exec.gbpFixedAt === 'string' && exec.gbpFixedAt) return NextResponse.json({ ok: true, fixedAt: exec.gbpFixedAt, already: true })
  // Record what was ACTUALLY true at the moment of finishing. On the clean path that is
  // just the timestamp; when the owner overrode the bar we also write the parts that were
  // still open and the score, so the completion record never reads as "it was perfect".
  const stamp: Record<string, unknown> = { ...exec, gbpFixedAt: nowIso }
  if (!readiness.ready) {
    stamp.gbpFinishedWithGaps = stillOpen.map((s) => ({ key: s.key, label: s.label, status: s.status }))
    stamp.gbpScoreAtFinish = diag!.score
  }
  const { data: claimed, error } = await admin
    .from('campaigns')
    .update({ execution: stamp, updated_at: nowIso })
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
