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
  /** Where each measured stage is heading inside the window (from its 7-day average). */
  trends: AnalystTrend[]
  /** The weekday rhythm of the Awareness series, last eight weeks. */
  rhythm: AnalystRhythm | null
  /** The days that stood out against their own week, named when they land on a holiday. */
  standouts: AnalystStandout[]
  /** Every launch with a known go-live date inside the window. */
  launches: Array<{ name: string; date: string; stage: string }>
}

export interface AnalystTrend { stage: number; label: string; firstAvg: number; lastAvg: number; changePct: number | null; days: number }
export interface AnalystRhythm { strongestDay: string; weakestDay: string; weekendVsWeekdayPct: number | null; byDay: Array<{ day: string; avg: number }> }
export interface AnalystStandout { date: string; value: number; vsWeekPct: number; holiday: string | null; weekday: string }

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS = 86400000
function nthWeekday(y: number, m: number, dow: number, n: number): Date { const d = new Date(y, m, 1); const off = (dow - d.getDay() + 7) % 7; return new Date(y, m, 1 + off + (n - 1) * 7) }
function lastWeekday(y: number, m: number, dow: number): Date { const d = new Date(y, m + 1, 0); const off = (d.getDay() - dow + 7) % 7; return new Date(y, m + 1, -off) }
/** US holidays the trade feels; used ONLY to name a stand-out day, never to explain it. */
export function usHolidays(y: number): Array<{ ms: number; name: string }> {
  const f = (m: number, d: number, name: string) => ({ ms: new Date(y, m, d).getTime(), name })
  const w = (d: Date, name: string) => ({ ms: d.getTime(), name })
  return [
    f(0, 1, "New Year's Day"), w(nthWeekday(y, 0, 1, 3), 'MLK Day'), w(nthWeekday(y, 1, 0, 2), 'Super Bowl Sunday'), f(1, 14, "Valentine's Day"), w(nthWeekday(y, 1, 1, 3), "Presidents' Day"),
    f(2, 17, "St. Patrick's Day"), f(4, 5, 'Cinco de Mayo'), w(nthWeekday(y, 4, 0, 2), "Mother's Day"), w(lastWeekday(y, 4, 1), 'Memorial Day'), w(nthWeekday(y, 5, 0, 3), "Father's Day"), f(5, 19, 'Juneteenth'),
    f(6, 4, 'July 4th'), w(nthWeekday(y, 8, 1, 1), 'Labor Day'), f(9, 31, 'Halloween'), f(10, 11, 'Veterans Day'), w(nthWeekday(y, 10, 4, 4), 'Thanksgiving'), w(new Date(nthWeekday(y, 10, 4, 4).getTime() + DAY_MS), 'Black Friday'),
    f(11, 24, 'Christmas Eve'), f(11, 25, 'Christmas'), f(11, 31, "New Year's Eve"),
  ]
}
export function holidayOn(dateYmd: string): string | null {
  const ms = new Date(dateYmd + 'T00:00:00').getTime()
  const y = new Date(ms).getFullYear()
  return [...usHolidays(y), ...usHolidays(y - 1)].find((h) => Math.abs(h.ms - ms) < DAY_MS / 2)?.name ?? null
}
/** 7-day rolling average, first stretch vs last (a week each, or a third of a short window). */
export function deriveTrend(stage: number, label: string, series: Array<{ date: string; value: number }>): AnalystTrend | null {
  // trailing zero-filled days are unreported, not quiet — cut them (at most a week)
  let cut = series.length
  while (cut > 0 && cut > series.length - 7 && series[cut - 1].value === 0) cut--
  const s = series.slice(0, cut)
  if (s.length < 6) return null
  const stretch = Math.max(2, Math.min(7, Math.floor(s.length / 3)))
  const mean = (arr: Array<{ value: number }>) => arr.reduce((t, x) => t + x.value, 0) / Math.max(1, arr.length)
  const firstAvg = mean(s.slice(0, stretch)), lastAvg = mean(s.slice(-stretch))
  const changePct = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : null
  return { stage, label, firstAvg: Math.round(firstAvg), lastAvg: Math.round(lastAvg), changePct, days: s.length }
}
export function deriveRhythm(series: Array<{ date: string; value: number }>): AnalystRhythm | null {
  const recent = series.slice(-56).filter((d) => d.value > 0)
  if (recent.length < 14) return null
  const by = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }))
  for (const d of recent) { const k = new Date(d.date + 'T00:00:00').getDay(); by[k].sum += d.value; by[k].n++ }
  const avg = by.map((b) => (b.n ? b.sum / b.n : 0))
  const best = avg.indexOf(Math.max(...avg)), worst = avg.indexOf(Math.min(...avg.filter((v) => v > 0).length ? avg.map((v) => (v > 0 ? v : Infinity)) : avg))
  const weekday = [1, 2, 3, 4, 5].reduce((t, k) => t + avg[k], 0) / 5, weekend = (avg[0] + avg[6]) / 2
  return {
    strongestDay: WEEKDAY_NAMES[best], weakestDay: WEEKDAY_NAMES[worst],
    weekendVsWeekdayPct: weekday > 0 ? Math.round(((weekend - weekday) / weekday) * 100) : null,
    byDay: [1, 2, 3, 4, 5, 6, 0].map((k) => ({ day: WEEKDAY_NAMES[k].slice(0, 3), avg: Math.round(avg[k]) })),
  }
}
export function deriveStandouts(series: Array<{ date: string; value: number }>, max = 3): AnalystStandout[] {
  let cut = series.length
  while (cut > 0 && cut > series.length - 7 && series[cut - 1].value === 0) cut--
  // the newest two days may still be filling in — never call one of them a stand-out
  const s = series.slice(0, Math.max(0, cut - 2))
  const dev = s.map((d, i) => { const sl = s.slice(Math.max(0, i - 6), i + 1); const avg = sl.reduce((t, x) => t + x.value, 0) / sl.length; return { d, pct: avg > 0 ? Math.round(((d.value - avg) / avg) * 100) : 0 } })
  return dev.filter((x) => Math.abs(x.pct) >= 25).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, max).sort((a, b) => a.d.date.localeCompare(b.d.date))
    .map((x) => ({ date: x.d.date, value: x.d.value, vsWeekPct: x.pct, holiday: holidayOn(x.d.date), weekday: WEEKDAY_NAMES[new Date(x.d.date + 'T00:00:00').getDay()] }))
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
