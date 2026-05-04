/**
 * Curated design presets — each is a complete look (palette, typography,
 * design system tokens) tuned by hand to feel cohesive. Applying a preset
 * is one-click full-system reskin.
 *
 * These exist as the default starting point AND the catalogue Claude
 * adapts when generating a custom design from a prompt.
 */

import type { Brand, DesignSystem } from './site-schemas/shared'

export interface DesignPreset {
  id: string
  name: string
  mood: string
  description: string
  /** Sample colors used in the preset card */
  swatches: { primary: string; secondary: string; accent: string }
  /** Apply this preset to the brand object */
  apply: (current: Brand) => Brand
}

/** Convenience — produce a full Brand from individual fields. */
function preset(opts: {
  primary: string
  secondary: string
  accent: string
  fontDisplay: string
  fontBody: string
  ds: DesignSystem
}): (cur: Brand) => Brand {
  return (cur) => ({
    ...cur,
    primaryColor: opts.primary,
    secondaryColor: opts.secondary,
    accentColor: opts.accent,
    fontDisplay: opts.fontDisplay,
    fontBody: opts.fontBody,
    designSystem: opts.ds,
  })
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'bold-restaurant',
    name: 'Bold',
    mood: 'KBBQ · Steakhouse · Loud Group Dinner',
    description: 'Dark hero, red accents, condensed display type. Best for high-energy restaurants where the food is the show.',
    swatches: { primary: '#0B0B0B', secondary: '#CC0A0A', accent: '#F5EFE6' },
    apply: preset({
      primary: '#0B0B0B', secondary: '#CC0A0A', accent: '#F5EFE6',
      fontDisplay: 'Anton', fontBody: 'DM Sans',
      ds: { radius: 'subtle', density: 'balanced', motion: 'subtle', photoTreatment: 'natural', surface: 'cream', typeWeight: 'black' },
    }),
  },
  {
    id: 'editorial-elegant',
    name: 'Editorial',
    mood: 'Fine Dining · Hotel · Magazine',
    description: 'Serif display, generous whitespace, sharp lines. Reads like a New Yorker spread.',
    swatches: { primary: '#1A1A1A', secondary: '#8B6F47', accent: '#FAF6EF' },
    apply: preset({
      primary: '#1A1A1A', secondary: '#8B6F47', accent: '#FAF6EF',
      fontDisplay: 'Playfair Display', fontBody: 'Inter',
      ds: { radius: 'sharp', density: 'airy', motion: 'subtle', photoTreatment: 'natural', surface: 'cream', typeWeight: 'regular' },
    }),
  },
  {
    id: 'warm-artisan',
    name: 'Warm Artisan',
    mood: 'Bakery · Cafe · Farm-to-Table',
    description: 'Hand-feel serif, cream backgrounds, soft corners, organic warmth. For places that smell like flour.',
    swatches: { primary: '#3D2817', secondary: '#C97B5C', accent: '#FFF5E1' },
    apply: preset({
      primary: '#3D2817', secondary: '#C97B5C', accent: '#FFF5E1',
      fontDisplay: 'Fraunces', fontBody: 'Inter',
      ds: { radius: 'soft', density: 'balanced', motion: 'subtle', photoTreatment: 'natural', surface: 'cream', typeWeight: 'medium' },
    }),
  },
  {
    id: 'minimal-modern',
    name: 'Minimal Modern',
    mood: 'Specialty Coffee · Boutique · Modern Asian',
    description: 'Tight typography, light surfaces, almost no chrome. Lets the photography lead.',
    swatches: { primary: '#0F0F0F', secondary: '#666666', accent: '#FFFFFF' },
    apply: preset({
      primary: '#0F0F0F', secondary: '#666666', accent: '#FFFFFF',
      fontDisplay: 'Archivo Black', fontBody: 'Archivo',
      ds: { radius: 'subtle', density: 'airy', motion: 'subtle', photoTreatment: 'natural', surface: 'light', typeWeight: 'black' },
    }),
  },
  {
    id: 'luxe-night',
    name: 'Luxe Night',
    mood: 'Cocktail Bar · Omakase · Speakeasy',
    description: 'Dark surface, muted gold, classic serif. After-hours sophistication.',
    swatches: { primary: '#0A0A12', secondary: '#C9A96E', accent: '#1A1A22' },
    apply: preset({
      primary: '#0A0A12', secondary: '#C9A96E', accent: '#1A1A22',
      fontDisplay: 'Cormorant Garamond', fontBody: 'Lato',
      ds: { radius: 'sharp', density: 'balanced', motion: 'subtle', photoTreatment: 'duotone', surface: 'dark', typeWeight: 'regular' },
    }),
  },
  {
    id: 'playful-pop',
    name: 'Playful Pop',
    mood: 'Boba · Ice Cream · Casual Asian · Burger Joint',
    description: 'Bright primary, rounded-up everything, lively motion. Built for crave-and-share.',
    swatches: { primary: '#FF5A8E', secondary: '#3B2A8C', accent: '#FFF1F5' },
    apply: preset({
      primary: '#FF5A8E', secondary: '#3B2A8C', accent: '#FFF1F5',
      fontDisplay: 'Archivo Black', fontBody: 'DM Sans',
      ds: { radius: 'pillowy', density: 'balanced', motion: 'lively', photoTreatment: 'natural', surface: 'light', typeWeight: 'black' },
    }),
  },
  {
    id: 'tech-modern',
    name: 'Tech Modern',
    mood: 'Brewery · Modern Tap House · Fast-Casual',
    description: 'Geometric sans, monochrome with one strong accent. Looks like a thoughtful product page.',
    swatches: { primary: '#0D1B2A', secondary: '#FF6B35', accent: '#FFFFFF' },
    apply: preset({
      primary: '#0D1B2A', secondary: '#FF6B35', accent: '#FFFFFF',
      fontDisplay: 'Space Grotesk', fontBody: 'Space Grotesk',
      ds: { radius: 'subtle', density: 'balanced', motion: 'subtle', photoTreatment: 'natural', surface: 'light', typeWeight: 'medium' },
    }),
  },
  {
    id: 'energetic-athletic',
    name: 'Energetic Athletic',
    mood: 'Sports Bar · Fitness · Late-Night',
    description: 'Bold sans, high contrast, motion-forward. For places with TVs and a crowd.',
    swatches: { primary: '#0A0A0A', secondary: '#FFD700', accent: '#FFFFFF' },
    apply: preset({
      primary: '#0A0A0A', secondary: '#FFD700', accent: '#FFFFFF',
      fontDisplay: 'Oswald', fontBody: 'Open Sans',
      ds: { radius: 'subtle', density: 'dense', motion: 'lively', photoTreatment: 'natural', surface: 'dark', typeWeight: 'bold' },
    }),
  },
]

/** Look up a preset by ID. */
export function findPreset(id: string): DesignPreset | undefined {
  return DESIGN_PRESETS.find(p => p.id === id)
}
