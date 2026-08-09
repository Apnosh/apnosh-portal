/**
 * THE DESTINATION LOOKUP TABLE — single source of truth for where a design can go
 * (docs/DESIGN-ORDERING spec, Phase A).
 *
 * The client speaks destination language ("Instagram post", "printed flyer"); everything a
 * production spec needs — dimensions, bleed, color mode, resolution, safe zones, buffer days —
 * derives from this table and is NEVER asked. One table, shared with campaign briefs, so the
 * designer's spec and the client's checkbox can never drift apart.
 *
 * Pure data. Amounts live in rate-card.ts, never here.
 */

export type DestinationId =
  | 'instagram-post'
  | 'instagram-story'
  | 'facebook-post'
  | 'printed-flyer'
  | 'menu-board'
  | 'google-listing'
  | 'table-tent'
  | 'poster'
  | 'banner'
  | 'email-header'
  | 'gift-card'

export interface DestinationSpec {
  id: DestinationId
  /** what the client sees on the checkbox */
  label: string
  kind: 'digital' | 'print'
  /** px for digital, inches for print */
  dimensions: { w: number; h: number; unit: 'px' | 'in' }
  colorMode: 'RGB' | 'CMYK'
  /** ppi for print; digital exports at native px */
  resolution: number
  /** print only, inches per edge */
  bleed?: number
  /** keep-clear margins, same unit as dimensions */
  safeZone?: { top: number; bottom: number; left: number; right: number }
  /** production days this destination adds beyond design time (printing, shipping, platform review) */
  bufferDays: number
}

export const DESTINATIONS: readonly DestinationSpec[] = [
  {
    id: 'instagram-post', label: 'Instagram post', kind: 'digital',
    dimensions: { w: 1080, h: 1350, unit: 'px' }, colorMode: 'RGB', resolution: 72,
    safeZone: { top: 60, bottom: 60, left: 60, right: 60 }, bufferDays: 0,
  },
  {
    id: 'instagram-story', label: 'Instagram Story', kind: 'digital',
    dimensions: { w: 1080, h: 1920, unit: 'px' }, colorMode: 'RGB', resolution: 72,
    /* the platform chrome eats the top and bottom of a story */
    safeZone: { top: 250, bottom: 250, left: 60, right: 60 }, bufferDays: 0,
  },
  {
    id: 'facebook-post', label: 'Facebook post', kind: 'digital',
    dimensions: { w: 1200, h: 630, unit: 'px' }, colorMode: 'RGB', resolution: 72,
    safeZone: { top: 40, bottom: 40, left: 40, right: 40 }, bufferDays: 0,
  },
  {
    id: 'google-listing', label: 'Google listing', kind: 'digital',
    dimensions: { w: 1200, h: 900, unit: 'px' }, colorMode: 'RGB', resolution: 72,
    safeZone: { top: 40, bottom: 40, left: 40, right: 40 }, bufferDays: 1, // Google review lag
  },
  {
    id: 'printed-flyer', label: 'Printed flyer', kind: 'print',
    dimensions: { w: 8.5, h: 11, unit: 'in' }, colorMode: 'CMYK', resolution: 300,
    bleed: 0.125, safeZone: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 }, bufferDays: 3,
  },
  {
    id: 'menu-board', label: 'Menu board', kind: 'print',
    dimensions: { w: 11, h: 17, unit: 'in' }, colorMode: 'CMYK', resolution: 300,
    bleed: 0.125, safeZone: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }, bufferDays: 3,
  },
  {
    id: 'table-tent', label: 'Table tent', kind: 'print',
    dimensions: { w: 4, h: 6, unit: 'in' }, colorMode: 'CMYK', resolution: 300,
    bleed: 0.125, safeZone: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 }, bufferDays: 3,
  },
  {
    id: 'poster', label: 'Poster', kind: 'print',
    dimensions: { w: 18, h: 24, unit: 'in' }, colorMode: 'CMYK', resolution: 300,
    bleed: 0.25, safeZone: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 }, bufferDays: 4,
  },
  {
    /* Large format, read from across a street: lower ppi at full size is the standard. */
    id: 'banner', label: 'Banner', kind: 'print',
    dimensions: { w: 72, h: 24, unit: 'in' }, colorMode: 'CMYK', resolution: 150,
    bleed: 0.25, safeZone: { top: 2, bottom: 2, left: 3, right: 3 }, bufferDays: 5,
  },
  {
    /* One graphic sized for email width; the send itself is the email rail's job, not design's. */
    id: 'email-header', label: 'Email graphic', kind: 'digital',
    dimensions: { w: 1200, h: 600, unit: 'px' }, colorMode: 'RGB', resolution: 72,
    safeZone: { top: 40, bottom: 40, left: 40, right: 40 }, bufferDays: 0,
  },
  {
    /* Standard CR80 card stock, same as a credit card. Card printing runs slower than paper. */
    id: 'gift-card', label: 'Gift card', kind: 'print',
    dimensions: { w: 3.375, h: 2.125, unit: 'in' }, colorMode: 'CMYK', resolution: 300,
    bleed: 0.125, safeZone: { top: 0.1875, bottom: 0.1875, left: 0.1875, right: 0.1875 }, bufferDays: 7,
  },
]

export const destinationById = (id: string): DestinationSpec | undefined =>
  DESTINATIONS.find((d) => d.id === id)

export const isPrint = (id: string): boolean => destinationById(id)?.kind === 'print'

/* PRINT RUNS ARE OFF (owner call, 2026-08-09): we DESIGN print pieces (flyer, table
 * tent, menu board, poster, banner, gift card) and hand over the print ready file, but
 * we cannot run the print job itself. While this flag is false the flow skips the
 * copy-count and who-prints questions and says so plainly. One flag to flip when
 * printing returns; specs, adders, and buffers all stay ready. */
export const PRINT_AVAILABLE = false

export const PRINT_OFF_MESSAGE =
  'We design it and hand you the print ready file. We cannot print or deliver copies yet, so printing is with you or your print shop.'
