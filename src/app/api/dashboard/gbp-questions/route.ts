/**
 * GET /api/dashboard/gbp-questions — DEAD ROUTE (410).
 *
 * Google shut the My Business Q&A API down for every app. Verified by a live
 * probe on 2026-07-11: the questions list returns 501 UNIMPLEMENTED, reason
 * API_UNSUPPORTED, "My Business Q&A API is no longer supported." No app can
 * read listing questions anymore, so this route answers 410 Gone with a
 * plain-words body and NEVER calls Google (the old listGbpQuestions in
 * src/lib/gbp-qanda.ts is kept for reference but no longer invoked).
 *
 * The owner UI (GbpQandaView in src/components/mvp/gbp-fixer.tsx) no longer
 * fetches this route; it hands off to business.google.com and keeps the AI
 * drafter (POST /api/dashboard/gbp-answer-draft), which never used this API.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Google closed this feature for apps.', code: 'api_removed' },
    { status: 410 },
  )
}
