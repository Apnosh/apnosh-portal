/**
 * A read of the comments under ONE post: which ones are love, which are questions, which are
 * complaints, and a suggested reply for the ones that want one.
 * ======================================================================================
 * POST { clientId, caption, comments: [{ id, text, author }] }
 *   →  { summary, items: [{ id, tone, why, reply }] }
 *
 * The owner asked for it on the post sheet (2026-09-11): "analyzing the good/bad ones or
 * recommended responding". The comments come from the client's own connected accounts through
 * the Zernio adapter; this route only reads them and writes nothing anywhere.
 *
 * NOTHING GOES OUT FROM HERE. A suggested reply is a draft the owner sends by hand from the
 * sheet, through the same reply path the Inbox uses. Autonomous sending is the line: this is
 * why the prompt tells the model to route allergen, dietary, booking and money questions to a
 * DM or a call rather than answer them.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export type CommentTone = 'love' | 'question' | 'complaint' | 'neutral' | 'spam'
const TONES: readonly CommentTone[] = ['love', 'question', 'complaint', 'neutral', 'spam']
export interface CommentReadItem { id: string; tone: CommentTone; why: string; reply: string | null }

const MAX_COMMENTS = 30
const MAX_TEXT = 500

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; caption?: string | null; comments?: Array<{ id?: string; text?: string; author?: string }> }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  const comments = (Array.isArray(body.comments) ? body.comments : [])
    .filter((c) => c && typeof c.id === 'string' && typeof c.text === 'string' && c.text.trim())
    .slice(0, MAX_COMMENTS)
    .map((c) => ({ id: String(c.id), text: String(c.text).slice(0, MAX_TEXT), author: String(c.author ?? '').slice(0, 60) }))
  if (comments.length === 0) return NextResponse.json({ summary: '', items: [] })

  const admin = createAdminClient()
  const { data: clientRow } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle()
  const businessName = (clientRow?.name as string | undefined)?.trim() || 'the restaurant'
  const caption = String(body.caption ?? '').slice(0, 600)

  const anthropic = new Anthropic()
  const system = `You read the comments under a social media post by ${businessName}, a local restaurant, and sort them for the owner.
For EACH comment give:
- tone: one of love | question | complaint | neutral | spam. "love" is praise or excitement. "question" asks something the owner should answer. "complaint" is unhappy or a problem. "spam" is bots, self-promotion, or unrelated.
- why: at most 8 plain words saying what it is about.
- reply: a warm reply in the owner's own voice, at most 35 words, ONLY when the comment is a question, a complaint, or praise that names something specific worth thanking. Otherwise null.
Rules for replies: never promise money, refunds, bookings, times or availability. Never answer allergen, dietary or medical questions; invite them to message or call instead. No hashtags, no emoji unless the comment used them, no corporate phrases.
Also give a one-sentence summary for the owner, at most 18 words, in plain language, that says what the comments are mostly about.
Answer with JSON only, exactly: {"summary": string, "items": [{"id": string, "tone": string, "why": string, "reply": string | null}]}`
  const user = `Post caption: ${caption || '(no caption)'}\n\nComments:\n${comments.map((c) => `[${c.id}] ${c.author ? `${c.author}: ` : ''}${c.text}`).join('\n')}`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { summary?: unknown; items?: unknown }
    const known = new Set(comments.map((c) => c.id))
    const items: CommentReadItem[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((x) => x as { id?: unknown; tone?: unknown; why?: unknown; reply?: unknown })
      .filter((x) => typeof x.id === 'string' && known.has(x.id))
      .map((x) => ({
        id: String(x.id),
        tone: TONES.includes(x.tone as CommentTone) ? (x.tone as CommentTone) : 'neutral',
        why: typeof x.why === 'string' ? x.why.slice(0, 80) : '',
        reply: typeof x.reply === 'string' && x.reply.trim() ? x.reply.trim().slice(0, 400) : null,
      }))
    return NextResponse.json({ summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '', items })
  } catch (e) {
    /* The owner-facing text is fixed. The vendor's own message goes to the log, where it is
       useful, and never to a restaurant, where it is not. */
    console.error('[comment-read]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'We could not read the comments just now.' }, { status: 502 })
  }
}
