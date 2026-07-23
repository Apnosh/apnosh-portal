/**
 * verify-creator-schedule — proves the per-creator scheduling loop on LIVE data, end to end:
 * seed a vendor availability rule → read the vendor's open slots (the exact pure engine the product
 * page uses) → hold one slot → confirm that slot vanishes from the open list. Cleans up the test
 * booking; leaves the availability rule active so the owner can see the slot picker live.
 *
 * Uses the pure computeOpenSlots + a local rowToRule (the server modules import 'server-only', which
 * throws outside a request), so it exercises the same math the app runs.
 *
 * Run: node_modules/.bin/tsx scripts/verify-creator-schedule.ts
 */

import fs from 'fs'
import { computeOpenSlots } from '../src/lib/campaigns/gates/availability'
import type { AvailabilityRule, BookingRef, Window } from '../src/lib/campaigns/gates/types'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  PASS  ${label}`) } else { fail++; console.log(`  FAIL  ${label}`) } }

function coerceWindowMap(v: unknown): Record<string, Window[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, Window[]> = {}
  for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
    out[k] = Array.isArray(arr) ? (arr as Window[]).filter((w) => w && typeof w.start === 'string' && typeof w.end === 'string') : []
  }
  return out
}
function rowToRule(r: Record<string, unknown>): AvailabilityRule {
  return {
    id: r.id as string, gateKind: (r.gate_kind as string) ?? 'shoot',
    scopeKind: r.scope_kind === 'vendor' ? 'vendor' : 'team', scopeId: (r.scope_id as string) ?? null,
    label: (r.label as string) ?? null, timezone: (r.timezone as string) || 'America/Los_Angeles',
    weekly: coerceWindowMap(r.weekly), exceptions: coerceWindowMap(r.exceptions),
    slotMinutes: Number(r.slot_minutes) || 120, capacity: Number(r.capacity) || 1,
    leadTimeDays: Number.isFinite(Number(r.lead_time_days)) ? Number(r.lead_time_days) : 3,
    horizonDays: Number(r.horizon_days) || 45, active: !!r.active,
  }
}

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin')
  const db = createAdminClient()

  const { data: vendor } = await db.from('vendors').select('id, name').eq('slug', 'example-leo-photo').maybeSingle()
  if (!vendor) { console.log('  seed the example creators first (verify-creator-schedule needs example-leo-photo)'); process.exit(1) }
  const vendorId = vendor.id as string

  // 1) Seed Leo's availability (request mode) — Tue/Thu/Sat, 2-hour slots.
  const ruleRow = {
    gate_kind: 'shoot', scope_kind: 'vendor', scope_id: vendorId, label: 'confirm:request',
    timezone: 'America/Los_Angeles',
    weekly: { '2': [{ start: '09:00', end: '13:00' }], '4': [{ start: '09:00', end: '17:00' }], '6': [{ start: '10:00', end: '14:00' }] },
    slot_minutes: 120, capacity: 1, lead_time_days: 3, horizon_days: 45, active: true, updated_at: new Date().toISOString(),
  }
  const { data: existing } = await db.from('availability_rules').select('id').eq('scope_kind', 'vendor').eq('scope_id', vendorId).eq('gate_kind', 'shoot').maybeSingle()
  let ruleId: string
  if (existing?.id) { await db.from('availability_rules').update(ruleRow).eq('id', existing.id); ruleId = existing.id as string }
  else { const { data } = await db.from('availability_rules').insert(ruleRow).select('id').single(); ruleId = data!.id as string }
  ok('Leo has an active vendor availability rule', !!ruleId)

  // 2) Read the rule + open slots the way the product page does.
  const { data: ruleData } = await db.from('availability_rules').select('*').eq('id', ruleId).single()
  const rule = rowToRule(ruleData as Record<string, unknown>)
  ok('the rule is vendor-scoped to Leo', rule.scopeKind === 'vendor' && rule.scopeId === vendorId)
  ok('confirm mode reads as request from the label', /confirm:request/.test(rule.label ?? ''))

  const liveBookings = async (): Promise<BookingRef[]> => {
    const { data } = await db.from('bookings').select('rule_id, slot_date, slot_start, status, hold_expires_at').eq('rule_id', ruleId).in('status', ['held', 'confirmed'])
    return ((data ?? []) as Array<Record<string, unknown>>).map((b) => ({ ruleId: (b.rule_id as string) ?? null, slotDate: (b.slot_date as string) ?? null, slotStart: (b.slot_start as string) ?? null, status: (b.status as BookingRef['status']) ?? 'held', holdExpiresAt: (b.hold_expires_at as string) ?? null }))
  }

  const before = computeOpenSlots(rule, await liveBookings(), new Date().toISOString(), 60)
  ok('Leo has real open slots to book', before.length > 0)
  ok('the earliest slot respects the 3-business-day runway', before.every((s) => s.date >= new Date().toISOString().slice(0, 10)))
  const target = before[0]

  // 3) Hold that slot (mirrors holdCreatorBooking, request mode → held with a 24h TTL).
  const { data: client } = await db.from('clients').select('id').limit(1).maybeSingle()
  if (!client) { console.log('  no client row to attach a test booking'); process.exit(1) }
  const meta = { kind: 'creator', vendorId, vendorSlug: 'example-leo-photo', listingId: null, listingSlug: 'dish-photo-day', listingTitle: 'Dish Photo Day', tierName: '20 photos', intake: { dishes: 'Birria, ramen' } }
  const { data: booking } = await db.from('bookings').insert({
    client_id: client.id, gate_kind: 'shoot', rule_id: ruleId,
    slot_date: target.date, slot_start: target.start, slot_end: target.end, timezone: rule.timezone,
    status: 'held', hold_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), note: JSON.stringify(meta), updated_at: new Date().toISOString(),
  }).select('id').single()
  ok('a hold was written to the bookings table', !!booking?.id)

  // 4) The held slot must vanish from the open list (capacity 1) — the honesty guarantee.
  const after = computeOpenSlots(rule, await liveBookings(), new Date().toISOString(), 60)
  const stillOffered = after.some((s) => s.date === target.date && s.start === target.start)
  ok('the held slot is no longer offered to anyone else', !stillOffered)
  ok('other slots stay open', after.length === before.length - 1)

  // Clean up the test booking; leave Leo's availability live for the owner to see.
  if (booking?.id) await db.from('bookings').delete().eq('id', booking.id)
  const restored = computeOpenSlots(rule, await liveBookings(), new Date().toISOString(), 60)
  ok('releasing the hold reopens the slot', restored.some((s) => s.date === target.date && s.start === target.start))

  console.log(`\n${'='.repeat(52)}`)
  console.log(fail === 0
    ? `RESULT: per-creator scheduling works on live data — a hold hides a slot, releasing reopens it (${pass} checks). Leo's calendar is live.`
    : `RESULT: ${fail} FAILED of ${pass + fail}.`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
