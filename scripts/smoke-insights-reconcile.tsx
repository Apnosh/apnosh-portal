/* Insights reconcile smoke — pure unit test of the "what feeds this" breakdown
 * builders (src/lib/dashboard/insights-feed.ts). Every stage's headline must
 * equal the sum of its clearly-labeled source pieces, and misplaced metrics
 * (profile visits, new followers) must not sit inside the Awareness total.
 *
 * With a fixture (views {total:34, google:19, social:15, maps:7, search:12},
 * socialReach:15, profile_visits:146, followers_gained:5) assert:
 *   a) Awareness pieces are Google Maps 7 + Google Search 12 + Social 15 and they
 *      SUM to 34 (== the headline)
 *   b) Profile visits + New followers are NOT inside the Awareness total group
 *   c) Interest stage shows Profile visits
 *   d) a no-social fixture (social:0) shows Social "Not connected" and headline =
 *      google (19), still reconciling
 *   e) no em dashes in any produced copy
 *
 * Run: node_modules/.bin/tsx scripts/smoke-insights-reconcile.tsx */

import {
  buildAwarenessFeed, buildInterestFeed, buildActionsFeed,
  NOT_CONNECTED, type FeedInput, type StageFeed,
} from '../src/lib/dashboard/insights-feed'

let fail = 0
function ok(cond: boolean, msg: string) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg)
  if (!cond) fail++
}

const BASE: FeedInput = {
  views: { total: 34, google: 19, social: 15, maps: 7, search: 12 },
  socialReach: 15,
  socialConnected: true,
  googleConnected: true,
  actions: { directions: 20, calls: 5, websiteClicks: 9 },
  profileVisits: 146,
  followersGained: 5,
  socialEngagement: 0,
}

const sumPieces = (f: StageFeed) => f.pieces.reduce((s, p) => s + (p.connected ? p.value : 0), 0)
const labels = (f: StageFeed) => f.pieces.map((p) => p.label)
// every string a feed authored, for the em-dash sweep
function feedStrings(f: StageFeed): string {
  const s: string[] = [f.caption]
  for (const p of [...f.pieces, ...f.note]) s.push(p.label)
  return s.join(' | ')
}

function main() {
  console.log('\n== a) Awareness pieces are Maps 7 + Search 12 + Social 15 = 34 ==')
  const aware = buildAwarenessFeed(BASE)
  ok(JSON.stringify(labels(aware)) === JSON.stringify(['Google Maps', 'Google Search', 'Social reach']),
    `pieces labeled Google Maps / Google Search / Social reach (${labels(aware).join(', ')})`)
  ok(aware.pieces[0].value === 7, `Google Maps = 7 (${aware.pieces[0].value})`)
  ok(aware.pieces[1].value === 12, `Google Search = 12 (${aware.pieces[1].value})`)
  ok(aware.pieces[2].value === 15, `Social reach = 15 (${aware.pieces[2].value})`)
  ok(aware.headline === 34, `headline = 34 (${aware.headline})`)
  ok(sumPieces(aware) === aware.headline, `pieces sum (${sumPieces(aware)}) == headline (${aware.headline})`)
  ok(aware.headline === BASE.views!.total, `headline == views.total (${BASE.views!.total})`)

  console.log('\n== b) Profile visits + New followers NOT in the Awareness total group ==')
  const awareText = labels(aware).join(' ').toLowerCase()
  ok(!/profile|follower/.test(awareText), 'no profile-visits / followers piece inside Awareness')
  ok(aware.note.length === 0, 'Awareness has no note rows')

  console.log('\n== c) Interest stage shows Profile visits ==')
  const interest = buildInterestFeed(BASE)
  ok(labels(interest).some((l) => /profile visits/i.test(l)), `Interest lists Profile visits (${labels(interest).join(', ')})`)
  ok(interest.pieces.find((p) => p.key === 'profile')?.value === 146, 'Profile visits = 146')
  ok(sumPieces(interest) === interest.headline, `Interest pieces sum (${sumPieces(interest)}) == headline (${interest.headline})`)
  ok(interest.note.some((p) => /new followers/i.test(p.label)), 'New followers rides along as a note (audience growth)')
  ok(!interest.pieces.some((p) => /follower/i.test(p.label)), 'New followers is NOT a summed piece')

  console.log('\n== d) No-social fixture: Social "Not connected", headline = google (19) ==')
  const noSocial: FeedInput = {
    ...BASE,
    views: { total: 19, google: 19, social: 0, maps: 7, search: 12 },
    socialReach: 0,
    socialConnected: false,
  }
  const awareNS = buildAwarenessFeed(noSocial)
  const socialPiece = awareNS.pieces.find((p) => p.key === 'social')!
  ok(socialPiece.connected === false, 'Social piece marked not connected')
  ok(awareNS.headline === 19, `headline = 19 (${awareNS.headline})`)
  ok(awareNS.headline === noSocial.views!.google, `headline == google (${noSocial.views!.google})`)
  ok(sumPieces(awareNS) === awareNS.headline, `pieces sum (${sumPieces(awareNS)}) == headline (${awareNS.headline})`)
  ok(awareNS.pieces.every((p) => p.label), 'every source still labeled (none silently dropped)')

  console.log('\n== also: Customer actions reconcile (directions 20 + calls 5 + site 9 = 34) ==')
  const acts = buildActionsFeed(BASE)
  ok(acts.headline === 34, `actions headline = 34 (${acts.headline})`)
  ok(sumPieces(acts) === acts.headline, `actions pieces sum (${sumPieces(acts)}) == headline`)

  console.log('\n== e) no em dashes in any produced copy ==')
  const all = [aware, interest, acts, awareNS].map(feedStrings).join(' | ') + ' | ' + NOT_CONNECTED
  ok(!all.includes('—'), 'no em dash (\\u2014) in feed copy')
  ok(!all.includes('–'), 'no en dash (\\u2013) in feed copy')

  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
