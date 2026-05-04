/**
 * Retail vertical schema. Reuses Brand / Hero / Locations / About /
 * Testimonials / Gallery / Contact / Social / SEO. Adds retail-specific
 * sections: featured products, shopping/online ordering, shipping info.
 */

import { z } from 'zod'
import {
  BrandSchema, HeroSchema, LocationSchema, AboutSchema,
  ContactSchema, SocialSchema, SeoSchema, IdentitySchema,
  NonEmptyString, OptionalUrl, OptionalString,
} from './shared'
import {
  TestimonialsSchema, GallerySchema, FooterSchema, StatBandSchema,
} from './restaurant'

// ----- Featured products -----

export const ProductSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString.max(80),
  description: z.string().trim().max(280).optional().nullable(),
  price: z.string().trim().max(24).optional().nullable().describe('Display price (e.g. "$24" or "From $12")'),
  imageUrl: OptionalUrl,
  buyUrl: OptionalUrl.describe('Product page or buy-now URL'),
  badge: z.string().trim().max(20).optional().nullable().describe('e.g. "Bestseller", "New", "Limited"'),
})
export type Product = z.infer<typeof ProductSchema>

export const ProductsSchema = z.object({
  enabled: z.boolean(),
  heading: z.string().trim().max(80).optional(),
  description: z.string().trim().max(220).optional(),
  items: z.array(ProductSchema).max(20),
})
export type Products = z.infer<typeof ProductsSchema>

// ----- Shopping links / online ordering -----

export const ShoppingSchema = z.object({
  enabled: z.boolean(),
  primaryCtaLabel: z.string().trim().max(28).optional().describe('e.g. "Shop online" or "Order now"'),
  primaryCtaUrl: OptionalUrl,
  marketplaces: z.array(
    z.object({
      name: NonEmptyString.describe('Marketplace name (Etsy, Amazon, Shopify, etc.)'),
      url: NonEmptyString.describe('URL to your storefront on that marketplace'),
    }),
  ).max(8),
})
export type Shopping = z.infer<typeof ShoppingSchema>

// ----- Shipping / fulfillment -----

export const ShippingSchema = z.object({
  enabled: z.boolean(),
  freeShippingThreshold: z.string().trim().max(40).optional().nullable().describe('e.g. "Free shipping over $50"'),
  shipsTo: z.string().trim().max(120).optional().nullable().describe('e.g. "US + Canada"'),
  policyUrl: OptionalUrl,
  returnsPolicy: z.string().trim().max(220).optional().nullable(),
})
export type Shipping = z.infer<typeof ShippingSchema>

// ----- Top-level Retail Site Config -----

export const RetailSiteSchema = z.object({
  identity: IdentitySchema,
  brand: BrandSchema,
  hero: HeroSchema,
  /** Retail clients may have 0 physical locations (online-only) so locations is optional. */
  locations: z.array(LocationSchema),
  products: ProductsSchema,
  shopping: ShoppingSchema,
  shipping: ShippingSchema.optional(),
  about: AboutSchema,
  testimonials: TestimonialsSchema.optional(),
  gallery: GallerySchema.optional(),
  contact: ContactSchema,
  social: SocialSchema,
  seo: SeoSchema,
  statBand: StatBandSchema.optional(),
  footer: FooterSchema.optional(),
})

export type RetailSite = z.infer<typeof RetailSiteSchema>

export const RETAIL_DEFAULTS: RetailSite = {
  identity: {
    displayName: '',
    vertical: 'retail',
    templateId: 'retail-grid',
    tagline: '',
  },
  brand: {
    primaryColor: '#0B0B0B',
    secondaryColor: '#3A3A3A',
    accentColor: '#FFFFFF',
    fontDisplay: 'Archivo Black',
    fontBody: 'Archivo',
    logoUrl: null,
    voiceNotes: null,
  },
  hero: {
    eyebrow: '',
    headline: '',
    subhead: '',
    photoUrl: null,
    primaryCta: { label: 'Shop now', url: '#' },
  },
  locations: [],
  products: { enabled: true, heading: 'Featured', description: '', items: [] },
  shopping: { enabled: false, primaryCtaLabel: 'Shop online', primaryCtaUrl: null, marketplaces: [] },
  shipping: { enabled: false, freeShippingThreshold: null, shipsTo: null, policyUrl: null, returnsPolicy: null },
  about: { headline: '', body: '', photoUrl: null, values: [] },
  testimonials: { enabled: false, heading: 'What customers are saying', items: [] },
  gallery: { enabled: false, heading: 'Photos', description: '', photos: [] },
  contact: { intro: '', faqs: [] },
  social: { instagram: null, tiktok: null, facebook: null, twitter: null, youtube: null, linkedin: null },
  seo: { title: '', description: '', ogImageUrl: null },
  statBand: { enabled: false, stats: [] },
  footer: { tagline: null, copyright: null },
}

// Suppress unused-import warning for OptionalString — used by some downstream types
void OptionalString
