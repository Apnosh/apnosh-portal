/**
 * Restaurant vertical schema — single source of truth.
 *
 * Drives:
 *   - Admin Site Builder form (auto-rendered via FieldRenderer)
 *   - /api/public/sites/[slug] response shape
 *   - Template fallback defaults (Eleventy via apnosh.js)
 *
 * Add a field here and it's available everywhere. Don't add fields anywhere
 * else.
 */

import { z } from 'zod'
import {
  BrandSchema, HeroSchema, LocationSchema, AboutSchema,
  ContactSchema, SocialSchema, SeoSchema, IdentitySchema,
  NonEmptyString, OptionalUrl, OptionalString,
} from './shared'

// ----- Restaurant-specific: AYCE & Menu Highlights -----

export const AyceProgramSchema = z.object({
  enabled: z.boolean().describe('Show this AYCE program on the site'),
  name: NonEmptyString.max(40, 'Keep it short'),
  subtitle: z.string().trim().max(120).optional(),
  meatCount: z.coerce.number().int().min(0).describe('# of meats'),
  sideCount: z.coerce.number().int().min(0).describe('# of sides + stews'),
  highlights: z.array(z.string().trim().min(1)).describe('Bullet list, 3–5 items'),
})
export type AyceProgram = z.infer<typeof AyceProgramSchema>

export const MenuCategoryPlaceholderSchema = z.object({
  id: NonEmptyString.describe('Category slug (e.g. appetizers)'),
  name: NonEmptyString.max(60),
  description: z.string().trim().max(220).optional(),
})

export const OfferingsSchema = z.object({
  ayce: z.object({
    premium: AyceProgramSchema.optional(),
    supreme: AyceProgramSchema.optional(),
  }).describe('All-you-can-eat programs (optional — restaurants without AYCE leave both off)'),
  categories: z.array(MenuCategoryPlaceholderSchema).describe('Menu categories shown on /menu/. Items are managed in the Menu editor (separate table).'),
})
export type Offerings = z.infer<typeof OfferingsSchema>

// ----- Reservation / Booking -----

export const ReservationSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['opentable', 'resy', 'sevenrooms', 'tock', 'custom']).optional(),
  url: OptionalUrl.describe('Reservation page URL'),
  ctaLabel: z.string().trim().max(24).optional().describe('Button label (default: Reserve a Table)'),
})
export type Reservation = z.infer<typeof ReservationSchema>

// ----- Stat band / numbers strip -----

export const StatBandSchema = z.object({
  enabled: z.boolean(),
  stats: z.array(
    z.object({
      value: NonEmptyString.max(8, 'Keep stats short'),
      label: NonEmptyString.max(28),
    }),
  ).max(4),
})
export type StatBand = z.infer<typeof StatBandSchema>

// ----- Footer -----

export const FooterSchema = z.object({
  tagline: z.string().trim().max(180).optional().nullable(),
  copyright: OptionalString,
})
export type Footer = z.infer<typeof FooterSchema>

// ----- Top-level Restaurant Site Config -----

export const RestaurantSiteSchema = z.object({
  identity: IdentitySchema,
  brand: BrandSchema,
  hero: HeroSchema,
  locations: z.array(LocationSchema).min(1, 'At least one location is required'),
  offerings: OfferingsSchema,
  about: AboutSchema,
  contact: ContactSchema,
  reservation: ReservationSchema,
  social: SocialSchema,
  seo: SeoSchema,
  statBand: StatBandSchema.optional(),
  footer: FooterSchema.optional(),
})

export type RestaurantSite = z.infer<typeof RestaurantSiteSchema>

// ----- Default seed (used to bootstrap empty drafts) -----

export const RESTAURANT_DEFAULTS: RestaurantSite = {
  identity: {
    displayName: '',
    vertical: 'restaurant',
    templateId: 'restaurant-bold',
    tagline: '',
  },
  brand: {
    primaryColor: '#0B0B0B',
    secondaryColor: '#CC0A0A',
    accentColor: '#FFFFFF',
    fontDisplay: 'Anton',
    fontBody: 'DM Sans',
    logoUrl: null,
    voiceNotes: null,
  },
  hero: {
    eyebrow: '',
    headline: '',
    subhead: '',
    photoUrl: null,
    primaryCta: { label: 'Reserve', url: '#' },
  },
  locations: [],
  offerings: {
    ayce: {},
    categories: [
      { id: 'appetizers', name: 'Appetizers', description: 'Small plates to share.' },
      { id: 'entrees', name: 'Entrées', description: 'Mains served with rice and sides.' },
      { id: 'drinks', name: 'Drinks', description: 'Cocktails, beer, wine, zero-proof.' },
    ],
  },
  about: {
    headline: '',
    body: '',
    photoUrl: null,
    values: [],
  },
  contact: {
    intro: '',
    faqs: [],
  },
  reservation: { enabled: false, url: null, ctaLabel: 'Reserve a Table' },
  social: {
    instagram: null, tiktok: null, facebook: null,
    twitter: null, youtube: null, linkedin: null,
  },
  seo: {
    title: '',
    description: '',
    ogImageUrl: null,
  },
  statBand: { enabled: false, stats: [] },
  footer: { tagline: null, copyright: null },
}
