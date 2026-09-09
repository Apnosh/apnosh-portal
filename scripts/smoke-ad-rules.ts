/**
 * The ad-platform capability map, exercised.
 *
 * The point of these assertions is the DIFFERENCES. Meta and TikTok are not the
 * same product wearing two logos: TikTok's floor is twenty times higher, it
 * ignores a city radius, and it cannot size an audience before you pay. Each of
 * those changes what the screen may honestly show, so each is pinned here.
 */
import { AD_RULES, adPlatformFor, CONNECT_SLUG } from '../src/lib/channels/ad-rules'

let pass = 0, fail = 0
const t = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} — want ${b}, got ${a}`) }
}

console.log('a post knows which ad platform promotes it:')
t('instagram → meta', adPlatformFor('instagram'), 'meta')
t('facebook → meta', adPlatformFor('facebook'), 'meta')
t('tiktok → tiktok', adPlatformFor('tiktok'), 'tiktok')
t('youtube → nothing (not in the ads list)', adPlatformFor('youtube'), null)
t('linkedin → nothing yet', adPlatformFor('linkedin'), null)

console.log('the differences that change the screen:')
t('meta delivers on $1 a day', AD_RULES.meta.minDaily, 1)
t('tiktok needs $20 a day', AD_RULES.tiktok.minDaily, 20)
t('meta honours a city radius', AD_RULES.meta.cityRadius, true)
t('tiktok does NOT', AD_RULES.tiktok.cityRadius, false)
t('meta can size an audience first', AD_RULES.meta.reachEstimate, true)
t('tiktok cannot', AD_RULES.tiktok.reachEstimate, false)
t('meta can render the ad', AD_RULES.meta.previews, true)
t('tiktok cannot', AD_RULES.tiktok.previews, false)
t('meta rides the posting token', AD_RULES.meta.ownLogin, false)
t('tiktok needs its own login', AD_RULES.tiktok.ownLogin, true)

console.log('connect slugs match the vendor enum:')
t('meta connects as facebook', CONNECT_SLUG.meta, 'facebook')
t('tiktok connects as tiktok', CONNECT_SLUG.tiktok, 'tiktok')

console.log('every rule carries its source:')
for (const [k, r] of Object.entries(AD_RULES)) {
  t(`${k} cites minDaily`, !!r.source.minDaily, true)
  t(`${k} cites cityRadius`, !!r.source.cityRadius, true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
