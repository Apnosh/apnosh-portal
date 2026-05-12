/**
 * POST /api/work/web/draft
 *
 * Web team's AI assist. Drafts page copy (headline + subhead + body
 * + CTA) for a client + page kind, grounded in the standard retrieval
 * contract. Writes a web_page_drafts row + audit row.
 *
 * Body: { clientId, pageKind, angle?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getClientContext } from '@/lib/ai/get-client-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

const VALID_KINDS = [
  'home_hero', 'about', 'menu_intro', 'reservation_cta',
  'catering', 'contact', 'press', 'careers', 'other',
]

interface Body { clientId: string; pageKind: string; angle?: string | null }
interface PageCopyJSON {
  headline: string
  subhead: string
  body_md: string
  cta_text: string
  cta_url?: string
  why?: string
}

function kindGuidance(kind: string): string {
  switch (kind) {
    case 'home_hero':       return 'A web hero section. 1 sharp headline, 1 supporting subhead, ~30-60 word body that anchors what the place IS, primary CTA.'
    case 'about':           return 'About page. Origin, people, what makes them them. ~150-250 words. CTA usually "Reserve a table" or "Order online".'
    case 'menu_intro':      return 'Menu page intro (header above the menu items). Short — 2-3 sentences positioning the cuisine + the chef. No exhaustive item lists.'
    case 'reservation_cta': return 'Reservation CTA block. ~60-100 words. Concrete: party size, lead time, any policy. CTA "Book a table".'
    case 'catering':        return "Catering page. Who they serve (corporate, weddings, etc), capacity range, lead time, what they DON'T do. CTA \"Get a catering quote\"."
    case 'contact':         return 'Contact page intro. Brief, warm. Hours + best way to reach them.'
    case 'press':           return 'Press / media kit copy. ~100 words positioning the brand for journalists. CTA to contact for interviews.'
    case 'careers':         return 'Careers page intro. What the place values in hires. Honest about pace + culture. CTA "Apply".'
    default:                return 'Free-form page copy.'
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['web_ops', 'web_designer', 'web_developer']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.clientId || !body.pageKind || !VALID_KINDS.includes(body.pageKind)) {
    return NextResponse.json({ error: 'clientId + valid pageKind required' }, { status: 400 })
  }

  const context = await getClientContext(body.clientId)
  const guidance = kindGuidance(body.pageKind)

  const systemPrompt = `You are a senior web copywriter for restaurants. You write page copy that converts without sounding like a Squarespace template.

Output JSON only:
  { "headline": "5-12 words",
    "subhead": "supporting line, ~10-20 words",
    "body_md": "the main body. Plain text or light markdown. Length per page kind below.",
    "cta_text": "2-4 word CTA button label",
    "cta_url": "optional path/URL — only if obvious from facts (e.g. /menu, /reserve)",
    "why": "one short line on the voice + retrieval signals you used" }

Page kind: ${guidance}

Rules:
- Match the client's voice EXACTLY. Direct, dry, warm — whatever the retrieval shows.
- No corporate filler ("welcome to...", "we pride ourselves...", "experience the").
- Be specific. Reference the actual facts (chef, hours, neighborhood, dishes) where they help.
- No emojis. No exclamation points.
- Avoid the rejection patterns this client has flagged.`

  const userPrompt = `Draft ${body.pageKind.replace(/_/g, ' ')} copy.

${body.angle ? `## Angle the operator wants pushed\n${body.angle}\n` : ''}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: PageCopyJSON | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
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

  const completedAt = new Date()
  const admin = createAdminClient()

  const aiGenInsert = await admin
    .from('ai_generations')
    .insert({
      client_id: body.clientId,
      task_type: 'generate',
      model: MODEL,
      input_summary: { kind: 'web_page', page_kind: body.pageKind, angle: body.angle ?? null },
      output_summary: { kind: 'web_page', error: parseError, headline_chars: parsed?.headline?.length ?? null, body_chars: parsed?.body_md?.length ?? null, why: parsed?.why ?? null },
      raw_text: rawOutput.slice(0, 8000),
      latency_ms: completedAt.getTime() - startedAt.getTime(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error_message: parseError,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle()

  const generationId = aiGenInsert.data?.id as string | undefined
  if (generationId) {
    await admin.from('ai_generation_inputs').insert({
      generation_id: generationId,
      client_id: body.clientId,
      prompt: userPrompt.slice(0, 8000),
      retrieved_facts: context.retrieval.factIds,
      retrieved_posts: context.retrieval.postIds,
      retrieved_drafts: context.retrieval.crossClientDraftIds,
      retrieved_judgments: context.retrieval.judgmentIds,
      brand_voice_version: context.retrieval.brandVersion,
      theme_version: null,
      cross_client_signal: context.crossClientSignal.length > 0
        ? { count: context.crossClientSignal.length, descriptors: context.crossClientSignal.map(s => s.anonDescriptor) }
        : null,
      model: MODEL,
    })
  }

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  // Insert the page draft
  const { data: pageDraft, error: insertErr } = await admin
    .from('web_page_drafts')
    .insert({
      client_id: body.clientId,
      page_kind: body.pageKind,
      headline: parsed.headline,
      subhead: parsed.subhead,
      body_md: parsed.body_md,
      cta_text: parsed.cta_text,
      cta_url: parsed.cta_url ?? null,
      status: 'draft',
      ai_assisted: true,
      ai_generation_ids: generationId ? [generationId] : [],
      brand_voice_version: context.retrieval.brandVersion,
      created_by: user.id,
    })
    .select('id, client_id, page_kind, page_label, headline, subhead, body_md, cta_text, cta_url, status, ai_assisted, created_at, updated_at')
    .maybeSingle()

  if (insertErr || !pageDraft) {
    return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
  }

  // Resolve client name for the returned row
  const { data: client } = await supabase.from('clients').select('name').eq('id', body.clientId).maybeSingle()

  return NextResponse.json({
    ok: true,
    row: {
      id: pageDraft.id,
      clientId: pageDraft.client_id,
      clientName: (client?.name as string) ?? null,
      pageKind: pageDraft.page_kind,
      pageLabel: pageDraft.page_label,
      headline: pageDraft.headline,
      subhead: pageDraft.subhead,
      bodyMd: pageDraft.body_md,
      ctaText: pageDraft.cta_text,
      ctaUrl: pageDraft.cta_url,
      status: pageDraft.status,
      aiAssisted: pageDraft.ai_assisted,
      createdAt: pageDraft.created_at,
      updatedAt: pageDraft.updated_at,
    },
  })
}
