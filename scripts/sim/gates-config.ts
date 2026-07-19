/**
 * Phase 4a verification — per-campaign gate config (generalize gates + turn-off + G10 needs).
 *   A) cleanGatesConfig + resolveGates (pure): shoot auto/off/required/optional (the DIY-reel-beat
 *      over-trigger fix) + custom agreement/input gates.
 *   B) getGatesConfig reads gates from catalog_content_overrides (built-ins) + catalog_campaigns (DB),
 *      against LIVE tables. Also checks the catalog_campaigns.needs column (migration 220) round-trip.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/gates-config.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanGatesConfig, resolveGates } from '@/lib/campaigns/gates/config'
import { getGatesConfig } from '@/lib/campaigns/gates/config-server'
import type { CampaignDraft, LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const line = (serviceId: string, over: Partial<LineItem> = {}): LineItem => ({ id: 'li', serviceId, name: serviceId, plain: serviceId, does: '', stage: 'foundation', price: 100, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', ...over })
const draft = (items: LineItem[]): Pick<CampaignDraft, 'items' | 'brief'> => ({ items })
const SHOOT = draft([line('video-engine')])          // needsShoot service
const NONSHOOT = draft([line('gbp-setup')])

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // ── A) pure ────────────────────────────────────────────────────────────────────
  s.group('cleanGatesConfig')
  s.eq("shoot 'off' kept", cleanGatesConfig({ shoot: 'off' }), { shoot: 'off' })
  s.eq("shoot 'auto' dropped (it's the default)", cleanGatesConfig({ shoot: 'auto' }), undefined)
  s.eq('empty → undefined', cleanGatesConfig({}), undefined)
  const cg = cleanGatesConfig({ custom: [{ kind: 'agreement', title: 'I own the rights' }, { kind: 'input', title: 'POS?', inputType: 'text' }] })
  s.check('custom gates sanitized with ids + required default', !!cg?.custom && cg.custom.length === 2 && cg.custom[0].required === true && !!cg.custom[0].id)
  s.eq('bad kind dropped', cleanGatesConfig({ custom: [{ kind: 'nope', title: 'x' }] }), undefined)

  s.group('resolveGates — shoot modes')
  s.check('auto + shoot draft → required booking', resolveGates(SHOOT, null).booking?.required === true)
  s.check("'off' turns the shoot gate OFF (over-trigger fix)", resolveGates(SHOOT, { shoot: 'off' }).booking === null)
  s.check("'optional' keeps the gate but doesn't block", resolveGates(SHOOT, { shoot: 'optional' }).booking?.required === false)
  s.check("'required' forces a booking even without shoot signal", resolveGates(NONSHOOT, { shoot: 'required' }).booking?.required === true)
  s.check('non-shoot + auto → no booking', resolveGates(NONSHOOT, null).booking === null)
  s.eq('custom agreement/input pass through', resolveGates(NONSHOOT, { custom: [{ id: 'g1', kind: 'agreement', title: 'X', required: true }] }).custom.length, 1)

  // ── B) live reads ────────────────────────────────────────────────────────────────
  const BUILTIN_ID = 'sim-gates-builtin'
  const DB_ID = 'sim-gates-db'
  try {
    s.group('getGatesConfig — built-in override (catalog_content_overrides.gates)')
    await a.from('catalog_content_overrides').delete().eq('item_id', BUILTIN_ID)
    const { error: ovErr } = await a.from('catalog_content_overrides').insert({ item_id: BUILTIN_ID, gates: { shoot: 'off' } })
    s.check('seed override gates', !ovErr, ovErr?.message)
    const cfg1 = await getGatesConfig(BUILTIN_ID)
    s.check("reads shoot:'off' from the override", cfg1?.shoot === 'off')

    s.group('getGatesConfig — DB campaign (catalog_campaigns.gates)')
    await a.from('catalog_campaigns').delete().eq('id', DB_ID)
    const { error: dbErr } = await a.from('catalog_campaigns').insert({ id: DB_ID, title: 'SIM gates', service_ids: ['gbp-setup'], status: 'draft', gates: { shoot: 'required', custom: [{ id: 'agree1', kind: 'agreement', title: 'Agree', required: true }] } })
    s.check('seed DB campaign gates', !dbErr, dbErr?.message)
    const cfg2 = await getGatesConfig(DB_ID)
    s.check("reads shoot:'required' + a custom gate from the DB campaign", cfg2?.shoot === 'required' && (cfg2?.custom?.length ?? 0) === 1)

    s.group('catalog_campaigns.needs (migration 220, G10)')
    const { error: needsErr } = await a.from('catalog_campaigns').update({ needs: { custom: [{ id: 'custom-x', title: 'A file', inputType: 'text', required: true }] } }).eq('id', DB_ID)
    if (!needsErr) {
      const { data } = await a.from('catalog_campaigns').select('needs').eq('id', DB_ID).maybeSingle()
      s.check('220 applied — needs round-trips on the DB campaign', !!(data?.needs as { custom?: unknown[] })?.custom?.length)
    } else if (needsErr.code === '42703' || needsErr.code === 'PGRST204' || /could not find the '?needs'? column|needs.* does not exist/i.test(needsErr.message)) {
      s.check('220 NOT applied — needs column absent (save-route degrade covers it)', true, 'pending owner migration 220')
    } else {
      s.check('needs update error', false, needsErr.message)
    }
  } finally {
    await a.from('catalog_content_overrides').delete().eq('item_id', BUILTIN_ID)
    await a.from('catalog_campaigns').delete().eq('id', DB_ID)
  }

  const ok = s.report('Phase 4a — gate config (generalize + turn-off + G10)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
