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
import {
  SITUATIONS, OWNER_ASSETS, PLAN_QUESTIONS, sanitizeAsk, sanitizeRead,
  SHIFT_OPTIONS, AUDIENCE_OPTIONS, REACH_OPTIONS, AVOID_OPTIONS, PROMOTE_OTHER_OPTIONS,
  type PlanQuestion, type DescribeRead,
} from '@/lib/campaigns/data/plan-goals'

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
  /**
   * WHICH FOLLOW-UPS THIS PARTICULAR BRIEF STILL NEEDS, and why each one.
   *
   * The point of reading the paragraph is not just to fill slots, it is to work out what is still
   * missing. Two grand openings are not the same campaign: "12 September, we have DJs and
   * giveaways, pull from the whole city" has answered three of the five already, while "we're
   * opening soon" has answered none. Running the same fixed list at both is the thing that made
   * this feel like a form.
   *
   * `why` quotes their own words back. It is what turns "here are three more questions" into
   * evidence that something actually read what they wrote.
   */
  ask: { q: PlanQuestion; why: string }[]
  /**
   * THE WIDE READ (Campaign Ledger Phase 2): everything else the paragraph already answered —
   * budget, reach, shifts, avoid list, audience, promote subject, start, offer economics. Each
   * field only survives sanitizeRead's evidence law: the model must quote the words it read it
   * from, and the quote must actually appear in the text. The screen prefills these and drops
   * the matching question from the walk; budget always gets an explicit confirm tap.
   */
  read: DescribeRead
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
  ask         array of {"q": <question id>, "why": <one short sentence>} for the follow-ups THIS
              brief still needs. Ordered most important first. [] if the paragraph already covers
              everything.
  read        an object holding anything ELSE the paragraph already answered. Every entry is
              {"value": ..., "quote": "<the owner's exact words you read it from>"}. The quote
              must be copied VERBATIM from their text — a field with a paraphrased or invented
              quote is discarded. Omit any field they did not state. Possible keys:
                budget      value is a number in dollars ("about $2k a month" -> 2000)
                start       "asap" or "YYYY-MM-DD" — only for campaigns with no fixed date
                reach       one reach id from the list below
                shift       array of exact shift strings from the list below
                avoid       array of exact avoid strings from the list below
                audience    array of exact audience strings from the list below
                promote     array of exact promote strings (menu items or the promote list below)
                offerTerms  the deal itself, short ("20% off all sandwiches")
                offerLimit  any redemption cap they stated ("first 100 customers")
                offerExpiry when the offer ends, in their words or a date

Rules:
- Pick the situation that matches their PRIMARY intent, not an incidental mention.
- shape follows the situation: a grand opening or a one-off night is "date"; a limited menu or a
  season is "run"; anything with no end is "ongoing".
- Never invent a date. If they say "next month" with no day, return null and let them pick.
- assets are things the OWNER already has or can get, never things we would sell them.
- Be conservative. A null the owner corrects is better than a confident wrong answer.

Choosing "ask" is the most important thing you do here:
- Only ids from the question list. Never invent a question; nothing downstream can read one.
- Leave out anything they already answered, even loosely. If they named what they can put behind
  it, do not ask about assets. If they said the neighbourhood or the whole city, do not ask about
  reach. Asking someone something they just told you is the failure to avoid.
- Leave out anything that cannot change THIS campaign. Do not ask which shifts are empty for a
  grand opening; there is no trading history to be uneven.
- Fewer is better. Three is a lot. Zero is a valid and good answer.
- "why" is one short sentence addressed to the owner, in plain words, referring to what they wrote.
  Good: "You said DJs and giveaways, but not how far out you want to pull people from."
  Bad: "To better tailor your marketing plan."

Rules for "read":
- Only what they actually SAID. "read" exists so we never ask a question the paragraph answered;
  a guessed value would silently compose a wrong plan, which is worse than asking.
- The quote is the proof. Copy their words exactly, including typos. Short is fine.
- For list fields, map their words onto the EXACT strings from the lists ("Tuesdays and
  Wednesdays are dead" -> shift ["Tuesday", "Wednesday"]). If nothing on the list fits, omit it.
- A field you put in "read" must NOT also appear in "ask".`

function buildPrompt(text: string, menu: readonly string[]): string {
  const sits = SITUATIONS.map((s) => `  ${s.v} = ${s.label} (${s.sub})`).join('\n')
  const assets = OWNER_ASSETS.map((a) => `  "${a.v}"`).join('\n')
  /* Shipped from PLAN_QUESTIONS rather than restated here, so the rule the model is judging against
   * cannot drift from the rule the rest of the codebase states. */
  const qs = PLAN_QUESTIONS.map((q) => `  ${q.q} — ${q.asks}\n      changes: ${q.changes}`).join('\n')
  /* The read vocabularies, from the same constants the question screens render. */
  const list = (opts: readonly { v: string }[]) => opts.map((o) => `  "${o.v}"`).join('\n')
  const promote = [...menu, ...PROMOTE_OTHER_OPTIONS.flatMap((g) => g.items.map((i) => i.v))]
  const reach = REACH_OPTIONS.map((o) => `  ${o.v} = ${o.label} (${o.sub})`).join('\n')
  return `Situation ids:\n${sits}\n\nAsset strings (use these exactly):\n${assets}\n\nQuestions you may ask for:\n${qs}\n\nReach ids:\n${reach}\n\nShift strings:\n${list(SHIFT_OPTIONS)}\n\nAvoid strings:\n${list(AVOID_OPTIONS)}\n\nAudience strings:\n${list(AUDIENCE_OPTIONS)}\n\nPromote strings (their menu first):\n${promote.map((v) => `  "${v}"`).join('\n')}\n\nThe owner wrote:\n"""${text}"""`
}

export async function POST(req: Request) {
  let text = ''
  /** Their real menu, sent by the screen, so the promote read can name actual dishes. */
  let menu: string[] = []
  try {
    const body = (await req.json()) as { text?: string; menu?: unknown }
    text = String(body.text ?? '').trim()
    menu = (Array.isArray(body.menu) ? body.menu : []).filter((m): m is string => typeof m === 'string' && !!m.trim()).slice(0, 30)
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
        max_tokens: 1400,
        system: SYS,
        messages: [{ role: 'user', content: buildPrompt(text, menu) }],
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

  /*
   * Same rule as the ids: the model does not get to widen the vocabulary. Kept in plan-goals with
   * the vocabulary it validates against, and tested there.
   */
  const validAsk = sanitizeAsk(parsed.ask)

  /* The wide read, through the evidence law: no quote in their text, no field. Pure and
   * sim-locked in plan-goals, so this route cannot loosen it. */
  const read = sanitizeRead((parsed as { read?: unknown }).read, text, menu)
  /* The read wins over the ask — a field the paragraph answered must not also be asked. */
  const readAsQ: Record<string, PlanQuestion> = { shift: 'shift', avoid: 'avoid', reach: 'reach', promote: 'promote' }
  const askMinusRead = validAsk.filter((x) => !Object.entries(readAsQ).some(([k, q]) => q === x.q && k in read))

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
      ask: askMinusRead,
      read,
    } satisfies DescribeResult,
  })
}
