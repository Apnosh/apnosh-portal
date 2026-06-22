import 'server-only'
/**
 * Part 1 — the Strategist (Diagnose). One Opus call turns the live signals into
 * a decision: the single binding constraint, the bet, and what to deliberately
 * skip. Budget-independent (spec §3): it reads signals + goal, never the budget.
 *
 * The model NEVER prices: Diagnosis carries no serviceId and no number that
 * reaches a bill. Money enters at Part 2 (Select). Graceful degradation: no key
 * / error / refusal → a deterministic rulesDiagnosis, tagged source:'rules', so
 * a point of view always renders.
 */
import type { PlanningContext, Diagnosis, DiagnoseResult } from './types'
import { callStructuredOutput } from './anthropic'

const DIAGNOSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['situation', 'bindingConstraint', 'bet', 'skip', 'evidence', 'confidence'],
  properties: {
    situation: { type: 'string', description: 'Two plain sentences, grounded in the signals.' },
    bindingConstraint: { type: 'string', description: 'THE one thing holding them back. Commit to one.' },
    bet: { type: 'string', description: 'What to do about it, before anything else.' },
    skip: {
      type: 'array',
      description: 'What to deliberately NOT do, and why. Honesty; load-bearing.',
      items: {
        type: 'object', additionalProperties: false, required: ['what', 'why'],
        properties: { what: { type: 'string' }, why: { type: 'string' } },
      },
    },
    evidence: { type: 'array', items: { type: 'string' }, description: 'Which concrete signals drove this.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

const SYSTEM = `You are a senior restaurant marketing strategist briefing a busy owner who has 90 seconds.
You give honest, specific, transparency-first advice. You are willing to say "don't bother
with this." No marketing jargon. Plain language a fifth grader could read. No em dashes.

Your job: DIAGNOSE, don't describe. From the signals provided, commit to the single binding
constraint holding this business back right now, state the bet you'd make, and name what you
would deliberately skip and why. A real strategist subtracts as confidently as they add.

Rules:
- Ground every claim in a specific signal you were given. Cite the numbers. Never invent data.
- Commit. Pick ONE binding constraint, not three. If two compete, say which wins and why.
- Be willing to skip. If awareness spend would be wasted while the funnel leaks, say so.
- Specific beats generic: "263 guests lapsing, no win-back running" not "improve retention".`

function buildUserMessage(ctx: PlanningContext): string {
  const { business, signals, request } = ctx
  const rep = signals.reputation
  const L: string[] = []
  L.push(`Restaurant: ${business.name} (${business.archetype})`)
  L.push(`Their goal: ${business.goal} [${request.goalKey ?? business.goalKey}]`)
  if (request.occasion) L.push(`Occasion: ${request.occasion}`)
  L.push('')
  L.push('REPUTATION:')
  L.push(`- Rating: ${rep.rating ?? 'unknown'}${rep.ratingCount ? ` from ${rep.ratingCount} reviews` : ''}`)
  if (rep.trend != null) L.push(`- Review volume vs last month: ${rep.trend >= 0 ? '+' : ''}${rep.trend}`)
  if (rep.themes.length) {
    L.push('- What guests keep mentioning:')
    for (const t of rep.themes) L.push(`  - ${t.label} (${t.good ? 'praise' : 'complaint'}, ${t.mentions} mentions)`)
  } else {
    L.push('- No review themes available yet.')
  }
  L.push('')
  L.push('GETTING FOUND (presence):')
  if (signals.presence.length) {
    for (const p of signals.presence) L.push(`- ${p.name}: ${p.completeness}% complete${p.gaps.length ? `; gaps: ${p.gaps.join(', ')}` : ''}`)
  } else {
    L.push('- No presence data available.')
  }
  L.push('')
  L.push('GUESTS (segments):')
  if (signals.segments.length) {
    for (const s of signals.segments) L.push(`- ${s.name}: ${s.count} (${s.tone})`)
  } else {
    L.push('- Guest segment counts are NOT available for this business. Do not assume or invent segment sizes; diagnose from reputation and presence.')
  }
  L.push('')
  L.push('Diagnose the single binding constraint, the bet, and what to skip. Output JSON only.')
  return L.join('\n')
}

/** Coerce a parsed payload into a valid Diagnosis (null if unusable). */
function coerce(parsed: Partial<Diagnosis> | null): Diagnosis | null {
  if (!parsed || !parsed.bindingConstraint || !parsed.bet) return null
  return {
    situation: typeof parsed.situation === 'string' ? parsed.situation : '',
    bindingConstraint: parsed.bindingConstraint,
    bet: parsed.bet,
    skip: Array.isArray(parsed.skip) ? parsed.skip.filter((s) => s && s.what && s.why) : [],
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((e) => typeof e === 'string') : [],
    confidence: parsed.confidence === 'high' || parsed.confidence === 'low' ? parsed.confidence : 'medium',
  }
}

export async function diagnose(ctx: PlanningContext): Promise<DiagnoseResult> {
  const parsed = await callStructuredOutput<Partial<Diagnosis>>({
    system: SYSTEM,
    user: buildUserMessage(ctx),
    schema: DIAGNOSIS_SCHEMA,
    maxTokens: 1200,
  })
  const diagnosis = coerce(parsed)
  return diagnosis ? { diagnosis, source: 'ai' } : { diagnosis: rulesDiagnosis(ctx), source: 'rules' }
}

/**
 * Deterministic fallback — always produces a point of view from whatever signals
 * exist (lowest-completeness channel, then reputation leak, else goal momentum).
 * This is the cold-start prior and the safety net; confidence is 'low'.
 */
export function rulesDiagnosis(ctx: PlanningContext): Diagnosis {
  const { business, signals } = ctx
  const rep = signals.reputation
  const evidence: string[] = []
  const skip: { what: string; why: string }[] = []

  const worstPresence = [...signals.presence].sort((a, b) => a.completeness - b.completeness)[0]
  const complaint = rep.themes.find((t) => !t.good)
  const lowRating = rep.rating != null && rep.rating < 4.2

  let bindingConstraint: string
  let bet: string

  if (worstPresence && worstPresence.completeness < 70) {
    bindingConstraint = `People can't reliably find you. Your ${worstPresence.name} is only ${worstPresence.completeness}% complete.`
    bet = `Fix ${worstPresence.name} first${worstPresence.gaps.length ? ` (${worstPresence.gaps.slice(0, 2).join(', ')})` : ''}, before spending on reach.`
    evidence.push(`${worstPresence.name} ${worstPresence.completeness}% complete`)
    skip.push({ what: 'Paid ads for new reach', why: 'Sending people to an incomplete listing wastes the spend.' })
  } else if (lowRating || complaint) {
    const r = rep.rating != null ? `${rep.rating}` : 'your rating'
    bindingConstraint = complaint
      ? `Your reputation has a specific leak: guests keep mentioning ${complaint.label}.`
      : `Your rating (${r}) is holding back everything else.`
    bet = `Tighten reviews and fix what guests flag${complaint ? ` about ${complaint.label}` : ''} before pushing for more new visits.`
    if (rep.rating != null) evidence.push(`Rating ${rep.rating}${rep.ratingCount ? ` from ${rep.ratingCount} reviews` : ''}`)
    if (complaint) evidence.push(`Recurring complaint: ${complaint.label}`)
    skip.push({ what: 'A big new-customer push', why: 'More first visits into a reputation problem just spreads the problem.' })
  } else {
    bindingConstraint = `Your foundations look healthy, so the real constraint is momentum on your goal: ${business.goal.toLowerCase()}.`
    bet = `Run one focused, consistent play for "${business.goal.toLowerCase()}" instead of a little of everything.`
    if (rep.rating != null) evidence.push(`Rating ${rep.rating} looks solid`)
    skip.push({ what: 'Spreading budget across every channel', why: 'One consistent play beats five half-efforts.' })
  }

  const ratingBit = rep.rating != null
    ? `You're at ${rep.rating}${rep.ratingCount ? ` across ${rep.ratingCount} reviews` : ''}.`
    : `We don't have a rating on file yet.`
  const situation = `${business.name} wants to ${business.goal.toLowerCase()}. ${ratingBit}`

  return { situation, bindingConstraint, bet, skip, evidence, confidence: 'low' }
}
