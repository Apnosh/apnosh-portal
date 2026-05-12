/**
 * POST /api/work/billing/tier-fit
 *
 * Finance's AI assist for the renewal conversation. Given a client's
 * tier + monthly rate + 30-day usage signals + retrieval (voice,
 * facts, judgments), the AI returns a verdict + a one-line summary
 * + a pitch the finance manager can paste into the renewal email.
 *
 * Body: { clientId: string }
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

interface Body { clientId: string }
interface TierFitJSON {
  verdict: 'upsell' | 'downsell' | 'hold' | 'churn_risk'
  one_liner: string
  pitch: string
  why: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['finance']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const admin = createAdminClient()

  // Pull client + 30d usage in one shot
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [clientRes, draftsRes, postsRes, repliesRes, reviewsRes, campaignsRes, generationsRes, invoicesRes] = await Promise.all([
    admin.from('clients').select('id, name, tier, monthly_rate, onboarding_date, status').eq('id', body.clientId).maybeSingle(),
    admin.from('content_drafts').select('id, status').eq('client_id', body.clientId).gte('created_at', thirtyDaysAgo),
    admin.from('social_posts').select('total_interactions, reach').eq('client_id', body.clientId).gte('posted_at', thirtyDaysAgo),
    admin.from('social_interactions').select('id').eq('client_id', body.clientId).eq('status', 'replied').gte('reply_at', thirtyDaysAgo),
    admin.from('local_reviews').select('id, rating').eq('client_id', body.clientId).eq('status', 'replied').gte('reply_at', thirtyDaysAgo),
    admin.from('email_campaigns').select('id, opens, clicks').eq('client_id', body.clientId).eq('status', 'sent').gte('sent_at', thirtyDaysAgo),
    admin.from('ai_generations').select('id').eq('client_id', body.clientId).gte('created_at', thirtyDaysAgo),
    admin.from('invoices').select('status, amount_due_cents, paid_at, due_at').eq('client_id', body.clientId).order('issued_at', { ascending: false }).limit(6),
  ])

  if (!clientRes.data) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  const drafts = (draftsRes.data ?? []) as Array<{ status: string }>
  const draftCount = drafts.length
  const approvedCount = drafts.filter(d => ['approved', 'scheduled', 'published'].includes(d.status)).length
  const publishedCount = drafts.filter(d => d.status === 'published').length
  const posts = (postsRes.data ?? []) as Array<{ total_interactions: number | string; reach: number | string }>
  const totalEng = posts.reduce((s, p) => s + Number(p.total_interactions ?? 0), 0)
  const totalReach = posts.reduce((s, p) => s + Number(p.reach ?? 0), 0)
  const repliesSent = (repliesRes.data ?? []).length
  const reviews = (reviewsRes.data ?? []) as Array<{ rating: number }>
  const reviewsAnswered = reviews.length
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviews.length : null
  const campaigns = (campaignsRes.data ?? []) as Array<{ opens: number | string; clicks: number | string }>
  const campaignsSent = campaigns.length
  const totalOpens = campaigns.reduce((s, c) => s + Number(c.opens ?? 0), 0)
  const aiGenerations = (generationsRes.data ?? []).length
  const invoices = (invoicesRes.data ?? []) as Array<{ status: string; amount_due_cents: number | string; paid_at: string | null; due_at: string | null }>
  const now = Date.now()
  const overdueInvoices = invoices.filter(i => (i.status === 'open' || i.status === 'past_due') && i.due_at && new Date(i.due_at).getTime() < now)
  const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.amount_due_cents ?? 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'paid').length
  const latestPaid = invoices.find(i => i.status === 'paid')

  // Retrieval-aware (so the AI sees the client's voice + recent activity)
  const context = await getClientContext(body.clientId)

  const client = clientRes.data
  const tier = (client.tier as string) ?? 'Basic'
  const monthlyRate = client.monthly_rate ? Number(client.monthly_rate) : null
  const onboardedAt = client.onboarding_date as string | null

  const systemPrompt = `You are a finance / account ops lead at a restaurant marketing agency. You analyze a client's tier fit using their actual usage signals and write a one-paragraph pitch the AM can paste into a renewal conversation.

Output JSON only:
  { "verdict": "upsell" | "downsell" | "hold" | "churn_risk",
    "one_liner": "5-12 word headline framing the conversation",
    "pitch": "2-3 sentences. Specific numbers. No corporate-speak. Match the client's voice.",
    "why": "one line on what numbers drove the verdict" }

Rules:
- 'upsell' = client is using heavily and getting outcomes — they should pay more or take a bigger tier.
- 'downsell' = client is paying for capacity they aren't using — preempt a churn move by offering a smaller tier.
- 'hold' = tier is fine; reinforce the value at renewal.
- 'churn_risk' = activity is collapsing, payments are slipping, or both. Recommend a rescue conversation, not just renewal.
- Be SPECIFIC. Reference real numbers from the usage data.
- pitch should match the client's voice (from retrieval). If they're direct, be direct. If they're warm, be warm.
- Don't promise outcomes you can't back up with the numbers.`

  const userPrompt = `Analyze tier fit for this client.

## Client
${client.name}
Tier: ${tier} ($${monthlyRate?.toLocaleString() ?? '?'}/mo)
Onboarded: ${onboardedAt ?? 'unknown'}
Status: ${client.status ?? 'unknown'}

## 30-day usage
- Drafts created: ${draftCount} (${approvedCount} approved, ${publishedCount} published)
- Posts published with outcome data: ${posts.length}
- Total engagement: ${totalEng} on ${totalReach} reach
- DM/comment replies sent: ${repliesSent}
- Reviews answered: ${reviewsAnswered}${avgRating !== null ? ` (avg ${avgRating.toFixed(1)}★)` : ''}
- Email campaigns sent: ${campaignsSent}${totalOpens > 0 ? ` (${totalOpens} total opens)` : ''}
- AI generations consumed: ${aiGenerations}

## Billing
- Recent invoices: ${invoices.length}
- Paid: ${paidInvoices}
- Overdue: ${overdueInvoices.length} ($${(overdueAmount / 100).toLocaleString()})
- Latest paid: ${latestPaid?.paid_at ?? 'never'}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: TierFitJSON | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
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

  await admin
    .from('ai_generations')
    .insert({
      client_id: body.clientId,
      task_type: 'critique',
      model: MODEL,
      input_summary: { kind: 'tier_fit', tier, monthly_rate: monthlyRate, drafts_30d: draftCount, posts_30d: posts.length },
      output_summary: { kind: 'tier_fit', error: parseError, verdict: parsed?.verdict ?? null, why: parsed?.why ?? null },
      raw_text: rawOutput.slice(0, 8000),
      latency_ms: completedAt.getTime() - startedAt.getTime(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error_message: parseError,
      created_by: user.id,
    })

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({ ok: true, fit: parsed })
}
