/**
 * GET /api/dashboard/delivery-menu — the client's own menu, priced for a delivery app.
 *
 * No delivery-app API is involved and none exists for us. The menu comes from menu_items, which is
 * the same table the onboarding flow fills and the content work already reads. The commission rate
 * comes from the caller, because it is on their statement and not something we can look up.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMenuReport, APPS, type AppKey, type MenuItem } from '@/lib/delivery/menu-fix'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const appKey = (req.nextUrl.searchParams.get('app') ?? 'doordash') as AppKey
  const app = APPS[appKey] ? appKey : 'other'
  const rawRate = Number(req.nextUrl.searchParams.get('rate'))
  // Clamp rather than trust: a rate of 0 or 1 makes the arithmetic meaningless or infinite.
  const rate = Number.isFinite(rawRate) && rawRate > 0.01 && rawRate < 0.6 ? rawRate : 0.30

  const admin = createAdminClient()
  // The real schema: price_cents (nullable — a plain bagel has no price) and NO food-cost column.
  // The first version of this select asked for `price` and `food_cost`, neither of which exists,
  // so the card errored on every real menu. Caught by the S4 signal-reader work reading the same
  // table.
  const { data, error } = await admin
    .from('menu_items')
    .select('id, name, price_cents')
    .eq('client_id', clientId)
    .eq('kind', 'item')
    .not('price_cents', 'is', null)
    .limit(200)

  if (error) return NextResponse.json({ error: 'We could not read your menu.' }, { status: 500 })

  const items: MenuItem[] = (data ?? [])
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      price: (Number(r.price_cents) || 0) / 100,
      // No food-cost column exists in the schema, so no item carries one and the report says
      // plainly that the advice protects percentage, not dollars. When a costs column ships,
      // this is the one line that changes.
    }))
    .filter((i) => i.name && i.price > 0)

  return NextResponse.json(buildMenuReport(items, app, rate))
}
