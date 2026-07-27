/**
 * POST /api/campaigns/describe — turn what an owner wrote into the fields the builder composes from.
 *
 * WHY THIS EXISTS. Owners do not arrive with a goal, they arrive with a paragraph: "new location
 * opening, I want a line out the door, we have DJs and can do giveaways". Every version of this
 * screen so far has made them translate that into our categories first, and each time the categories
 * got better the underlying mistake stayed the same. This reads the paragraph instead.
 *
 * THE READ-BACK IS THE PRODUCT, NOT THE PARSE. The result is never applied silently. It comes back
 * as picks the owner can see and correct, so a wrong read costs them one tap rather than a wrong
 * plan. That also means a mediocre parse is survivable, which is the right risk profile.
 *
 * `unsupported` IS THE HONEST FIELD. Owners ask for things we do not sell (sponsor the little league
 * team, run a radio spot, print flyers). Naming those back is worth more than quietly dropping them
 * and composing something adjacent, because dropping them is how an owner ends up paying for a plan
 * that does not do the thing they asked for.
 *
 * DEGRADES OUT LOUD. With no key, no credit, or a bad response, this returns ok:false and a reason.
 * The screen then offers the two paths that are actually real: pick the closest shortcut and get a
 * plan now, or send the words to a human who reads them. It never pretends to have understood.
 */
import { NextResponse } from 'next/server'
import { SITUATIONS, OWNER_ASSETS } from '@/lib/campaigns/data/plan-goals'

export const runtime = 'nodejs'
export const maxDuration = 30

/** What the screen can act on. Every field maps to a control the owner can then correct. */
export interface DescribeResult {
  /** the closest situation id, or null when nothing fits */
  situation: string | null
  shape: 'date' | 'run' | 'ongoing' | null
  /** ISO yyyy-mm-dd, only when a real date was stated or clearly implied */
  when: string | null
  until: string | null
  /** exact `v` values from OWNER_ASSETS */
  assets: string[]
  /** a one-line read-back in the owner's own terms, shown above the picks */
  summary: string
  /** what they asked for that we do not sell. Named, never dropped. */
  unsupported: string[]
}

const SYS = `You turn a restaurant owner's description of a marketing campaign into structured fields.

Return ONLY a JSON object, no prose, with exactly these keys:
  situation   one of the ids listed below, or null if none fit
  shape       "date" | "run" | "ongoing" | null
  when        "YYYY-MM-DD" or null. Only if a date is stated or unambiguous. Never guess a year.
  until       "YYYY-MM-DD" or null. Only for a run with a stated end.
  assets      array of EXACT strings from the asset list below. [] if none mentioned.
  summary     one sentence, under 20 words, in the owner's own terms, starting "You want to..."
  unsupported array of short phrases for things they asked for that are NOT in the situation or
              asset lists and are not marketing services a small agency would run (e.g. "print
              flyers", "sponsor a team", "radio spot"). [] if none.

Rules:
- Pick the situation that matches their PRIMARY intent, not an incidental mention.
- shape follows the situation: a grand opening or a one-off night is "date"; a limited menu or a
  season is "run"; anything with no end is "ongoing".
- Never invent a date. If they say "next month" with no day, return null and let them pick.
- assets are things the OWNER already has or can get, never things we would sell them.
- Be conservative. A null the owner corrects is better than a confident wrong answer.`

function buildPrompt(text: string): string {
  const sits = SITUATIONS.map((s) => `  ${s.v} = ${s.label} (${s.sub})`).join('\n')
  const assets = OWNER_ASSETS.map((a) => `  "${a.v}"`).join('\n')
  return `Situation ids:\n${sits}\n\nAsset strings (use these exactly):\n${assets}\n\nThe owner wrote:\n"""${text}"""`
}

export async function POST(req: Request) {
  let text = ''
  try {
    const body = (await req.json()) as { text?: string }
    text = String(body.text ?? '').trim()
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-request' }, { status: 400 })
  }
  if (text.length < 12) return NextResponse.json({ ok: false, reason: 'too-short' }, { status: 400 })
  if (text.length > 4000) text = text.slice(0, 4000)

  const key = process.env.ANTHROPIC_API_KEY
  // No key is a configuration fact, not a failure to hide. The screen has a real path for it.
  if (!key) return NextResponse.json({ ok: false, reason: 'no-key' }, { status: 503 })

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 900,
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
    /*
     * Out of credit is the one failure worth telling apart, because it is the one an owner cannot
     * wait out and we can fix in a minute. It has already taken down every AI surface in this
     * product once, silently, so it gets its own reason code rather than a generic error.
     */
    const reason = /credit balance is too low/i.test(body) ? 'no-credit' : res.status === 429 ? 'busy' : 'upstream'
    return NextResponse.json({ ok: false, reason, status: res.status }, { status: 503 })
  }

  let parsed: DescribeResult
  try {
    const json = (await res.json()) as { content?: { text?: string }[] }
    const raw = json.content?.map((c) => c.text ?? '').join('') ?? ''
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    parsed = JSON.parse(raw.slice(start, end + 1)) as DescribeResult
  } catch {
    return NextResponse.json({ ok: false, reason: 'unparseable' }, { status: 502 })
  }

  /*
   * Never trust the model with the vocabulary. An id or asset string it invented would silently
   * compose the wrong plan, or none at all, so anything not in our own lists is dropped here.
   */
  const validSit = SITUATIONS.some((s) => s.v === parsed.situation) ? parsed.situation : null
  const validAssets = (Array.isArray(parsed.assets) ? parsed.assets : []).filter((v) => OWNER_ASSETS.some((a) => a.v === v))
  const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const shape = validSit ? (SITUATIONS.find((s) => s.v === validSit)!.shape) : null

  return NextResponse.json({
    ok: true,
    result: {
      situation: validSit,
      // The situation owns the shape. A model disagreeing with our own table is the model being wrong.
      shape,
      when: iso(parsed.when),
      until: iso(parsed.until),
      assets: validAssets,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '',
      unsupported: (Array.isArray(parsed.unsupported) ? parsed.unsupported : []).slice(0, 6).map((x) => String(x).slice(0, 80)),
    } satisfies DescribeResult,
  })
}
