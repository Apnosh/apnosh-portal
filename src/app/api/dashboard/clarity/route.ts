/**
 * Save the client's Microsoft Clarity project ID. Only the owner
 * or admin can set it.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { clientId?: string; projectId?: string } | null
  if (!body) return NextResponse.json({ error: 'Missing body' }, { status: 400 })
  /* The body's clientId is purely advisory; the auth-resolved
     clientId is the one we trust. */
  if (body.clientId && body.clientId !== clientId) {
    return NextResponse.json({ error: 'Client mismatch' }, { status: 403 })
  }
  const trimmed = (body.projectId ?? '').trim()
  /* Clarity IDs are 10-char alphanumeric. Allow empty to clear. */
  if (trimmed && !/^[a-z0-9]{8,16}$/i.test(trimmed)) {
    return NextResponse.json({ error: 'Project ID should be 8-16 alphanumeric characters' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({ clarity_project_id: trimmed || null })
    .eq('id', clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('clarity_project_id')
    .eq('id', clientId)
    .maybeSingle()
  return NextResponse.json({ projectId: data?.clarity_project_id ?? null })
}
