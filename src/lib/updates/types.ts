/**
 * Type definitions for the unified updates system.
 *
 * Every operational change (hours, menu items, promotions, events,
 * closures) flows through the same `updates` table. Each type has
 * its own payload shape, defined below. New types should add a new
 * payload interface + extend UpdateType + UpdatePayload union.
 *
 * The fanout system reads these payloads and adapts them to each
 * target platform (GBP, Yelp, Facebook, etc.) at publish time.
 */

// ─── Core shared types ───────────────────────────────────────────

export type UpdateType =
  | 'hours'
  | 'menu_item'
  | 'promotion'
  | 'event'
  | 'closure'
  | 'asset'
  | 'info'

export type UpdateStatus =
  | 'draft'
  | 'review'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export type FanoutTarget =
  | 'gbp'
  | 'yelp'
  | 'facebook'
  | 'instagram'
  | 'website'
  | 'email'
  | 'sms'
  | 'pos'

export type FanoutStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rate_limited'

// ─── Hours types ─────────────────────────────────────────────────

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface TimeRange {
  open: string  // "09:00" 24h format
  close: string // "22:00" 24h format
}

/** Regular weekly hours. Empty array = closed. Multiple ranges = split shifts. */
export type WeeklyHours = Record<DayKey, TimeRange[]>

export interface SpecialHoursEntry {
  date: string                    // "2026-12-24"
  hours: TimeRange[] | []         // empty = closed for the day
  note?: string                   // "Christmas Eve"
}

// ─── Per-type payload schemas ────────────────────────────────────

export interface HoursPayload {
  /** Either a regular-week update or a special-day override */
  scope: 'regular' | 'special'
  /** Set when scope='regular' */
  weekly?: WeeklyHours
  /** Set when scope='special' */
  special?: SpecialHoursEntry[]
  /** Optional restaurant-facing note: "We're switching to summer hours" */
  note?: string
}

export interface MenuItemPayload {
  action: 'add' | 'update' | 'remove'
  item: {
    name: string
    description?: string
    price?: number               // in cents
    category?: string
    photoUrl?: string
    allergens?: string[]
    dietary?: string[]           // ['vegetarian', 'gluten_free']
    availability?: 'always' | 'lunch' | 'dinner' | 'limited_time'
    available_until?: string     // ISO date for LTOs
  }
  external_id?: string           // for update/remove, the existing item's ID
}

export interface PromotionPayload {
  name: string                   // "Happy Hour 4-6pm"
  description: string
  discount_type: 'percent' | 'amount' | 'bogo' | 'free_item' | 'other'
  discount_value?: number        // 25 for "25% off", 500 for "$5 off" (cents)
  valid_from: string             // ISO datetime
  valid_until: string            // ISO datetime
  code?: string                  // promo code if applicable
  terms?: string                 // fine print
  photoUrl?: string
}

export interface EventPayload {
  name: string                   // "Wine pairing dinner"
  description: string
  start_at: string               // ISO datetime
  end_at: string                 // ISO datetime
  capacity?: number
  ticket_url?: string
  ticket_price?: number          // cents
  photoUrl?: string
}

export interface ClosurePayload {
  /** When the closure starts */
  starts_at: string              // ISO datetime
  /** When the closure ends. If reopening time-of-day matters, include it. */
  ends_at: string
  /** 'planned' = holiday, vacation. 'emergency' = power outage, water main, weather */
  kind: 'planned' | 'emergency'
  reason: string                 // "Christmas Eve" | "Power outage" | "Family emergency"
  /** Customer-facing message for IG/FB/email. AI generates default. */
  customer_message?: string
}

export interface AssetPayload {
  action: 'add' | 'remove' | 'feature'
  asset_url: string
  asset_type: 'photo' | 'video'
  caption?: string
  tags?: string[]                // ['interior', 'food', 'team']
  /** When `action='feature'`, which surface to feature on */
  feature_on?: ('gbp_cover' | 'website_hero' | 'instagram_grid')[]
}

export interface InfoPayload {
  /** What field is being changed */
  field:
    | 'address'
    | 'phone'
    | 'website_url'
    | 'order_url'
    | 'reservation_url'
    | 'parking'
    | 'accessibility'
    | 'service_options'
    | 'description'
  /** New value. String for most fields, object for service_options. */
  value: string | Record<string, unknown>
  previous_value?: string | Record<string, unknown>
}

// ─── Discriminated union for type safety ─────────────────────────

export type UpdatePayload =
  | { type: 'hours'; data: HoursPayload }
  | { type: 'menu_item'; data: MenuItemPayload }
  | { type: 'promotion'; data: PromotionPayload }
  | { type: 'event'; data: EventPayload }
  | { type: 'closure'; data: ClosurePayload }
  | { type: 'asset'; data: AssetPayload }
  | { type: 'info'; data: InfoPayload }

// ─── Update record (matches DB row) ──────────────────────────────

export interface UpdateRecord {
  id: string
  clientId: string
  locationId: string | null
  type: UpdateType
  payload: UpdatePayload['data']
  status: UpdateStatus
  targets: FanoutTarget[]
  scheduledFor: string | null
  approvalRequired: boolean
  approvedBy: string | null
  approvedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  summary: string | null
  source: 'manual' | 'api' | 'cron' | 'auto'
}

export interface UpdateFanoutRecord {
  id: string
  updateId: string
  target: FanoutTarget
  status: FanoutStatus
  payload: Record<string, unknown> | null
  externalId: string | null
  externalUrl: string | null
  errorMessage: string | null
  retryCount: number
  nextRetryAt: string | null
  attemptedAt: string | null
  completedAt: string | null
}

/** What targets are valid for which update types (default suggestions) */
export const DEFAULT_TARGETS: Record<UpdateType, FanoutTarget[]> = {
  hours:     ['gbp', 'yelp', 'facebook', 'website'],
  menu_item: ['gbp', 'website', 'instagram', 'facebook'],
  promotion: ['gbp', 'website', 'instagram', 'facebook', 'email'],
  event:     ['gbp', 'website', 'facebook', 'instagram', 'email'],
  closure:   ['gbp', 'yelp', 'facebook', 'instagram', 'website', 'email'],
  asset:     ['website', 'instagram', 'facebook', 'gbp'],
  info:      ['gbp', 'yelp', 'facebook', 'website'],
}
