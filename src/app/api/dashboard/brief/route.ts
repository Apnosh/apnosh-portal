/**
 * Today's brief — AI-generated 60-80 word morning briefing for the
 * dashboard. Pulls aggregate stats for the past 7 days, sends to Claude
 * with an "AI marketing assistant" system prompt, returns the brief.
 *
 * Caching: we look for a recent brief in `ai_generations` (task_type =
 * 'dashboard_brief'). If one exists generated within the last 24 hours,
 * return it. Otherwise generate a fresh one.
 *
 * No new tables needed — `ai_generations` already has all the columns
 * (raw_text, output_summary, generated at, etc.).
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logGeneration } from '@/lib/ai/log-generation'

export const maxDuration = 30

const SYSTEM = `You are a senior AI marketing assistant for a restaurant owner. Write the dashboard's morning brief.

Voice: calm, confident, practical. Like an experienced operations partner who already knows the business inside out. Never salesy. Never chipper. Never use exclamation marks. Plain language a busy person reads in five seconds.

Output: 60-80 words. Plain text. Three or four short sentences. No headings, no bullet points, no markdown.

Always end with the most urgent thing — either a decision they need to make today, or what to keep an eye on this week. If everything is genuinely fine, end with one observation about what's working.

Open with a status sentence (one of):
- "Quiet weekend on search..." (when something is down/unusual)
- "Busy week — bookings up..." (when something is up)
- "Holding steady this week." (when nothing has changed materially)
- "All quiet on the marketing front." (when everything is fine and nothing notable)

Anchor every claim in the data you receive. Do NOT invent numbers. If a metric is missing, just don't mention it.`.trim()

interface BriefRequest {
  clientId: string
  /** force regenerate even if a fresh cached brief exists */
  refresh?: boolean
}

interface BriefData {
  text: string
  generatedAt: string
  model: string
  cached: boolean
}

const FALLBACK = (clientName: string) =>
  `Welcome to your dashboard. Once your accounts are connected, your daily brief will appear here every morning — what's moving, what needs your attention, and what to watch this week.`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as BriefRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify the user is allowed to read briefs for this client. Admins can read any;
  // a client user must be linked to this client.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin' && profile?.client_id !== body.clientId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Check for a cached brief (< 24 hours old)
  if (!body.refresh) {
    const { data: cached } = await admin
      .from('ai_generations')
      .select('raw_text, model, created_at')
      .eq('client_id', body.clientId)
      .eq('task_type', 'dashboard_brief')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached?.raw_text) {
      return NextResponse.json({
        text: cached.raw_text,
        generatedAt: cached.created_at,
        model: cached.model,
        cached: true,
      } satisfies BriefData)
    }
  }

  // Pull data for the brief
  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', body.clientId)
    .maybeSingle()

  if (!client?.name) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Aggregate the past 7 + previous 7 days for reach, reviews, posts, approvals
  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * 86400000)
  const d14 = new Date(now.getTime() - 14 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const [socialThis, socialPrev, reviewsThis, generationsThis, pendingApprovals] = await Promise.all([
    admin.from('social_metrics').select('reach, impressions, profile_visits').eq('client_id', body.clientId).gte('date', fmt(d7)),
    admin.from('social_metrics').select('reach, impressions, profile_visits').eq('client_id', body.clientId).gte('date', fmt(d14)).lt('date', fmt(d7)),
    admin.from('reviews').select('rating, created_at').eq('client_id', body.clientId).gte('created_at', d7.toISOString()),
    admin.from('ai_generations').select('task_type, applied').eq('client_id', body.clientId).gte('created_at', d7.toISOString()).eq('applied', true),
    admin.from('deliverables').select('id', { count: 'exact', head: true }).eq('business_id', body.clientId).eq('status', 'client_review'),
  ])

  const sum = <T extends Record<string, unknown>>(rows: T[] | null, field: keyof T): number =>
    (rows ?? []).reduce((acc, r) => acc + Number(r[field] ?? 0), 0)

  const thisReach = sum(socialThis.data, 'reach')
  const prevReach = sum(socialPrev.data, 'reach')
  const reachChangePct = prevReach > 0 ? Math.round(((thisReach - prevReach) / prevReach) * 100) : null

  const reviews = reviewsThis.data ?? []
  const newReviewCount = reviews.length
  const avgStar = reviews.length > 0 ? (reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviews.length) : null

  const postsApplied = (generationsThis.data ?? []).filter(g =>
    g.task_type === 'social_post' || g.task_type === 'caption' || g.task_type === 'design'
  ).length

  const approvalsCount = pendingApprovals.count ?? 0

  // If there's literally no data, return a graceful fallback
  if (!thisReach && !prevReach && !newReviewCount && !postsApplied && !approvalsCount) {
    return NextResponse.json({
      text: FALLBACK(client.name),
      generatedAt: new Date().toISOString(),
      model: 'fallback',
      cached: false,
    } satisfies BriefData)
  }

  const dataBlock = [
    `Business: ${client.name}`,
    thisReach ? `Social reach this week: ${thisReach.toLocaleString()} (vs ${prevReach.toLocaleString()} prior week, ${reachChangePct !== null ? `${reachChangePct >= 0 ? '+' : ''}${reachChangePct}%` : 'no comparable data'})` : 'Social reach: no data yet',
    newReviewCount > 0 ? `New reviews this week: ${newReviewCount} (${avgStar ? avgStar.toFixed(1) + ' avg' : ''})` : 'No new reviews this week',
    postsApplied > 0 ? `Content applied this week: ${postsApplied} pieces` : null,
    approvalsCount > 0 ? `Pending owner approvals: ${approvalsCount}` : 'No pending approvals',
    `Today: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
  ].filter(Boolean).join('\n')

  // Generate
  let text = ''
  let modelUsed = 'claude-sonnet'
  const startedAt = Date.now()
  try {
    const anthropic = new Anthropic()
    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Here's the data for today's brief:\n\n${dataBlock}\n\nWrite the brief.` }],
    })
    const block = result.content[0]
    text = block.type === 'text' ? block.text.trim() : ''
    modelUsed = result.model
  } catch (e) {
    // On Claude failure, return a deterministic fallback so the UI never breaks
    text = (() => {
      const parts: string[] = []
      if (reachChangePct !== null && Math.abs(reachChangePct) >= 10) {
        parts.push(`${reachChangePct < 0 ? 'Quiet' : 'Strong'} week on social — reach ${reachChangePct >= 0 ? 'up' : 'down'} ${Math.abs(reachChangePct)}% vs last week.`)
      } else {
        parts.push(`Holding steady this week.`)
      }
      if (newReviewCount > 0) parts.push(`${newReviewCount} new review${newReviewCount === 1 ? '' : 's'} (${avgStar?.toFixed(1) ?? '?'}★ avg).`)
      if (postsApplied > 0) parts.push(`You shipped ${postsApplied} pieces of content.`)
      if (approvalsCount > 0) parts.push(`${approvalsCount} item${approvalsCount === 1 ? '' : 's'} waiting for your approval.`)
      else parts.push(`Nothing waiting on you right now.`)
      return parts.join(' ')
    })()
    modelUsed = 'fallback-template'
    void e
  }

  // Log the generation (this also acts as our cache)
  await logGeneration({
    clientId: body.clientId,
    taskType: 'dashboard_brief',
    promptId: 'dashboard-brief',
    promptVersion: 'v1',
    model: modelUsed,
    inputSummary: { thisReach, prevReach, reachChangePct, newReviewCount, avgStar, postsApplied, approvalsCount },
    outputSummary: { wordCount: text.split(/\s+/).length },
    rawText: text,
    latencyMs: Date.now() - startedAt,
    createdBy: user.id,
  })

  return NextResponse.json({
    text,
    generatedAt: new Date().toISOString(),
    model: modelUsed,
    cached: false,
  } satisfies BriefData)
}

// GET: same as POST but reads cached only (or generates if no cache)
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  return POST(new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ clientId }),
  }))
}
