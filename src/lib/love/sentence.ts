import 'server-only'
/**
 * love/sentence — one true sentence about this week, in the owner's own numbers.
 *
 * Not a chart, not a percentage: the thing an owner would say out loud. "This week your Google
 * listing got 41 taps. Last week it was 33." It compares the client's last seven REPORTED
 * Google days against the seven before (gbpRows, the same reported-days rule the promises
 * ledger counts by). Google delivers days late and writes zero rows for days it has not sent,
 * so counting calendar days would compare a full week against a half-reported one and print a
 * fake drop. A client with more than one shop gets one Google row per shop per day, so the rows
 * are added up per day before the weeks are cut (src/lib/love/week-window.ts) — the same way the
 * ledger adds locations together.
 *
 * One difference from the ledger, on purpose: the demo location is dropped here. gbpRows keeps
 * every location, and a demo row would put made-up taps in a sentence the owner reads as theirs.
 *
 * The words say "this week", so the days have to BE this week: the newest reported day within
 * three days of today, and the fourteen days inside three weeks. Otherwise a listing that went
 * quiet in July would still be printing July's taps as "this week".
 *
 * No Google, or days too old: the same sentence on social reach, if there are posts.
 * Nothing to say: null. This never guesses, and it never says a number is up or down — it puts
 * the two weeks side by side and lets the owner see it.
 *
 * IT COMES BACK IN PIECES, NOT AS A FINISHED STRING. Ten of the twenty owners read Spanish, and a
 * sentence glued together here could only ever be English. So the reader returns the i18n KEY plus
 * the two raw numbers, and whoever draws it fills the holes in the owner's own language and their
 * own number grouping. weeklySentence() below keeps the
 * finished English for the places that are English by definition — the staff love table.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { gbpRows, shiftDays, today, type Gbp } from '@/lib/promises/metrics'
import { weekPair, WEEKLY_GOOGLE_KEY, WEEKLY_SOCIAL_KEY } from '@/lib/love/week-window'
import { t } from '@/lib/i18n/t'

const DAY = 86400000

const taps = (r: Gbp) => (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0)

/** The sentence before it is written out: which one it is, and the two numbers in it. */
export interface WeeklyLine {
  /** the English sentence, which is also the i18n key (src/lib/i18n/t.ts) */
  key: string
  /** this week's number and last week's, raw — grouped by whoever draws them */
  vars: { n: number; prev: number }
}

/* The two sentences live in week-window.ts, which has no database in it, so a script can check
   them against keys.ts and es.ts. Re-exported here because this is where they are chosen. */
export { WEEKLY_GOOGLE_KEY, WEEKLY_SOCIAL_KEY }

/**
 * The finished English sentence, for the surfaces that are English by definition (the staff love
 * table). Everything an OWNER reads goes through weeklyLine() and t() instead.
 */
export async function weeklySentence(clientId: string): Promise<string | null> {
  const line = await weeklyLine(clientId)
  if (!line) return null
  return t(line.key, 'en', { n: line.vars.n.toLocaleString('en-US'), prev: line.vars.prev.toLocaleString('en-US') })
}

/** One plain sentence in pieces, or null when the client has no data to say it with. */
export async function weeklyLine(clientId: string): Promise<WeeklyLine | null> {
  if (!clientId) return null

  // Google first: it is the number owners recognise.
  try {
    // 60 days back, because a slow feed can leave big gaps and we still want 14 reported days.
    const rows = await gbpRows(clientId, shiftDays(today(), -60), today())
    // Per DATE, not per row: a client with two shops has two rows for the same day, and slicing
    // fourteen rows would cut the week in half. weekPair adds the locations up per day, takes the
    // newest fourteen days, and checks those days are actually this week.
    const pair = weekPair(
      rows.filter((r) => r.location_id !== 'demo-proof').map((r) => ({ date: r.date, value: taps(r) })),
      today(),
    )
    if (pair && pair.thisWeek + pair.lastWeek > 0) {
      return { key: WEEKLY_GOOGLE_KEY, vars: { n: pair.thisWeek, prev: pair.lastWeek } }
    }
  } catch (e) {
    console.warn('[love] weekly sentence: google read failed', (e as Error)?.message)
  }

  // Social, on the same shape: what the posts of the last seven days reached.
  try {
    const since = new Date(Date.now() - 14 * DAY).toISOString()
    const cut = new Date(Date.now() - 7 * DAY).toISOString()
    const { data } = await createAdminClient()
      .from('social_posts')
      .select('reach, video_views, posted_at')
      .eq('client_id', clientId)
      .gte('posted_at', since)
    const posts = (data ?? []) as { reach: number | null; video_views: number | null; posted_at: string }[]
    if (!posts.length) return null
    // Reach and video views measure the same thing on different platforms; take the bigger one,
    // the way the promises ledger does, so a video account is not counted as silent.
    const sum = (from: string, to: string | null) => posts
      .filter((p) => String(p.posted_at) >= from && (to === null || String(p.posted_at) < to))
      .reduce((t, p) => t + Math.max(p.reach ?? 0, p.video_views ?? 0), 0)
    const count = (from: string, to: string | null) => posts
      .filter((p) => String(p.posted_at) >= from && (to === null || String(p.posted_at) < to))
      .length
    const thisWeek = sum(cut, null)
    const lastWeek = sum(since, cut)
    /* BOTH weeks need posts before the two numbers can be compared. Nothing posted last week
     * sums to 0, and "Last week it was 0" reads as "your posts reached nobody" when the truth
     * is that there were no posts to reach anyone. A week with no posts has no comparison. */
    if (!count(cut, null) || !count(since, cut)) return null
    if (thisWeek + lastWeek === 0) return null
    return { key: WEEKLY_SOCIAL_KEY, vars: { n: thisWeek, prev: lastWeek } }
  } catch (e) {
    console.warn('[love] weekly sentence: social read failed', (e as Error)?.message)
    return null
  }
}
