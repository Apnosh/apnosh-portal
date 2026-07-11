/**
 * GET /api/dashboard/gbp-questions?clientId=
 *
 * The customer Questions & Answers on the client's Google listing, read live
 * via the My Business Q&A API (src/lib/gbp-qanda.ts listGbpQuestions).
 *
 * Auth: checkClientAccess only — READING questions is fine for every tier
 * (same stance as GET /api/dashboard/gbp-diagnosis). Answering is the
 * Pro-gated write, on POST /api/dashboard/gbp-answer.
 *
 * Response is honest:
 *   200 { ok: true, questions: [...] }
 *   502 { ok: false, error, code } — plain owner words + a machine code;
 *       code 'api_disabled' means the Q&A API is not enabled on the OAuth
 *       project (a setup problem on our side, so the UI says "This part of
 *       Google is not connected yet."). Raw Google strings never escape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listGbpQuestions } from '@/lib/gbp-qanda'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  const result = await listGbpQuestions(clientId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 502 })
  }
  return NextResponse.json({ ok: true, questions: result.questions })
}
