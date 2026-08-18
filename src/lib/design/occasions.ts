/**
 * OCCASIONS — the calendar that brings graphic demand to the owner (GD-3).
 *
 * Restaurants buy graphics for MOMENTS: a holiday, a game day, a season.
 * Instead of waiting for the owner to remember, the Campaigns page shows the
 * next few occasions with enough lead time to actually have the piece in hand,
 * and one tap opens the design order pre-filled with the occasion and its date.
 *
 * Deliberately CODE, not DB: these are national moments that hold for every
 * client. A client's OWN events already live in their campaigns; per-market
 * calendars later become one file per market, same shape.
 *
 * Lead time honesty: standard design turnaround is up to 7 days (the flow's
 * own "in hand by" logic treats closer dates as rush), so an occasion only
 * shows while ordering TODAY still comfortably beats the date — never a
 * suggestion that is already too late. CLIENT-SAFE: pure data + date math.
 */

export interface Occasion {
  id: string
  name: string
  emoji: string
  /** seeds the design flow's description */
  brief: string
  /** next occurrence on/after the given date */
  nextOn: (from: Date) => Date
}

/* nth weekday helpers (month is 0-based; weekday 0=Sun) */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (nth - 1) * 7)
}
function fixed(month: number, day: number): (from: Date) => Date {
  return (from) => {
    const y = from.getFullYear()
    const d = new Date(y, month, day)
    return d >= from ? d : new Date(y + 1, month, day)
  }
}
function nth(month: number, weekday: number, n: number): (from: Date) => Date {
  return (from) => {
    const d = nthWeekday(from.getFullYear(), month, weekday, n)
    return d >= from ? d : nthWeekday(from.getFullYear() + 1, month, weekday, n)
  }
}

export const OCCASIONS: Occasion[] = [
  { id: 'valentines', name: "Valentine's Day", emoji: '💝', brief: "A Valentine's Day promo graphic for our restaurant: date night, dinner for two", nextOn: fixed(1, 14) },
  { id: 'stpatricks', name: "St. Patrick's Day", emoji: '🍀', brief: "A St. Patrick's Day graphic for our restaurant: specials for the day", nextOn: fixed(2, 17) },
  { id: 'mothersday', name: "Mother's Day", emoji: '💐', brief: "A Mother's Day graphic for our restaurant: treat mom, brunch or dinner", nextOn: nth(4, 0, 2) },
  { id: 'fathersday', name: "Father's Day", emoji: '🎁', brief: "A Father's Day graphic for our restaurant: bring dad in", nextOn: nth(5, 0, 3) },
  { id: 'july4', name: 'Fourth of July', emoji: '🎆', brief: 'A Fourth of July graphic for our restaurant: holiday specials and hours', nextOn: fixed(6, 4) },
  { id: 'laborday', name: 'Labor Day weekend', emoji: '🍔', brief: 'A Labor Day weekend graphic for our restaurant: long-weekend specials', nextOn: nth(8, 1, 1) },
  { id: 'halloween', name: 'Halloween', emoji: '🎃', brief: 'A Halloween graphic for our restaurant: spooky specials or event night', nextOn: fixed(9, 31) },
  { id: 'thanksgiving', name: 'Thanksgiving', emoji: '🦃', brief: 'A Thanksgiving graphic for our restaurant: holiday hours, pre-orders, or catering', nextOn: nth(10, 4, 4) },
  { id: 'christmas', name: 'Christmas', emoji: '🎄', brief: 'A Christmas graphic for our restaurant: holiday hours, gift cards, festive specials', nextOn: fixed(11, 25) },
  { id: 'nye', name: "New Year's Eve", emoji: '🥂', brief: "A New Year's Eve graphic for our restaurant: the night's event or specials", nextOn: fixed(11, 31) },
]

export interface UpcomingOccasion extends Occasion {
  /** YYYY-MM-DD of the next occurrence */
  dateISO: string
  daysAway: number
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The next occasions worth showing: at least minLeadDays out (ordering today
 * still beats the date without a rush) and inside the horizon, soonest first.
 */
export function upcomingOccasions(from = new Date(), horizonDays = 75, minLeadDays = 8, limit = 3): UpcomingOccasion[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return OCCASIONS
    .map((o) => {
      const d = o.nextOn(today)
      const daysAway = Math.round((d.getTime() - today.getTime()) / 86_400_000)
      return { ...o, dateISO: ymd(d), daysAway }
    })
    .filter((o) => o.daysAway >= minLeadDays && o.daysAway <= horizonDays)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, limit)
}

export function occasionById(id: string): Occasion | null {
  return OCCASIONS.find((o) => o.id === id) ?? null
}
