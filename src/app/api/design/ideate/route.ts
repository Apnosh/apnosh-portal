/**
 * POST /api/design/ideate — help the owner FIGURE OUT the post, not just fill blanks.
 *
 * Built 2026-08-21 after the owner tried "the story behind the owners" and the
 * words step offered headline / when / deal — promo slots that do nothing for a
 * half-formed idea. This takes whatever they typed and returns three concrete
 * DIRECTIONS: an angle, a headline, a supporting line, and what to feature.
 * Tapping one fills the fields; everything stays editable.
 *
 * Same honesty rules as every AI surface: direct transport, hard timeout, and a
 * deterministic fallback so a broken model never kills the button.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

interface Direction { angle: string; headline: string; subline: string; feature: string }

const FALLBACK: Direction[] = [
  { angle: 'The people', headline: 'Meet the faces behind it', subline: 'The story of who we are and why we cook', feature: 'A warm photo of the owners or team together' },
  { angle: 'The journey', headline: 'How it all started', subline: 'From the first day to today, in one post', feature: 'An early photo next to a recent one' },
  { angle: 'The why', headline: 'Why we do this', subline: 'The thing that keeps us opening the doors every day', feature: 'A candid moment with a guest or a signature dish' },
]

async function aiDirections(brief: string, businessName: string): Promise<Direction[] | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `A restaurant called "${businessName}" wants a social graphic about: ${brief}\n\nThe owner has not fully planned it. Give 3 distinct creative directions. Reply with ONLY a JSON array of 3 objects: {"angle": string (2-4 word name for the direction), "headline": string (max 6 words, goes on the graphic), "subline": string (max 14 words, supports the headline), "feature": string (one plain sentence: what photo or content to feature)}. Plain warm language, no hashtags, no quotes inside strings.`,
        }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) { console.warn('[design ideate] ai failed:', res.status); return null }
    const data = await res.json() as { content?: { text?: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return null
    const arr = JSON.parse(m[0]) as Partial<Direction>[]
    const out = arr
      .filter((d) => typeof d.headline === 'string' && typeof d.subline === 'string')
      .slice(0, 3)
      .map((d) => ({
        angle: String(d.angle ?? 'A direction').slice(0, 40),
        headline: String(d.headline).slice(0, 80),
        subline: String(d.subline).slice(0, 140),
        feature: String(d.feature ?? '').slice(0, 200),
      }))
    return out.length > 0 ? out : null
  } catch (e) {
    console.warn('[design ideate] ai error:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { brief?: string }
  try { body = await req.json() } catch { body = {} }
  const brief = typeof body.brief === 'string' && body.brief.trim() ? body.brief.trim().slice(0, 400) : null
  if (!brief) return NextResponse.json({ error: 'Say what the post is about first' }, { status: 400 })

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('id, name').eq('owner_id', user.id).maybeSingle()
  let name = biz?.name as string | undefined
  if (!name) {
    const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
    if (cu?.client_id) {
      const { data: b2 } = await admin.from('businesses').select('name').eq('client_id', cu.client_id).maybeSingle()
      name = b2?.name as string | undefined
    }
  }

  const directions = (await aiDirections(brief, name ?? 'the restaurant')) ?? FALLBACK
  return NextResponse.json({ directions, ai: directions !== FALLBACK })
}
