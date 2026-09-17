/**
 * POST /api/dashboard/announce-draft  { clientId, kind, answers, channels }
 *
 * The words for an announcement (Create → Announce, owner 2026-09-16): one social caption and,
 * when Google is among the channels, one Google post, written from the owner's own answers in
 * the business's voice. Grounded in the answers only: the model may not add a price, a time,
 * a claim or a place the owner did not give. No em dashes, no hashtags in the caption, no URLs
 * in the Google post (the publish rail refuses them anyway).
 *
 * When the model is unavailable the route still answers, with a plain deterministic sentence
 * built from the same answers, so the sheet never dead-ends on an outage.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { callStructuredOutput } from '@/lib/campaigns/planning/anthropic'

export type AnnounceKind = 'dish' | 'hours' | 'deal' | 'event' | 'hiring' | 'open' | 'holiday' | 'else'
const KINDS: readonly AnnounceKind[] = ['dish', 'hours', 'deal', 'event', 'hiring', 'open', 'holiday', 'else']

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['social', 'google', 'socialEs', 'card', 'reminder', 'tonight', 'after'],
  properties: {
    social: { type: 'string', description: 'The caption for Instagram and Facebook: 1 to 3 short sentences, warm, plain, in the business voice, ending with the call to action given. No hashtags, no emoji unless the owner used one, no em dashes. Never invent a price, time, date or claim not in the facts. English only.' },
    socialEs: { type: 'string', description: 'The same caption in the second language asked for, as its own post. Empty string if no second language was asked for.' },
    google: { type: 'string', description: 'The same news as a Google Business post: 1 to 2 sentences, under 280 characters, no URLs, no phone numbers, no em dashes. Empty string if Google is not among the channels.' },
    card: { type: 'string', description: 'A card for the restaurant staff, 3 to 5 short lines, plain: what it is, how to describe it to a guest in one sentence, the price if given, anything to know (allergens, when it runs, where it is available). Empty string if not asked for.' },
    reminder: { type: 'string', description: 'A short reminder post, 1 to 2 sentences, written as if the moment is close (the day before, the morning of, two days to go, as told). Same facts, no new claims, no hashtags, no em dashes. Empty string if not asked for.' },
    tonight: { type: 'string', description: 'A day-of post, 1 to 2 sentences, written as if it is that afternoon ("tonight", "today"). Same facts. Empty string if not asked for.' },
    after: { type: 'string', description: 'A day-after post, 1 to 2 sentences: thanks for coming, and when the next one is if it repeats. Same facts. Empty string if not asked for.' },
  },
}

function clean(s: unknown, max = 600): string {
  return String(s ?? '').replace(/—|–/g, ',').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** The plain fallback: the owner's answers as one honest sentence. */
function plain(kind: AnnounceKind, a: Record<string, string>, name: string): { social: string; google: string } {
  const when = a.from ? ` from ${a.from}` : ''
  const line = a.line ? ` ${a.line}` : ''
  let s = ''
  switch (kind) {
    case 'dish': s = `New on the menu${when}: ${a.what}${a.price ? `, ${a.price}` : ''}.${line}`; break
    case 'hours': s = `A change to our hours: ${a.what}${a.line ? `. ${a.line}` : ''}.`; break
    case 'deal': s = `${a.what}${a.when ? `, ${a.when}` : ''}.${line}`; break
    case 'event': s = `${a.what}${a.when ? ` on ${a.when}` : ''}${a.time ? ` at ${a.time}` : ''}.${line}`; break
    case 'hiring': s = `We are hiring: ${a.what}${a.line ? `. ${a.line}` : ''}.${a.how ? ` ${a.how}` : ''}`; break
    case 'open': s = `${a.what || 'We are open'}${when}.${line}`; break
    case 'holiday': s = `${a.what}${a.line ? `: ${a.line}` : ''}.`; break
    default: s = a.what || ''
  }
  s = clean(s.replace(/\.\./g, '.'))
  return { social: `${s} See you at ${name}.`, google: clean(s, 280) }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; kind?: string; answers?: Record<string, unknown>; channels?: string[]; cta?: string; languages?: string[]; card?: boolean; reminderWhen?: string; tonight?: boolean; after?: boolean; ctaText?: string }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const kind = (KINDS as readonly string[]).includes(String(body.kind)) ? (body.kind as AnnounceKind) : 'else'
  const answers: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.answers ?? {})) if (typeof v === 'string' && v.trim()) answers[k] = clean(v, 300)
  const channels = (Array.isArray(body.channels) ? body.channels : []).map(String)
  const wantsGoogle = channels.includes('google')
  const CTA: Record<string, string> = { order: 'Order online', visit: 'Come in', reserve: 'Book a table', message: 'Send us a message' }
  const cta = CTA[String(body.cta ?? '')] ?? ''
  const languages = (Array.isArray(body.languages) ? body.languages : []).map(String).filter((l) => /^[a-z]{2}$/.test(l) && l !== 'en')
  const wantsCard = body.card === true
  const reminderWhen = clean(body.reminderWhen, 60)
  const wantsTonight = body.tonight === true
  const wantsAfter = body.after === true
  const ctaText = clean(body.ctaText, 60)
  const cardKind = kind === 'event' ? 'a runsheet for the staff: doors, who hosts, the prize or the special, what to say when a guest asks, who does what' : 'a card for the staff'

  const admin = createAdminClient()
  const { data: row } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle()
  const name = (row?.name as string | undefined)?.trim() || 'the restaurant'
  const fallback = plain(kind, answers, name)

  const facts = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n')
  const system = `You write short announcements for ${name}, a local restaurant, in the owner's own warm, plain voice. Use ONLY the facts given. Never add a price, a date, a time, an address, a claim or an offer that is not in the facts. Plain sentences a 5th grader understands. No hashtags. No em dashes. Never mention AI.`
  const LANG: Record<string, string> = { es: 'Spanish', vi: 'Vietnamese', zh: 'Chinese', ko: 'Korean', fr: 'French', tl: 'Tagalog' }
  const user = `Kind of announcement: ${kind}\nFacts from the owner:\n${facts || '(none)'}\nChannels: ${channels.join(', ') || 'social'}${ctaText || cta ? `\nCall to action to end on: ${ctaText || cta}` : ''}${languages.length ? `\nAlso write the caption as its own post in: ${languages.map((l) => LANG[l] ?? l).join(', ')}` : ''}\n\nWrite the social caption${wantsGoogle ? ' and the Google post' : ''}${wantsCard ? ` and ${cardKind}` : ''}${reminderWhen ? ` and a reminder post for ${reminderWhen}` : ''}${wantsTonight ? ' and a day-of post for that afternoon' : ''}${wantsAfter ? ' and a day-after post' : ''}.`
  const ai = await callStructuredOutput<{ social?: string; google?: string; socialEs?: string; card?: string; reminder?: string; tonight?: string; after?: string }>({ system, user, schema: SCHEMA, maxTokens: 800, timeoutMs: 15000, tag: { kind: 'announce-draft', clientId, schemaName: 'announce' } })
  const keepLines = (s: unknown, max: number) => String(s ?? '').replace(/—|–/g, ',').replace(/[ \t]+/g, ' ').trim().slice(0, max)
  const social = keepLines(ai?.social, 2000) || fallback.social
  const google = wantsGoogle ? (clean(ai?.google, 280).replace(/https?:\/\/\S+/g, '').trim() || fallback.google) : ''
  const card = wantsCard ? (keepLines(ai?.card, 900) || [answers.what, answers.line, answers.price ? `Price: ${answers.price}` : '', answers.tags ? `Good to know: ${answers.tags}` : ''].filter(Boolean).join('\n')) : ''
  const reminder = reminderWhen ? (keepLines(ai?.reminder, 600) || `${reminderWhen.charAt(0).toUpperCase() + reminderWhen.slice(1)}: ${social}`) : ''
  const tonight = wantsTonight ? (keepLines(ai?.tonight, 600) || `Tonight: ${social}`) : ''
  const after = wantsAfter ? (keepLines(ai?.after, 600) || `Thank you for coming out to ${answers.what ?? 'last night'}. See you at ${name}.`) : ''
  const socialEs = languages.length ? keepLines(ai?.socialEs, 2000) : ''
  return NextResponse.json({ social, google, socialEs, card, reminder, tonight, after, source: ai ? 'ai' : 'plain' })
}
