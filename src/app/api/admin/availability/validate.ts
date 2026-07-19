/**
 * Validation + coercion for an availability_rules write. Pure. Rejects malformed windows so the
 * stored supply is always renderable by the pure slot engine, and clamps the numeric dials to sane
 * bounds so a typo can never publish a rule that offers thousands of slots or negative capacity.
 */
import type { Window } from '@/lib/campaigns/gates/types'

const HHMM = /^(\d{1,2}):(\d{2})$/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function validWindow(v: unknown): Window | null {
  if (!v || typeof v !== 'object') return null
  const start = (v as Window).start, end = (v as Window).end
  if (typeof start !== 'string' || typeof end !== 'string') return null
  const ms = HHMM.exec(start.trim()), me = HHMM.exec(end.trim())
  if (!ms || !me) return null
  const s = Number(ms[1]) * 60 + Number(ms[2]), e = Number(me[1]) * 60 + Number(me[2])
  if (Number(ms[1]) > 23 || Number(me[1]) > 23 || Number(ms[2]) > 59 || Number(me[2]) > 59) return null
  if (e <= s) return null
  return { start: start.trim(), end: end.trim() }
}

/** Coerce a { key: window[] } map, keeping only well-formed windows. `keyOk` guards the key shape. */
function cleanWindowMap(v: unknown, keyOk: (k: string) => boolean): Record<string, Window[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, Window[]> = {}
  for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
    if (!keyOk(k)) continue
    if (!Array.isArray(arr)) continue
    const wins = arr.map(validWindow).filter((w): w is Window => !!w)
    out[k] = wins
  }
  return out
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.min(hi, Math.max(lo, n))
}

export interface RulePayload {
  gate_kind: string
  scope_kind: 'team'
  scope_id: null
  label: string | null
  timezone: string
  weekly: Record<string, Window[]>
  exceptions: Record<string, Window[]>
  slot_minutes: number
  capacity: number
  lead_time_days: number
  horizon_days: number
  active: boolean
}

/** Validate + coerce an availability rule write body. Phase 1 is TEAM-scope only. */
export function validateRule(body: unknown): { payload: RulePayload } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' }
  const b = body as Record<string, unknown>

  const gateKind = (typeof b.gateKind === 'string' && b.gateKind.trim() ? b.gateKind.trim() : 'shoot').slice(0, 40)
  const timezone = (typeof b.timezone === 'string' && b.timezone.trim() ? b.timezone.trim() : 'America/Los_Angeles').slice(0, 60)
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : null

  const weekly = cleanWindowMap(b.weekly, (k) => /^[0-6]$/.test(k))
  const exceptions = cleanWindowMap(b.exceptions, (k) => ISO_DAY.test(k))

  const slot_minutes = clampInt(b.slotMinutes, 15, 12 * 60, 120)
  const capacity = clampInt(b.capacity, 1, 50, 1)
  const lead_time_days = clampInt(b.leadTimeDays, 0, 60, 3)
  const horizon_days = clampInt(b.horizonDays, 1, 120, 45)
  const active = b.active === true

  // An ACTIVE rule with no open windows anywhere would publish an empty calendar that always reads
  // "no availability" — reject so a client never hits a live-but-empty gate.
  if (active) {
    const hasWindows = Object.values(weekly).some((w) => w.length) || Object.values(exceptions).some((w) => w.length)
    if (!hasWindows) return { error: 'Add at least one open window before turning this calendar on.' }
  }

  return { payload: { gate_kind: gateKind, scope_kind: 'team', scope_id: null, label, timezone, weekly, exceptions, slot_minutes, capacity, lead_time_days, horizon_days, active } }
}
