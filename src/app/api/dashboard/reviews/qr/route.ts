/**
 * GET /api/dashboard/reviews/qr?clientId=&size= — the Google write-a-review link as a QR, PNG.
 *
 * The `qrcode` package sat in package.json for months with no import; this is its first job.
 * Built from the listing's place_id, never from a URL the browser hands us.
 */
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const size = Math.max(160, Math.min(1200, Number(req.nextUrl.searchParams.get('size')) || 480))
  const admin = createAdminClient()
  const { data: locs } = await admin.from('gbp_locations').select('place_id, is_primary').eq('client_id', clientId)
  const rows = (locs ?? []) as { place_id: string | null; is_primary?: boolean }[]
  const placeId = (rows.find((r) => r.is_primary && r.place_id) ?? rows.find((r) => r.place_id))?.place_id ?? null
  if (!placeId) return NextResponse.json({ error: 'No Google listing on file' }, { status: 404 })
  const url = `https://search.google.com/local/writereview?placeid=${placeId}`
  const png = await QRCode.toBuffer(url, { type: 'png', width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d1d1f', light: '#ffffff' } })
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
}
