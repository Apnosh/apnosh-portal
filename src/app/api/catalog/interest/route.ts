/**
 * POST /api/catalog/interest — "Tell me when it's ready" for a coming-soon catalog card.
 *
 * Body: { itemId }. Resolves the caller's own client (never trusts a client-sent id),
 * verifies the id is a real catalog card, records the interest (catalog_interest,
 * migration 224; one row per client+card), and pages the client's strategist so the
 * demand is visible to a human immediately.
 *
 * Degrades honestly: if the table is missing (migration not applied yet), the staff
 * notification still goes out — the owner's ask is never silently dropped — and the
 * response says stored: false.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'
import { CREATE_CATALOG } from '@/lib/campaigns/data/create-catalog'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : ''
  const card = CREATE_CATALOG.find((c) => c.id === itemId)
  if (!card) return NextResponse.json({ error: 'Unknown catalog item' }, { status: 400 })

  const admin = createAdminClient()
  let stored = false
  let already = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from('catalog_interest') as any)
      .insert({ client_id: clientId, item_id: card.id, item_title: card.title })
    if (!error) stored = true
    else if (/duplicate|unique/i.test(error.message ?? '')) { stored = true; already = true }
  } catch { /* table missing (pre-224) — the staff page below still carries the ask */ }

  // A human hears about it either way — interest must never vanish into a dead table.
  if (!already) {
    await notifyStaffForClient(clientId, ['strategist'], {
      kind: 'client_request',
      title: `Owner wants a coming-soon campaign: ${card.title}`,
      body: `They tapped "Tell me when it's ready" on "${card.title}" (${card.id}). Reach out if there is a way to serve the goal today.`,
      link: `/admin/catalog`,
    }).catch(() => ({ notified: 0 }))
  }

  return NextResponse.json({ ok: true, stored })
}
