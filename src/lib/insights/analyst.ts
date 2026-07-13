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
import type { AnalystPayload } from './analyst-payload'

const MODEL = 'claude-sonnet-4-5-20250929'

/** The prose the AI returns. NO numbers originate here — see funnelFromPayload. */
export interface AnalystRead {
  /** 1–2 plain sentences: the single most important takeaway */
  bottomLine: string
  /** short bullets on what's going well, each tied to a real number */
  working: string[]
  /** the 1–2 highest-leverage moves, each with why it matters */
  fixes: Array<{ move: string; why: string }>
  /** what the analyst genuinely cannot see yet (+ the connect step) */
  blindSpots: string[]
}

/** The authoritative funnel the PAGE renders — built from the payload, not the AI. */
export interface AnalystFunnelStep {
  stage: number
  label: string
  value: number | null
  unit?: string
  isEmpty: boolean
  keptFromPrevPct: number | null
}

/** Deterministic funnel-with-drop-offs for the UI. Numbers come only from here. */
export function funnelFromPayload(payload: AnalystPayload): AnalystFunnelStep[] {
  const keptByStage = new Map<number, number>()
  for (const d of payload.dropOffs) keptByStage.set(d.toStage, d.keptPct)
  return payload.stages.map((s) => ({
    stage: s.stage,
    label: s.label,
    value: s.headline,
    unit: s.unit,
    isEmpty: s.isEmpty,
    keptFromPrevPct: keptByStage.get(s.stage) ?? null,
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
  lines.push('DROP-OFF (how many made it to the next step):')
  if (payload.dropOffs.length === 0) lines.push('  (not enough connected stages to measure)')
  for (const d of payload.dropOffs) {
    lines.push(`  ${d.fromLabel} ${num(d.fromValue)} -> ${d.toLabel} ${num(d.toValue)} = ${d.keptPct}% kept`)
  }
  lines.push('')
  lines.push(`REPUTATION: rating ${payload.reputation.rating ?? 'n/a'}, ${payload.reputation.reviewCount ?? 'n/a'} reviews`)
  if (payload.topSearches.length) {
    lines.push('TOP SEARCHES: ' + payload.topSearches.map((q) => `"${q.query}" (${q.impressions})`).join(', '))
  }
  const camps = Object.values(payload.activeCampaignsByStage).flat()
  if (camps.length) lines.push('ACTIVE CAMPAIGNS: ' + [...new Set(camps)].join(', '))
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
- Never say one thing CAUSED another. You may say two things happened together, not that one caused the other.
- For anything listed under DARK SOURCES, you cannot see it. Say so plainly and point to connecting it. Never guess its value.
- If the funnel shows a big drop between two steps, that gap is the story. Name it in plain words.
- Be specific and short. No filler, no hype, no "leverage/synergy/optimize" jargon.

Return ONLY a JSON object, no prose around it, in exactly this shape:
{
  "bottomLine": "one or two sentences: the single most important thing happening",
  "working": ["short bullet tied to a real number", "..."],
  "fixes": [{"move": "the concrete next thing to do", "why": "why it matters, tied to a number"}],
  "blindSpots": ["what you cannot see yet and what to connect to see it"]
}
Keep working to at most 3 bullets, fixes to at most 2, blindSpots to at most 3.`

/** Validate + narrow the model's JSON into an AnalystRead. Throws on bad shape. */
export function parseAnalystRead(raw: string): AnalystRead {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
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
  const fixes = Array.isArray(r.fixes)
    ? r.fixes
        .map((f) => f as Record<string, unknown>)
        .filter((f) => typeof f?.move === 'string' && (f.move as string).trim())
        .map((f) => ({ move: (f.move as string).trim(), why: typeof f.why === 'string' ? (f.why as string).trim() : '' }))
    : []
  return {
    bottomLine,
    working: asStrings(r.working).slice(0, 3),
    fixes: fixes.slice(0, 2),
    blindSpots: asStrings(r.blindSpots).slice(0, 3),
  }
}

/** Sonnet 4.5 rates: $3/M in, $15/M out. */
export function analystCostCents(tokensIn: number, tokensOut: number): number {
  return Math.ceil((tokensIn / 1_000_000) * 3 * 100 + (tokensOut / 1_000_000) * 15 * 100)
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
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Here is the BRIEF:\n\n${brief}\n\nWrite the read as JSON only.` }],
  })
  const block = response.content.find((b) => b.type === 'text')
  const raw = block && block.type === 'text' ? block.text : ''
  const read = parseAnalystRead(raw)
  return {
    read,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    costCents: analystCostCents(response.usage.input_tokens, response.usage.output_tokens),
  }
}
