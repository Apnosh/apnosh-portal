/**
 * Google Business Profile — publish the owner's saved menu to Google.
 *
 *   GET  /api/dashboard/gbp-menu-publish?clientId=…   → { portalItems, googleItems }
 *        (how many menu items we hold vs how many are on Google now — powers the button label)
 *   POST /api/dashboard/gbp-menu-publish  { clientId } → { ok, itemCount } | { error }
 *        (build a Google food menu from the owner's saved menu_items and PATCH it to Google)
 *
 * The owner's menu already lives in the portal (menu_items, from onboarding). Google's
 * food menu is separate and usually empty. This route fills the Google food menu FROM the
 * saved menu — no retyping — using the existing v4 write path (gbp-menu.updateClientMenus).
 *
 * Honesty by construction:
 *   - Publishes ONLY the real saved items (available ones), grouped by their real category.
 *     Nothing is invented; an empty saved menu is refused, not padded.
 *   - After the PATCH we READ THE MENU BACK from Google and only report success with the
 *     item count Google actually returns — never "done" on an unverified write.
 *
 * Auth: checkClientAccess + server-enforced Pro gate (same as gbp-apply / gbp-draft).
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { getClientMenus, updateClientMenus, type FoodMenu, type MenuSection } from '@/lib/gbp-menu'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

interface MenuRow { name?: string | null; description?: string | null; price_cents?: number | null; category?: string | null }

/** price_cents (int) → the plain "8.99" string gbp-menu expects (drops trailing .00). */
function centsToPrice(cents: number | null | undefined): string | undefined {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return undefined
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

/** Read the owner's saved menu items and shape them into ONE Google food menu,
 *  sections = categories, in the order they come back (category, then name). */
async function buildMenuFromPortal(admin: ReturnType<typeof createAdminClient>, clientId: string): Promise<FoodMenu | null> {
  const { data } = await admin
    .from('menu_items')
    .select('name, description, price_cents, category')
    .eq('client_id', clientId)
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  const rows = (data ?? []) as MenuRow[]

  // Group by category, preserving first-seen order; items with no category fall under "Menu".
  const order: string[] = []
  const byCat = new Map<string, MenuSection['items']>()
  for (const r of rows) {
    const name = (r.name ?? '').trim()
    if (!name) continue
    const cat = (r.category ?? '').trim() || 'Menu'
    if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat) }
    const price = centsToPrice(r.price_cents)
    const description = (r.description ?? '').trim()
    byCat.get(cat)!.push({ name, ...(description ? { description } : {}), ...(price ? { price } : {}) })
  }
  const sections: MenuSection[] = order
    .map((cat) => ({ name: cat, items: byCat.get(cat) ?? [] }))
    .filter((s) => s.items.length > 0)
  if (sections.length === 0) return null
  return { name: 'Menu', sections }
}

function countItems(menus: FoodMenu[]): number {
  return menus.reduce((s, m) => s + m.sections.reduce((t, sec) => t + sec.items.length, 0), 0)
}

async function gate(clientId: string | null) {
  if (!clientId) return { fail: NextResponse.json({ error: 'clientId required' }, { status: 400 }) } as const
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return { fail: denied(access.reason) } as const
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return { fail: NextResponse.json({ error: 'Could not reach the menu right now.' }, { status: 502 }) } as const }
  const { data: row } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
  if (!isProTier((row as { tier?: string | null } | null)?.tier)) {
    return { fail: NextResponse.json({ error: 'Putting your menu on Google is on the Pro plan.' }, { status: 403 }) } as const
  }
  return { admin } as const
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const g = await gate(clientId)
  if ('fail' in g) return g.fail
  const built = await buildMenuFromPortal(g.admin, clientId!)
  const portalItems = built ? countItems([built]) : 0
  const live = await getClientMenus(clientId!)
  const googleItems = live.ok ? countItems(live.menus) : 0
  return NextResponse.json({ portalItems, googleItems })
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'clientId required' }, { status: 400 }) }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  const g = await gate(clientId)
  if ('fail' in g) return g.fail

  const menu = await buildMenuFromPortal(g.admin, clientId!)
  if (!menu) {
    return NextResponse.json({ error: 'You have no saved menu items to publish. Add your menu first.' }, { status: 400 })
  }

  const wrote = await updateClientMenus(clientId!, [menu])
  if (!wrote.ok) {
    return NextResponse.json({ error: wrote.error || 'The menu did not save to Google.' }, { status: 502 })
  }

  // Read-back proof: only claim success with the count Google actually returns.
  const back = await getClientMenus(clientId!)
  const itemCount = back.ok ? countItems(back.menus) : 0
  if (!back.ok || itemCount === 0) {
    return NextResponse.json({
      ok: false,
      error: 'Google took the menu but has not shown it back yet. Give it a few minutes and check again.',
    }, { status: 202 })
  }
  return NextResponse.json({ ok: true, itemCount })
}
