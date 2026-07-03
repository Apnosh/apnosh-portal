import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/admin/campaign-orders/:id/line — an admin override for ONE plan line's status.
 * Body { lineId, lock } where lock is the line's ItemLock: 'editable' (not started) | 'in-production'
 * (in progress) | 'delivered' (complete). This is the manual per-service completion tracking (services
 * have no automatic work-order spine yet), so an admin can mark a service in progress or complete, or
 * reset it. Scoped to the order (campaign_id must match) so one order can never touch another's lines.
 * Admin-only: the caller's profile role is checked before the service-role client writes.
 */
const VALID = new Set(['editable', 'in-production', 'delivered'])

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const lineId = typeof body?.lineId === 'string' ? body.lineId : null
  const lock = typeof body?.lock === 'string' && VALID.has(body.lock) ? body.lock : null
  if (!lineId || !lock) return NextResponse.json({ error: 'lineId and a valid status are required' }, { status: 400 })

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('campaign_line_items')
    .update({ lock })
    .eq('id', lineId)
    .eq('campaign_id', id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'line not found on this order' }, { status: 404 })
  // Belt-and-suspenders: the control also calls router.refresh(), but invalidate the page cache too
  // so any other entry point sees the new status.
  revalidatePath(`/admin/campaign-orders/${id}`)
  return NextResponse.json({ ok: true, lineId, lock })
}
