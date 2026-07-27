/**
 * THE VAULT — what a client has already given us, read and written in one place.
 *
 * Phase 2 defined the vocabulary (requirements.ts) and the table (client_requirements). This is the
 * only module that touches that table, and the reason it is the only one is the rule below.
 *
 * ── THE RULE THIS MODULE ENFORCES ──────────────────────────────────────────────────────────────
 *
 * NOTHING MAY CLAIM A PROOF ITS REQUIREMENT CANNOT PRODUCE.
 *
 * The library already refuses to DEFINE a requirement collected by a typed form that claims a live
 * API token. This is the same check at write time, against real input: a route that stamps
 * `proof: 'token'` for a requirement whose only collection method is "the owner typed it" gets an
 * error, not a row. Without that, the vault becomes the exact laundering machine the separate
 * claimed-vs-verified execution columns exist to prevent — one write and an owner's say-so is
 * indistinguishable from a credential we hold.
 *
 * The second rule is smaller and just as load-bearing: `value` is for small owner-typed FACTS. A
 * requirement that is an access grant may not carry one, because the only thing an access grant
 * would put there is a secret, and secrets stay in the systems built to hold them.
 *
 * Server-only. Runs on the service role, which is why the table's own policy is admin-only: the
 * proof rung is a decision about what an ACTION is allowed to assert, and only the route knows
 * which action it is.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirementById, isHollow, intakeFor, type Requirement, type RequirementProof } from './requirements'
import { proofRefusal } from './vault-guard'
export { proofRefusal } from './vault-guard'

export interface HeldRequirement {
  requirement: string
  proof: RequirementProof
  value: unknown
  evidence: string | null
  satisfiedAt: string
  /** True when this rests on the owner's word. The UI must render it hollow. */
  hollow: boolean
}

/* ── reading ─────────────────────────────────────────────────────────────────────────────────── */

/** Everything this client has given us that is still good. Broken rows are excluded: a revoked
 *  token is not a thing we hold, and the ask has to come back. */
export async function getHeldRequirements(clientId: string): Promise<HeldRequirement[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_requirements')
    .select('requirement, proof, value, evidence, satisfied_at')
    .eq('client_id', clientId)
    .is('broken_at', null)

  // Never blow up a page over the vault. An unreadable vault means we ask again, which is annoying
  // and safe; throwing means the screen does not render at all, which is neither.
  if (error || !data) return []

  return data.map((r) => ({
    requirement: r.requirement as string,
    proof: r.proof as RequirementProof,
    value: r.value,
    evidence: (r.evidence as string | null) ?? null,
    satisfiedAt: r.satisfied_at as string,
    hollow: (r.proof as RequirementProof) === 'owner-word',
  }))
}

/** The ids alone, for the common case of "is this satisfied". */
export async function heldRequirementIds(clientId: string): Promise<string[]> {
  return (await getHeldRequirements(clientId)).map((r) => r.requirement)
}

/**
 * What a client still owes for a given set of requirement ids, in library order, prerequisites
 * first. This is the function an intake screen renders and a product page previews.
 */
export async function outstandingFor(clientId: string, needs: readonly string[]): Promise<Requirement[]> {
  const held = new Set(await heldRequirementIds(clientId))
  return intakeFor(needs).filter((r) => !held.has(r.id))
}

/* ── writing ─────────────────────────────────────────────────────────────────────────────────── */

export interface SatisfyInput {
  clientId: string
  /** A requirement id from the library. */
  requirement: string
  /** What the caller is asserting it knows. Checked against the requirement's own definition. */
  proof: RequirementProof
  /** Small owner-typed facts only. Never a secret. */
  value?: unknown
  /** How we know, in a sentence, for the audit trail. */
  evidence?: string
}

export type SatisfyResult = { ok: true } | { ok: false; error: string }

/**
 * Record that a requirement is satisfied.
 *
 * Idempotent by construction: the table's unique (client_id, requirement) means a second call
 * updates rather than duplicates, which is what makes "collect once" survive a double-tap and a
 * retried webhook alike.
 */
export async function satisfyRequirement(input: SatisfyInput): Promise<SatisfyResult> {
  const req = requirementById(input.requirement)
  if (!req) return { ok: false, error: `unknown requirement "${input.requirement}"` }

  const bad = proofRefusal(req, input.proof)
  if (bad) return { ok: false, error: bad }

  if (input.value !== undefined && !req.fact) {
    return { ok: false, error: `${req.id} is an access grant, so it stores no value. Secrets do not live here.` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_requirements')
    .upsert(
      {
        client_id: input.clientId,
        requirement: req.id,
        proof: input.proof,
        value: input.value ?? null,
        evidence: input.evidence ?? null,
        satisfied_at: new Date().toISOString(),
        // Satisfying again clears a previous break: whatever was wrong is now not wrong.
        broken_at: null,
        broken_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,requirement' },
    )

  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Mark a requirement as no longer true: a token expired, a probe failed on recheck, an invite was
 * revoked. The row is kept rather than deleted, so we can still say what we once had and when it
 * stopped being so.
 */
export async function breakRequirement(clientId: string, requirement: string, reason: string): Promise<SatisfyResult> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('client_requirements')
    .update({ broken_at: new Date().toISOString(), broken_reason: reason, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('requirement', requirement)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Whether a satisfied requirement should render as a hollow check. Re-exported so callers need
 *  only one import to render a vault row honestly. */
export const requirementIsHollow = isHollow
