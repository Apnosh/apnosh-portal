/**
 * analyst — the premium AI Data Analyst engine. Turns the grounded payload
 * (analyst-payload.ts) into a plain-English read for a restaurant owner.
 *
 * THE HONESTY CONTRACT (this is the whole point):
 *  - The AI writes ONLY prose: the bottom line, what's working, what to fix, and
 *    the blind spots. It never produces the numbers the owner sees.
 *  - Every NUMBER shown on the page is rendered by the UI straight from the
 *    grounded payload (funnelFromPayload below), never transcribed by the model.
 *    So a model that hallucinates a figure can't put a wrong number on screen.
 *  - The system prompt hard-forbids inventing numbers, benchmarks, or causation,
 *    and requires it to name what it can't see instead of guessing.
 *
 * runAnalyst does the model call; renderPayloadForPrompt / parseAnalystRead /
 * funnelFromPayload are pure and unit-tested (no API key needed).
 */

import Anthropic from '@anthropic-ai/sdk'
import { tallyThemes, type AnalystPayload, type ReviewTheme, type ThemeTags } from './analyst-derive'

/**
 * THE MODEL, IN ONE PLACE.
 *
 * Anthropic has no "always newest" alias. `claude-opus-4-8` looks like one because it
 * carries no date, but it pins a generation: it will keep serving Opus 4.8 forever and
 * will never silently become 4.9. That is deliberate and we want it — a model that
 * changed under us could change how the analyst writes, and what it costs, with no
 * deploy and no way to tell which version produced a stored report.
 *
 * So bumps stay a human decision. What we CAN remove is the busywork: this constant is
 * the only place the analyst's model is named (the route reads it too, so the model
 * recorded next to each stored report is always the one that actually ran), and
 * ANALYST_MODEL can be overridden by env, so a bump can be tested in preview without a
 * code change. RATES must move with it or the cost log silently lies.
 */
export const ANALYST_MODEL = process.env.ANALYST_MODEL || 'claude-opus-4-8'

/** The prose the AI returns. NO numbers originate here — see funnelFromPayload. */
export interface AnalystRead {
  /** the headline: at most twelve words, the way a marketer opens for the CEO */
  bottomLine: string
  /** the story in three beats, one short sentence each: what happened · why it matters · what we do next */
  story: string[]
  /** short bullets on what's going well, each tied to a real number */
  working: string[]
  /** the 1–2 highest-leverage moves, each with why it matters */
  fixes: Array<{ move: string; why: string }>
  /** what the analyst genuinely cannot see yet (+ the connect step) */
  blindSpots: string[]
  /** what reviewers praise and complain about, drawn only from real quoted reviews */
  reviews: ReviewRead | null
  /** where each measured line is heading inside the window, in plain words (from TRENDS) */
  trends: Array<{ stage: number; label: string; read: string }>
  /** what outside the business may have mattered: holidays from the brief, weather / local events researched on the web, each with its source */
  outside: { summary: string; items: Array<{ note: string; source: string | null }> } | null
  /** the pitfalls and missing pieces a good marketer would flag, each with the fix */
  gaps: Array<{ gap: string; why: string; fix: string }>
  /** things worth the owner's reading, found on the web and specific to this business: local news, their trade, the platforms they live on — each with its source */
  reading: Array<{ title: string; why: string; source: string | null; when: string | null }>
  /** the version of the report shape this read was written to */
  version: number
  /** server-computed numbers the page DRAWS (never written by the model): attached by the route */
  numbers?: { trends: AnalystPayload['trends']; rhythm: AnalystPayload['rhythm']; standouts: AnalystPayload['standouts']; launches: AnalystPayload['launches'] }
}
export const READ_VERSION = 5

/** The review read. Every point must be traceable to a quote in the brief. */
export interface ReviewRead {
  /** one plain sentence on the overall picture */
  headline: string
  /** what people say they like, each tied to something someone actually wrote */
  praise: string[]
  /** what people complain about, same rule */
  complaints: string[]
  /** topics with counted praise vs complaint, for the bar chart. Counted in code. */
  themes: ReviewTheme[]
  /** how many real reviews the topics were counted over, so the chart can say so */
  countedOver: number
}

/** The authoritative funnel the PAGE renders — built from the payload, not the AI. */
export interface AnalystFunnelStep {
  stage: number
  label: string
  value: number | null
  unit?: string
  isEmpty: boolean
  keptFromPrevPct: number | null
  /** Move vs the same stage last period. Null when the two are not comparable. */
  changePct: number | null
}

/** Deterministic funnel-with-drop-offs for the UI. Numbers come only from here. */
export function funnelFromPayload(payload: AnalystPayload): AnalystFunnelStep[] {
  const keptByStage = new Map<number, number>()
  for (const d of payload.dropOffs) keptByStage.set(d.toStage, d.keptPct)
  // Only comparable changes reach the UI. A not-comparable stage shows no chip at all,
  // which is the honest render: better to show nothing than a number that misleads.
  const changeByStage = new Map<number, number>()
  for (const c of payload.changes) {
    if (c.comparable && c.changePct != null) changeByStage.set(c.stage, c.changePct)
  }
  return payload.stages.map((s) => ({
    stage: s.stage,
    label: s.label,
    value: s.headline,
    unit: s.unit,
    isEmpty: s.isEmpty,
    keptFromPrevPct: keptByStage.get(s.stage) ?? null,
    changePct: changeByStage.get(s.stage) ?? null,
  }))
}

const num = (v: number | null): string => (v == null ? 'no data' : v.toLocaleString('en-US'))

/** Compact text brief for the model — real numbers only. */
export function renderPayloadForPrompt(payload: AnalystPayload): string {
  const where = [payload.business.city, payload.business.state].filter(Boolean).join(', ')
  const lines: string[] = []
  lines.push(`BUSINESS: ${payload.business.name}${where ? ` (${where})` : ''}`)
  lines.push(`WINDOW: last ${payload.window}`)
  lines.push('')
  lines.push('FUNNEL (each stage headline is the SUM of its connected sources only):')
  for (const s of payload.stages) {
    if (s.isEmpty) {
      lines.push(`  ${s.stage}. ${s.label}: no data yet${s.note ? ` — ${s.note}` : ''}`)
      continue
    }
    lines.push(`  ${s.stage}. ${s.label}: ${num(s.headline)}${s.unit ? ` ${s.unit}` : ''}`)
    for (const src of s.sources) {
      if (src.value != null) lines.push(`       - ${src.label}: ${num(src.value)}`)
    }
  }
  lines.push('')
  lines.push(`CHANGE VS THE PERIOD BEFORE (the previous ${payload.window}):`)
  if (!payload.changes.length) lines.push('  (no earlier period to compare against)')
  for (const c of payload.changes) {
    if (c.comparable && c.changePct != null) {
      const dir = c.changePct > 0 ? 'up' : c.changePct < 0 ? 'down' : 'flat'
      lines.push(`  ${c.label}: ${num(c.previous)} -> ${num(c.current)} = ${dir} ${Math.abs(c.changePct)}%`)
    } else {
      lines.push(`  ${c.label}: CANNOT COMPARE (${c.reason ?? 'not comparable'})`)
    }
  }
  lines.push('')
  lines.push('DROP-OFF (how many made it to the next step):')
  if (payload.dropOffs.length === 0) lines.push('  (not enough connected stages to measure)')
  for (const d of payload.dropOffs) {
    lines.push(`  ${d.fromLabel} ${num(d.fromValue)} -> ${d.toLabel} ${num(d.toValue)} = ${d.keptPct}% kept`)
  }
  lines.push('')
  const rv = payload.reviews
  if (!rv) {
    lines.push('REVIEWS: could not read them just now.')
  } else if (rv.tooFewToRead) {
    lines.push(`REVIEWS: only ${rv.recent.count} in the last ${rv.recent.days} days, too few to read a pattern into. Do not claim one.`)
  } else {
    const mix = (m: Record<string, number>) => [5, 4, 3, 2, 1].map((k) => `${k}star ${m[String(k)] ?? 0}`).join(', ')
    lines.push(`REVIEWS (last ${rv.recent.days} days): ${rv.recent.count} reviews, average ${rv.recent.avg ?? 'n/a'}`)
    lines.push(`  star mix: ${mix(rv.recent.mix)}`)
    lines.push(`  all time: ${rv.lifetime.count} reviews, average ${rv.lifetime.avg ?? 'n/a'} (${mix(rv.lifetime.mix)})`)
    lines.push(`  landed inside this report's ${rv.inWindow.days} day window: ${rv.inWindow.count}`)
    lines.push(`  never replied to: ${rv.unanswered} of ${rv.recent.count}`)
    lines.push('  WHAT THEY WROTE (real words, use these and only these to say what people praise or complain about).')
    lines.push('  Each is numbered. Cite these numbers in "themes" so the chart counts real reviews:')
    rv.quotes.forEach((q, i) => lines.push(`    [${i + 1}] ${q.rating} star, ${q.when}: "${q.text}"`))
  }
  lines.push('')
  lines.push(`REPUTATION: rating ${payload.reputation.rating ?? 'n/a'}, ${payload.reputation.reviewCount ?? 'n/a'} reviews`)
  if (payload.topSearches.length) {
    lines.push('TOP SEARCHES: ' + payload.topSearches.map((q) => `"${q.query}" (${q.impressions})`).join(', '))
  }
  const camps = Object.values(payload.activeCampaignsByStage).flat()
  if (camps.length) lines.push('ACTIVE CAMPAIGNS: ' + [...new Set(camps)].join(', '))
  lines.push('')
  if (payload.trends.length) {
    lines.push('TRENDS ON GOOGLE ONLY (Google Search + Maps for Awareness, website clicks for Interest, directions + calls for Actions; 7-day average at the start of the window vs at the end). Social views are NOT in these lines — when a stage is mostly social, say the trend line covers Google only:')
    for (const t of payload.trends) lines.push(`  ${t.label}: ${num(t.firstAvg)} a day at the start -> ${num(t.lastAvg)} a day at the end${t.changePct == null ? '' : ` (${t.changePct > 0 ? 'up' : t.changePct < 0 ? 'down' : 'flat'} ${Math.abs(t.changePct)}%)`}, over ${t.days} reported days`)
  }
  if (payload.rhythm) {
    const r = payload.rhythm
    lines.push(`WEEKDAY RHYTHM ON GOOGLE (Google views, average by day of the week, last eight weeks): ${r.byDay.map((d) => `${d.day} ${num(d.avg)}`).join(', ')}. Strongest ${r.strongestDay}, weakest ${r.weakestDay}${r.weekendVsWeekdayPct == null ? '' : `, weekends ${r.weekendVsWeekdayPct > 0 ? '+' : ''}${r.weekendVsWeekdayPct}% vs weekdays`}.`)
  }
  if (payload.standouts.length) {
    lines.push('DAYS THAT STOOD OUT ON GOOGLE (Google views against their own 7-day average ending that day; the holiday is a calendar fact, not a cause):')
    for (const d of payload.standouts) lines.push(`  ${d.date} (${d.weekday}${d.holiday ? `, ${d.holiday}` : ''}): ${num(d.value)}, ${d.vsWeekPct > 0 ? '+' : ''}${d.vsWeekPct}% against its 7-day average`)
  }
  if (payload.launches.length) {
    lines.push('LAUNCHES (what went live and when; a launch and a move can happen together, never say one caused the other):')
    for (const l of payload.launches) lines.push(`  ${l.date}: ${l.name} (${l.stage})`)
  }
  lines.push('')
  lines.push('CONNECTED SOURCES (data is flowing): ' + (payload.sources.connected.join(', ') || 'none'))
  lines.push('DARK SOURCES (cannot see — do NOT guess these): ' + (payload.sources.dark.map((d) => d.label).join(', ') || 'none'))
  return lines.join('\n')
}

export const SYSTEM = `You are the in-house data analyst for a restaurant owner. You explain their marketing numbers in plain, warm, everyday language, like a sharp employee sitting across the table. Write at a 5th-grade reading level. Never use em dashes.

You are given a BRIEF of the owner's real numbers. These are the ONLY facts you may use.

HARD RULES (breaking any of these fails the task):
- Use ONLY numbers that appear in the BRIEF. Never invent, estimate, round-guess, or extrapolate a number.
- Never compare them to other restaurants or "industry averages" or "typical" figures. You have no such data.
- The ONLY fair comparison is the owner against their own past, using the CHANGE section. Lead with it when it is there, because a number on its own does not tell them if things are getting better or worse.
- Where CHANGE says CANNOT COMPARE, you must not compare those two numbers or imply a direction. Say plainly that you cannot compare it yet and why, in the owner's words.
- A change is not a reason. You may say what moved, never why it moved.
- Never say one thing CAUSED another. You may say two things happened together, not that one caused the other.
- The REVIEWS section carries real quoted reviews. You may summarise what people praise and complain about, but ONLY from those quotes. Never invent a theme nobody wrote, and never guess at food, service, or prices you were not told about.
- Put the complaint that comes up most FIRST. An owner needs the problem more than the compliment.
- If REVIEWS says there are too few to read, say that plainly and leave praise and complaints empty. Do not stretch one or two reviews into a pattern.
- Reviews nobody replied to are a real, fixable miss. If that count is meaningful, say so.
- For anything listed under DARK SOURCES, you cannot see it. Say so plainly and point to connecting it. Never guess its value.
- If the funnel shows a big drop between two steps, that gap is the story. Name it in plain words.
- Be specific and short. No filler, no hype, no "leverage/synergy/optimize" jargon.

HOW TO WRITE (this matters as much as what you say): you are a world-class marketer presenting to the owner as if they were the CEO. Tell a STORY, do not list numbers. Open with a headline of at most twelve words. Then three beats, one short sentence each: what happened, why it matters, what we do next. Everywhere: one idea per sentence, at most ONE number in any sentence, sentences under fifteen words, no brackets, no dashes, no "from X to Y (Z%)" strings. Round big numbers the way people say them ("about 350,000", "nearly 6,300"). Name the platform when it is the whole story ("almost all of it came from TikTok").
WHAT THIS IS: a full report a world-class marketer would write for an owner who knows nothing about marketing. Explain every term the first time it appears, in one short clause (e.g. "Awareness, the number of times you showed up in a search or a feed"). Weigh what customers wrote, where the lines are heading, and the gaps a professional would spot. Be the sharpest, kindest advisor they have ever had.
OUTSIDE THE BUSINESS: you may use the web_search tool ONLY for (a) things outside the owner's walls that could have mattered in this window — the weather where they are, big local events or games, a holiday, the season — and (b) up to three things WORTH THEIR READING right now: news in their city or neighbourhood that touches a restaurant like theirs, news in their trade (their kind of food, their kind of place), and changes on the platforms they live on (Google, Instagram, TikTok, delivery apps). Use the tool at most a few times. Report only what you actually found, with its source and its date. Never search for the owner's own numbers, competitors' numbers, or "industry averages", and never present a search result as a cause; say "this happened in the same window".
Return ONLY a JSON object, no prose around it, in exactly this shape:
{
  "bottomLine": "the headline, at most twelve words",
  "story": ["what happened, one sentence", "why it matters, one sentence", "what we do next, one sentence"],
  "working": ["short bullet tied to a real number", "..."],
  "fixes": [{"move": "the concrete next thing to do", "why": "why it matters, tied to a number"}],
  "blindSpots": ["what you cannot see yet and what to connect to see it"],
  "trends": [{"stage": 1, "label": "Awareness", "read": "one or two plain sentences: where this line is heading inside the window and what stood out (a strong weekday, a day that spiked), using only TRENDS, WEEKDAY RHYTHM and DAYS THAT STOOD OUT"}],
  "outside": {"summary": "one or two sentences on what outside the business may have mattered in this window, or that nothing notable turned up", "items": [{"note": "one specific thing (a heat wave, a game, a holiday) and the dates it covers", "source": "the URL you found it at, or 'holiday calendar', or null"}]},
  "gaps": [{"gap": "a pitfall or missing piece a professional would flag", "why": "why it costs them, tied to a number where one exists", "fix": "the concrete fix, in plain words"}],
  "reading": [{"title": "the piece, in plain words", "why": "one sentence on why it matters to THIS business", "source": "the URL", "when": "the date or month it was published, or null"}],
  "reviews": {
    "headline": "one plain sentence on what reviews add up to",
    "praise": ["what people say they like, in their words not yours"],
    "complaints": ["what people complain about, most common first"],
    "themes": [
      {"label": "short topic name, e.g. Price or Banh mi or Staff",
       "positive": [numbers of the quotes that speak WELL of this topic],
       "negative": [numbers of the quotes that COMPLAIN about this topic]}
    ]
  }
}
Keep working to at most 3 bullets, fixes to at most 3, blindSpots to at most 3, praise and complaints to at most 3 each, trends to one per measured stage, outside items to at most 4, gaps to at most 4, reading to at most 3 (an empty list is fine when nothing genuinely useful turned up).
Set "reviews" to null ONLY when the brief says reviews could not be read or there are too few.

About "themes": group what people talk about into up to 6 topics, most-mentioned first. Name topics the way the owner would (the dish, the staff, the prices, the wait), not in marketing words. Put each quote number under positive or negative for that topic. A quote can appear under several DIFFERENT topics, because one review often mentions the food and the price. Only cite numbers that appear in the brief. These numbers are counted and drawn as a chart, so a number you invent becomes a visible lie.`

/** Validate + narrow the model's JSON into an AnalystRead. Throws on bad shape. */
export function parseAnalystRead(raw: string, quoteCount = 0): AnalystRead {
  // After a web search the model sometimes narrates ("Here is the report as JSON:") before the
  // fenced object (seen live 2026-09-04). Take the object wherever it sits: a fenced block
  // first, else the outermost braces.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  let json = (fenced ? fenced[1] : raw).trim()
  const a = json.indexOf('{'), b = json.lastIndexOf('}')
  if (a >= 0 && b > a) json = json.slice(a, b + 1)
  let o: unknown
  try {
    o = JSON.parse(json)
  } catch {
    throw new Error('Analyst returned non-JSON: ' + json.slice(0, 160))
  }
  const r = o as Record<string, unknown>
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
  const bottomLine = typeof r.bottomLine === 'string' ? r.bottomLine.trim() : ''
  if (!bottomLine) throw new Error('Analyst read missing bottomLine')
  const story = asStrings(r.story).slice(0, 3)
  const fixes = Array.isArray(r.fixes)
    ? r.fixes
        .map((f) => f as Record<string, unknown>)
        .filter((f) => typeof f?.move === 'string' && (f.move as string).trim())
        .map((f) => ({ move: (f.move as string).trim(), why: typeof f.why === 'string' ? (f.why as string).trim() : '' }))
    : []
  // The review read is optional by design: the model is told to null it when there is
  // too little to go on, and a malformed one is dropped rather than half-rendered.
  let reviews: ReviewRead | null = null
  const rr = r.reviews as Record<string, unknown> | null | undefined
  if (rr && typeof rr === 'object' && typeof rr.headline === 'string' && rr.headline.trim()) {
    // Themes are COUNTED here, over quotes proven to exist, never taken as written.
    const themes = tallyThemes(Array.isArray(rr.themes) ? (rr.themes as ThemeTags[]) : [], quoteCount)
    reviews = {
      headline: rr.headline.trim(),
      praise: asStrings(rr.praise).slice(0, 3),
      complaints: asStrings(rr.complaints).slice(0, 3),
      themes,
      countedOver: quoteCount,
    }
  }

  const trends = Array.isArray(r.trends)
    ? r.trends.map((t) => t as Record<string, unknown>).filter((t) => typeof t?.read === 'string' && (t.read as string).trim())
        .map((t) => ({ stage: Number(t.stage) || 0, label: typeof t.label === 'string' ? t.label : '', read: (t.read as string).trim() })).slice(0, 5)
    : []
  const oo = r.outside as Record<string, unknown> | null | undefined
  const outside = oo && typeof oo === 'object' && typeof oo.summary === 'string' && oo.summary.trim()
    ? { summary: oo.summary.trim(), items: (Array.isArray(oo.items) ? oo.items : []).map((i) => i as Record<string, unknown>).filter((i) => typeof i?.note === 'string' && (i.note as string).trim()).map((i) => ({ note: (i.note as string).trim(), source: typeof i.source === 'string' && i.source.trim() ? i.source.trim() : null })).slice(0, 4) }
    : null
  const gaps = Array.isArray(r.gaps)
    ? r.gaps.map((g) => g as Record<string, unknown>).filter((g) => typeof g?.gap === 'string' && (g.gap as string).trim())
        .map((g) => ({ gap: (g.gap as string).trim(), why: typeof g.why === 'string' ? (g.why as string).trim() : '', fix: typeof g.fix === 'string' ? (g.fix as string).trim() : '' })).slice(0, 4)
    : []
  const reading = Array.isArray(r.reading)
    ? r.reading.map((x) => x as Record<string, unknown>).filter((x) => typeof x?.title === 'string' && (x.title as string).trim())
        .map((x) => ({ title: (x.title as string).trim(), why: typeof x.why === 'string' ? (x.why as string).trim() : '', source: typeof x.source === 'string' && /^https?:/.test(x.source) ? x.source.trim() : null, when: typeof x.when === 'string' && x.when.trim() ? x.when.trim() : null })).slice(0, 3)
    : []
  return {
    bottomLine,
    story,
    working: asStrings(r.working).slice(0, 3),
    fixes: fixes.slice(0, 3),
    blindSpots: asStrings(r.blindSpots).slice(0, 3),
    reviews,
    trends,
    outside,
    gaps,
    reading,
    version: READ_VERSION,
  }
}

/** Published per-million-token rates, in dollars. Keep in step with ANALYST_MODEL. */
const RATES: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-5-20250929': { in: 3, out: 15 },
}

/**
 * Real spend for one read, in cents. An unknown model falls back to the Opus rate
 * (the dearer of the two we run) so a forgotten RATES entry over-states cost rather
 * than under-stating it — an honest cost log fails loud, not quiet.
 */
export function analystCostCents(tokensIn: number, tokensOut: number, model: string = ANALYST_MODEL): number {
  const rate = RATES[model] ?? RATES['claude-opus-4-8']
  return Math.ceil((tokensIn / 1_000_000) * rate.in * 100 + (tokensOut / 1_000_000) * rate.out * 100)
}

export interface AnalystRunResult {
  read: AnalystRead
  tokensIn: number
  tokensOut: number
  costCents: number
}

/** The model call. Grounded brief in, validated prose out. */
export async function runAnalyst(payload: AnalystPayload): Promise<AnalystRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })

  const brief = renderPayloadForPrompt(payload)
  // The full report (2026-09-04): the model may research OUTSIDE context on the web (a
  // few bounded searches), so the turn can pause while the server tool runs — keep
  // continuing the same conversation until it stops on its own. The last text block is
  // the answer; earlier ones are the model narrating its searches.
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Here is the BRIEF:\n\n${brief}\n\nWrite the report as JSON only.` }]
  let tokensIn = 0, tokensOut = 0
  let response: Anthropic.Message | null = null
  for (let turn = 0; turn < 4; turn++) {
    response = await client.messages.create({
      model: ANALYST_MODEL,
      // Reading a funnel is real thinking: find the biggest drop, weigh it against what is
      // dark, decide the moves worth naming. Adaptive lets the model spend that effort
      // where it needs to.
      thinking: { type: 'adaptive' },
      // Thinking and search tokens bill against max_tokens; the full report needs the room.
      max_tokens: 9000,
      output_config: { effort: 'medium' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
      messages,
    })
    tokensIn += response.usage.input_tokens; tokensOut += response.usage.output_tokens
    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content })
  }
  if (!response) throw new Error('Analyst returned nothing')
  const texts = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
  const raw = texts.length ? texts[texts.length - 1].text : ''
  const read = parseAnalystRead(raw, payload.reviews?.quotes.length ?? 0)
  return {
    read,
    tokensIn,
    tokensOut,
    costCents: analystCostCents(tokensIn, tokensOut),
  }
}
