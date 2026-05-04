/**
 * Vertical schema registry. Add a vertical here once and the rest of the
 * platform (admin form, API, template) picks it up automatically.
 */

import { RestaurantSiteSchema, RESTAURANT_DEFAULTS } from './restaurant'
import { RetailSiteSchema, RETAIL_DEFAULTS } from './retail'
import type { RestaurantSite } from './restaurant'
import type { RetailSite } from './retail'
import type { ZodTypeAny } from 'zod'

export type Vertical = 'restaurant' | 'retail' | 'services'

export interface VerticalDefinition {
  schema: ZodTypeAny
  defaults: unknown
  templates: { id: string; name: string; preview?: string }[]
}

export const VERTICAL_REGISTRY: Record<Vertical, VerticalDefinition> = {
  restaurant: {
    schema: RestaurantSiteSchema,
    defaults: RESTAURANT_DEFAULTS,
    templates: [
      { id: 'restaurant-bold', name: 'Bold — dark hero, red accents' },
    ],
  },
  retail: {
    schema: RetailSiteSchema,
    defaults: RETAIL_DEFAULTS,
    templates: [
      { id: 'retail-grid', name: 'Grid — product-forward, minimal' },
    ],
  },
  services: {
    schema: RestaurantSiteSchema, // placeholder — services.ts coming next
    defaults: RESTAURANT_DEFAULTS,
    templates: [],
  },
}

export { RestaurantSiteSchema, RESTAURANT_DEFAULTS }
export { RetailSiteSchema, RETAIL_DEFAULTS }
export type { RestaurantSite, RetailSite }
