/**
 * GET   /api/work/clients/[clientId]/approval-settings
 * PATCH /api/work/clients/[clientId]/approval-settings
 *
 * Per-client toggles for the content approval flow. Staff configures
 * these during onboarding; owners can also edit via the dashboard
 * (separate route, same store).
 *
 * RLS already gates which clients a non-admin staffer can see, so
 * we just authenticate. The READ path uses the user-scoped client
 * (so an unassigned staffer hits 404); the WRITE path also uses the
 * user-scoped client so RLS enforces write access.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  getApprovalSettings,
  updateApprovalSettings,
  DEFAULT_APPROVAL_SETTINGS,
  type ApprovalSettings,
} from '@/lib/work/approval-settings'

export const dynamic = 'force-dynamic'

const TOGGLE_KEYS: (keyof ApprovalSettings)[] = [
  'media_required_before_approval',
  'client_signoff_required',
  'allow_strategist_direct_publish',
  'auto_publish_on_signoff',
]

async function authorize(clientId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }

  // RLS-gated visibility check. Admin sees all; strategists/onboarders
  // only see clients in role_assignments.
  const { data: row } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (!row) return { ok: false, status: 404, error: 'client not found' }
  return { ok: true }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const auth = await authorize(clientId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const settings = await getApprovalSettings(clientId)
  return NextResponse.json({ settings, defaults: DEFAULT_APPROVAL_SETTINGS })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const auth = await authorize(clientId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as Partial<ApprovalSettings> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  // Keep only known keys with boolean values.
  const patch: Partial<ApprovalSettings> = {}
  for (const k of TOGGLE_KEYS) {
    if (k in body && typeof body[k] === 'boolean') {
      patch[k] = body[k]
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no recognized boolean keys in body' }, { status: 400 })
  }

  const settings = await updateApprovalSettings(clientId, patch)
  return NextResponse.json({ settings })
}
