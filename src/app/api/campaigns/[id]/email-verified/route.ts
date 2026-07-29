/**
 * POST /api/campaigns/:id/email-verified — completion stamp for the land-in-the-inbox task.
 *
 * The ONLY writer of execution.emailDeliverableAt, and the key is deliberately NOT in the owner
 * PATCH whitelist. Same guarantee as gbpFixedAt: this route re-runs the DNS lookups ITSELF and
 * stamps only when what is actually published passes. So the stamp cannot be forged or backdated
 * by a hand-rolled request.
 *
 * WHERE IT DIFFERS FROM THE GOOGLE ONE, and it matters: there is no "finish anyway" override here.
 * The gbp route has one because a profile can be legitimately good enough with a section still
 * improvable, and the owner is the judge of that. Deliverability is not a judgement call. Either
 * the records are published and correct or the mail lands in spam, and letting an owner declare
 * otherwise would have us record "your email is set up" about a domain we just watched fail.
 *
 * DKIM CANNOT BLOCK. Its absence is unknowable from outside (the selector is private), so the bar
 * is the two records we can genuinely check. Blocking on a thing we cannot measure would leave a
 * correctly-configured owner permanently unable to finish.
 *
 * Idempotent + first-writer-wins: once stamped, later calls return the original time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveTxt } from 'node:dns/promises'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign } from '@/lib/campaigns/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReport, DKIM_SELECTORS, type DnsAnswers } from '@/lib/email/deliverability'
import { normalizeDomain } from '@/app/api/dashboard/email-health/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((chunks) => chunks.join(''))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Producer is deliberately not part of this test, same reasoning as the gbp route: the stamp
  // means "we re-read the live records and they passed", which is equally true whichever lane
  // did the work.
  const hasEmail = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'email-found')
  if (!hasEmail) return NextResponse.json({ error: 'this campaign has no email setup task' }, { status: 400 })

  const existing = (campaign.execution as Record<string, unknown> | null)?.emailDeliverableAt
  if (typeof existing === 'string' && existing) return NextResponse.json({ ok: true, verifiedAt: existing, already: true })

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('website').eq('id', campaign.clientId).maybeSingle()
  const domain = normalizeDomain((client?.website as string | null) ?? '')
  if (!domain) return NextResponse.json({ error: 'we do not have your website address, so there is nothing to check' }, { status: 400 })

  const [apexTxt, dmarcTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)])
  let dkim: DnsAnswers['dkim'] = null
  for (const { selector, who } of DKIM_SELECTORS) {
    const rows = await txt(`${selector}._domainkey.${domain}`)
    const rec = rows.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='))
    if (rec) { dkim = { selector, who, record: rec }; break }
  }
  const report = buildReport({ domain, apexTxt, dmarcTxt, dkim, domainResolves: apexTxt.length > 0 || dmarcTxt.length > 0 })

  if (!report.clean) {
    return NextResponse.json({
      error: report.problems === 1
        ? 'one record is still wrong, so we cannot say your email is set up'
        : `${report.problems} records are still wrong, so we cannot say your email is set up`,
      blocking: report.findings
        .filter((f) => f.state === 'missing' || f.state === 'weak')
        .map((f) => ({ key: f.key, label: f.label, state: f.state, problem: f.problem })),
    }, { status: 409 })
  }

  // Race-proof claim, guarded on the key still being absent so only the first stamp wins.
  const nowIso = new Date().toISOString()
  const { data: cur, error: readErr } = await admin.from('campaigns').select('execution').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const exec = (cur?.execution && typeof cur.execution === 'object' ? cur.execution : {}) as Record<string, unknown>
  if (typeof exec.emailDeliverableAt === 'string' && exec.emailDeliverableAt) {
    return NextResponse.json({ ok: true, verifiedAt: exec.emailDeliverableAt, already: true })
  }

  // Record WHAT we saw, not just that we looked: which records passed, and whether the signature
  // was one we could confirm or one we simply could not see. A completion row that says "clean"
  // without saying what clean meant is the thing nobody can audit later.
  const { error } = await admin
    .from('campaigns')
    .update({
      execution: {
        ...exec,
        emailDeliverableAt: nowIso,
        emailCheckedDomain: domain,
        emailDkimConfirmed: report.findings.find((f) => f.key === 'dkim')?.state === 'good',
      },
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Law 5: the DNS probe passed on THIS domain — a client-scoped fact the vault holds, so the
  // next campaign's email work does not re-run the ask. Awaited; never throws.
  const { recordSignal } = await import('@/lib/campaigns/setup/vault-bridge')
  await recordSignal(campaign.clientId, { kind: 'dns-verified', domain })

  return NextResponse.json({ ok: true, verifiedAt: nowIso })
}
