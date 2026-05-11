/**
 * POST /api/admin/clients/[id]/plan
 *
 * Admin-only. Updates a client's tier, monthly_rate, and allotments.
 * Body: { tier, monthlyRate, allotments: { [key]: number } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TIERS = new Set(['Basic', 'Standard', 'Pro', 'Internal'])
const VALID_ALLOTMENT_KEYS = new Set([
  'social_posts_per_month',
  'website_changes_per_month',
  'seo_updates_per_month',
  'email_campaigns_per_month',
])

interface Body {
  tier?: string | null
  monthlyRate?: number | null
  allotments?: Record<string, number>
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') {
    return new NextResponse('Admin only', { status: 403 })
  }

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.tier !== undefined) {
    if (body.tier !== null && !VALID_TIERS.has(body.tier)) {
      return new NextResponse('Invalid tier', { status: 400 })
    }
    update.tier = body.tier
  }
  if (body.monthlyRate !== undefined) {
    update.monthly_rate = body.monthlyRate
  }
  if (body.allotments !== undefined) {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.allotments)) {
      if (!VALID_ALLOTMENT_KEYS.has(k)) continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) clean[k] = Math.floor(n)
    }
    update.allotments = clean
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update(update)
    .eq('id', id)

  if (error) {
    return new NextResponse(`Could not update: ${error.message}`, { status: 500 })
  }

  await admin.from('events').insert({
    client_id: id,
    event_type: 'plan.updated',
    subject_type: 'client',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'admin',
    summary: `Plan updated to ${body.tier ?? 'unchanged'}${body.monthlyRate != null ? ` · $${body.monthlyRate}/mo` : ''}`,
    payload: update,
  })

  return NextResponse.json({ ok: true })
}
