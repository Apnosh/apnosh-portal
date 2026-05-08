/**
 * Per-event_type payload shapes.
 *
 * The events table stores payload as untyped jsonb (intentionally -- the
 * shape evolves and we don't want a migration on every product change).
 * This file is the documented contract for what each event_type's payload
 * looks like. Consumers (console, AI prompt builders, exports) reference
 * these types when reading.
 *
 * Adding a new event_type:
 *   1. Add a TypeScript interface here.
 *   2. Wire it into EventPayloads below.
 *   3. The producer calls logEvent({ eventType, payload }) with the
 *      shape; readers can `(e.payload as EventPayloads[typeof e.event_type])`
 *      after a runtime check.
 */

// ── Scheduled posts ───────────────────────────────────────────────
export interface ScheduledPostStateEvent {
  postId: string
  fromState: string | null
  toState: string
  reason?: string
}

// ── Reviews ───────────────────────────────────────────────────────
export interface ReviewReceivedEvent {
  reviewId: string
  source: 'google' | 'yelp' | 'manual'
  rating: number
  excerpt?: string
}

export interface ReviewRespondedEvent {
  reviewId: string
  responseExcerpt?: string
  withinHours: number
}

// ── Connections ───────────────────────────────────────────────────
export interface ConnectionTokenEvent {
  channel: string
  status: 'rotated' | 'expired' | 'reauth_required' | 'failed'
  error?: string
}

// ── Deliverables ──────────────────────────────────────────────────
export interface DeliverableShippedEvent {
  deliverableId: string
  serviceId: string | null
  type: string
}

// ── Registry ──────────────────────────────────────────────────────
export interface EventPayloads {
  'scheduled_post.submitted_for_review': ScheduledPostStateEvent
  'scheduled_post.approved': ScheduledPostStateEvent
  'scheduled_post.changes_requested': ScheduledPostStateEvent
  'scheduled_post.scheduled': ScheduledPostStateEvent
  'scheduled_post.published': ScheduledPostStateEvent
  'scheduled_post.failed': ScheduledPostStateEvent
  'scheduled_post.canceled': ScheduledPostStateEvent

  'review.received': ReviewReceivedEvent
  'review.responded': ReviewRespondedEvent

  'connection.token_rotated': ConnectionTokenEvent
  'connection.reauth_required': ConnectionTokenEvent

  'deliverable.shipped': DeliverableShippedEvent
}

export type EventType = keyof EventPayloads
