/**
 * DB-level e2e for the requirement vault: the write guard, idempotency, break/repair, and the
 * derived∪vault union — against the REAL client_requirements table.
 *
 * Skips LOUDLY (exit 0 with a warning, never a silent pass) when the table is absent, because
 * pre-migration-233 that is the expected state and the code's degrade path is the behavior
 * under test elsewhere. Self-cleaning: every row this writes is deleted at the end.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/vault-db-e2e.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createAdminClient } from '@/lib/supabase/admin'
import { satisfyRequirement, breakRequirement, getHeldRequirements } from '@/lib/campaigns/setup/vault'
import { recordSignal, heldRequirementsUnion, vaultFactSeeds, deriveHeldFromTables } from '@/lib/campaigns/setup/vault-bridge'
import { Suite } from './lib'

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  const probe = await a.from('client_requirements').select('id', { head: true, count: 'exact' }).limit(1)
  if (probe.error) {
    console.warn('⚠️  client_requirements is not reachable (migration 233 not applied?) — SKIPPING the vault DB e2e.')
    console.warn(`    error: ${probe.error.message}`)
    process.exit(0)
  }

  const cleanup = async () => {
    await a.from('client_requirements').delete().eq('client_id', TEST_CLIENT).in('requirement', ['LINKS', 'PHOTOS', 'DNS'])
  }
  await cleanup()

  try {
    s.group('the write guard holds against real input')
    {
      const bad = await satisfyRequirement({ clientId: TEST_CLIENT, requirement: 'NAP', proof: 'token' })
      s.check('NAP at token refused (ceiling owner-word)', !bad.ok)
      const bad2 = await satisfyRequirement({ clientId: TEST_CLIENT, requirement: 'GOOGLE', proof: 'token', value: 'secret' })
      s.check('a value on GOOGLE refused (access grants store no value)', !bad2.ok)
      const { count } = await a.from('client_requirements').select('id', { count: 'exact', head: true }).eq('client_id', TEST_CLIENT).in('requirement', ['NAP', 'GOOGLE'])
      s.check('and neither wrote a row', (count ?? 0) === 0)
    }

    s.group('collect once: idempotent writes, upgrades, never downgrades')
    {
      await recordSignal(TEST_CLIENT, { kind: 'links', ordering: 'https://order.example.com', via: 'owner-typed' })
      await recordSignal(TEST_CLIENT, { kind: 'links', ordering: 'https://order.example.com', via: 'owner-typed' })
      const { count } = await a.from('client_requirements').select('id', { count: 'exact', head: true }).eq('client_id', TEST_CLIENT).eq('requirement', 'LINKS')
      s.check('double-tap writes exactly one LINKS row', count === 1)
      let held = await getHeldRequirements(TEST_CLIENT)
      s.check('owner-typed LINKS is hollow (owner-word)', held.find((h) => h.requirement === 'LINKS')?.hollow === true)

      await recordSignal(TEST_CLIENT, { kind: 'links', ordering: 'https://order.example.com', booking: 'https://book.example.com', via: 'gbp-applied' })
      held = await getHeldRequirements(TEST_CLIENT)
      const links = held.find((h) => h.requirement === 'LINKS')
      s.check('the GBP apply upgrades it to our-side (solid)', links?.proof === 'our-side' && links?.hollow === false)

      await recordSignal(TEST_CLIENT, { kind: 'links', ordering: 'https://retyped.example.com', via: 'owner-typed' })
      const after = (await getHeldRequirements(TEST_CLIENT)).find((h) => h.requirement === 'LINKS')
      s.check('a later owner-typed save never downgrades the our-side proof', after?.proof === 'our-side')
    }

    s.group('break and repair')
    {
      await breakRequirement(TEST_CLIENT, 'LINKS', 'link 404ed on recheck')
      let held = await getHeldRequirements(TEST_CLIENT)
      s.check('a broken row stops counting', !held.some((h) => h.requirement === 'LINKS'))
      await recordSignal(TEST_CLIENT, { kind: 'links', ordering: 'https://order.example.com', via: 'gbp-applied' })
      held = await getHeldRequirements(TEST_CLIENT)
      s.check('re-satisfying clears the break', held.some((h) => h.requirement === 'LINKS'))
    }

    s.group('the union and the seeds')
    {
      await recordSignal(TEST_CLIENT, { kind: 'photos', urls: 'https://p1.example.com, https://p2.example.com' })
      const derived = await deriveHeldFromTables(TEST_CLIENT)
      const union = await heldRequirementsUnion(TEST_CLIENT)
      s.check(`union ⊇ derived (${derived.length} derived rows)`, derived.every((d) => union.some((u) => u.requirement === d.requirement)))
      s.check('union ⊇ vault (LINKS + PHOTOS present)', ['LINKS', 'PHOTOS'].every((id) => union.some((u) => u.requirement === id)))

      const seeds = await vaultFactSeeds(TEST_CLIENT)
      s.check('seeds carry the ordering link', seeds.orderingLink === 'https://order.example.com')
      s.check('seeds carry the photo urls', (seeds.photoUrls ?? '').includes('p1.example.com'))
    }
  } finally {
    await cleanup()
  }

  const ok = s.report('Vault DB e2e')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
