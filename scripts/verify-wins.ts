/**
 * verify-wins — proves the rules behind Move 7b without a browser, a database or a network call.
 *
 * Four claims, and each one is a way this move could quietly lie to an owner:
 *
 *   1. WHAT COUNTS AS A WIN. A COUNTED PROMISE and nothing else: an order the owner bought, whose
 *      promised number came in on the day they were told. A good Google week, a quiet week, a
 *      "connect Google" state card, a seeded sample and a card whose big line has no number in it
 *      must never get a Show someone button — because the button mints a PUBLIC page that says
 *      "Counted by Apnosh" at the foot, and nobody counted a week that happened on its own.
 *      Nor is a number that went the WRONG WAY: "4.7 → 4.5" is a rating that fell, and both
 *      halves of it are positive, so the direction has to be part of the rule at both ends.
 *   2. THE SHARE TOKEN IS AN ADDRESS NOBODY CAN GUESS. Long, from real randomness, and shaped so a
 *      junk URL is rejected before it ever reaches the database.
 *   3. THE REPORT NEVER PRINTS A NUMBER IT DOES NOT HAVE. A chapter with nothing in it gets the
 *      honest waiting line, never a zero, and a month with no chapters at all is never emailed.
 *   4. THE SENDING WINDOW, AND WHO IS LEFT IN IT. The cron runs on the 1st through the 5th so a
 *      weekend cannot swallow a month, and EVERY business day in there may send — the
 *      owner_reports row, not the calendar, is what keeps it to one email. That is what makes a
 *      month given back (nobody could be told) actually get another try. Day two must do nothing
 *      for the clients already claimed, and a run must never take more than it can finish.
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
import { isWin, isWinType, winNumber, newShareToken, isShareToken, winTypeIsMint, renderCardWords, WIN_TYPE } from '../src/lib/love/win'
import { countedCardWords, COUNTED_LABEL_KEY, COUNTED_BIG_KEY, COUNTED_CONTEXT_KEY } from '../src/lib/promises/lines'
import {
  isReportDay, clientsToProcess, inBatches, monthKey, previousMonth, reportLines, hasSomethingToSay,
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

const win = (over: Partial<{ cardKey: string; cardType: string; big: string; isSample: boolean; metricKey: string }> = {}) => ({
  cardKey: 'promise:8f1c', cardType: 'promise_counted', big: '41 taps on your Google card', ...over,
})

/** A ledger row whose count is in, as countedCardWords reads it. */
const counted = (over: Partial<Parameters<typeof countedCardWords>[0]> = {}) => ({
  state: 'counted' as const,
  tone: 'up' as const,
  label: 'Taco Tuesday push',
  metricKey: 'gbp_card_taps',
  metricLabel: 'taps on your Google card',
  value: '41',
  countFrom: '2026-08-24',
  showsOn: '2026-09-07',
  ...over,
})

console.log('\n1. What counts as a win')
{
  check('a counted promise with a number is a win', isWin(win()))

  check('a sample card is NOT a win', !isWin(win({ isSample: true })))
  check('a good Google week is NOT a win', !isWin(win({ cardKey: 'gbp-2026-08-24', cardType: 'gbp_week', big: '9 calls · 31 direction taps' })))
  check('a post that did well is NOT a win', !isWin(win({ cardKey: 'post-abc', cardType: 'post', big: '2,418 people saw it' })))
  check('a review month is NOT a win', !isWin(win({ cardKey: 'reviews-2026-08', cardType: 'reviews', big: '6 new reviews · 4.7 average' })))
  check('a quiet week is NOT a win', !isWin(win({ cardKey: 'gbp-down-2026-08-24', cardType: 'gbp_down', big: '3 calls · 14 direction taps' })))
  check('a state card is NOT a win, whatever its tone', !isWin(win({ cardKey: 'state-coming-up' })))
  check('connect Google is NOT a win', !isWin(win({ cardKey: 'state-connect-google', cardType: 'connect_google', big: 'Connect Google' })))
  check('a counted promise with no number is NOT a win', !isWin(win({ big: 'Not counted' })))
  check('a counted promise whose number is zero is NOT a win', !isWin(win({ big: '0 taps on your Google card' })))
  check('a counted promise whose number went backwards is NOT a win', !isWin(win({ big: '-5 taps on your Google card' })))
  // A rating is a pair and both halves are positive, so the direction is the only thing that
  // tells a rise from a fall. A card written before the composer learned this is caught here.
  check('a rating that FELL is NOT a win',
    !isWin(win({ big: '4.7 → 4.5 your rating since you started', metricKey: 'rating' })))
  check('a rating that rose IS a win',
    isWin(win({ big: '4.5 → 4.7 your rating since you started', metricKey: 'rating' })))
  check('a rating that held IS a win',
    isWin(win({ big: '4.7 → 4.7 your rating since you started', metricKey: 'rating' })))

  check('there is exactly one winning type', isWinType(WIN_TYPE) && !isWinType('gbp_week') && !isWinType('post') && !isWinType('reviews_waiting'))
  check('the winning type is still mint on Home', winTypeIsMint())

  check('a thousands separator is one number, not two', winNumber('2,418 people saw it') === 2418)
  check('a decimal survives', winNumber('4.7 average') === 4.7)
  check('a minus belongs to the number after it', winNumber('-5 calls') === null && winNumber('−5 calls') === null)
  check('no digits means no number', winNumber('Start your first campaign') === null)
  check('zero is not a number worth showing', winNumber('0 calls') === null)
  // The composer gates a rating on its LAST number; so does this, or the two disagree about the
  // same card and one of them mints a public page the other would refuse.
  check('a rating reads the number it is NOW', winNumber('4.5 → 4.7 average', 'rating') === 4.7)
  check('a rating that fell has no number to show', winNumber('4.7 → 4.5 average', 'rating') === null)
  check('a rating with nothing before it reads itself', winNumber('4.7 average', 'rating') === 4.7)
  check('rubbish in is null out', winNumber('') === null && winNumber(undefined as unknown as string) === null)
}

console.log('\n1b. The card a counted promise makes')
{
  const c = countedCardWords(counted())
  check('a counted promise makes a card', !!c)
  check('the label names what they ordered', c?.label.key === COUNTED_LABEL_KEY && c?.label.vars.label === 'Taco Tuesday push')
  check('the big line is the number and its unit', c?.big.key === COUNTED_BIG_KEY && c?.big.vars.n === '41' && c?.big.vars.unit === 'taps on your Google card')
  check('the context is the window it was counted over',
    c?.context.key === COUNTED_CONTEXT_KEY && c?.context.vars.from === '2026-08-24' && c?.context.vars.to === '2026-09-07')

  check('a promise still counting makes no card', countedCardWords(counted({ state: 'counting' })) === null)
  check('a promise the product cannot count makes NO card', countedCardWords(counted({ state: 'not_counted', value: 'Not counted' })) === null)
  check('a stopped order makes no card', countedCardWords(counted({ state: 'stopped', value: 'Stopped' })) === null)
  check('a delivered order with no number makes no card', countedCardWords(counted({ state: 'delivered', value: 'Done' })) === null)
  check('zero makes no card', countedCardWords(counted({ value: '0 so far' })) === null)
  check('a number that went backwards makes no card', countedCardWords(counted({ value: '-5' })) === null)
  check('a missing number makes no card', countedCardWords(counted({ value: '—' })) === null)
  // A rating reads "4.5 → 4.7"; the number that is true today is the second one.
  check('a rating takes the number it is NOW', countedCardWords(counted({ metricKey: 'rating', value: '4.5 → 4.7' }))?.n === 4.7)
  check('every other metric takes the number it leads with', countedCardWords(counted({ value: '41' }))?.n === 41)

  /* THE DIRECTION IS PART OF THE RULE. Both halves of "4.7 → 4.5" are positive numbers, so
     until the ledger's tone came in here a rating that FELL composed a card, and the card became a
     public win that said "Counted by Apnosh". read.ts writes tone 'down' for exactly that row. */
  check('a rating that FELL makes no card',
    countedCardWords(counted({ metricKey: 'rating', value: '4.7 → 4.5', tone: 'down' })) === null)
  check('a rating that ROSE makes a card',
    countedCardWords(counted({ metricKey: 'rating', value: '4.5 → 4.7', tone: 'up' }))?.n === 4.7)
  check('a count that came in UNDER what it was before makes no card',
    countedCardWords(counted({ value: '13', tone: 'down' })) === null)
  check('a count that held level still makes a card',
    countedCardWords(counted({ value: '41', tone: 'flat' }))?.n === 41)

  // The composer and the win rules have to agree about the SAME row, or one of them mints a
  // public page the other would have refused.
  check('the composer and the win rules agree about a rating that fell', () => {
    const fell = countedCardWords(counted({ metricKey: 'rating', value: '4.7 → 4.5', tone: 'down' }))
    return fell === null && !isWin({ cardKey: 'promise:8f1c', cardType: WIN_TYPE, big: '4.7 → 4.5 your rating since you started', metricKey: 'rating' })
  })

  // The card the composer stores, and the card a reader draws from it, are the same card.
  const stored = { words: { label: c!.label, big: c!.big, context: c!.context } }
  const en = renderCardWords(stored, { label: 'x', big: 'y', context: 'z' }, 'en')
  check('the English card reads as one sentence per line',
    en.label === 'Counted: Taco Tuesday push' && en.big === '41 taps on your Google card' && en.context === 'Counted Aug 24–Sep 7',
    `${en.label} | ${en.big} | ${en.context}`)
  check('the card a counted promise makes is a win', isWin({ cardKey: 'promise:8f1c', cardType: WIN_TYPE, big: en.big, isSample: false }))
  check('a card with no stored words falls back to what the row says',
    renderCardWords(null, { label: 'a', big: 'b', context: 'c' }, 'es').big === 'b')
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

console.log('\n4. The sending window, and who is left in it')
{
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16))
  // September 2026: the 1st is a Tuesday.
  check('Tuesday the 1st sends', isReportDay(utc(2026, 9, 1)))
  // THE FIX. The 2nd used to be shut, so a month given back on the 1st waited thirty days.
  check('the 2nd sends too, so a month given back gets another try', isReportDay(utc(2026, 9, 2)))
  // August 2026: the 1st is a Saturday, so Monday the 3rd is the first business day.
  check('a Saturday 1st does not send', !isReportDay(utc(2026, 8, 1)))
  check('the Sunday after it does not send', !isReportDay(utc(2026, 8, 2)))
  check('Monday the 3rd sends', isReportDay(utc(2026, 8, 3)))
  check('the 6th is outside the window', !isReportDay(utc(2026, 9, 6)) && !isReportDay(utc(2026, 9, 15)))
  // Every month for two years has at least one sending day, and never a weekend one.
  const noDay: string[] = []
  const weekend: string[] = []
  for (let y = 2026; y <= 2027; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      let n = 0
      for (let d = 1; d <= 5; d += 1) {
        if (!isReportDay(utc(y, m, d))) continue
        n += 1
        const wd = utc(y, m, d).getUTCDay()
        if (wd === 0 || wd === 6) weekend.push(`${y}-${m}-${d}`)
      }
      if (n === 0) noDay.push(`${y}-${m}`)
    }
  }
  check('every month has a day the report can go out', noDay.length === 0, noDay.join(' '))
  check('no weekend is ever a sending day', weekend.length === 0, weekend.join(' '))

  // DAY TWO DOES NOT DO DAY ONE AGAIN. The claim row is the dedupe, so it is also the work list.
  const clients = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` }))
  const day1 = clientsToProcess(clients, new Set<string>(), 60)
  check('day one takes everybody', day1.batch.length === 25 && day1.already === 0 && day1.remaining === 0)

  // The 1st told twenty of them and gave two back (nobody to send to), so five are unclaimed.
  const stillClaimed = new Set(clients.slice(0, 18).map((c) => c.id))
  const day2 = clientsToProcess(clients, stillClaimed, 60)
  check('day two works only on the clients with no row for the month',
    day2.batch.length === 7 && day2.already === 18, `${day2.batch.length} / ${day2.already}`)
  check('a month given back is one of them', day2.batch.some((c) => c.id === 'c18'))
  check('a client already told is never touched again', !day2.batch.some((c) => stillClaimed.has(c.id)))
  check('everybody claimed means there is nothing to do',
    clientsToProcess(clients, new Set(clients.map((c) => c.id)), 60).batch.length === 0)

  // THE RUN HAS SIXTY SECONDS. What it cannot reach comes back as a number, not as silence.
  const capped = clientsToProcess(clients, new Set<string>(), 10)
  check('a run takes no more than its cap', capped.batch.length === 10)
  check('what it did not reach is counted, not dropped', capped.remaining === 15)
  check('the cap takes them in order, so nobody is starved', capped.batch[0].id === 'c0' && capped.batch[9].id === 'c9')

  check('sixty clients go ten at a time', () => {
    const runs = inBatches(Array.from({ length: 60 }, (_, i) => i), 10)
    return runs.length === 6 && runs.every((r) => r.length === 10)
  })
  check('a short list is one run', inBatches([1, 2, 3], 10).length === 1)
  check('an empty list is no runs at all', inBatches([], 10).length === 0)
  check('every client lands in exactly one run', () => {
    const runs = inBatches(clients, 10)
    return runs.flat().length === 25 && new Set(runs.flat().map((c) => c.id)).size === 25
  })

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
