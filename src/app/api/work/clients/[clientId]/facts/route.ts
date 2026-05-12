/**
 * GET  /api/work/clients/[clientId]/facts        — list facts (RLS-scoped)
 * POST /api/work/clients/[clientId]/facts        — add a fact
 *
 * RLS already enforces who can see / write what (migration 107). We
 * just authenticate and trust the policies.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { FACT_CATEGORIES, type FactCategory, type FactConfidence, type FactSource } from '@/lib/work/fact-types'

export const dynamic = 'force-dynamic'

const VALID_SOURCES = new Set<FactSource>([
  'strategist_note', 'client_conversation', 'onboarding',
  'observation', 'ai_extracted', 'public_data', 'review_mining',
])
const VALID_CONFIDENCE = new Set<FactConfidence>(['low', 'medium', 'high', 'verified'])

export async function GET(_req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { clientId } = await ctx.params

  const { data, error } = await supabase
    .from('client_knowledge_facts')
    .select('id, category, fact, source, confidence, recorded_at, recorded_by, active')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('recorded_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ facts: data ?? [] })
}

interface PostBody {
  category?: string
  fact?: string
  source?: string
  confidence?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { clientId } = await ctx.params
  const body = (await req.json().catch(() => null)) as PostBody | null
  if (!body?.category || !body?.fact) {
    return NextResponse.json({ error: 'category and fact required' }, { status: 400 })
  }
  if (!FACT_CATEGORIES.includes(body.category as FactCategory)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })
  }
  const source: FactSource = body.source && VALID_SOURCES.has(body.source as FactSource)
    ? body.source as FactSource
    : 'strategist_note'
  const confidence: FactConfidence = body.confidence && VALID_CONFIDENCE.has(body.confidence as FactConfidence)
    ? body.confidence as FactConfidence
    : 'medium'

  const { data, error } = await supabase
    .from('client_knowledge_facts')
    .insert({
      client_id: clientId,
      category: body.category,
      fact: body.fact.trim().slice(0, 4000),
      source,
      confidence,
      recorded_by: user.id,
      active: true,
    })
    .select('id, category, fact, source, confidence, recorded_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, fact: data })
}
