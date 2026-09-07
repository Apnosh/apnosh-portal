/**
 * The move that rides with a complaint theme (spec M-04: bad news never
 * arrives without what happens about it). Rule-based on the theme's words:
 * marketing can answer some complaints; others are honestly the owner's own shop.
 *
 * Every move is short sentences, in the owner's words. The five that are not marketing used to
 * read "This one is operational, not marketing. Worth a look at X; we reply to each one" — a word
 * an owner does not use, then two sentences spliced with a semicolon. They say what the thing is
 * about, then what to do, then what we do.
 */

export interface ThemeMove { move: string; operational: boolean }

const RULES: Array<{ test: RegExp; move: string; operational: boolean }> = [
  { test: /wait|slow|line|took forever|long time|waited/i, move: 'The next push goes to your quieter nights, and every wait review gets a reply with the reservation link.', operational: false },
  { test: /park/i, move: 'A parking note goes on your Google listing and your site so guests arrive knowing.', operational: false },
  { test: /pric|expensive|overpriced|value|cost|cheap/i, move: 'A value item or lunch offer leads the next campaign, so the price story changes.', operational: false },
  { test: /expired|stale|spoiled|rotten|moldy|out of date|freshness/i, move: 'This one is about the food, not the marketing. Check the shelves today. We reply to each review and watch it again next month.', operational: true },
  { test: /\btip|tipping|gratuity|checkout|register/i, move: 'This one is about your checkout, not the marketing. Take a look at it today. We reply to each review kindly.', operational: true },
  { test: /reserv|book|table|seat/i, move: 'The reservation link goes front and center on Google and the next posts.', operational: false },
  { test: /hours|closed|open late|open early/i, move: 'Hours get checked on Google today so nobody shows up to a locked door.', operational: false },
  { test: /rude|staff|attitude|unfriendly|ignored|service/i, move: 'This one is about your team, not the marketing. Take a look with them this week. We reply to each review kindly.', operational: true },
  { test: /cold|undercooked|bland|quality|portion|small|dry|salty|greasy/i, move: 'This one is about the kitchen, not the marketing. Take a look there today. We reply to each review and watch it again next month.', operational: true },
  { test: /dirty|clean|bathroom|restroom|smell/i, move: 'This one is about how clean the place is, not the marketing. Take a look today. We reply to each review and watch it again next month.', operational: true },
  { test: /loud|noise|noisy|music/i, move: 'This one is about how loud the room gets, not the marketing. Take a look today. We reply to each review and watch it again next month.', operational: true },
]

export function moveForTheme(theme: string): ThemeMove {
  for (const r of RULES) if (r.test.test(theme)) return { move: r.move, operational: r.operational }
  return { move: 'We reply to each one and watch whether it fades next month.', operational: false }
}

export function titleCase(s: string): string {
  return s.trim().replace(/^\w/, (c) => c.toUpperCase())
}
