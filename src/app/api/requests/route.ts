/**
 * /api/requests — the creative request rail (owner side).
 *
 * POST: submit a request. The payload is re-validated against the catalog server side
 * (same rules as the UI) so a hand-rolled call cannot land garbage. Requests never
 * charge; they notify staff and land in the admin queue.
 * GET: the signed-in owner's own requests, newest first.
 *
 * Failure honesty: if the creative_requests table is missing (migration 235 not applied
 * yet), the owner gets a calm "still setting up" message, never a stack trace.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest, isMissingRequestsTable as isMissingTable } from '@/lib/requests/create'
import { campaignCheckoutEnabled } from '@/lib/checkout-gate'

export const runtime = 'nodejs'

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  let body: { type?: string; answers?: unknown; attachments?: unknown; due_date?: unknown; order?: unknown; design?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }

  /* The whole lane — validation, server-side pricing, the row, the work order, staff notice —
     lives in createCreativeRequest so the Announce commit lands the same rows this route does. */
  const r = await createCreativeRequest({
    clientId, userId: user.id, type: String(body.type ?? ''), answers: body.answers,
    attachments: body.attachments, due_date: body.due_date, order: body.order === true, design: body.design,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const isOrder = body.order === true
  return NextResponse.json({
    ok: true,
    request: r.row,
    ...(isOrder ? { order: { amount_cents: r.orderCents, needs_payment: r.needsPayment, work_order_id: r.workOrderId, monthly: r.monthly, assigned: r.assigned } } : {}),
  })
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const V2_SELECT = 'id, type, brief, status, team_note, created_at, updated_at, due_date, attachments, quote_cents, accepted_at, notes:creative_request_notes(id, author_role, body, created_at)'
  let { data, error } = await admin
    .from('creative_requests')
    .select(V2_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)
  /* Pre-236 schema: fall back to the v1 shape so the list still loads. */
  if (error) {
    const fb = await admin
      .from('creative_requests')
      .select('id, type, brief, status, team_note, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    data = fb.data as unknown as typeof data
    error = fb.error
  }
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ requests: [], tillOpen: campaignCheckoutEnabled() })
    return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  }
  /* The card switch, echoed so the accept button promises what the accept route will actually do.
   * With it off the yes mints the work and the bill follows; the screen has to say that, not
   * "your card opens next" at a till that cannot take one. */
  return NextResponse.json({ requests: data ?? [], tillOpen: campaignCheckoutEnabled() })
}
