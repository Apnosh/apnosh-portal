/**
 * /api/dashboard/listing/menu — read + write food menus on the
 * connected GBP listing. v1 mybusinessbusinessinformation.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientMenus, updateClientMenus, type FoodMenu } from '@/lib/gbp-menu'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const result = await getClientMenus(clientId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ menus: result.menus })
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { menus?: FoodMenu[] } | null
  if (!body?.menus) return NextResponse.json({ error: 'Missing menus' }, { status: 400 })

  const result = await updateClientMenus(clientId, body.menus)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
