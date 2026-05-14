/**
 * /api/dashboard/listing/menu — read + write food menus on the
 * connected GBP listing. v1 mybusinessbusinessinformation.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import {
  getClientMenus, updateClientMenus, getClientMenuLink, updateClientMenuLink,
  type FoodMenu,
} from '@/lib/gbp-menu'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('locationId')

  /* Always return the menu link (v1 — works without v4 approval).
     Try the structured menu too, but tolerate failure (most accounts
     don't have v4 yet so this 4xx's). */
  const [linkRes, menusRes] = await Promise.all([
    getClientMenuLink(clientId, locationId),
    getClientMenus(clientId, locationId),
  ])
  const link = linkRes.ok ? linkRes.url : ''
  const menus = menusRes.ok ? menusRes.menus : []
  /* Only surface a hard error if BOTH paths failed — that means the
     listing itself is unreachable, not just v4 being gated. */
  if (!linkRes.ok && !menusRes.ok) {
    return NextResponse.json({ error: linkRes.error }, { status: 502 })
  }
  return NextResponse.json({
    menus,
    menuUrl: link,
    structuredMenusAvailable: menusRes.ok,
  })
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    menus?: FoodMenu[]
    menuUrl?: string
    locationId?: string
  } | null
  if (!body) return NextResponse.json({ error: 'Missing body' }, { status: 400 })

  /* Menu-link only path (v1 — no v4 approval needed). */
  if (typeof body.menuUrl === 'string' && !body.menus) {
    const result = await updateClientMenuLink(clientId, body.menuUrl, body.locationId ?? null)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  if (!body.menus) return NextResponse.json({ error: 'Missing menus or menuUrl' }, { status: 400 })

  const result = await updateClientMenus(clientId, body.menus, body.locationId ?? null)

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
