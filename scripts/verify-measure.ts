/**
 * verify-measure — checks the "Get measurable" card against realistic connection states, with
 * no network and no database.
 *
 * Unlike the listings card, this one CAN report on real state: connection status is server
 * truth, kept honest by the health cron's data-path probe. So the checks here are about two
 * things — that the diagnosis reads that state faithfully, and that the per-host steps are real
 * actions naming the right verification path, never a generic hand-wave.
 *
 * Run: node_modules/.bin/tsx scripts/verify-measure.ts
 */

import {
  buildMeasurePlan, headlineFor, stepsFor, hostGuide, hostFromUrl, joinWords,
  type MeasureTool, type HostKey,
} from '../src/lib/measure/setup'

let pass = 0, fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}`) }
}
function section(t: string) { console.log(`\n== ${t} ==`) }

const SA = 'apnosh-reader@apnosh.iam.gserviceaccount.com'

function tool(key: 'search_console' | 'analytics', status: MeasureTool['status'], reason: string | null = null): MeasureTool {
  return {
    key,
    label: key === 'search_console' ? 'Search Console' : 'Analytics',
    answers: key === 'search_console' ? 'How people find you on Google search' : 'What people do once they reach your site',
    status,
    attentionReason: reason,
  }
}
const plan = (tools: MeasureTool[], host: HostKey = 'wix', sa: string | null = SA) =>
  buildMeasurePlan({ tools, websiteUrl: 'https://example.com', host, serviceAccountEmail: sa })

/* ── the diagnosis reads real state ──────────────────────────────── */

section('done means both tools are actually connected')
{
  const p = plan([tool('search_console', 'connected'), tool('analytics', 'connected')])
  ok('measured is true only when everything is connected', p.measured === true)
  ok('there is nothing left to do', p.todo.length === 0)
  ok('the headline celebrates, plainly', /measure everything/i.test(p.headline))
}

section('a new client reads as missing, not fine')
{
  const p = plan([tool('search_console', 'missing'), tool('analytics', 'missing')])
  ok('not measured', p.measured === false)
  ok('both tools are on the todo list', p.todo.length === 2)
  ok('the headline names the blind spot', /flying blind|whether any of this is working/i.test(p.headline))
  ok('it never claims a missing tool is set up', !/connected|live|sending/i.test(p.headline))
}

section('a broken pipe is attention, and worded as recoverable')
{
  const p = plan([tool('search_console', 'attention', 'Our access was removed. Granting it again turns the data back on.'), tool('analytics', 'connected')])
  ok('the broken one is on the todo list', p.todo.some((t) => t.key === 'search_console'))
  ok('the working one is not', !p.todo.some((t) => t.key === 'analytics'))
  ok('the headline says quick fix, not rebuild', /quick fix|not a rebuild|granting/i.test(p.headline))
}

section('the work opens on the bigger job first')
{
  const p = plan([tool('search_console', 'attention', 'x'), tool('analytics', 'missing')])
  ok('a from-scratch tool comes before one that just needs a grant', p.todo[0].status === 'missing')
}

section('the headline is counted, never guessed')
{
  ok('all connected', /measure everything/i.test(headlineFor(2, [tool('search_console', 'connected'), tool('analytics', 'connected')])))
  ok('one missing reads singular', /is not set up/i.test(headlineFor(1, [tool('search_console', 'connected'), tool('analytics', 'missing')])))
  ok('none connected has its own line', /whether any of this is working/i.test(headlineFor(0, [tool('search_console', 'missing'), tool('analytics', 'missing')])))
}

/* ── the per-host steps are real and specific ────────────────────── */

section('Search Console steps name the host-specific verification path')
{
  const wix = stepsFor('search_console', hostGuide('wix'), SA).join(' | ')
  const sq = stepsFor('search_console', hostGuide('squarespace'), SA).join(' | ')
  ok('Wix names its built-in SEO connect', /wix connects search console|let google find/i.test(wix))
  ok('Squarespace names its DNS settings path', /settings.*domains.*dns|dns settings/i.test(sq))
  ok('the two hosts do not give identical directions', wix !== sq)
  ok('every step is a real action, none left blank', stepsFor('search_console', hostGuide('other'), SA).every((s) => s.trim().length > 12))
}

section('the grant step carries the exact service-account email')
{
  const withSa = stepsFor('search_console', hostGuide('wix'), SA)
  ok('Search Console asks for Full user', withSa.some((s) => s.includes(SA) && /full user/i.test(s)))
  const gaSa = stepsFor('analytics', hostGuide('wix'), SA)
  ok('Analytics asks for Viewer', gaSa.some((s) => s.includes(SA) && /viewer/i.test(s)))
}

section('with no service account, the grant step is hidden, not faked')
{
  const noSa = stepsFor('search_console', hostGuide('wix'), null)
  ok('no grant line appears when there is no service account', !noSa.some((s) => /add .* as a (full user|viewer)/i.test(s)))
  ok('the earlier real steps still stand', noSa.length >= 3)
}

section('Analytics steps fold in the host tag gotcha')
{
  const sq = stepsFor('analytics', hostGuide('squarespace'), SA).join(' | ')
  ok('Squarespace points at its built-in Analytics field', /external api keys|built-in google analytics/i.test(sq))
  const other = stepsFor('analytics', hostGuide('other'), SA).join(' | ')
  ok('an unknown host still gives a usable fallback', /without touching code/i.test(other))
  ok('an unknown host never bleeds a DNS note into the tag step', !/who runs your dns/i.test(other))
}

/* ── host detection ──────────────────────────────────────────────── */

section('host detection from a URL, honest when unsure')
{
  ok('a wixsite subdomain is Wix', hostFromUrl('https://joe.wixsite.com/diner') === 'wix')
  ok('a squarespace subdomain is Squarespace', hostFromUrl('https://x.squarespace.com') === 'squarespace')
  ok('a myshopify domain is Shopify', hostFromUrl('https://x.myshopify.com') === 'shopify')
  ok('a bare custom domain is unknown, not guessed', hostFromUrl('https://shinyashokudotukwila.com') === 'other')
  ok('no url is unknown', hostFromUrl(null) === 'other')
}

section('word joining reads naturally')
{
  ok('two items', joinWords(['Search Console', 'Analytics']) === 'Search Console and Analytics')
  ok('one item has no joiner', joinWords(['Analytics']) === 'Analytics')
  ok('none is empty', joinWords([]) === '')
}

console.log(`\n${'='.repeat(52)}`)
console.log(fail === 0
  ? `RESULT: the measure diagnosis is real state, and the host steps are specific (${pass} checks).`
  : `RESULT: ${fail} FAILED of ${pass + fail}.`)
process.exit(fail === 0 ? 0 : 1)
