/**
 * verify-wins — proves the rules behind Move 7b without a browser, a database or a network call.
 *
 * Four claims, and each one is a way this move could quietly lie to an owner:
 *
 *   1. WHAT COUNTS AS A WIN. Only a stored card that is mint AND carries a real number. A quiet
 *      week, a "connect Google" state card, and a card whose big line has no number in it must
 *      never get a Show someone button — because the button mints a PUBLIC page, and a public page
 *      with no number on it is a claim about a business with nothing behind it.
 *   2. THE SHARE TOKEN IS AN ADDRESS NOBODY CAN GUESS. Long, from real randomness, and shaped so a
 *      junk URL is rejected before it ever reaches the database.
 *   3. THE REPORT NEVER PRINTS A NUMBER IT DOES NOT HAVE. A chapter with nothing in it gets the
 *      honest waiting line, never a zero, and a month with no chapters at all is never emailed.
 *   4. THE FIRST BUSINESS DAY IS THE FIRST BUSINESS DAY. The cron runs on the 1st through the 5th
 *      so a weekend cannot swallow a month; exactly one of those days may send.
 *
 * Plus the loop the i18n scanner cannot close: the weekly sentence's key is chosen at runtime, so
 * the scanner never sees it. Here we check the two keys the reader can return (they live in
 * love/week-window.ts, which has no database in it) are the two keys keys.ts lists and es.ts
 * translates.
 *
 * Pure imports only — nothing here touches the network, Stripe, or Supabase.
 *
 *   npx tsx scripts/verify-wins.ts
 */
import { isWin, isWinType, winNumber, newShareToken, isShareToken } from '../src/lib/love/win'
import {
  isFirstBusinessDay, monthKey, previousMonth, reportLines, hasSomethingToSay,
  WAITING_KEY, MOVED_KEY, SAID_ONE_KEY, SAID_MANY_KEY, WORKED_KEY, WORKED_POSTS_KEY,
} from '../src/lib/report/report-sent'
import { WEEKLY_GOOGLE_KEY, WEEKLY_SOCIAL_KEY } from '../src/lib/love/week-window'
import { SCREEN_KEYS } from '../src/lib/i18n/keys'
import { ES } from '../src/lib/i18n/es'
import { t } from '../src/lib/i18n/t'
import type { MonthlyReport } from '../src/lib/report/build-month'

let failures = 0
function check(name: string, ok: boolean | (() => boolean), detail?: string) {
  if (typeof ok === 'function' ? ok() : ok) { console.log(`  ok   ${name}`); return }
  failures += 1
  console.log(`  FAIL ${name}${detail ? `  →  ${detail}` : ''}`)
}

const win = (over: Partial<{ cardKey: string; cardType: string; big: string }> = {}) => ({
  cardKey: 'gbp-2026-08-24', cardType: 'gbp_week', big: '9 calls · 31 direction taps', ...over,
})

console.log('\n1. What counts as a win')
{
  check('a Google week with numbers is a win', isWin(win()))
  check('a post that reached people is a win', isWin(win({ cardKey: 'post-abc', cardType: 'post', big: '2,418 people saw it' })))
  check('a review month is a win', isWin(win({ cardKey: 'reviews-2026-08', cardType: 'reviews', big: '6 new reviews · 4.7 average' })))
  check('a campaign that moved a number is a win', isWin(win({ cardKey: 'campaign-moved-1', cardType: 'campaign_moved', big: '41 taps · was 13' })))

  check('a quiet week is NOT a win', !isWin(win({ cardKey: 'gbp-down-2026-08-24', cardType: 'gbp_down', big: '3 calls · 14 direction taps' })))
  check('a state card is NOT a win, whatever its tone', !isWin(win({ cardKey: 'state-coming-up', cardType: 'gbp_week', big: '3 pieces this week' })))
  check('a card with no number is NOT a win', !isWin(win({ big: 'Start your first campaign' })))
  check('a card whose number is zero is NOT a win', !isWin(win({ big: '0 calls · 0 direction taps' })))
  check('connect Google is NOT a win', !isWin(win({ cardKey: 'state-connect-google', cardType: 'connect_google', big: 'Connect Google' })))

  check('the tone table is the deck\'s, not a second copy', isWinType('gbp_week') && isWinType('post') && !isWinType('gbp_down') && !isWinType('reviews_waiting'))

  check('a thousands separator is one number, not two', winNumber('2,418 people saw it') === 2418)
  check('a decimal survives', winNumber('4.7 average') === 4.7)
  check('no digits means no number', winNumber('Start your first campaign') === null)
  check('zero is not a number worth showing', winNumber('0 calls') === null)
  check('rubbish in is null out', winNumber('') === null && winNumber(undefined as unknown as string) === null)
}

console.log('\n2. The share token')
{
  const a = newShareToken(), b = newShareToken()
  check('a token is 22 characters', a.length === 22, a)
  check('two tokens are not the same', a !== b)
  check('a token we minted passes the shape check', isShareToken(a) && isShareToken(b))
  check('nothing outside the alphabet is accepted', !isShareToken('AAAAAAAAAAAAAAAAAAAAAA') && !isShareToken('abcdefghijklmnopqrstuv'))
  check('a short or long token is refused', !isShareToken('abc') && !isShareToken(`${a}x`))
  check('a non-string is refused', !isShareToken(null) && !isShareToken(undefined) && !isShareToken(42))
  check('a path traversal is refused', !isShareToken('../../etc/passwd'))
  // 300 tokens, no repeats: proof the source is real randomness and not a counter.
  const many = new Set(Array.from({ length: 300 }, () => newShareToken()))
  check('300 tokens are 300 different tokens', many.size === 300, String(many.size))
}

console.log('\n3. The report never prints a number it does not have')
{
  const base: MonthlyReport = {
    year: 2026, month: 8, monthLabel: 'August', sealed: true,
    found: null, said: null, worked: null, moved: null,
  }
  const empty = reportLines(base)
  check('an empty month is three waiting lines', empty.length === 3 && empty.every((l) => l.key === WAITING_KEY))
  check('an empty month is never emailed', !hasSomethingToSay(base))

  const full: MonthlyReport = {
    ...base,
    moved: { calls: 9, directions: 31, siteClicks: 12, priorCalls: 4, priorDirections: 12, priorSiteClicks: 6 },
    said: { count: 6, avg: 4.7, priorCount: 2, quote: null, loved: [], heard: [] },
    worked: { posts: 4, topTitle: 'Taco Tuesday', topReach: 2418 },
  }
  const lines = reportLines(full)
  check('a full month says moved, said and worked, in that order',
    lines[0].key === MOVED_KEY && lines[1].key === SAID_MANY_KEY && lines[2].key === WORKED_KEY,
    lines.map((l) => l.key).join(' | '))
  check('a full month is worth an email', hasSomethingToSay(full))
  check('the numbers written out are the ledger\'s',
    t(lines[0].key, 'en', lines[0].vars) === 'What it moved: 9 calls, 31 directions, 12 site visits.',
    t(lines[0].key, 'en', lines[0].vars))

  const one = reportLines({ ...full, said: { count: 1, avg: 5, priorCount: 0, quote: null, loved: [], heard: [] } })
  check('one review is a review, not reviews', one[1].key === SAID_ONE_KEY)

  const unmeasured = reportLines({ ...full, worked: { posts: 3, topTitle: null, topReach: 0 } })
  check('posts with no measured reach say how many posts, not "0 people saw it"',
    unmeasured[2].key === WORKED_POSTS_KEY && unmeasured[2].vars.n === 3)

  // Every line the email can print must have Spanish, or a Spanish owner gets an English email.
  const emailKeys = [MOVED_KEY, SAID_ONE_KEY, SAID_MANY_KEY, WORKED_KEY, WORKED_POSTS_KEY, WAITING_KEY, 'Your {month} is ready']
  check('every email line has Spanish', emailKeys.every((k) => !!ES[k]), emailKeys.filter((k) => !ES[k]).join(' | '))
  check('every email line is listed in keys.ts',
    emailKeys.every((k) => SCREEN_KEYS.reportEmail.includes(k)),
    emailKeys.filter((k) => !SCREEN_KEYS.reportEmail.includes(k)).join(' | '))
  check('the waiting line carries no number', !/\{[a-z]+\}/.test(WAITING_KEY) && !/\d/.test(WAITING_KEY))
}

console.log('\n4. The first business day')
{
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16))
  // September 2026: the 1st is a Tuesday.
  check('Tuesday the 1st sends', isFirstBusinessDay(utc(2026, 9, 1)))
  check('the 2nd does not', !isFirstBusinessDay(utc(2026, 9, 2)))
  // August 2026: the 1st is a Saturday, so Monday the 3rd is the first business day.
  check('a Saturday 1st does not send', !isFirstBusinessDay(utc(2026, 8, 1)))
  check('the Sunday after it does not send', !isFirstBusinessDay(utc(2026, 8, 2)))
  check('Monday the 3rd sends', isFirstBusinessDay(utc(2026, 8, 3)))
  // November 2026: the 1st is a Sunday, so Monday the 2nd is the first business day.
  check('a Sunday 1st does not send', !isFirstBusinessDay(utc(2026, 11, 1)))
  check('Monday the 2nd sends', isFirstBusinessDay(utc(2026, 11, 2)))
  // Exactly one day in each of the first five may send, every month for two years.
  const bad: string[] = []
  for (let y = 2026; y <= 2027; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      let n = 0
      for (let d = 1; d <= 5; d += 1) if (isFirstBusinessDay(utc(y, m, d))) n += 1
      if (n !== 1) bad.push(`${y}-${m}:${n}`)
    }
  }
  check('exactly one of the first five days sends, every month', bad.length === 0, bad.join(' '))

  check('the report is about LAST month', monthKey(previousMonth(utc(2026, 9, 1)).year, previousMonth(utc(2026, 9, 1)).month) === '2026-08')
  check('January reaches back into last year', monthKey(previousMonth(utc(2026, 1, 1)).year, previousMonth(utc(2026, 1, 1)).month) === '2025-12')
  check('the month key is what the link carries', monthKey(2026, 3) === '2026-03')
}

console.log('\n5. The weekly sentence the scanner cannot see')
{
  // The key is picked at runtime, so scan-screen.ts never reads it off the component. This is the
  // check that stands in for it.
  const keys = [WEEKLY_GOOGLE_KEY, WEEKLY_SOCIAL_KEY]
  check('both sentences are listed in keys.ts', keys.every((k) => SCREEN_KEYS.weekly.includes(k)))
  check('keys.ts lists no sentence the reader cannot return', SCREEN_KEYS.weekly.every((k) => keys.includes(k)))
  check('both sentences have Spanish', keys.every((k) => !!ES[k]), keys.filter((k) => !ES[k]).join(' | '))
  check('both holes survive into the Spanish', keys.every((k) => ES[k].includes('{n}') && ES[k].includes('{prev}')))
  check('the two weeks are put side by side, never called up or down',
    keys.every((k) => !/\b(up|down|better|worse)\b/i.test(k)))
}

console.log(failures === 0 ? '\n✓ wins verified\n' : `\n✗ ${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
