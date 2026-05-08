/**
 * Marketing-relevant calendar for restaurants.
 *
 * Static list of US holidays + food-industry moments owners typically
 * post around. Each entry has a date function so we recompute for the
 * current year automatically — no annual maintenance.
 *
 * Strictly content opportunities. This is NOT an operations calendar
 * (no "expect 30% busier") and NOT a weather forecast.
 */

export interface MarketingMoment {
  /** ISO date string YYYY-MM-DD */
  date: string
  /** Short label, e.g. "Mother's Day" */
  label: string
  /** One-sentence framing for content prompts */
  hook: string
  /** Approximate restaurant-marketing relevance, 1 (niche) → 5 (must-post) */
  weight: number
}

// Helpers for "Nth weekday of month" rules
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  // weekday: 0=Sun, 1=Mon, ..., 6=Sat. n: 1-5 (1st, 2nd, ...). Negative n = Nth from end.
  if (n > 0) {
    const first = new Date(year, month - 1, 1)
    const offset = (weekday - first.getDay() + 7) % 7
    return new Date(year, month - 1, 1 + offset + (n - 1) * 7)
  }
  const last = new Date(year, month, 0)
  const offset = (last.getDay() - weekday + 7) % 7
  return new Date(year, month - 1, last.getDate() - offset - (Math.abs(n) - 1) * 7)
}

function fixed(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function dynamic(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10)
}

/**
 * Build the calendar for the rolling year starting from `from`.
 * Returns events between `from` and `from + windowDays` (default 60d),
 * sorted ascending by date.
 */
export function getMarketingCalendar(from: Date = new Date(), windowDays = 60): MarketingMoment[] {
  const year = from.getFullYear()
  const horizon = new Date(from.getTime() + windowDays * 86400000)

  const events: MarketingMoment[] = []
  for (const y of [year, year + 1]) {
    events.push(
      // ── Major holidays
      { date: dynamic(nthWeekdayOfMonth(y, 5, 0, 2)), label: "Mother's Day", hook: 'Brunch + flowers + family — natural moment for a special menu post.', weight: 5 },
      { date: dynamic(nthWeekdayOfMonth(y, 5, 1, -1)), label: 'Memorial Day', hook: 'Long-weekend kickoff, patio season opens.', weight: 4 },
      { date: dynamic(nthWeekdayOfMonth(y, 6, 0, 3)), label: "Father's Day", hook: 'Steak / BBQ / brunch posts perform well.', weight: 5 },
      { date: fixed(y, 7, 4), label: 'Independence Day', hook: 'Patriotic specials, BBQ, summer cocktails.', weight: 4 },
      { date: dynamic(nthWeekdayOfMonth(y, 9, 1, 1)), label: 'Labor Day', hook: 'Last big summer weekend before fall menus.', weight: 4 },
      { date: fixed(y, 10, 31), label: 'Halloween', hook: 'Themed cocktails, dessert specials, costume nights.', weight: 4 },
      { date: dynamic(nthWeekdayOfMonth(y, 11, 4, 4)), label: 'Thanksgiving', hook: 'Family menu, prix fixe, takeout pies.', weight: 5 },
      { date: fixed(y, 12, 24), label: 'Christmas Eve', hook: 'Holiday menu, family dinners, gift cards.', weight: 4 },
      { date: fixed(y, 12, 25), label: 'Christmas', hook: 'Christmas day service or holiday wishes post.', weight: 3 },
      { date: fixed(y, 12, 31), label: "New Year's Eve", hook: 'NYE menu, prix fixe, cocktails, midnight count.', weight: 5 },
      { date: fixed(y, 1, 1), label: "New Year's Day", hook: 'Hangover brunch, fresh-start menus.', weight: 3 },
      { date: fixed(y, 2, 14), label: "Valentine's Day", hook: 'Date-night menu — biggest reservation night of the year for many places.', weight: 5 },
      { date: fixed(y, 3, 17), label: "St. Patrick's Day", hook: 'Irish specials, green drinks, brunch.', weight: 4 },
      { date: fixed(y, 4, 1), label: "April Fools' Day", hook: 'Playful menu items, joke specials — fun engagement.', weight: 2 },
      { date: fixed(y, 5, 5), label: 'Cinco de Mayo', hook: 'Mexican specials, margaritas, taco nights.', weight: 4 },

      // ── Food-industry moments (high-value content)
      { date: fixed(y, 5, 28), label: 'National Burger Day', hook: 'Burger of the day, signature spotlight, behind-the-scenes.', weight: 4 },
      { date: fixed(y, 6, 4), label: 'National Cheese Day', hook: 'Cheese plate, mac & cheese, behind-the-counter.', weight: 3 },
      { date: fixed(y, 7, 17), label: 'World Emoji Day', hook: 'Light fun engagement post.', weight: 1 },
      { date: fixed(y, 8, 26), label: 'National Dog Day', hook: 'Pup-friendly patio post; great engagement driver.', weight: 3 },
      { date: fixed(y, 9, 13), label: 'Restaurant Week (typical start)', hook: 'Prix-fixe menu reveal — usually local, check city dates.', weight: 4 },
      { date: fixed(y, 10, 4), label: 'National Taco Day', hook: 'Taco specials, photogenic stack shots.', weight: 4 },
      { date: fixed(y, 12, 4), label: 'National Cookie Day', hook: 'Dessert spotlight.', weight: 2 },

      // ── Calendar moments owners shouldn't miss
      { date: dynamic(nthWeekdayOfMonth(y, 2, 0, 1)), label: 'Super Bowl Sunday', hook: 'Wings, takeout packages, group orders — biggest takeout day of the year.', weight: 5 },
    )
  }

  return events
    .filter(e => {
      const d = new Date(e.date)
      return d >= new Date(from.toDateString()) && d <= horizon
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function daysUntil(isoDate: string, from: Date = new Date()): number {
  const d = new Date(isoDate)
  const start = new Date(from.toDateString())
  return Math.round((d.getTime() - start.getTime()) / 86400000)
}
