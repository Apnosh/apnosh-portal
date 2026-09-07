import 'server-only'
/**
 * love/sentence — one true sentence about this week, in the owner's own numbers.
 *
 * Not a chart, not a percentage: the thing an owner would say out loud. "This week your Google
 * listing got 41 taps. Last week it was 33." It compares the client's last seven REPORTED
 * Google days against the seven before (gbpRows, the same reported-days rule the promises
 * ledger counts by, so the two never disagree). Google delivers days late and writes zero rows
 * for days it has not sent, so counting calendar days would compare a full week against a
 * half-reported one and print a fake drop.
 *
 * No Google, or not enough reported days: the same sentence on social reach, if there are posts.
 * Nothing to say: null. This never guesses, and it never says a number is up or down — it puts
 * the two weeks side by side and lets the owner see it.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { gbpRows, shiftDays, today, type Gbp } from '@/lib/promises/metrics'

const DAY = 86400000
const n = (v: number) => v.toLocaleString('en-US')

const taps = (r: Gbp) => (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0)

/** One plain sentence, or null when the client has no data to say it with. */
export async function weeklySentence(clientId: string): Promise<string | null> {
  if (!clientId) return null

  // Google first: it is the number owners recognise.
  try {
    // 60 days back, because a slow feed can leave big gaps and we still want 14 reported days.
    const rows = await gbpRows(clientId, shiftDays(today(), -60), today())
    const days = rows
      .filter((r) => r.location_id !== 'demo-proof')
      .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first
    if (days.length >= 14) {
      const thisWeek = days.slice(0, 7).reduce((sum, r) => sum + taps(r), 0)
      const lastWeek = days.slice(7, 14).reduce((sum, r) => sum + taps(r), 0)
      if (thisWeek + lastWeek > 0) {
        return `This week your Google listing got ${n(thisWeek)} taps: calls, directions, and website visits. Last week it was ${n(lastWeek)}.`
      }
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
    const thisWeek = sum(cut, null)
    const lastWeek = sum(since, cut)
    if (thisWeek + lastWeek === 0) return null
    return `This week your posts reached ${n(thisWeek)} people. Last week it was ${n(lastWeek)}.`
  } catch (e) {
    console.warn('[love] weekly sentence: social read failed', (e as Error)?.message)
    return null
  }
}
