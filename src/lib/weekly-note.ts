/**
 * THE WEEKLY NOTE — one finding, delivered.
 * ==========================================
 * Sixteen of twenty owners in testing asked for something that arrives rather
 * than something they log into. Three of five in one group said they would pay
 * MORE for a weekly text than for the app. The product's answer so far was a
 * monthly in-app nudge reading "Your {Month} recap is ready", which is a chore:
 * it announces that work exists somewhere else and asks them to go and do it.
 *
 * This composes the opposite. The message CARRIES the finding, so the value has
 * already landed when they read it and opening the app is optional. That serves
 * both ends of the list at once: the owner who will never open a dashboard
 * still gets what they pay for, and the owner who audits everything has
 * something specific to go and check.
 *
 * ONE finding, not a digest. A list of seven numbers is a dashboard in a
 * message. The candidates below are ranked by what an owner can actually act on
 * this week, and only the top one leads.
 *
 * Delivery is deliberately not this file's business. It returns text; the cron
 * decides what carries it. Email works today; SMS is the same text once carrier
 * registration clears, and that is the channel most of these owners asked for.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Lang } from '@/lib/i18n/t'

export interface WeeklyNote {
  /** The one sentence that is the point. Leads the message and the subject. */
  headline: string
  /** At most two supporting lines. Never a digest. */
  lines: string[]
  /** True when the honest answer is "a quiet week" — the caller may skip sending. */
  quiet: boolean
}

const DAY = 86400000
const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** A candidate finding and how much it deserves to lead. */
interface Cand { rank: number; headline: string; line?: string }

/**
 * Build this week's note for one client. Read-only, never throws: a failed read
 * simply removes its candidate rather than losing the whole message.
 */
export async function buildWeeklyNote(clientId: string, lang: Lang = 'en', asOf?: Date): Promise<WeeklyNote> {
  const admin = createAdminClient()
  /* asOf lets a cron re-send a week it missed, and lets this be checked against
     a week that actually had data rather than only against today. */
  const now = asOf ?? new Date()
  const weekAgo = new Date(now.getTime() - 7 * DAY)
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY)
  const cands: Cand[] = []
  const es = lang === 'es'

  /* ── Reviews: the thing that recurs, and the thing owners act on ───────── */
  try {
    const { data } = await admin
      .from('reviews')
      .select('rating, posted_at, review_text, response_text, author_name')
      .eq('client_id', clientId)
      .gte('posted_at', twoWeeksAgo.toISOString())
    const rows = (data ?? []) as Array<{ rating: number | null; posted_at: string | null; review_text: string | null; response_text: string | null; author_name: string | null }>
    const inWeek = rows.filter((r) => (r.posted_at ?? '') >= weekAgo.toISOString())
    const prior = rows.filter((r) => (r.posted_at ?? '') < weekAgo.toISOString())

    /* A bad review nobody answered is the most actionable thing that can happen
       to a restaurant in a week, so it outranks every number below. */
    const badUnanswered = inWeek.filter((r) => Number(r.rating ?? 5) <= 3 && !(r.response_text ?? '').trim())
    if (badUnanswered.length) {
      const n = badUnanswered.length
      cands.push({
        rank: 100,
        headline: es
          ? `${n === 1 ? 'Una reseña crítica' : `${n} reseñas críticas`} sin responder esta semana.`
          : `${n === 1 ? 'A critical review' : `${n} critical reviews`} came in this week with no reply.`,
        line: es ? 'Responder pronto es lo que más mueve tu reputación.' : 'Answering quickly is the thing that moves a rating most.',
      })
    }

    if (inWeek.length) {
      const avg = inWeek.reduce((t, r) => t + Number(r.rating ?? 0), 0) / inWeek.length
      cands.push({
        rank: 60,
        headline: es
          ? `${inWeek.length} ${inWeek.length === 1 ? 'reseña nueva' : 'reseñas nuevas'} esta semana, con ${avg.toFixed(1)} de promedio.`
          : `${inWeek.length} new ${inWeek.length === 1 ? 'review' : 'reviews'} this week, averaging ${avg.toFixed(1)}.`,
        line: prior.length
          ? (es ? `La semana anterior fueron ${prior.length}.` : `The week before that it was ${prior.length}.`)
          : undefined,
      })
    }
  } catch { /* no reviews candidate */ }

  /* ── Google: calls and directions, this week against last ──────────────── */
  try {
    const { data } = await admin
      .from('gbp_metrics')
      .select('date, calls, directions')
      .eq('client_id', clientId)
      .gte('date', ymd(twoWeeksAgo))
    const rows = (data ?? []) as Array<{ date: string; calls: number | null; directions: number | null }>
    const cut = ymd(weekAgo)
    const sum = (rs: typeof rows, k: 'calls' | 'directions') => rs.reduce((t, r) => t + Number(r[k] ?? 0), 0)
    const thisW = rows.filter((r) => r.date >= cut)
    const lastW = rows.filter((r) => r.date < cut)
    /* Both weeks must have data. Comparing a full week against a week we never
       collected is how "down 100%" gets sent to somebody having a normal week.

       AND A ROW IS NOT DATA. The sync writes a row per day with zeros for days
       Google has not delivered yet, so counting rows proves nothing. Caught on
       live data: one client's calls and directions had reported nothing for nine
       days while impressions kept arriving, and the first draft of this note
       cheerfully told them their calls were down 100%. We cannot tell "no calls"
       apart from "no data" in this table, so a metric with no non-zero day in
       THIS week says nothing at all. Silence is the honest answer; a false alarm
       is the one thing a weekly note cannot survive sending. */
    const anyNonZero = (rs: typeof rows, k: 'calls' | 'directions') => rs.some((r) => Number(r[k] ?? 0) > 0)
    if (thisW.length >= 5 && lastW.length >= 5) {
      for (const [k, wordEn, wordEs] of [['calls', 'calls', 'llamadas'], ['directions', 'people asking for directions', 'personas pidiendo cómo llegar']] as const) {
        if (!anyNonZero(thisW, k) || !anyNonZero(lastW, k)) continue
        const a = sum(lastW, k), b = sum(thisW, k)
        if (a < 5 && b < 5) continue // too small for a percentage to mean anything
        const pct = a > 0 ? Math.round(((b - a) / a) * 100) : null
        if (pct == null || Math.abs(pct) < 25) continue
        const up = pct > 0
        cands.push({
          rank: up ? 55 : 70, // a fall is more worth telling them about than a rise
          headline: es
            ? `${b} ${wordEs} esta semana, ${up ? 'un' : 'un'} ${Math.abs(pct)}% ${up ? 'más' : 'menos'} que la semana pasada.`
            : `${b} ${wordEn} this week, ${Math.abs(pct)}% ${up ? 'up on' : 'down on'} last week.`,
        })
      }
    }
  } catch { /* no google candidate */ }

  /* ── Nothing worth reporting is itself an honest answer ─────────────────── */
  if (!cands.length) {
    return {
      headline: es ? 'Semana tranquila: nada se movió lo suficiente como para avisarte.' : 'A quiet week. Nothing moved enough to be worth telling you about.',
      lines: [],
      quiet: true,
    }
  }

  cands.sort((a, b) => b.rank - a.rank)
  const lead = cands[0]
  const rest = cands.slice(1, 3).map((c) => c.headline)
  return {
    headline: lead.headline,
    lines: [lead.line, ...rest].filter((x): x is string => !!x).slice(0, 2),
    quiet: false,
  }
}

/** The note as one plain-text message. The same text an SMS will carry. */
export function noteToText(note: WeeklyNote, businessName: string, lang: Lang = 'en'): string {
  const head = lang === 'es' ? `${businessName}, esta semana:` : `${businessName}, this week:`
  return [head, '', note.headline, ...note.lines].join('\n').trim()
}
