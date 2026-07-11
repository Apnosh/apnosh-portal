/**
 * POST /api/dashboard/gbp-answer — DEAD ROUTE (410).
 *
 * Google shut the My Business Q&A API down for every app. Verified by a live
 * probe on 2026-07-11: the API returns 501 UNIMPLEMENTED, reason
 * API_UNSUPPORTED, "My Business Q&A API is no longer supported." No app can
 * write a merchant answer anymore, so this route answers 410 Gone with a
 * plain-words body and NEVER calls Google (the old upsertGbpAnswer in
 * src/lib/gbp-qanda.ts is kept for reference but no longer invoked).
 *
 * The owner UI (GbpQandaView in src/components/mvp/gbp-fixer.tsx) no longer
 * posts here; owners answer on business.google.com, with an AI-drafted answer
 * to copy from POST /api/dashboard/gbp-answer-draft (which never used this
 * API — it only reads our own DB facts and calls the model).
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Google closed this feature for apps.', code: 'api_removed' },
    { status: 410 },
  )
}
