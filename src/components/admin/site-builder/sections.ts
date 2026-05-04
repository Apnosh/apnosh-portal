/**
 * Section catalogue for the Site Builder UI.
 *
 * Sections are grouped (Identity & Brand, Content, Trust, Configuration)
 * and each declares which fields are required for "publish-ready". The
 * readiness score panel uses these to compute completeness.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

export type SectionKey = keyof RestaurantSite

export interface SectionDef {
  key: SectionKey
  title: string
  subtitle: string
  group: GroupKey
  /**
   * Function that returns missing-field labels. Empty array = section is
   * publish-ready. The form surfaces these in the readiness panel.
   */
  validate: (data: RestaurantSite) => string[]
}

export type GroupKey =
  | 'identity'
  | 'content'
  | 'trust'
  | 'configuration'

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'identity',      label: 'Identity & Brand' },
  { key: 'content',       label: 'Content' },
  { key: 'trust',         label: 'Trust & Social Proof' },
  { key: 'configuration', label: 'Configuration' },
]

export const SECTIONS: SectionDef[] = [
  {
    key: 'identity',
    title: 'Identity',
    subtitle: 'Brand name, vertical, template',
    group: 'identity',
    validate: (d) => {
      const out: string[] = []
      if (!d.identity.displayName?.trim()) out.push('Identity → Display name')
      return out
    },
  },
  {
    key: 'brand',
    title: 'Brand',
    subtitle: 'Colors, fonts, logo',
    group: 'identity',
    validate: (d) => {
      const out: string[] = []
      if (!d.brand.primaryColor) out.push('Brand → Primary color')
      if (!d.brand.fontDisplay) out.push('Brand → Display font')
      return out
    },
  },
  {
    key: 'hero',
    title: 'Hero',
    subtitle: 'Top of the home page',
    group: 'content',
    validate: (d) => {
      const out: string[] = []
      if (!d.hero.headline?.trim()) out.push('Hero → Headline')
      if (!d.hero.primaryCta?.label?.trim()) out.push('Hero → Primary CTA label')
      return out
    },
  },
  {
    key: 'locations',
    title: 'Locations',
    subtitle: 'Physical places',
    group: 'content',
    validate: (d) => {
      const out: string[] = []
      if (!d.locations.length) out.push('Locations → Add at least one')
      d.locations.forEach((l, i) => {
        if (!l.name?.trim()) out.push(`Locations → #${i + 1} name`)
        if (!l.address?.trim()) out.push(`Locations → #${i + 1} address`)
      })
      return out
    },
  },
  {
    key: 'offerings',
    title: 'Offerings',
    subtitle: 'Programs, menu categories',
    group: 'content',
    validate: () => [], // Optional everywhere
  },
  {
    key: 'about',
    title: 'About',
    subtitle: 'Story + values',
    group: 'content',
    validate: (d) => {
      const out: string[] = []
      if (!d.about.headline?.trim()) out.push('About → Headline')
      if (!d.about.body?.trim()) out.push('About → Story body')
      return out
    },
  },
  {
    key: 'testimonials',
    title: 'Testimonials',
    subtitle: 'Reviews + press quotes',
    group: 'trust',
    validate: () => [],
  },
  {
    key: 'gallery',
    title: 'Gallery',
    subtitle: 'Photo grid',
    group: 'trust',
    validate: () => [],
  },
  {
    key: 'contact',
    title: 'Contact + FAQ',
    subtitle: 'Common questions',
    group: 'trust',
    validate: () => [],
  },
  {
    key: 'reservation',
    title: 'Reservation',
    subtitle: 'Booking link',
    group: 'configuration',
    validate: (d) => {
      const out: string[] = []
      if (d.reservation.enabled && !d.reservation.url) {
        out.push('Reservation → URL (toggle is on but URL is empty)')
      }
      return out
    },
  },
  {
    key: 'social',
    title: 'Social',
    subtitle: 'Profile links',
    group: 'configuration',
    validate: () => [],
  },
  {
    key: 'seo',
    title: 'SEO',
    subtitle: 'Title, description, share image',
    group: 'configuration',
    validate: (d) => {
      const out: string[] = []
      if (!d.seo.title?.trim()) out.push('SEO → Title')
      if (!d.seo.description?.trim()) out.push('SEO → Description')
      return out
    },
  },
  {
    key: 'statBand',
    title: 'Stat Band',
    subtitle: 'Big number strip',
    group: 'configuration',
    validate: () => [],
  },
  {
    key: 'footer',
    title: 'Footer',
    subtitle: 'Tagline + copyright',
    group: 'configuration',
    validate: () => [],
  },
]

export function readinessScore(data: RestaurantSite): {
  score: number       // 0–100
  totalRequired: number
  missing: string[]
  perSection: Record<SectionKey, { missing: string[]; complete: boolean }>
} {
  const perSection = {} as Record<SectionKey, { missing: string[]; complete: boolean }>
  let totalRequired = 0
  const allMissing: string[] = []

  for (const sec of SECTIONS) {
    const missing = sec.validate(data)
    perSection[sec.key] = { missing, complete: missing.length === 0 }
    // Required-ness is implicit: sections with non-empty validate output
    // contribute to the score
    if (sec.validate.toString().includes('out.push')) {
      // count this section as required-bearing — score by per-field
    }
    allMissing.push(...missing)
  }

  // Score = (sections with no missing fields / total scoring sections) × 100
  const scoringSections = SECTIONS.filter(s => s.validate(data).length === 0 || s.validate.toString().includes('out.push'))
  const completeCount = scoringSections.filter(s => perSection[s.key].complete).length
  const score = scoringSections.length === 0
    ? 100
    : Math.round((completeCount / scoringSections.length) * 100)

  totalRequired = allMissing.length

  return { score, totalRequired, missing: allMissing, perSection }
}
