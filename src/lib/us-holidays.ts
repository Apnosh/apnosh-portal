/**
 * US restaurant-relevant holidays. Used by listing-health (gap
 * detection) and the holiday-hours reminder cron.
 *
 * Hand-curated per-year because some holidays float (Thanksgiving =
 * 4th Thursday, Mother's Day = 2nd Sunday in May, etc). Keep the
 * list short and high-impact for restaurants — these are the dates
 * where regular hours are most likely to mislead customers.
 */

export const US_RESTAURANT_HOLIDAYS: Array<{ date: string; label: string }> = [
  /* 2026 */
  { date: '2026-01-01', label: "New Year's Day" },
  { date: '2026-02-14', label: "Valentine's Day" },
  { date: '2026-05-10', label: "Mother's Day" },
  { date: '2026-05-25', label: 'Memorial Day' },
  { date: '2026-06-21', label: "Father's Day" },
  { date: '2026-07-04', label: 'Independence Day' },
  { date: '2026-09-07', label: 'Labor Day' },
  { date: '2026-11-26', label: 'Thanksgiving' },
  { date: '2026-12-24', label: 'Christmas Eve' },
  { date: '2026-12-25', label: 'Christmas Day' },
  { date: '2026-12-31', label: "New Year's Eve" },
  /* 2027 */
  { date: '2027-01-01', label: "New Year's Day" },
  { date: '2027-02-14', label: "Valentine's Day" },
  { date: '2027-05-09', label: "Mother's Day" },
  { date: '2027-05-31', label: 'Memorial Day' },
  { date: '2027-06-20', label: "Father's Day" },
  { date: '2027-07-04', label: 'Independence Day' },
  { date: '2027-09-06', label: 'Labor Day' },
  { date: '2027-11-25', label: 'Thanksgiving' },
  { date: '2027-12-24', label: 'Christmas Eve' },
  { date: '2027-12-25', label: 'Christmas Day' },
  { date: '2027-12-31', label: "New Year's Eve" },
]

export function upcomingHolidayDates(windowDays: number): Array<{ date: string; label: string }> {
  const now = new Date()
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() + windowDays)
  return US_RESTAURANT_HOLIDAYS.filter(h => {
    const d = new Date(h.date + 'T00:00:00Z')
    return d >= now && d <= cutoff
  })
}
