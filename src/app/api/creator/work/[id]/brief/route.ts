import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getWorkOrder, getCreatorIdForUser } from '@/lib/campaigns/work-orders'
import { regenerateCreatorBrief, setOwnerCreative, getBriefSource } from '@/lib/campaigns/creator-brief'

// Mutate one order's creative direction.
//   { action: 'regenerate' }  → re-run the AI (owner OR assigned creator)
//   { creative: {...} }       → save the owner's hand-written direction (owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const order = await getWorkOrder(id)
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const isOwner = (await checkClientAccess(order.clientId)).authorized
  const isCreator = (await getCreatorIdForUser(user.id)) === order.creatorId
  if (!isOwner && !isCreator) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Locked once the piece is executed/closed — mirrors the client's canTweak so a
  // stale tab or a direct call can't rewrite a delivered/approved brief.
  if (['delivered', 'approved', 'declined'].includes(order.status)) {
    return NextResponse.json({ error: `this brief is locked — the order is already ${order.status}` }, { status: 409 })
  }
  const viewer = isOwner ? 'owner' : 'creator'
  const body = (await req.json().catch(() => ({}))) as { action?: string; creative?: unknown }

  if (body.action === 'regenerate') {
    // A creator may regenerate an AI/template brief, but must never replace an
    // owner-authored direction.
    if (!isOwner && (await getBriefSource(id)) === 'owner') {
      return NextResponse.json({ error: 'only the owner can replace their own direction' }, { status: 403 })
    }
    const result = await regenerateCreatorBrief(id)
    return result ? NextResponse.json({ ...result, viewer }) : NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  if (body.creative && typeof body.creative === 'object' && !Array.isArray(body.creative)) {
    if (!isOwner) return NextResponse.json({ error: 'only the owner can write the direction' }, { status: 403 })
    const result = await setOwnerCreative(id, body.creative as Record<string, unknown>)
    return result ? NextResponse.json({ ...result, viewer }) : NextResponse.json({ error: 'a brief needs at least one non-empty field' }, { status: 400 })
  }
  return NextResponse.json({ error: 'no action' }, { status: 400 })
}
