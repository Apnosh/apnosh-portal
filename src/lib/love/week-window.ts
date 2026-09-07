/**
 * love/week-window — the day maths behind the weekly sentence, with no database in it.
 *
 * A client with two shops gets two Google rows for the same day, one per location. Counting
 * rows instead of days would call fourteen rows "two weeks" when it is really three and a half
 * days, and the sentence would print half a week as "this week". So the rows are added up per
 * DATE first — both shops on Tuesday are one Tuesday — and only then cut into two weeks.
 *
 * This lives in its own file so scripts/verify-love-sentence.ts can check it without pulling in
 * the server-only Supabase reader.
 */

const DAY = 86400000
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`)

export type DayValue = { date: string; value: number }

/**
 * One row per date, every location added together, newest date first.
 *
 * The promises ledger adds locations together the same way: gbpSum (src/lib/promises/metrics.ts)
 * sums every row it reads over the window, so a two-shop day is both shops. The one place the
 * ledger differs is its reportedDays, which counts ROWS — a two-shop client reads as twice the
 * days there. The sentence counts dates, because the words say "week".
 */
export function sumByDate(rows: DayValue[]): DayValue[] {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.date, (totals.get(r.date) ?? 0) + r.value)
  return [...totals.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * The last seven reported dates against the seven before, or null when those days are not
 * this week: the newest day is more than three days old (Google runs a couple of days behind),
 * or the fourteen days are spread over more than three calendar weeks.
 */
export function weekPair(rows: DayValue[], todayIso: string): { thisWeek: number; lastWeek: number } | null {
  const days = sumByDate(rows)
  if (days.length < 14) return null
  const todayMs = dayMs(todayIso)
  if (todayMs - dayMs(days[0].date) > 3 * DAY) return null
  if (dayMs(days[0].date) - dayMs(days[13].date) > 21 * DAY) return null
  const add = (from: number, to: number) => days.slice(from, to).reduce((sum, d) => sum + d.value, 0)
  return { thisWeek: add(0, 7), lastWeek: add(7, 14) }
}
