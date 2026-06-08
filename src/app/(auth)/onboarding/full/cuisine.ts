// Shared cuisine matching used by the business and location autofill. Keeps
// the synonym map in one place so both the website scan and the place search
// resolve a free-form cuisine string to the same CUISINES chip.
import { CUISINES } from './data'

// Common ways a website describes its food, mapped to a CUISINES chip. Keys
// are matched as substrings against the AI's free-form cuisine string.
export const CUISINE_SYNONYMS: Record<string, string> = {
  taco: 'Mexican', taqueria: 'Mexican', burrito: 'Mexican', tex: 'Mexican',
  sushi: 'Japanese', ramen: 'Japanese', izakaya: 'Japanese',
  pizza: 'Italian', pasta: 'Italian', trattoria: 'Italian',
  burger: 'American', diner: 'American', grill: 'American', steakhouse: 'American',
  bbq: 'BBQ / Smokehouse', barbecue: 'BBQ / Smokehouse', smokehouse: 'BBQ / Smokehouse',
  pho: 'Vietnamese', banh: 'Vietnamese',
  'dim sum': 'Chinese', szechuan: 'Chinese', sichuan: 'Chinese',
  curry: 'Indian', tandoori: 'Indian',
  greek: 'Mediterranean', falafel: 'Mediterranean', kebab: 'Middle Eastern',
  bakery: 'Bakery / Desserts', pastry: 'Bakery / Desserts', dessert: 'Bakery / Desserts',
  cafe: 'American', coffee: 'American',
  vegan: 'Vegan / Vegetarian', vegetarian: 'Vegan / Vegetarian',
  seafood: 'Seafood', oyster: 'Seafood',
  soul: 'Soul / Southern', southern: 'Soul / Southern', cajun: 'Soul / Southern',
}

/** Resolve a free-form cuisine string to a CUISINES chip, or Other + the raw text. */
export function matchCuisine(raw: string): { cuisine: string; other: string } {
  const v = raw.trim()
  if (!v) return { cuisine: '', other: '' }
  const lower = v.toLowerCase()
  const exact = CUISINES.find((c) => c.toLowerCase() === lower)
  if (exact) return { cuisine: exact, other: '' }
  const partial = CUISINES.find(
    (c) => c !== 'Other' && (lower.includes(c.toLowerCase()) || c.toLowerCase().includes(lower)),
  )
  if (partial) return { cuisine: partial, other: '' }
  for (const [needle, target] of Object.entries(CUISINE_SYNONYMS)) {
    if (lower.includes(needle)) return { cuisine: target, other: '' }
  }
  return { cuisine: 'Other', other: v }
}
