/**
 * The vault's write-time guard, kept apart from the vault itself.
 *
 * WHY ITS OWN FILE. vault.ts is 'server-only' and constructs a Supabase admin client, so anything
 * that imports it drags a database in. This check is the one part that must be testable without
 * one, and testable is the whole point: it is the rule that stops an owner's say-so being recorded
 * as a credential we hold. A guard nothing can hammer is a comment.
 *
 * CLIENT-SAFE: pure. No I/O.
 */

import type { Requirement, RequirementProof } from './requirements'

/** Best first. A claim ABOVE a requirement's own ceiling is the laundering case; a claim below it
 *  is just under-selling what we know, which is never the lie. */
const RANK: Record<RequirementProof, number> = {
  token: 3,
  probe: 2,
  'our-side': 1,
  'owner-word': 0,
}

/** Why this proof may not be recorded for this requirement, or null when it may. */
export function proofRefusal(req: Requirement, claimed: RequirementProof): string | null {
  if (RANK[claimed] > RANK[req.proof]) {
    return `${req.id} is collected by "${req.method}", which cannot produce proof "${claimed}" (its best is "${req.proof}")`
  }
  return null
}
