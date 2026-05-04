/**
 * Shared field types used across vertical schemas.
 *
 * Each vertical (restaurant, retail, services) imports these so locations,
 * brand, hero, social, and SEO are defined once.
 */

import { z } from 'zod'

// ----- Primitive types -----

export const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Use a hex color like #CC0A0A')
  .describe('Hex color (e.g. #CC0A0A)')

export const NonEmptyString = z.string().trim().min(1, 'Required')

export const OptionalString = z.string().trim().optional().nullable()

export const OptionalUrl = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .optional()
  .or(z.literal(''))
  .nullable()

export const RequiredUrl = z.string().trim().url('Must be a valid URL')

// ----- Design system tokens -----

export const DesignSystemSchema = z.object({
  /** Corner roundness — sharp / soft / pillowy. */
  radius: z.enum(['sharp', 'subtle', 'soft', 'pillowy']).describe('Corner radius profile'),
  /** Density — airy = lots of whitespace, dense = packed editorial. */
  density: z.enum(['airy', 'balanced', 'dense']).describe('Spacing density'),
  /** Motion intensity — none / subtle / lively. */
  motion: z.enum(['none', 'subtle', 'lively']).describe('Animation intensity'),
  /** Photo treatment — natural / duotone / brand-tinted. */
  photoTreatment: z.enum(['natural', 'duotone', 'tinted']).describe('How photos are styled'),
  /** Surface preference — paper (light) or ink (dark). */
  surface: z.enum(['light', 'dark', 'cream']).describe('Default page background'),
  /** Type weight — leaner regular vs heavier black. */
  typeWeight: z.enum(['regular', 'medium', 'bold', 'black']).describe('Display type weight'),
})
export type DesignSystem = z.infer<typeof DesignSystemSchema>

export const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  radius: 'subtle',
  density: 'balanced',
  motion: 'subtle',
  photoTreatment: 'natural',
  surface: 'cream',
  typeWeight: 'regular',
}

// ----- Brand -----

export const BrandSchema = z.object({
  primaryColor: HexColor.describe('Primary brand color'),
  secondaryColor: HexColor.describe('Secondary brand color'),
  accentColor: HexColor.optional().describe('Accent color (optional)'),
  fontDisplay: NonEmptyString.describe('Display font (headings)'),
  fontBody: NonEmptyString.describe('Body font (paragraphs)'),
  logoUrl: OptionalUrl.describe('Logo image URL (transparent PNG preferred)'),
  voiceNotes: OptionalString.describe('How the brand sounds — tone notes for AI + writers'),
  designSystem: DesignSystemSchema.optional().describe('Visual design tokens — radius, density, motion'),
})
export type Brand = z.infer<typeof BrandSchema>

// ----- Hero -----

export const CtaSchema = z.object({
  label: NonEmptyString.max(28, 'Keep CTAs short').describe('Button label'),
  url: RequiredUrl.describe('Button destination URL'),
})
export type Cta = z.infer<typeof CtaSchema>

export const HeroSchema = z.object({
  eyebrow: z.string().trim().max(28, 'Eyebrow is too long').optional().describe('Small line above the headline'),
  headline: NonEmptyString.max(72, 'Headline is too long').describe('Big headline'),
  subhead: z.string().trim().max(220, 'Subhead is too long').optional().describe('One-line description under the headline'),
  photoUrl: OptionalUrl.describe('Hero photo URL'),
  primaryCta: CtaSchema.describe('Primary call-to-action button'),
  secondaryCta: CtaSchema.optional().describe('Secondary button (optional)'),
})
export type Hero = z.infer<typeof HeroSchema>

// ----- Locations -----

export const HoursRowSchema = z.object({
  label: NonEmptyString.describe('Day or day range (e.g. Mon–Fri)'),
  value: NonEmptyString.describe('Hours (e.g. 4 – 10pm) or "Closed"'),
})

export const LocationSchema = z.object({
  id: z.string().describe('Stable identifier (used for anchors and DB ref)'),
  name: NonEmptyString.describe('Location name (e.g. Alki Beach)'),
  tagline: z.string().trim().max(60, 'Tagline is too long').optional().describe('Short positioning line'),
  address: NonEmptyString.describe('Street address'),
  city: NonEmptyString.describe('City'),
  state: NonEmptyString.describe('State (2 letters)'),
  zip: NonEmptyString.describe('ZIP / postal code'),
  phone: OptionalString.describe('Display phone (formatted)'),
  phoneHref: OptionalString.describe('Tel: href (digits-only)'),
  email: OptionalString.describe('Location-specific email (optional)'),
  googleMapsUrl: OptionalUrl.describe('Google Maps URL'),
  vibe: z.string().trim().max(280, 'Vibe is too long').optional().describe('One paragraph about the room'),
  hours: z.array(HoursRowSchema).describe('Hours rows in display order'),
  features: z.array(z.string().trim().min(1)).describe('Short feature chips (e.g. "Walk-ins welcome")'),
  isPrimary: z.boolean().describe('Show first / use as canonical location'),
  photoUrl: OptionalUrl.describe('Location photo'),
})
export type Location = z.infer<typeof LocationSchema>

// ----- About -----

export const AboutValueSchema = z.object({
  title: NonEmptyString.max(40, 'Title is too long'),
  body: NonEmptyString.max(220, 'Body is too long'),
})

export const AboutSchema = z.object({
  headline: NonEmptyString.max(72, 'Headline is too long').describe('Big line at the top of About'),
  body: NonEmptyString.max(2400, 'Story is too long').describe('Brand story (2–4 paragraphs, separated by blank lines)'),
  photoUrl: OptionalUrl.describe('About-page photo'),
  values: z.array(AboutValueSchema).describe('Three brand values (title + short body each)'),
})
export type About = z.infer<typeof AboutSchema>

// ----- Contact / FAQ -----

export const FaqSchema = z.object({
  q: NonEmptyString.max(160, 'Question is too long'),
  a: NonEmptyString.max(600, 'Answer is too long'),
})

export const ContactSchema = z.object({
  intro: z.string().trim().max(400, 'Intro is too long').optional().describe('Lead paragraph on the contact page'),
  faqs: z.array(FaqSchema).describe('Common questions, repeatable'),
})
export type Contact = z.infer<typeof ContactSchema>

// ----- Social -----

export const SocialSchema = z.object({
  instagram: OptionalUrl,
  tiktok: OptionalUrl,
  facebook: OptionalUrl,
  twitter: OptionalUrl,
  youtube: OptionalUrl,
  linkedin: OptionalUrl,
})
export type Social = z.infer<typeof SocialSchema>

// ----- SEO -----

export const SeoSchema = z.object({
  title: NonEmptyString.max(70, 'Title should be 70 chars or less').describe('Browser tab title + Google result title'),
  description: NonEmptyString.max(180, 'Description should be 160–180 chars').describe('Meta description for search results'),
  ogImageUrl: OptionalUrl.describe('Social share image (1200×630)'),
})
export type Seo = z.infer<typeof SeoSchema>

// ----- Identity -----

export const IdentitySchema = z.object({
  displayName: NonEmptyString.max(60).describe('Public-facing brand name'),
  vertical: z.enum(['restaurant', 'retail', 'services']).describe('Drives template + field set'),
  templateId: NonEmptyString.describe('Template variant slug'),
  tagline: z.string().trim().max(120).optional().describe('Short positioning line'),
})
export type Identity = z.infer<typeof IdentitySchema>
