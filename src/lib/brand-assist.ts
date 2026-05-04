/**
 * Brand assist — color theory + typography helpers used by the Site Builder
 * Brand section to suggest accents, derive complementary colors, warn about
 * poor contrast, and offer curated font pairings.
 *
 * No external deps — small, pure functions.
 */

// ----------------------------------------------------------------------------
// Color parsing + conversion
// ----------------------------------------------------------------------------

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

export function hexToRgb(hex: string): RGB | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return null
  const v = m[1].length === 3
    ? m[1].split('').map(c => c + c).join('')
    : m[1]
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
      case gn: h = ((bn - rn) / d + 2); break
      case bn: h = ((rn - gn) / d + 4); break
    }
    h = h * 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let rp = 0, gp = 0, bp = 0
  if (h < 60)       [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else              [rp, gp, bp] = [c, 0, x]
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 }
}

// ----------------------------------------------------------------------------
// Color manipulation
// ----------------------------------------------------------------------------

/** Shift hue by `degrees` and clamp lightness for visual balance. */
export function rotateHue(hex: string, degrees: number, lightnessAdjust = 0): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)
  hsl.h = (hsl.h + degrees + 360) % 360
  hsl.l = Math.max(15, Math.min(85, hsl.l + lightnessAdjust))
  return rgbToHex(hslToRgb(hsl))
}

/** Lighten or darken (positive = lighter). */
export function adjustLightness(hex: string, deltaPct: number): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)
  hsl.l = Math.max(0, Math.min(100, hsl.l + deltaPct))
  return rgbToHex(hslToRgb(hsl))
}

// ----------------------------------------------------------------------------
// Contrast (WCAG)
// ----------------------------------------------------------------------------

function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA), b = hexToRgb(hexB)
  if (!a || !b) return null
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export interface ContrastVerdict {
  ratio: number
  rating: 'AAA' | 'AA' | 'AA-large' | 'FAIL'
  passLargeText: boolean
  passNormalText: boolean
}

export function evaluateContrast(fg: string, bg: string): ContrastVerdict | null {
  const ratio = contrastRatio(fg, bg)
  if (ratio == null) return null
  let rating: ContrastVerdict['rating'] = 'FAIL'
  if (ratio >= 7) rating = 'AAA'
  else if (ratio >= 4.5) rating = 'AA'
  else if (ratio >= 3) rating = 'AA-large'
  return {
    ratio: Math.round(ratio * 10) / 10,
    rating,
    passNormalText: ratio >= 4.5,
    passLargeText: ratio >= 3,
  }
}

// ----------------------------------------------------------------------------
// Suggested companion colors
// ----------------------------------------------------------------------------

export interface BrandSuggestions {
  /** Slightly desaturated darker companion — great for secondary surfaces. */
  secondary: string
  /** Light tint of the primary — backgrounds, highlights. */
  tint: string
  /** A complementary accent (180° hue rotation, lightness-balanced). */
  accent: string
  /** A safe text-on-primary color (white or near-black depending on contrast). */
  textOnPrimary: string
}

export function suggestBrandColors(primary: string): BrandSuggestions | null {
  const rgb = hexToRgb(primary)
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)

  const secondary = rgbToHex(hslToRgb({
    h: hsl.h,
    s: Math.max(0, hsl.s - 25),
    l: Math.max(8, hsl.l - 30),
  }))

  const tint = rgbToHex(hslToRgb({
    h: hsl.h,
    s: Math.max(20, hsl.s - 10),
    l: Math.min(95, hsl.l + 40),
  }))

  const accent = rotateHue(primary, 180, hsl.l > 50 ? -10 : 10) ?? primary

  const whiteContrast = contrastRatio(primary, '#FFFFFF') ?? 0
  const textOnPrimary = whiteContrast >= 4.5 ? '#FFFFFF' : '#0B0B0B'

  return { secondary, tint, accent, textOnPrimary }
}

// ----------------------------------------------------------------------------
// Font pairings
// ----------------------------------------------------------------------------

export interface FontPairing {
  display: string
  body: string
  mood: string
  description: string
}

export const FONT_PAIRINGS: FontPairing[] = [
  { display: 'Anton',         body: 'DM Sans',      mood: 'Bold, restaurant-grade',  description: 'Condensed display + clean body. Excellent for KBBQ, BBQ, gastro.' },
  { display: 'Bebas Neue',    body: 'Inter',        mood: 'Editorial, sharp',        description: 'Magazine-style. Works across food, retail, fitness.' },
  { display: 'Playfair Display', body: 'Inter',     mood: 'Elegant, fine-dining',    description: 'Serif headlines for upscale + classic.' },
  { display: 'Archivo Black', body: 'Archivo',      mood: 'Modern, design-forward',  description: 'Tight + technical. Coffee shops, modern Asian, retail.' },
  { display: 'Fraunces',      body: 'Inter',        mood: 'Warm, hand-crafted',      description: 'Quirky serif. Bakeries, cafes, artisan brands.' },
  { display: 'Space Grotesk', body: 'Space Grotesk', mood: 'Tech-friendly',          description: 'Geometric sans. Modern bars, breweries, fast-casual.' },
  { display: 'Cormorant Garamond', body: 'Lato',    mood: 'Classic luxury',          description: 'High-contrast serif. Steakhouses, fine dining, hotels.' },
  { display: 'Oswald',        body: 'Open Sans',    mood: 'Athletic, energetic',     description: 'Muscular sans. Sports bars, fitness, late-night.' },
]
