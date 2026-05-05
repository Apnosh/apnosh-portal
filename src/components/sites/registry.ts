/**
 * Restaurant template registry. Add a new template here once and the
 * preview route + Site Builder pick it up automatically.
 */

import type { ComponentType } from 'react'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import RestaurantBold from './restaurant-bold'
import RestaurantEditorial from './restaurant-editorial'
import RestaurantCinematic from './restaurant-cinematic'
import RestaurantComposed from './restaurant-composed'
import { HERO_VARIANT_DESCRIPTIONS } from './sections/hero'
import { ABOUT_VARIANT_DESCRIPTIONS } from './sections/about'
import { LOCATIONS_VARIANT_DESCRIPTIONS } from './sections/locations'
import { AYCE_VARIANT_DESCRIPTIONS } from './sections/ayce'

export interface TemplateDef {
  id: string
  name: string
  mood: string
  description: string
  /** When to recommend this template (used in Re-create variant prompts). */
  bestFor: string
  Component: ComponentType<{ site: RestaurantSite }>
}

export const RESTAURANT_TEMPLATES: TemplateDef[] = [
  {
    id: 'restaurant-bold',
    name: 'Bold',
    mood: 'High-energy KBBQ / steakhouse / loud group',
    description: 'Dark hero with red glow, AYCE cards, two-up locations, stat band. Heavy display type.',
    bestFor: 'Restaurants where the food is the show. Group dinners, KBBQ, BBQ joints, high-volume modern Asian.',
    Component: RestaurantBold,
  },
  {
    id: 'restaurant-editorial',
    name: 'Editorial',
    mood: 'Magazine / fine dining / hotel restaurant',
    description: 'Oversized italic serif, full-bleed photography, asymmetric two-column long-form prose with drop caps, hairline rules. Reads like a New Yorker dining piece.',
    bestFor: 'Fine dining, occasion restaurants, hotel restaurants, chef-driven concepts that want gravitas without being stuffy.',
    Component: RestaurantEditorial,
  },
  {
    id: 'restaurant-cinematic',
    name: 'Cinematic',
    mood: 'Dark luxe / cocktail bar / omakase / occasion-night',
    description: 'Full-screen hero with overlay text, dark surfaces with gold accents, full-bleed image breakers between sections, centered narrative composition.',
    bestFor: 'Cocktail bars, omakase counters, speakeasies, steakhouses, high-end concepts with a sense of theater.',
    Component: RestaurantCinematic,
  },
  {
    id: 'restaurant-composed',
    name: 'Composed (Premium)',
    mood: 'Fully customizable — section-by-section variant composition',
    description: 'No fixed layout. Picks a different variant per section (hero/about/locations/AYCE) for a unique site every time. Premium tier — Claude or AM composes the layout, supports per-section CSS overrides for the bespoke tier.',
    bestFor: 'Premium-tier clients who want a site that doesn\'t look like a template at all.',
    Component: RestaurantComposed,
  },
]

export function getTemplate(id: string | undefined | null): TemplateDef {
  return RESTAURANT_TEMPLATES.find(t => t.id === id) ?? RESTAURANT_TEMPLATES[0]
}

/** Compact summary block for injecting into Claude prompts. */
export function templateMenuPromptBlock(): string {
  const lines = [
    '## Available templates (pick one per variant via identity.templateId)',
    '',
  ]
  for (const t of RESTAURANT_TEMPLATES) {
    lines.push(`- **${t.id}** ("${t.name}") — ${t.mood}`)
    lines.push(`  Best for: ${t.bestFor}`)
  }
  lines.push('')
  lines.push('Each variant should pick a DIFFERENT templateId to maximize visual variety.')
  return lines.join('\n')
}

/** Section-variant catalogue for the "Composed" template (premium tier). */
export function composedLayoutPromptBlock(): string {
  const formatGroup = (title: string, descriptions: Record<string, string>) => {
    const lines = [`### ${title}`]
    for (const [id, desc] of Object.entries(descriptions)) {
      lines.push(`- **${id}** — ${desc}`)
    }
    return lines.join('\n')
  }
  return [
    '## Section variants (used when identity.templateId === "restaurant-composed")',
    '',
    'When using the Composed template, set `layout` on the site config to pick a variant per section. This produces a unique layout every time — variants below.',
    '',
    'Schema:',
    '`layout: { hero: <heroId>, about: <aboutId>, locations: <locationsId>, ayce: <ayceId> }`',
    '',
    formatGroup('Hero', HERO_VARIANT_DESCRIPTIONS),
    '',
    formatGroup('About', ABOUT_VARIANT_DESCRIPTIONS),
    '',
    formatGroup('Locations', LOCATIONS_VARIANT_DESCRIPTIONS),
    '',
    formatGroup('AYCE / Offerings', AYCE_VARIANT_DESCRIPTIONS),
    '',
    'Mix variants thoughtfully — e.g. magazine hero + two-col-dropcap about + list-typographic locations + table ayce reads like an editorial spread; fullbleed hero + manifesto about + full-bleed-each locations + cinematic ayce reads like a luxe occasion-night brand.',
  ].join('\n')
}
