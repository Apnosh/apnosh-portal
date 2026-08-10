/**
 * THE CREATIVE PRICE SHEET, TIERED — every dollar a creative order can charge, one table.
 *
 * Owner call (2026-08-09, persona-tested against the 20-owner sim): effort tiers, picked
 * by the owner, priced instantly. The persona guardrails are LAW here:
 *   - every promise is COUNTABLE (concepts, revisions, days, photo counts) — never vibes
 *   - picking a tier visibly changes the price (no theater)
 *   - Standard is the default; the tier choice is never a required decision
 *   - own-words scope (the Something-else hatch) prices at the tier base, never a guessed
 *     upcharge; anything bigger is agreed in the thread BEFORE work starts
 *   - open scope (new website, Something else) is a STARTS-AT floor with a 1-business-day
 *     answer clock, never silence
 *   - the graphic has its own engine (design-pricing.ts): this sheet returns null for it
 *
 * The `level` answer carries the tier for types with a Standard / The-works choice:
 * missing or unknown level = Standard. logo / website / social / menu price off their own
 * scope answers (those questions ARE the tier).
 */

import { splitMulti, type RequestAnswers } from './catalog'

/** THE SERVICE FEE (owner call 2026-08-10: fees stay). The sim's law: a fee that
 * appears late is a trust crack, so the fee is a VISIBLE LINE inside every total from
 * the first screen a total appears on. Listed total = charged total, always. */
export const SERVICE_FEE_RATE = 0.10
export const feeOn = (subtotalCents: number): number => Math.round(subtotalCents * SERVICE_FEE_RATE)

export interface CreativePriceLine {
  label: string
  amountCents: number
  /** the answer that created this line, said to the owner */
  why: string
}

export interface CreativePrice {
  lines: CreativePriceLine[]
  totalCents: number
  /** open scope: this total is the agreed FLOOR; the final number is agreed in the
   *  thread before work starts, answered within 1 business day */
  startsAt?: boolean
}

/** The two-level choice shown on review screens. Promises are countable. */
export interface CreativeLevel {
  value: 'Standard' | 'The works'
  promise: string
}

/* One entry per type that offers the choice; label copy is owner-facing. */
export const CREATIVE_LEVELS: Record<string, { standard: string; works: string }> = {
  video: {
    standard: 'Shot or cut as picked · 1 to 2 revisions · 3 to 5 days',
    works: 'Planned shoot with a shot list · pro edit with titles and motion · senior editor · 2 revisions · 7 days',
  },
  photos: {
    standard: 'One visit · edited photos land in your Photos and files · 5 days',
    works: 'Senior photographer · styled food with props · 40 photos plus social crops · in your library · 7 days',
  },
  menu: {
    standard: 'As picked below · 1 to 2 revisions',
    works: 'Senior designer · dine in, takeout, and QR versions all included · 3 concepts · 7 days',
  },
  email: {
    standard: 'One email, designed and written · 1 revision',
    works: 'A reusable template you keep, plus the email · 2 revisions',
  },
  ads: {
    standard: '1 concept in every needed size · 1 revision',
    works: '3 concepts to test · senior designer · 2 revisions',
  },
  print: {
    standard: 'One piece, print ready · 1 revision',
    works: 'Senior designer · 2 concepts · on-wall mockup preview · 2 revisions',
  },
  copy: {
    standard: 'One piece, drafted and revised once',
    works: 'Senior writer · 2 directions to pick from · 2 revisions',
  },
}

const $ = (dollars: number) => Math.round(dollars * 100)

const line = (label: string, dollars: number, why: string): CreativePriceLine => ({
  label,
  amountCents: $(dollars),
  why,
})

const works = (a: RequestAnswers): boolean => (a.level ?? '').trim() === 'The works'

/**
 * Price a creative order from the validated answers. Returns null for 'graphic'
 * (the design engine owns it) and unknown types.
 */
export function priceCreativeRequest(typeId: string, a: RequestAnswers): CreativePrice | null {
  const lines: CreativePriceLine[] = []
  let startsAt = false

  switch (typeId) {
    case 'graphic':
      return null

    case 'video': {
      if (works(a)) {
        lines.push(line('Signature video', 700, 'The works: planned shoot with a shot list, pro edit with titles and motion, senior editor.'))
      } else if (a.count === 'A monthly batch') {
        lines.push(line('Video batch, monthly', 1200, 'You picked a monthly batch: 8 short videos a month, about 30% off per video.'))
      } else if (a.count === '3 to 5') {
        lines.push(line('Short videos, 3 to 5', 800, 'You picked 3 to 5 videos, about 20% off per video.'))
      } else {
        lines.push(line('Short video', 250, 'One video, cut from clips and photos you send.'))
      }
      if (!works(a) && a.filming === 'Come film at my place') {
        lines.push(line('Filming visit', 150, 'We come film at your place.'))
      }
      break
    }

    case 'photos': {
      const areas = splitMulti(a.what)
      if (works(a)) {
        lines.push(line('Photo shoot, the works', 800, 'Senior photographer, styled food with props, 40 photos plus social crops. Every file lands in your Photos and files.'))
      } else if (areas.length > 1) {
        lines.push(line('Photo shoot, full house', 450, `Food, space, and team in one visit: ${areas.length} areas, 25 edited photos. Every file lands in your Photos and files.`))
      } else {
        lines.push(line('Photo shoot', 350, 'One visit, one focus, 15 edited photos. Every file lands in your Photos and files.'))
      }
      break
    }

    case 'social': {
      if (a.count === '8 a month') lines.push(line('Posts, 8 a month', 560, 'You picked 8 posts a month. This is a monthly price.'))
      else if (a.count === '12 or more') lines.push(line('Posts, 12 a month', 780, 'You picked 12 or more posts a month. This is a monthly price.'))
      else lines.push(line('Posts, 4 a month', 320, 'The starter batch: 4 posts a month. This is a monthly price.'))
      break
    }

    case 'menu': {
      if (works(a)) {
        lines.push(line('Menu design, the works', 750, 'Senior designer. Dine in, takeout, and QR versions all included, 3 concepts.'))
      } else {
        if (a.change === 'Brand new look') lines.push(line('Menu design, new look', 400, 'A brand new menu design, 2 concepts.'))
        else if (a.change === 'Both') lines.push(line('Menu design, new look and updates', 500, 'A new look plus your item and price updates.'))
        else lines.push(line('Menu update', 150, 'Price and item updates on your current menu.'))
        const menus = splitMulti(a.which)
        if (menus.length > 1) lines.push(line(`Extra menu versions x ${menus.length - 1}`, (menus.length - 1) * 40, `You picked ${menus.length} menus; the first is included.`))
      }
      break
    }

    case 'logo': {
      if (a.scope === 'Full brand kit') lines.push(line('Full brand kit', 900, 'Senior designer. Logo, colors, fonts, ready to use templates, 4 concepts.'))
      else if (a.scope === 'Refresh my logo') lines.push(line('Logo refresh', 300, 'Your logo, cleaned up and modernized. 1 concept plus 1 revision.'))
      else lines.push(line('New logo', 500, 'A brand new logo: 3 concepts, 2 revisions, files for print and web.'))
      break
    }

    case 'website': {
      if (a.scope === 'Brand new website') {
        lines.push(line('New website, starting point', 1500, 'The floor for a new build. The final number is agreed in your thread before work starts. We answer within 1 business day.'))
        startsAt = true
      } else if (a.scope === 'Redesign my website') {
        lines.push(line('Website redesign', 900, 'Your pages, redesigned end to end, 2 revisions.'))
      } else {
        lines.push(line('Website changes', 250, 'Up to 5 changes on your current site.'))
      }
      break
    }

    case 'email':
      if (works(a)) lines.push(line('Email, the works', 350, 'A reusable template you keep, plus the email, 2 revisions.'))
      else lines.push(line('Designed email', 200, 'One email: designed, written, ready to send, 1 revision.'))
      break

    case 'ads':
      if (works(a)) lines.push(line('Ad creative, the works', 600, '3 concepts to test, senior designer, 2 revisions.'))
      else lines.push(line('Ad creative set', 350, '1 concept in every needed size, 1 revision.'))
      break

    case 'print':
      if (works(a)) lines.push(line('Print design, the works', 300, 'Senior designer, 2 concepts, an on-wall mockup preview, 2 revisions.'))
      else lines.push(line('Print design', 150, 'One piece, designed to print ready, 1 revision. Printing itself is separate.'))
      break

    case 'copy':
      if (works(a)) lines.push(line('Writing, the works', 350, 'Senior writer, 2 directions to pick from, 2 revisions.'))
      else lines.push(line('Writing', 200, 'One piece of writing, drafted and revised once.'))
      break

    case 'other':
      lines.push(line('Open request, starting point', 150, 'The floor to start. Anything bigger is agreed in your thread before work starts. We answer within 1 business day.'))
      startsAt = true
      break

    default:
      return null
  }

  const subtotal = lines.reduce((n, l) => n + l.amountCents, 0)
  lines.push({
    label: 'Service fee',
    amountCents: feeOn(subtotal),
    why: '10% covers coordination, revision handling, and your team. It is inside every total you see, never added later.',
  })
  return { lines, totalCents: subtotal + feeOn(subtotal), ...(startsAt ? { startsAt: true } : {}) }
}

/** "$250" / "$1,200" for whole-dollar sheet prices. */
export const fmtCents = (cents: number): string => `$${Math.round(cents / 100).toLocaleString()}`

/** The valve, said the way Tony needs to hear it (persona guardrail). */
export const VALVE_LINE =
  'Most orders never adjust. If yours is unusually big we tell you first, and you can cancel free.'

/** Revision rule, stated up front on every review. */
export const REVISION_LINE = 'More revision rounds past the included count are $45 each, always said first.'
