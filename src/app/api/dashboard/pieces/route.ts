/**
 * GET /api/dashboard/pieces?clientId=&from=YYYY-MM-DD&to=YYYY-MM-DD — everything ordered or
 * planned in the window, one row per real thing, tagged with its campaign. See src/lib/pieces/read.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPieces } from '@/lib/pieces/read'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const clientId = sp.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const today = new Date()
  const from = ok(sp.get('from')) ?? new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
  const to = ok(sp.get('to')) ?? new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().slice(0, 10)
  try {
    const pieces = await listPieces(createAdminClient(), clientId, from, to)
    return NextResponse.json({ pieces, from, to }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
