/**
 * /api/dashboard/citations — where your details are right and where they are wrong, across
 * the directories a restaurant actually gets found on.
 *
 * GET   the plan: what Google says (the truth source), and per directory whether we have
 *       checked it, whether it matched, and what differs.
 * POST  { platform: 'yelp' } runs the one automatic check we have and re-reads.
 *
 * Yelp is the only directory with a real API read. Everything else is reported as unchecked
 * until a person looks, and the walkthrough says so rather than implying a clean listing.
 * The reasoning lives in `@/lib/citations/directories` (pure, verified).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getCitationAudits, checkYelpForClient } from '@/lib/citation-audit'
import { buildCitationPlan, type AuditRow } from '@/lib/citations/directories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const summary = await getCitationAudits(clientId)
  if (!summary) return NextResponse.json({ error: 'Could not read your Google details.' }, { status: 502 })

  return NextResponse.json({
    ...buildCitationPlan(summary.source, summary.audits as AuditRow[]),
    // The button that offers the automatic check should not exist if the key is not set.
    canCheckYelp: !!process.env.YELP_API_KEY,
  })
}

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const platform = await req.json().then((b) => (b as { platform?: unknown } | null)?.platform).catch(() => null)
  // Only Yelp has an automatic check. Accepting anything else here would imply otherwise.
  if (platform !== 'yelp') return NextResponse.json({ error: 'Only Yelp can be checked automatically.' }, { status: 400 })

  const result = await checkYelpForClient(clientId, user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  const summary = await getCitationAudits(clientId)
  if (!summary) return NextResponse.json({ error: 'Checked, but could not re-read.' }, { status: 502 })

  return NextResponse.json({
    ...buildCitationPlan(summary.source, summary.audits as AuditRow[]),
    canCheckYelp: true,
    matched: result.matched,
  })
}
