/**
 * POST /api/campaigns/ai-draft — the "AI builds it" path.
 *
 * Given a composed campaign (brief + the deliverables to write), makes one
 * real Claude call that drafts on-brand copy for every content/asset piece at
 * once (structured output, so it's a single fast request). Returns a map of
 * line id → { title?, body } the canvas merges onto each line as line.draft.
 *
 * Failures are soft: the create flow proceeds without drafts if this errors.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getClientContext } from '@/lib/ai/get-client-context'
import type { CampaignBrief, LineItem } from '@/lib/campaigns/types'
import { AUDIENCES } from '@/lib/campaigns/data/campaign-templates'

function readApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return m ? m[1].trim() : null
  } catch { return null }
}

const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['drafts'],
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'body'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string', description: 'Subject line / headline where relevant (e.g. an email subject)' },
          body: { type: 'string', description: 'The copy itself — caption, post text, email body, SMS, or event description' },
        },
      },
    },
  },
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId: string | undefined = body.clientId
  const brief: CampaignBrief | undefined = body.brief
  const items: LineItem[] = Array.isArray(body.items) ? body.items : []
  const businessName: string | undefined = body.businessName
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason === 'unauthenticated' ? 'unauthenticated' : 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const apiKey = readApiKey()
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  // Only draft the pieces that actually need copy (skip ops/setup services).
  const draftable = items.filter((it) => it.included && !it.optOut && (it.serviceId.startsWith('content-') || ['graphic', 'gbp-event-post', 'fb-event', 'reminder-send', 'welcome-seq'].includes(it.serviceId)))
  if (!draftable.length) return NextResponse.json({ drafts: {} })

  const audienceText = (brief?.audienceIds ?? []).map((a) => AUDIENCES[a]?.label ?? a).join(', ') || 'your guests'
  const pieces = draftable.map((it) => `- id "${it.id}": ${it.plain} (${it.does})${it.when ? ` — lands ${it.when}` : ''}`).join('\n')

  // Ground the copy in the owner's real brand voice, facts, top posts, and the
  // patterns they've rejected before. Best-effort: if retrieval fails we still
  // draft (just less tailored), matching this route's soft-failure contract.
  const ctx = await getClientContext(clientId).catch(() => null)
  const brandBlock = ctx?.promptSummary
    ? `\nWrite in THIS restaurant's voice. Match the brand voice, honor the known facts, learn from what already works, and avoid anything this client rejects:\n\n${ctx.promptSummary}\n`
    : ''

  const system = `You are a sharp restaurant marketing copywriter at Apnosh. You write short, appetizing, on-brand copy a busy owner would be proud to post.
Rules:
- No em dashes. Short, plain sentences. Concrete and specific.
- Write in the restaurant's own brand voice when brand context is provided. Never sound generic.
- Work the offer in naturally where it fits; never sound spammy.
- Social/reel captions: a strong first line, then a tight follow. Add 2-4 relevant hashtags only where they help.
- Emails: a short subject (title) + a skimmable body with one clear call to action.
- Texts (SMS): under ~160 characters, one clear ask, include an opt-out note only if obvious.
- Event pages / Google posts: a vivid one-paragraph description plus the key details.
Return copy for every id you are given.`

  const user = `Write the copy for this campaign.
Restaurant: ${businessName || ctx?.clientName || 'this restaurant'}
Campaign: ${brief?.objective ?? 'a promotion'}${brief?.offer ? `\nOffer: ${brief.offer.label}` : ''}
Who it's for: ${audienceText}
Projected outcome: ${brief?.projected ?? ''}
${brandBlock}
Draft each of these pieces (use the exact id):
${pieces}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        output_config: { format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json({ error: `model error ${res.status}`, detail }, { status: 502 })
    }
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text) as { drafts?: { id: string; title?: string; body: string }[] }
    const drafts: Record<string, { title?: string; body: string }> = {}
    for (const d of parsed.drafts ?? []) if (d.id && d.body) drafts[d.id] = { title: d.title, body: d.body }
    return NextResponse.json({ drafts })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'draft failed' }, { status: 500 })
  }
}
