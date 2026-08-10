/**
 * THE CREATIVE PRICE SHEET — every dollar a creative order can charge, in one table.
 *
 * Owner call (2026-08-09): pricing is INCLUDED at order time, no quote round trip.
 * The same ledger laws as the design rate card apply:
 *   - every line cites the answer that created it (no un-explained money)
 *   - scope answers the sheet does not recognize (the Something-else escape hatch)
 *     price at the BASE, never a guessed upcharge; anything bigger is agreed in the
 *     request thread BEFORE work starts, out loud
 *   - the graphic has its own engine (design-pricing.ts); this sheet returns null
 *     for it so there can never be two prices for one thing
 *
 * NUMBERS ARE FIRST-PASS, sized against the design rate card scale. Each is one
 * line to change; tell the owner the table and edit on their word.
 */

import { splitMulti, type RequestAnswers } from './catalog'

export interface CreativePriceLine {
  label: string
  amountCents: number
  /** the answer that created this line, said to the owner */
  why: string
}

export interface CreativePrice {
  lines: CreativePriceLine[]
  totalCents: number
}

const $ = (dollars: number) => Math.round(dollars * 100)

/** One line, one price. */
const line = (label: string, dollars: number, why: string): CreativePriceLine => ({
  label,
  amountCents: $(dollars),
  why,
})

/**
 * Price a creative order from the validated answers. Returns null for 'graphic'
 * (the design engine owns it) and unknown types. Own-words answers price at base.
 */
export function priceCreativeRequest(typeId: string, a: RequestAnswers): CreativePrice | null {
  const lines: CreativePriceLine[] = []

  switch (typeId) {
    case 'graphic':
      return null

    case 'video': {
      if (a.count === 'A monthly batch') lines.push(line('Video batch, monthly', 1200, 'You picked a monthly batch: 8 short videos a month.'))
      else if (a.count === '3 to 5') lines.push(line('Short videos, 3 to 5', 800, 'You picked 3 to 5 videos.'))
      else lines.push(line('Short video', 250, 'One video, shot and cut.'))
      if (a.filming === 'Come film at my place') lines.push(line('Filming visit', 150, 'We come film at your place.'))
      break
    }

    case 'photos': {
      lines.push(line('Photo shoot', 350, 'One visit: shot, edited, delivered.'))
      const areas = splitMulti(a.what)
      if (areas.length > 1) lines.push(line(`Extra coverage x ${areas.length - 1}`, (areas.length - 1) * 50, `You picked ${areas.length} things to shoot; the first is included.`))
      break
    }

    case 'social': {
      if (a.count === '8 a month') lines.push(line('Posts, 8 a month', 560, 'You picked 8 posts a month.'))
      else if (a.count === '12 or more') lines.push(line('Posts, 12 a month', 780, 'You picked 12 or more posts a month.'))
      else lines.push(line('Posts, 4 a month', 320, 'The starter batch: 4 posts a month.'))
      break
    }

    case 'menu': {
      if (a.change === 'Brand new look') lines.push(line('Menu design, new look', 400, 'A brand new menu design.'))
      else if (a.change === 'Both') lines.push(line('Menu design, new look and updates', 500, 'A new look plus your item and price updates.'))
      else lines.push(line('Menu update', 150, 'Price and item updates on your current menu.'))
      const menus = splitMulti(a.which)
      if (menus.length > 1) lines.push(line(`Extra menu versions x ${menus.length - 1}`, (menus.length - 1) * 40, `You picked ${menus.length} menus; the first is included.`))
      break
    }

    case 'logo': {
      if (a.scope === 'Full brand kit') lines.push(line('Full brand kit', 900, 'Logo, colors, fonts, and the files for everything.'))
      else if (a.scope === 'Refresh my logo') lines.push(line('Logo refresh', 300, 'Your logo, cleaned up and modernized.'))
      else lines.push(line('New logo', 500, 'A brand new logo, built for your place.'))
      break
    }

    case 'website': {
      if (a.scope === 'Brand new website') lines.push(line('New website', 1500, 'A brand new website, built and launched.'))
      else if (a.scope === 'Redesign my website') lines.push(line('Website redesign', 900, 'Your site, redesigned end to end.'))
      else lines.push(line('Website changes', 250, 'The starting point for small changes; anything bigger is agreed in the thread first.'))
      break
    }

    case 'email':
      lines.push(line('Designed email', 200, 'One email: designed, written, ready to send.'))
      break

    case 'ads':
      lines.push(line('Ad creative set', 350, 'The images and words for one campaign, sized per platform.'))
      break

    case 'print':
      lines.push(line('Print design', 150, 'One piece, designed to print ready. Printing itself is separate.'))
      break

    case 'copy':
      lines.push(line('Writing', 200, 'One piece of writing, drafted and revised with you.'))
      break

    case 'other':
      lines.push(line('Open request, starting point', 150, 'The minimum to start. Anything bigger is agreed in the thread before work starts.'))
      break

    default:
      return null
  }

  return { lines, totalCents: lines.reduce((n, l) => n + l.amountCents, 0) }
}

/** "$250" / "$1,200" for whole-dollar sheet prices. */
export const fmtCents = (cents: number): string => `$${Math.round(cents / 100).toLocaleString()}`
