/**
 * Goal-layer types. Mirrors migration 092 schema.
 *
 * Per docs/PRODUCT-SPEC.md, the goal layer is the steering wheel of
 * the product. Every feature that touches the dashboard, console, or
 * service catalog will reference these types.
 */

// The 4 shape dimensions.
export type Footprint =
  | 'single_neighborhood'
  | 'single_destination'
  | 'multi_local'
  | 'multi_regional'
  | 'enterprise'
  | 'mobile'
  | 'ghost'

export type Concept =
  | 'qsr'
  | 'fast_casual'
  | 'casual'
  | 'fine_dining'
  | 'bar'
  | 'cafe'
  | 'mobile'
  | 'delivery_only'
  | 'catering_heavy'

export type CustomerMix =
  | 'local_repeat'
  | 'local_destination'
  | 'tourist_heavy'
  | 'regional_draw'
  | 'b2b_catering'

export type DigitalMaturity = 'nascent' | 'basic' | 'active' | 'sophisticated'

export interface RestaurantShape {
  footprint: Footprint | null
  concept: Concept | null
  customerMix: CustomerMix | null
  digitalMaturity: DigitalMaturity | null
  capturedAt: string | null
  capturedBy: string | null
}

// The 8 goals from PRODUCT-SPEC.md. Source of truth is the
// goals_catalog table; this union is the compile-time mirror.
export type GoalSlug =
  | 'more_foot_traffic'
  | 'regulars_more_often'
  | 'more_online_orders'
  | 'more_reservations'
  | 'better_reputation'
  | 'be_known_for'
  | 'fill_slow_times'
  | 'grow_catering'

export interface CatalogGoal {
  slug: GoalSlug
  displayName: string
  ownerVoice: string
  rationale: string
  primarySignal: string | null
  primaryLever: string | null
  sortOrder: number
  isActive: boolean
}

export type GoalStatus = 'active' | 'achieved' | 'abandoned' | 'superseded'

export interface ClientGoal {
  id: string
  clientId: string
  goalSlug: GoalSlug
  priority: 1 | 2 | 3
  targetDate: string | null
  status: GoalStatus
  notes: string | null
  setBy: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PlaybookEmphasis = 'high' | 'medium' | 'low' | 'avoid'

export interface PlaybookEntry {
  id: string
  goalSlug: GoalSlug
  footprintMatch: Footprint[] | null
  conceptMatch: Concept[] | null
  customerMixMatch: CustomerMix[] | null
  digitalMaturityMatch: DigitalMaturity[] | null
  serviceSlug: string
  emphasis: PlaybookEmphasis
  notes: string | null
  sortOrder: number
}

export type ServiceGoalStrength = 'primary' | 'secondary' | 'incidental'

export interface ServiceGoalTag {
  serviceSlug: string
  goalSlug: GoalSlug
  strength: ServiceGoalStrength
}
