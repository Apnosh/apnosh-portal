'use server'

/**
 * logEvent() -- the single writer for the unified events table
 * (migration 087, Phase 3 Decision 2).
 *
 * Use whenever something meaningful happens to a client. The strategist
 * console (1.3) and the AI "what changed" summaries read from this
 * table; if you skip writing here, your event won't show up there.
 *
 * Per-event_type payload validation lives in ./schemas.ts. logEvent
 * does NOT enforce schemas itself -- callers should validate their
 * own input. The schemas file exists so consumers can parse safely.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type EventActorRole =
  | 'admin'
  | 'strategist'
  | 'client'
  | 'system'
  | 'cron'
  | 'webhook'

export interface LogEventInput {
  clientId: string
  /** Dotted name, e.g. 'scheduled_post.approved' or 'review.received' */
  eventType: string
  /** Domain object type, e.g. 'scheduled_post' */
  subjectType?: string
  /** Domain object id */
  subjectId?: string
  /** auth.users.id of the human, or null/undefined for non-human actors */
  actorId?: string | null
  actorRole?: EventActorRole
  /** Free-form structured data; recipients should validate against schemas.ts */
  payload?: Record<string, unknown>
  /** Pre-computed one-line description for fast feed rendering */
  summary?: string
  /** When the underlying thing happened. Defaults to now. */
  occurredAt?: Date
}

export async function logEvent(input: LogEventInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('events')
    .insert({
      client_id: input.clientId,
      event_type: input.eventType,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? null,
      payload: input.payload ?? {},
      summary: input.summary ?? null,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

/**
 * Recent events for a client. Used by the strategist console row's
 * "what changed" preview and by AI brief generation.
 */
export async function recentEvents(clientId: string, limit = 50) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('events')
    .select('*')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, events: data ?? [] }
}
