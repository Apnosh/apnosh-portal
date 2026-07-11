/**
 * POST /api/admin/catalog-content/draft  { itemId } — "Draft with AI" for the
 * campaign content CMS (Phase C1). Returns SUGGESTIONS for description / why /
 * expectation; nothing is saved here — the admin reviews and saves (or discards).
 *
 * Grounded strictly in what the campaign really is: its canonical title + tagline
 * (CAMPAIGN_CONTENT) and the plain names + deliverables of the services its plan
 * actually composes (composePlanForGoal -> the priced catalog). The model is told
 * to invent nothing: no numbers, no percentages, no services beyond the list.
 *
 * AI call goes through the shared structured-output helper
 * (campaigns/planning/anthropic.ts — returns null on any failure). Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callStructuredOutput } from '@/lib/campaigns/planning/anthropic'
import { CAMPAIGN_CONTENT, type CampaignContent } from '@/lib/campaigns/data/campaign-content'
import { composePlanForGoal } from '@/lib/campaigns/builder/compose-plan'
import { serviceById, plainNameOf } from '@/lib/campaigns/catalog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const FAIL = 'Could not write a draft right now. Try again in a minute.'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'why', 'expectation'],
  properties: {
    description: { type: 'string', description: 'What this campaign is and does, 1-2 plain sentences.' },
    why: { type: 'string', description: 'Why it matters for a local restaurant owner, 1-2 plain sentences.' },
    expectation: { type: 'string', description: 'One small, honest sentence about how results tend to land.' },
  },
} as const

/** The copy rules the code records live under; drafts obey them too. */
const scrub = (s: string): string => s.replace(/\s*—\s*/g, ', ').replace(/\s{2,}/g, ' ').trim()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const itemId = body && typeof body.itemId === 'string' ? body.itemId : ''
  const content = (CAMPAIGN_CONTENT as Record<string, CampaignContent | undefined>)[itemId]
  if (!content) return NextResponse.json({ error: 'unknown campaign id' }, { status: 400 })

  // Ground in the services this campaign REALLY composes (plain names + real deliverables).
  let services: { name: string; deliverables: string[] }[] = []
  try {
    const plan = composePlanForGoal(itemId, {})
    services = (plan.serviceIds ?? [])
      .map((sid) => serviceById(sid))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ name: plainNameOf(s), deliverables: (s.deliverables?.included ?? []).slice(0, 6) }))
      .slice(0, 8)
  } catch {
    services = []
  }

  const system = [
    'You write product copy for a marketing store that sells campaigns to local restaurant owners.',
    'Write in plain 5th-grade words. Sentence case. Short sentences.',
    'Never use an em dash. Use a comma or a period instead.',
    'Never invent numbers, percentages, or results. No hype words.',
    'Only mention things in the campaign facts you are given. Do not invent services or deliverables.',
    'description = what this campaign is and does, 1-2 sentences.',
    'why = why it matters for a local restaurant owner, 1-2 sentences. It must not repeat the description.',
    'expectation = one small, honest sentence about how results tend to land (slowly, over weeks, a few at a time).',
  ].join('\n')

  const userMsg = JSON.stringify({
    campaign_title: content.title,
    campaign_tagline: content.tagline,
    services,
    current_description: content.description,
    current_why: content.why,
    current_expectation: content.expectation,
  })

  const out = await callStructuredOutput<{ description: string; why: string; expectation: string }>({
    system,
    user: `Write fresh copy for this campaign. Facts:\n${userMsg}`,
    schema: SCHEMA,
    maxTokens: 600,
  })
  if (!out || !out.description?.trim() || !out.why?.trim() || !out.expectation?.trim()) {
    return NextResponse.json({ error: FAIL }, { status: 502 })
  }

  return NextResponse.json({
    draft: {
      description: scrub(out.description),
      why: scrub(out.why),
      expectation: scrub(out.expectation),
    },
  })
}
