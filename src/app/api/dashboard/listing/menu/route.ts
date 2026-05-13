/**
 * /api/dashboard/listing/menu — read + write food menus on the
 * connected GBP listing. v1 mybusinessbusinessinformation.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getClientMenus, updateClientMenus, type FoodMenu } from '@/lib/gbp-menu'
import { createAdminClient } from '@/lib/supabase/admin'

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

  try {
    const admin = createAdminClient()
    const totalSections = body.menus.reduce((acc, m) => acc + (m.sections?.length ?? 0), 0)
    const totalItems = body.menus.reduce(
      (acc, m) => acc + (m.sections?.reduce((s, sec) => s + (sec.items?.length ?? 0), 0) ?? 0),
      0,
    )
    await admin.from('gbp_listing_audit').insert({
      client_id: clientId,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'update_menu',
      fields: { menus: body.menus.length, sections: totalSections, items: totalItems },
      error: result.ok ? null : result.error,
    })
  } catch { /* never block a save on audit failure */ }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
