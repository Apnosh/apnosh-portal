/**
 * verify-review-lanes — checks the "Reply to reviews" card the way verify-order-links
 * checks the order-button card: against realistic rows, with no network and no database.
 *
 * Two things are covered, and both have burned us before on other cards:
 *   the QUEUE      what gets shown, in what order, and whether the counted sentence is true
 *   the LANES      that picking a version actually changes the producer, the price and the
 *                  task, rather than rendering three tabs that all do the same thing
 *
 * Run: node_modules/.bin/tsx scripts/verify-review-lanes.ts
 */

import { buildQueue, headlineFor, type ReviewRow } from '../src/lib/reviews/queue'
import { gbpLaneFromDoer } from '../src/lib/campaigns/builder/adapter'
import { whatYouGet } from '../src/lib/campaigns/builder/what-you-get'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

const NOW = Date.parse('2026-07-21T12:00:00Z')
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function row(p: Partial<ReviewRow> & { id: string }): ReviewRow {
  return {
    rating: 5, author_name: 'A guest', review_text: 'Nice.', posted_at: day(1),
    response_text: null, review_url: 'accounts/1/locations/2/reviews/3', ...p,
  }
}

/* ── the queue ──────────────────────────────────────────────────── */

section('ordering: worst first, then longest waiting')
{
  const q = buildQueue([
    row({ id: 'four-yesterday', rating: 4, posted_at: day(1) }),
    row({ id: 'one-old', rating: 1, posted_at: day(40) }),
    row({ id: 'one-recent', rating: 1, posted_at: day(2) }),
    row({ id: 'five', rating: 5, posted_at: day(90) }),
  ], NOW).queue.map((r) => r.id)

  ok('a one-star never sits behind a four-star', q.indexOf('one-old') < q.indexOf('four-yesterday'))
  ok('among equals, the one waiting longest comes first', q.indexOf('one-old') < q.indexOf('one-recent'))
  ok('a five-star is last even when it is the oldest', q[q.length - 1] === 'five')
}

section('what is excluded, and why')
{
  const read = buildQueue([
    row({ id: 'answered', response_text: 'Thanks!' }),
    row({ id: 'no-address', review_url: null }),
    row({ id: 'waiting' }),
  ], NOW)

  ok('an answered review is not in the queue', !read.queue.some((r) => r.id === 'answered'))
  ok('a review with no address to reply to is not in the queue', !read.queue.some((r) => r.id === 'no-address'))
  ok('but it IS counted, so the owner is not left wondering', read.unreachable === 1)
  ok('the answered one counts as replied', read.replied === 1)
  ok('total describes the whole listing, not the backlog', read.total === 3)
}

section('the counted sentence is true')
{
  const read = buildQueue([
    row({ id: 'a', rating: 1 }), row({ id: 'b', rating: 2 }), row({ id: 'c', rating: 5 }),
  ], NOW)
  ok('it names the real waiting count', read.headline.startsWith('3 reviews'))
  ok('it names the real critical count', read.headline.includes('2 of them are 3 stars or below'))
  ok('nothing waiting says exactly that', headlineFor(0, 0, 4.5) === 'Every review on your Google listing has a reply.')
  ok('one waiting reads as singular', headlineFor(1, 0, null) === '1 review on your listing has no reply yet.')
  ok('one critical reads as singular', headlineFor(2, 1, null).includes('1 of them is 3 stars'))
  ok('no rating means no invented rating', !headlineFor(2, 0, null).includes('rating'))
}

section('averages and waits come from the rows')
{
  const read = buildQueue([
    row({ id: 'a', rating: 4, posted_at: day(10) }),
    row({ id: 'b', rating: 5, posted_at: day(3) }),
  ], NOW)
  ok('average is over ALL reviews, answered or not', read.average === 4.5)
  ok('longest wait is the real longest', read.longestWaitDays === 10)
  ok('waiting days are whole days', read.queue.every((r) => r.waitingDays == null || Number.isInteger(r.waitingDays)))
}

section('missing data never throws or invents')
{
  const read = buildQueue([
    row({ id: 'no-text', review_text: null, rating: null, posted_at: null, author_name: null }),
  ], NOW)
  ok('a nameless reviewer gets a neutral name', read.queue[0].author === 'A guest')
  ok('no text is empty, not a placeholder sentence', read.queue[0].text === '')
  ok('no date means no invented wait', read.queue[0].waitingDays === null)
  ok('an unrated review is not counted as critical', read.critical === 0)
  ok('an unrated review does not move the average', read.average === null)
  ok('an empty listing is fine', buildQueue([], NOW).queue.length === 0)
}

/* ── the lanes ──────────────────────────────────────────────────── */

section('the three versions decode to three different lanes')
{
  const SELF = 'done by you yourself, step by step, free'
  const AI = 'done with Apnosh AI, step by step, free'
  const TEAM = 'done for you by Apnosh, $165 a month'

  ok('"yourself" is the free self-serve lane', gbpLaneFromDoer(SELF) === 'diy')
  ok('"Apnosh AI" is the AI lane', gbpLaneFromDoer(AI) === 'ai')
  ok('plain "Apnosh" is the team lane', gbpLaneFromDoer(TEAM) === 'team')
  ok('the monthly price does not confuse the decode', gbpLaneFromDoer(TEAM) !== 'ai')
}

section('each version promises something different')
{
  const rows = (v: 'diy' | 'ai' | 'team') =>
    whatYouGet('reviewsreply', { version: v })[0].rows.join(' | ')
  const diy = rows('diy'), ai = rows('ai'), team = rows('team')

  ok('the three lanes do not render identical copy', new Set([diy, ai, team]).size === 3)
  ok('the free lane says YOU post them', /you write and post/i.test(diy))
  ok('the AI lane says we draft and you approve', /draft/i.test(ai) && /approve/i.test(ai))
  ok('the AI lane promises proof, like the other cards', /prove|proof/i.test(ai))
  ok('neither owner-run lane claims to keep running', !/every month|ongoing/i.test(diy + ai))
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: review queue is counted and honest, and the three lanes are real (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
