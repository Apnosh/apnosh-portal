/**
 * PATCH  /api/work/clients/[clientId]/facts/[id]  — supersede / edit
 * DELETE /api/work/clients/[clientId]/facts/[id]  — archive (active=false)
 *
 * Facts are intentionally NOT hard-deleted by default — the audit
 * trail matters, and a superseded_by chain preserves how knowledge
 * evolved.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clientId: string; id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as {
    fact?: string; confidence?: string;
  } | null

  const updates: Record<string, unknown> = {}
  if (typeof body?.fact === 'string') updates.fact = body.fact.trim().slice(0, 4000)
  if (typeof body?.confidence === 'string') updates.confidence = body.confidence

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('client_knowledge_facts')
    .update(updates)
    .eq('id', id)
    .select('id, fact, confidence')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, fact: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ clientId: string; id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const { error } = await supabase
    .from('client_knowledge_facts')
    .update({ active: false })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
