/**
 * POST /api/design/describe — turn "tell us what you want made" into pre-filled order fields.
 *
 * The campaign describe-read's skeleton with the design vocabulary (build rule: reuse, don't
 * parallel — the evidence gate, the date credibility law, and the vague-offer rule all come
 * from the shared modules; only the vocabulary is design's own).
 *
 * DEGRADES OUT LOUD: no key, no credit, or a bad response returns ok:false and a reason. The
 * screen keeps working on the local job matcher; it never pretends to have understood.
 */
import { NextResponse } from 'next/server'
import { DESIGN_JOBS, sanitizeDesignRead, type DesignRead } from '@/lib/design/design-read'
import { DESTINATIONS } from '@/lib/design/destinations'

export const runtime = 'nodejs'
export const maxDuration = 30

export interface DesignDescribeResult {
  read: DesignRead
}

const SYS = `You turn a restaurant owner's request for a graphic design into structured fields.

Return ONLY a JSON object. Every field is {"value": ..., "quote": "<their exact words>"} — the
quote must be copied VERBATIM from their text; a paraphrased or invented quote is discarded.
Omit any field they did not state. Keys:
  jobType       one job id from the list below
  message       the headline message, short, in their words
  offer         the deal if they stated one ("20% off pitchers"). Never invent terms.
  dateISO       "YYYY-MM-DD" only when a real day is stated. Never guess a day from a month.
  destinations  array of destination ids from the list below that they asked for
  ownPhotos     true only if they said they have photos or want their own used

Rules:
- Only ids from the lists. Nothing else can be read downstream.
- Be conservative. A field the screen asks about beats a confident wrong answer.
- The quote is the proof. Copy their words exactly, including typos.`

function buildPrompt(text: string): string {
  const jobs = DESIGN_JOBS.map((j) => `  ${j.id} = ${j.label}`).join('\n')
  const dests = DESTINATIONS.map((d) => `  ${d.id} = ${d.label}`).join('\n')
  return `Job ids:\n${jobs}\n\nDestination ids:\n${dests}\n\nThe owner wrote:\n"""${text}"""`
}

export async function POST(req: Request) {
  let text = ''
  try {
    const body = (await req.json()) as { text?: string }
    text = String(body.text ?? '').trim()
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-request' }, { status: 400 })
  }
  if (text.length < 8) return NextResponse.json({ ok: false, reason: 'too-short' }, { status: 400 })
  if (text.length > 2000) text = text.slice(0, 2000)

  const todayISO = new Date().toISOString().slice(0, 10)
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, reason: 'no-key' }, { status: 503 })

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 700,
        system: SYS,
        messages: [{ role: 'user', content: buildPrompt(text) }],
      }),
      signal: AbortSignal.timeout(25_000),
    })
  } catch {
    return NextResponse.json({ ok: false, reason: 'unreachable' }, { status: 503 })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const reason = /credit balance is too low/i.test(body) ? 'no-credit' : res.status === 429 ? 'busy' : 'upstream'
    return NextResponse.json({ ok: false, reason, status: res.status }, { status: 503 })
  }

  let parsed: unknown
  try {
    const json = (await res.json()) as { content?: { text?: string }[] }
    const raw = json.content?.map((c) => c.text ?? '').join('') ?? ''
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch {
    return NextResponse.json({ ok: false, reason: 'unparseable' }, { status: 502 })
  }

  /* The shared laws do the vetting: evidence gate, vocabulary filter, date credibility,
   * vague-offer rule, local-matcher floor. */
  return NextResponse.json({ ok: true, result: { read: sanitizeDesignRead(parsed, text, todayISO) } satisfies DesignDescribeResult })
}
