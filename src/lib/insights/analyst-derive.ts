/**
 * analyst-derive — the PURE honesty logic behind the analyst's brief.
 *
 * Split out from analyst-payload.ts on purpose. That module imports the Supabase
 * admin client and the campaign readers, which pull in `server-only` and therefore
 * cannot be loaded by a plain test runner. Keeping the derivations here means the
 * rules that decide what the analyst is allowed to say are unit-testable offline,
 * with no database and no API key.
 *
 * Nothing in this file does I/O. Types live here too so the shapes travel with them.
 */

import type { InsightsWindow } from './compute-stages'

/** One source inside a stage, flattened to just what the analyst needs. */
export interface AnalystSource {
  label: string
  provider: string
  value: number | null
  status: string
  /** true when this source's value is part of the stage headline */
  counted: boolean
}

/** One funnel stage, real numbers only. */
export interface AnalystStage {
  stage: number
  label: string
  /** the headline == sum of counted sources, or null when the stage has no data */
  headline: number | null
  unit?: string
  isEmpty: boolean
  note?: string
  sources: AnalystSource[]
}

/** The fall-off between two consecutive stages that both have a real number. */
export interface AnalystDropOff {
  fromStage: number
  fromLabel: string
  fromValue: number
  toStage: number
  toLabel: string
  toValue: number
  /** toValue / fromValue as a percentage (how many made it to the next step) */
  keptPct: number
}

/** Which sources feed the funnel today vs. which are dark (would add signal). */
export interface AnalystSourceSummary {
  connected: string[]
  dark: Array<{ label: string; state: string }>
}

/**
 * How one stage moved against the SAME stage in the period right before it.
 *
 * The owner's own past is the only benchmark we use. We never compare them to other
 * businesses or to an industry average, so this is the analyst's sole source of
 * "is this good or bad", and it has to be trustworthy.
 */
export interface AnalystChange {
  stage: number
  label: string
  current: number | null
  previous: number | null
  /** Percent move, positive or negative. Null whenever the pair is not comparable. */
  changePct: number | null
  /** False when comparing the two numbers would mislead. Read `reason` before using them. */
  comparable: boolean
  /** Plain-language why-not, present only when comparable is false. */
  reason?: string
}

/** The complete grounded brief handed to the analyst. */
export interface AnalystPayload {
  business: { name: string; city: string | null; state: string | null }
  window: InsightsWindow
  stages: AnalystStage[]
  /** Same-stage movement vs the previous period. Empty when there is no history. */
  changes: AnalystChange[]
  dropOffs: AnalystDropOff[]
  /** What people actually wrote. Null when reviews could not be read. */
  reviews: ReviewDigest | null
  reputation: { rating: number | null; reviewCount: number | null }
  topSearches: Array<{ query: string; impressions: number }>
  activeCampaignsByStage: Record<string, string[]>
  sources: AnalystSourceSummary
}

// ── Pure derivations (no I/O — unit tested) ──────────────────────────────

/**
 * The drop-off between each pair of consecutive stages that BOTH have a real
 * number and where the earlier stage is > 0. Stages with no data (null headline)
 * break the chain — we never invent a fall-off across a gap we can't see.
 */
export function deriveDropOffs(stages: AnalystStage[]): AnalystDropOff[] {
  const out: AnalystDropOff[] = []
  const withData = stages.filter((s) => s.headline != null && !s.isEmpty) as (AnalystStage & { headline: number })[]
  for (let i = 0; i < withData.length - 1; i++) {
    const from = withData[i]
    const to = withData[i + 1]
    // only chain ADJACENT funnel stages (no leap across a hidden stage)
    if (to.stage - from.stage !== 1) continue
    if (from.headline <= 0) continue
    out.push({
      fromStage: from.stage,
      fromLabel: from.label,
      fromValue: from.headline,
      toStage: to.stage,
      toLabel: to.label,
      toValue: to.headline,
      keptPct: Math.round((to.headline / from.headline) * 1000) / 10,
    })
  }
  return out
}

/** The sources that actually built a stage's headline, as a stable comparable key. */
function countedKey(stage: AnalystStage): string {
  return stage.sources
    .filter((s) => s.counted && s.value != null)
    .map((s) => s.label)
    .sort()
    .join('|')
}

/**
 * Movement per stage vs the previous period, with a hard guard against the trap that
 * makes period comparison dishonest.
 *
 * THE TRAP: if a source started reporting partway through (say GA4 was connected two
 * weeks ago), this period has website numbers and last period does not. The naive read
 * is "visits doubled!" when nothing about the business changed. We cannot detect that
 * from a connected-since date because we do not store one, but we CAN detect it from
 * the data: if the set of sources that fed the headline differs between the two
 * periods, the two headlines are measuring different things and must not be subtracted.
 *
 * So a change is only reported when both periods have a real number built from the
 * exact same sources, and the earlier number is above zero. Everything else is
 * returned as not comparable, with the reason, so the analyst says "I cannot compare
 * this yet" instead of inventing growth.
 */
export function deriveChanges(current: AnalystStage[], previous: AnalystStage[]): AnalystChange[] {
  const prevByStage = new Map(previous.map((s) => [s.stage, s]))
  const out: AnalystChange[] = []
  for (const cur of current) {
    const prev = prevByStage.get(cur.stage)
    const base = { stage: cur.stage, label: cur.label, current: cur.headline, previous: prev?.headline ?? null }
    if (cur.headline == null || !prev || prev.headline == null) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'no number for one of the two periods' })
      continue
    }
    if (countedKey(cur) !== countedKey(prev)) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'different sources fed this stage in each period, so the two numbers are not the same measurement' })
      continue
    }
    if (prev.headline <= 0) {
      out.push({ ...base, changePct: null, comparable: false, reason: 'the earlier period was zero, so a percent change would not mean anything' })
      continue
    }
    out.push({
      ...base,
      changePct: Math.round(((cur.headline - prev.headline) / prev.headline) * 1000) / 10,
      comparable: true,
    })
  }
  return out
}

/**
 * Split every source across all stages into "connected" (a real number is
 * flowing) vs "dark" (exists but isn't feeding the funnel — not connected,
 * errored, or no adapter yet). Deduped by label. This is how the analyst knows
 * its own blind spots and can honestly say "I can't see X."
 */
export function summarizeSources(stages: AnalystStage[]): AnalystSourceSummary {
  const connected = new Set<string>()
  const dark = new Map<string, string>()
  for (const st of stages) {
    for (const s of st.sources) {
      const live = (s.status === 'CONNECTED' || s.status === 'MANUAL_ENTRY') && s.value != null
      if (live) {
        connected.add(s.label)
        dark.delete(s.label) // a label that's live anywhere is not dark
      } else if (!connected.has(s.label) && s.status !== 'CONNECTED') {
        dark.set(s.label, s.status)
      }
    }
  }
  return {
    connected: [...connected],
    dark: [...dark.entries()].map(([label, state]) => ({ label, state })),
  }
}

// ── Reviews: what people actually said ───────────────────────────────────

/** One real review, trimmed to what the analyst needs. */
export interface ReviewRow {
  rating: number | null
  text: string | null
  postedAt: string | null
  /** true when the owner has already replied */
  answered: boolean
}

/** A verbatim excerpt handed to the model as evidence. Never paraphrased here. */
export interface ReviewQuote {
  rating: number
  when: string
  text: string
}

/**
 * The review picture: counts computed in code, real words carried through.
 *
 * The split of labour matters. Every NUMBER here (how many of each star, how many
 * unanswered) is counted from rows, so the model can never miscount them. The QUOTES
 * are verbatim, so when the analyst says "people mention prices" there is real text
 * behind it rather than a guess about a restaurant it has never visited.
 */
export interface ReviewDigest {
  /** Everything on record, however far back it goes. */
  lifetime: { count: number; avg: number | null; mix: Record<string, number> }
  /** A wider recent slice, because sentiment needs more than a handful of reviews. */
  recent: { days: number; count: number; avg: number | null; mix: Record<string, number> }
  /** How many landed inside the analyst's own reporting window. */
  inWindow: { days: number; count: number }
  /** Reviews with no reply from the owner, across `recent`. */
  unanswered: number
  /** Real words, newest first, deliberately mixing happy and unhappy. */
  quotes: ReviewQuote[]
  /** Set when there is too little to read anything into. */
  tooFewToRead: boolean
}

const MIX_KEYS = ['1', '2', '3', '4', '5']
const emptyMix = (): Record<string, number> => Object.fromEntries(MIX_KEYS.map((k) => [k, 0]))

function tally(rows: ReviewRow[]): { count: number; avg: number | null; mix: Record<string, number> } {
  const mix = emptyMix()
  let sum = 0
  let n = 0
  for (const r of rows) {
    if (r.rating == null) continue
    const k = String(Math.round(r.rating))
    if (k in mix) mix[k]++
    sum += r.rating
    n++
  }
  return { count: rows.length, avg: n ? Math.round((sum / n) * 10) / 10 : null, mix }
}

/** Trim a review to a quotable excerpt without cutting mid-word. */
function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '...'
}

/**
 * Shape raw review rows into the digest. Pure, so the counting rules are testable.
 *
 * `quotes` deliberately takes from BOTH ends rather than the newest N. A run of recent
 * five-star reviews would otherwise hide the complaint that keeps recurring, and the
 * complaint is usually the useful part. Unhappy reviews are taken first for the same
 * reason, then happy ones fill the remaining room.
 */
export function summarizeReviews(
  rows: ReviewRow[],
  opts: { windowDays: number; recentDays?: number; maxQuotes?: number; now?: number },
): ReviewDigest {
  const recentDays = opts.recentDays ?? 365
  const maxQuotes = opts.maxQuotes ?? 20
  const now = opts.now ?? Date.now()
  const ageDays = (iso: string | null): number | null => {
    if (!iso) return null
    const t = Date.parse(iso)
    return Number.isFinite(t) ? (now - t) / 86_400_000 : null
  }

  const dated = rows.filter((r) => ageDays(r.postedAt) != null)
  const recentRows = dated.filter((r) => (ageDays(r.postedAt) as number) <= recentDays)
  const windowRows = dated.filter((r) => (ageDays(r.postedAt) as number) <= opts.windowDays)

  const withText = recentRows
    .filter((r) => r.text && r.text.trim().length > 12 && r.rating != null)
    .sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''))

  const unhappy = withText.filter((r) => (r.rating as number) <= 3)
  const happy = withText.filter((r) => (r.rating as number) >= 4)
  const room = Math.max(0, maxQuotes)
  const takeUnhappy = unhappy.slice(0, Math.min(unhappy.length, Math.ceil(room / 2)))
  const takeHappy = happy.slice(0, Math.max(0, room - takeUnhappy.length))

  const quotes: ReviewQuote[] = [...takeUnhappy, ...takeHappy]
    .sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''))
    .map((r) => ({
      rating: r.rating as number,
      when: (r.postedAt ?? '').slice(0, 10),
      text: excerpt(r.text as string),
    }))

  return {
    lifetime: tally(dated),
    recent: { days: recentDays, ...tally(recentRows) },
    inWindow: { days: opts.windowDays, count: windowRows.length },
    unanswered: recentRows.filter((r) => !r.answered).length,
    quotes,
    // Two reviews cannot tell you what "people" think, and saying otherwise is the
    // kind of confident nonsense this whole engine exists to avoid.
    tooFewToRead: withText.length < 3,
  }
}

/**
 * One topic people keep raising, with how many said it warmly vs unhappily.
 *
 * These counts drive a bar chart, so they must be real. They are NOT numbers the
 * model wrote: the model tags each quote it read with a topic and a sentiment, and
 * the counting happens here, over quotes that were verified to exist. A model that
 * hallucinates "12 people loved the banh mi" cannot put 12 on a chart.
 */
export interface ReviewTheme {
  label: string
  positive: number
  negative: number
  /** 1-based indexes into the quotes the model was shown, so a claim can be traced back. */
  positiveRefs: number[]
  negativeRefs: number[]
}

/** What the model returns per theme: a label plus which quotes support each side. */
export interface ThemeTags {
  label: string
  positive: number[]
  negative: number[]
}

/**
 * Turn the model's tags into counted themes, dropping anything it made up.
 *
 * Guards, in order: a reference must point at a quote that actually exists; the same
 * quote cannot be counted twice on the same side; a quote cannot be both praise and
 * complaint for one theme (the model must pick, and we keep the complaint, since the
 * softer reading is the one more likely to be wrong); and a theme nobody actually
 * said anything about is discarded rather than drawn as an empty bar.
 */
export function tallyThemes(tags: ThemeTags[], quoteCount: number, maxThemes = 6): ReviewTheme[] {
  const valid = (ids: unknown): number[] => {
    if (!Array.isArray(ids)) return []
    const seen = new Set<number>()
    for (const raw of ids) {
      const n = typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw), 10)
      if (Number.isFinite(n) && n >= 1 && n <= quoteCount) seen.add(n)
    }
    return [...seen].sort((a, b) => a - b)
  }

  const out: ReviewTheme[] = []
  for (const t of tags) {
    const label = typeof t?.label === 'string' ? t.label.trim() : ''
    if (!label) continue
    const negativeRefs = valid(t.negative)
    const negSet = new Set(negativeRefs)
    const positiveRefs = valid(t.positive).filter((id) => !negSet.has(id))
    if (positiveRefs.length + negativeRefs.length === 0) continue
    out.push({ label, positive: positiveRefs.length, negative: negativeRefs.length, positiveRefs, negativeRefs })
  }
  // Loudest topics first, so the chart leads with what comes up most.
  return out
    .sort((a, b) => (b.positive + b.negative) - (a.positive + a.negative))
    .slice(0, Math.max(0, maxThemes))
}
