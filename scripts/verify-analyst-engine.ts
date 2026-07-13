/* Analyst-engine pure checks (Phase B) — no API key / no model call.
 * =================================================================
 * Proves the plumbing around the model is honest and robust:
 *  - the funnel the PAGE shows is built from the payload, not the model
 *  - the prompt brief carries real numbers and flags DARK sources as "do not guess"
 *  - the system prompt actually contains the honesty guardrails
 *  - parseAnalystRead accepts good JSON (even fenced) and rejects junk / missing fields
 *
 * Run: node_modules/.bin/tsx scripts/verify-analyst-engine.ts */

import {
  renderPayloadForPrompt,
  parseAnalystRead,
  funnelFromPayload,
  SYSTEM,
} from '../src/lib/insights/analyst'
import type { AnalystPayload } from '../src/lib/insights/analyst-payload'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const payload: AnalystPayload = {
  business: { name: 'Yellow Bee Market', city: 'Austin', state: 'TX' },
  window: '30d',
  stages: [
    { stage: 1, label: 'Awareness', headline: 16000, unit: 'views', isEmpty: false, sources: [
      { label: 'Google Maps views', provider: 'google_business_profile', value: 10000, status: 'CONNECTED', counted: true },
      { label: 'Instagram reach', provider: 'instagram', value: 6000, status: 'CONNECTED', counted: true },
      { label: 'TikTok views', provider: 'tiktok', value: null, status: 'COMING_SOON', counted: false },
    ] },
    { stage: 3, label: 'Actions', headline: 40, unit: 'actions', isEmpty: false, sources: [
      { label: 'Directions', provider: 'google_business_profile', value: 40, status: 'CONNECTED', counted: true },
    ] },
    { stage: 4, label: 'Sales', headline: null, unit: 'guests', isEmpty: true, note: 'Connect your register.', sources: [
      { label: 'Guests served', provider: 'pos', value: null, status: 'COMING_SOON', counted: false },
    ] },
  ],
  dropOffs: [
    { fromStage: 1, fromLabel: 'Awareness', fromValue: 16000, toStage: 3, toLabel: 'Actions', toValue: 40, keptPct: 0.3 },
  ],
  reputation: { rating: 4.5, reviewCount: 182 },
  topSearches: [{ query: 'grocery near me', impressions: 900 }],
  activeCampaignsByStage: { shown: ['Summer Awareness Push'] },
  sources: { connected: ['Google Maps views', 'Instagram reach', 'Directions'], dark: [{ label: 'TikTok views', state: 'COMING_SOON' }, { label: 'Guests served', state: 'COMING_SOON' }] },
}

console.log('\n== funnel is built from the payload (numbers never come from the model) ==')
{
  const f = funnelFromPayload(payload)
  ok(f.length === 3, 'one step per stage')
  ok(f[0].value === 16000 && f[0].keptFromPrevPct === null, 'first stage carries its real value, no kept%')
  ok(f[1].label === 'Actions' && f[1].keptFromPrevPct === 0.3, 'Actions shows the real 0.3% kept from the payload drop-off')
  ok(f[2].isEmpty && f[2].value === null, 'empty Sales stage stays empty (no invented number)')
}

console.log('\n== the brief carries real numbers + flags dark sources ==')
{
  const b = renderPayloadForPrompt(payload)
  ok(b.includes('Yellow Bee Market') && b.includes('Austin, TX'), 'business + location in brief')
  ok(b.includes('16,000') && b.includes('0.3% kept'), 'real headline + drop-off in brief')
  ok(/DARK SOURCES.*do NOT guess/i.test(b) && b.includes('Guests served'), 'dark sources are listed as do-not-guess')
  ok(b.includes('grocery near me'), 'top searches included')
  ok(b.includes('Summer Awareness Push'), 'active campaign included')
}

console.log('\n== system prompt hard-codes the honesty guardrails ==')
{
  ok(/ONLY numbers that appear/i.test(SYSTEM), 'forbids numbers not in the brief')
  ok(/never (say one thing CAUSED|.*CAUSED)/i.test(SYSTEM) || /Never say one thing CAUSED/i.test(SYSTEM), 'forbids claiming causation')
  ok(/other restaurants|industry averages/i.test(SYSTEM), 'forbids peer/industry benchmarks')
  ok(/5th-grade/i.test(SYSTEM) && /em dash/i.test(SYSTEM), 'voice rules: 5th-grade, no em dashes')
}

console.log('\n== parseAnalystRead: good JSON (fenced) ==')
{
  const raw = '```json\n' + JSON.stringify({
    bottomLine: 'Lots of people find you, but few come in.',
    working: ['Maps views are strong at 10,000', 'x', ''],
    fixes: [{ move: 'Add your menu to Google', why: 'People see you but do not act' }, { move: 'b', why: '' }, { move: 'c', why: 'extra' }],
    blindSpots: ['Cannot see sales yet', 'Connect your register', 'x', 'y'],
  }) + '\n```'
  const r = parseAnalystRead(raw)
  ok(r.bottomLine.startsWith('Lots of people'), 'bottomLine parsed through code fences')
  ok(r.working.length === 2, 'empty bullets dropped (2 kept)')
  ok(r.fixes.length === 2, 'fixes capped at 2')
  ok(r.blindSpots.length === 3, 'blindSpots capped at 3')
}

console.log('\n== parseAnalystRead: rejects junk + missing bottomLine ==')
{
  let threw = false
  try { parseAnalystRead('not json at all') } catch { threw = true }
  ok(threw, 'non-JSON throws')
  threw = false
  try { parseAnalystRead(JSON.stringify({ working: ['x'] })) } catch { threw = true }
  ok(threw, 'missing bottomLine throws')
}

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}\n`)
process.exit(fail === 0 ? 0 : 1)
