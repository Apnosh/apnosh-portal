/**
 * POST /api/work/onboarding/bootstrap
 *
 * Onboarder's AI assist. Takes raw discovery info from a new
 * restaurant (name, location, cuisine, owner, social handle, tier)
 * and proposes:
 *   - brand voice paragraph
 *   - a starter set of client_knowledge_facts
 *   - one editorial theme to kick off month 1
 *
 * Returns a JSON proposal. The onboarder reviews + edits, then hits
 * /commit to actually create the rows.
 *
 * This generation isn't scoped to an existing client (the client
 * doesn't exist yet), so the audit row attaches via the onboarder's
 * own person_id rather than a client_id. We log to ai_generations
 * with a NULL-ish marker so it's filterable.
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

interface Body {
  name: string
  location: string       // e.g. "Capitol Hill, Seattle"
  cuisine: string        // e.g. "Vietnamese / Pho"
  ownerName: string
  socialHandle?: string  // e.g. "@vinasonpho"
  serviceTier?: 'starter' | 'growth' | 'scale'
  discoveryNotes?: string  // free-form notes from the call
}

interface BootstrapProposal {
  voice_summary: string          // ~3 sentence brand voice description
  voice_traits: string[]         // 3-5 quick descriptors
  pet_peeves: string[]           // 2-3 things to avoid (saves them from corporate filler)
  facts: Array<{ category: string; value: string; rationale: string }>
  opening_theme: {
    theme_name: string
    theme_blurb: string
    pillars: string[]
  }
  why: string
}

const VALID_FACT_CATEGORIES = [
  'menu_signature', 'menu_dietary', 'hours_window', 'location_detail',
  'team_owner', 'team_member', 'origin_story', 'community_tie',
  'differentiator', 'pet_peeve', 'voice_note',
]

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.name || !body.location || !body.cuisine || !body.ownerName) {
    return NextResponse.json({ error: 'name, location, cuisine, ownerName required' }, { status: 400 })
  }

  const systemPrompt = `You are a senior brand strategist onboarding a new restaurant to a marketing agency. You take 5 minutes of discovery notes and produce a starter brand foundation the rest of the team can build on.

Output JSON only:
  { "voice_summary": "3-sentence paragraph capturing how this restaurant should sound — match their actual personality from the discovery notes, don't default to corporate warm-fuzzy",
    "voice_traits": ["3-5 punchy descriptors — direct/dry, hyper-local, food-obsessed, etc"],
    "pet_peeves": ["2-3 specific things to NEVER do — e.g. 'never call ourselves authentic', 'no superlatives like best/finest'"],
    "facts": [
      { "category": "menu_signature" | "menu_dietary" | "hours_window" | "location_detail" | "team_owner" | "team_member" | "origin_story" | "community_tie" | "differentiator" | "pet_peeve" | "voice_note",
        "value": "the actual fact, ~1 sentence",
        "rationale": "one short line on why this matters for content" }
      // produce 6-10 facts grounded in the discovery notes; don't invent specifics not implied by the notes
    ],
    "opening_theme": {
      "theme_name": "5-8 words — month 1 angle",
      "theme_blurb": "2-3 sentences positioning the theme",
      "pillars": ["3-5 content pillars supporting the theme"]
    },
    "why": "one short line on what you anchored on" }

Rules:
- Be SPECIFIC and grounded. If the discovery notes don't say something, don't invent it — but extrapolate sensible facts from cuisine + location.
- voice_summary: avoid "friendly and welcoming" platitudes. Pick a real personality.
- facts: tie each to content potential. "Owner Lucas grew up in Saigon" → category team_owner; "Open 11am-9pm but lunch is the rush window 11:30-1pm" → hours_window.
- opening_theme: appropriate to the season (it's spring 2026 right now) and the cuisine.`

  const userPrompt = `Onboard this new restaurant client.

## Basics
Name: ${body.name}
Cuisine: ${body.cuisine}
Location: ${body.location}
Owner: ${body.ownerName}
${body.socialHandle ? `Social: ${body.socialHandle}` : ''}
${body.serviceTier ? `Service tier: ${body.serviceTier}` : ''}

${body.discoveryNotes ? `## Discovery call notes\n${body.discoveryNotes}` : '## Discovery call notes\n(none — extrapolate sensibly from basics)'}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: BootstrapProposal | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    inputTokens = msg.usage.input_tokens
    outputTokens = msg.usage.output_tokens
    const block = msg.content.find(c => c.type === 'text')
    rawOutput = block ? (block as { type: 'text'; text: string }).text : ''
    const jsonStart = rawOutput.indexOf('{')
    const jsonEnd = rawOutput.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON in response')
    parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1))
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  // Filter facts to valid categories (AI sometimes invents categories).
  if (parsed?.facts) {
    parsed.facts = parsed.facts.filter(f => VALID_FACT_CATEGORIES.includes(f.category))
  }

  const completedAt = new Date()
  const admin = createAdminClient()

  // We don't yet have a client_id; use the first existing client as anchor for FK
  // (the row is informational; consumers filter by input_summary.kind).
  const { data: anchor } = await supabase.from('clients').select('id').limit(1).maybeSingle()
  if (anchor) {
    await admin
      .from('ai_generations')
      .insert({
        client_id: anchor.id,
        task_type: 'generate',
        model: MODEL,
        input_summary: { kind: 'onboarding_bootstrap', candidate_name: body.name },
        output_summary: { kind: 'onboarding_bootstrap', error: parseError, fact_count: parsed?.facts?.length ?? null, why: parsed?.why ?? null },
        raw_text: rawOutput.slice(0, 8000),
        latency_ms: completedAt.getTime() - startedAt.getTime(),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        error_message: parseError,
        created_by: user.id,
      })
  }

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({ ok: true, proposal: parsed })
}
