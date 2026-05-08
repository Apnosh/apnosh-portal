'use server'

/**
 * Generic workflow transition helper.
 *
 * Pairs with migration 084_state_transitions.sql. Use this whenever an
 * entity moves between workflow states -- it (a) lets the DB trigger
 * enforce the transition, (b) returns a typed error if the transition is
 * invalid, and (c) once the events table lands (next migration) will
 * write a single audit event for free.
 *
 * Usage:
 *   const r = await transition({
 *     table: 'scheduled_posts',
 *     id: postId,
 *     entityType: 'scheduled_post',
 *     to: 'approved',
 *     actorId: user.id,
 *   })
 *   if (!r.ok) throw new Error(r.error)
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface TransitionInput {
  /** Postgres table name (e.g. 'scheduled_posts') */
  table: string
  /** Primary key value of the row to transition */
  id: string
  /** Matches state_transitions.entity_type (e.g. 'scheduled_post') */
  entityType: string
  /** Destination state */
  to: string
  /** Actor user id -- written to audit log when events table lands */
  actorId?: string | null
  /** Status column name. Defaults to 'status'. */
  statusColumn?: string
  /** Additional columns to update alongside the state change. */
  patch?: Record<string, unknown>
}

export type TransitionResult<T = Record<string, unknown>> =
  | { ok: true; row: T }
  | { ok: false; error: string; code: 'invalid_transition' | 'not_found' | 'unknown' }

export async function transition<T = Record<string, unknown>>(
  input: TransitionInput
): Promise<TransitionResult<T>> {
  const admin = createAdminClient()
  const col = input.statusColumn ?? 'status'

  const updates: Record<string, unknown> = {
    ...(input.patch ?? {}),
    [col]: input.to,
  }

  const { data, error } = await admin
    .from(input.table)
    .update(updates)
    .eq('id', input.id)
    .select('*')
    .single()

  if (error) {
    // Postgres raises check_violation (23514) from enforce_state_transition()
    // when the (from, to) edge isn't declared in state_transitions.
    if (error.code === '23514' || /Invalid state transition/i.test(error.message)) {
      return { ok: false, error: error.message, code: 'invalid_transition' }
    }
    if (error.code === 'PGRST116') {
      return { ok: false, error: 'Row not found', code: 'not_found' }
    }
    return { ok: false, error: error.message, code: 'unknown' }
  }

  return { ok: true, row: data as T }
}
