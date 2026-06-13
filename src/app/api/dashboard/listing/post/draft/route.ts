/**
 * POST /api/dashboard/listing/post/draft — AI-draft a short Google Business
 * Profile post for the owner. Optional { topic }. Read-only; never publishes.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-20250514'

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

  const body = await req.json().catch(() => null) as { topic?: string } | null
  const topic = body?.topic?.trim().slice(0, 200) || null

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('name, business_subtype')
    .eq('id', clientId)
    .maybeSingle()
  const brand = (client?.name as string | null) ?? 'the restaurant'
  const subtype = (client?.business_subtype as string | null) ?? null

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userMsg = [
      `Restaurant: ${brand}${subtype ? ` (${subtype})` : ''}`,
      topic ? `Write the post about: ${topic}` : 'Write an inviting general post (a reason to visit this week).',
    ].join('\n')

    const resp = await claude.messages.create({
      model: MODEL,
      max_tokens: 320,
      system: [
        'You write short posts for a restaurant’s Google Business Profile (the "What’s new" posts that show on Google).',
        'Voice: warm, concrete, appetizing, human. Not a brand bot. No corporate-speak. No hashtag spam (one or none).',
        'A great post: leads with the hook (a special, new dish, event, or update), is specific (name the dish or the deal), and ends with a light nudge to visit or order.',
        'Length: 2 to 4 short sentences. Well under 1500 characters.',
        'Do not invent prices, dates, or facts you were not given — keep it true and easy for the owner to tweak.',
        'Output ONLY the post text. No preamble, no quotes, no markdown.',
      ].join('\n'),
      messages: [{ role: 'user', content: userMsg }],
    })

    const text = resp.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    if (!text) return NextResponse.json({ error: 'Could not draft a post — try again' }, { status: 502 })
    return NextResponse.json({ text })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
