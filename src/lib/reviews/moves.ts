/**
 * The move that rides with a complaint theme (spec M-04: bad news never
 * arrives without what happens about it). Rule-based on the theme's words:
 * marketing can answer some complaints; others are honestly operational.
 */

export interface ThemeMove { move: string; operational: boolean }

const RULES: Array<{ test: RegExp; move: string; operational: boolean }> = [
  { test: /wait|slow|line|took forever|long time|waited/i, move: 'The next push goes to your quieter nights, and every wait review gets a reply with the reservation link.', operational: false },
  { test: /park/i, move: 'A parking note goes on your Google listing and your site so guests arrive knowing.', operational: false },
  { test: /pric|expensive|overpriced|value|cost|cheap/i, move: 'A value item or lunch offer leads the next campaign, so the price story changes.', operational: false },
  { test: /expired|stale|spoiled|rotten|moldy|out of date|freshness/i, move: 'This one is operational, not marketing. Worth a check of the shelves today; we reply to each one and watch it next month.', operational: true },
  { test: /\btip|tipping|gratuity|checkout|register/i, move: 'This one is operational, not marketing. Worth a look at the checkout flow; we reply to each one kindly.', operational: true },
  { test: /reserv|book|table|seat/i, move: 'The reservation link goes front and center on Google and the next posts.', operational: false },
  { test: /hours|closed|open late|open early/i, move: 'Hours get checked on Google today so nobody shows up to a locked door.', operational: false },
  { test: /rude|staff|attitude|unfriendly|ignored|service/i, move: 'This one is operational, not marketing. Worth a look with the team this week; we reply to each one kindly.', operational: true },
  { test: /cold|undercooked|bland|quality|portion|small|dry|salty|greasy/i, move: 'This one is operational, not marketing. Worth a look in the kitchen; we reply to each one and watch it next month.', operational: true },
  { test: /dirty|clean|bathroom|restroom|smell/i, move: 'This one is operational, not marketing. Worth a look today; we reply to each one and watch it next month.', operational: true },
  { test: /loud|noise|noisy|music/i, move: 'This one is operational, not marketing. Worth a look at the room; we reply to each one and watch it next month.', operational: true },
]

export function moveForTheme(theme: string): ThemeMove {
  for (const r of RULES) if (r.test.test(theme)) return { move: r.move, operational: r.operational }
  return { move: 'We reply to each one and watch whether it fades next month.', operational: false }
}

export function titleCase(s: string): string {
  return s.trim().replace(/^\w/, (c) => c.toUpperCase())
}
