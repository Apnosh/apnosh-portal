/**
 * verify-love-sentence — checks the day window behind the weekly sentence, with no network and
 * no database.
 *
 * The bug this locks down: a client with two shops has two Google rows for the same day, so
 * taking fourteen ROWS took three and a half days and printed half a week as "this week". The
 * fixture below is two locations reporting the same fourteen days.
 *
 * Run: node_modules/.bin/tsx scripts/verify-love-sentence.ts
 */

import { sumByDate, weekPair, type DayValue } from '../src/lib/love/week-window'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

const DAY = 86400000
const TODAY = '2026-09-07'
/** `back` days before TODAY, as YYYY-MM-DD. */
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * DAY).toISOString().slice(0, 10)

/** Two shops, both reporting the same `days` days ending yesterday. */
function twoLocations(days: number, a: number, b: number): DayValue[] {
  const rows: DayValue[] = []
  for (let i = 1; i <= days; i++) rows.push({ date: day(i), value: a }, { date: day(i), value: b })
  return rows
}

section('two locations: the window is fourteen DAYS, not fourteen rows')
{
  const rows = twoLocations(14, 10, 5)
  ok('28 rows collapse to 14 dates', sumByDate(rows).length === 14)
  const p = weekPair(rows, TODAY)
  ok('there is a sentence to say', p !== null)
  // 7 days x (10 + 5) both shops added together.
  ok('this week is both shops, seven days', p?.thisWeek === 105)
  ok('last week is both shops, seven days', p?.lastWeek === 105)
}

section('one location reads the same as before')
{
  const rows: DayValue[] = []
  for (let i = 1; i <= 14; i++) rows.push({ date: day(i), value: 10 })
  const p = weekPair(rows, TODAY)
  ok('seven days each side', p?.thisWeek === 70 && p?.lastWeek === 70)
}

section('the two weeks are told apart, not averaged')
{
  const rows: DayValue[] = []
  for (let i = 1; i <= 7; i++) rows.push({ date: day(i), value: 4 }, { date: day(i), value: 6 })
  for (let i = 8; i <= 14; i++) rows.push({ date: day(i), value: 1 }, { date: day(i), value: 2 })
  const p = weekPair(rows, TODAY)
  ok('this week is the newest seven days', p?.thisWeek === 70)
  ok('last week is the seven before', p?.lastWeek === 21)
}

section('not enough days says nothing')
{
  ok('13 days of two shops is still not two weeks', weekPair(twoLocations(13, 10, 5), TODAY) === null)
  ok('no rows at all', weekPair([], TODAY) === null)
}

section('the days have to BE this week')
{
  // A listing that went quiet: fourteen good days, but the newest is three weeks old.
  const stale: DayValue[] = []
  for (let i = 21; i <= 34; i++) stale.push({ date: day(i), value: 10 }, { date: day(i), value: 10 })
  ok('a stale feed says nothing', weekPair(stale, TODAY) === null)

  // A gappy feed: fourteen reported days, but they are spread over two months.
  const gappy: DayValue[] = []
  for (let i = 1; i <= 14; i++) gappy.push({ date: day(i * 4), value: 10 })
  ok('fourteen days spread past three weeks says nothing', weekPair(gappy, TODAY) === null)

  // Three days behind is normal for Google, and still counts.
  const behind: DayValue[] = []
  for (let i = 3; i <= 16; i++) behind.push({ date: day(i), value: 10 }, { date: day(i), value: 1 })
  ok('three days behind still speaks', weekPair(behind, TODAY)?.thisWeek === 77)
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
