/**
 * The review-reply QUEUE — pure, no I/O, so it can be checked against real rows.
 *
 * The route hands it every Google review we hold and gets back what is waiting, in the
 * order an owner should work through it, plus the counted sentence for the top of the
 * screen. Keeping this separate from the route is what made the order-links diagnosis
 * verifiable, and the same reasoning applies: the ordering rule and the honesty of the
 * headline are the parts most likely to quietly go wrong, and both are pure functions
 * of the rows.
 */

/** Only the columns the queue reasons about. Typed narrow so any caller's row fits. */
export interface ReviewRow {
  id: string
  rating: number | null
  author_name: string | null
  review_text: string | null
  posted_at: string | null
  response_text: string | null
  /** Google's own review path. Without it there is no address to post a reply to. */
  review_url: string | null
}

export interface QueuedReview {
  id: string
  rating: number | null
  author: string
  text: string
  postedAt: string | null
  waitingDays: number | null
}

export interface QueueRead {
  queue: QueuedReview[]
  total: number
  replied: number
  critical: number
  longestWaitDays: number | null
  /** Unanswered, but we hold no address to reply to. Counted, never queued. */
  unreachable: number
  average: number | null
  headline: string
}

/** `now` is a parameter, not Date.now(), so a test can pin it. */
export function buildQueue(rows: ReviewRow[], now: number): QueueRead {
  const daysSince = (iso: string | null): number | null =>
    iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000)) : null

  const unanswered = rows.filter((r) => !r.response_text)
  // Held back on purpose. These ARE unanswered, but a reply we cannot post is a reply the
  // owner wasted their time writing, so they are reported separately rather than queued.
  const waiting = unanswered.filter((r) => !!r.review_url)
  const unreachable = unanswered.length - waiting.length

  // Worst first, then longest waiting. A one-star sitting for a month is the reply that
  // actually costs money, and it must never sit behind a four-star from yesterday.
  // Missing ratings sort as 5: an unrated review is not evidence of a problem.
  const sorted = [...waiting].sort((a, b) =>
    (a.rating ?? 5) - (b.rating ?? 5) || (a.posted_at ?? '').localeCompare(b.posted_at ?? ''))

  const queue: QueuedReview[] = sorted.map((r) => ({
    id: r.id,
    rating: r.rating,
    author: (r.author_name || 'A guest').trim(),
    text: (r.review_text || '').trim(),
    postedAt: r.posted_at,
    waitingDays: daysSince(r.posted_at),
  }))

  const rated = rows.filter((r) => typeof r.rating === 'number')
  const average = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length) * 10) / 10
    : null

  const critical = queue.filter((r) => (r.rating ?? 5) <= 3).length

  return {
    queue,
    total: rows.length,
    replied: rows.filter((r) => r.response_text).length,
    critical,
    longestWaitDays: queue.reduce<number | null>((m, r) => (r.waitingDays == null ? m : Math.max(m ?? 0, r.waitingDays)), null),
    unreachable,
    average,
    headline: headlineFor(queue.length, critical, average),
  }
}

/** Counted, never guessed. Every number in this sentence came from the rows. */
export function headlineFor(waiting: number, critical: number, average: number | null): string {
  if (waiting === 0) return 'Every review on your Google listing has a reply.'
  const one = waiting === 1
  const head = `${waiting} review${one ? '' : 's'} on your listing ${one ? 'has' : 'have'} no reply yet`
  if (critical > 0) return `${head}, and ${critical} of them ${critical === 1 ? 'is' : 'are'} 3 stars or below.`
  if (average != null) return `${head}. Your rating is ${average}.`
  return `${head}.`
}
