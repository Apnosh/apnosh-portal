/**
 * BOOKING BRIEF — the small pure bits shared between the mint (which writes a booking's brief) and
 * the creator's card (which shows it). Client-safe on purpose: the work screen is a client component
 * and must not pull in the admin client.
 *
 * The card now shows the job's title, restaurant, day, time, and price as real fields, so the brief
 * only needs to carry what the restaurant actually TOLD them. Older rows were minted with those same
 * facts repeated as sentences plus a closing instruction; `trimBookingBrief` strips exactly those, so
 * an old job reads as cleanly as a new one without a backfill.
 */

/** Sentences the mint used to append that the card now says better in its own layout. */
const LEGACY_LINES = [
  'Deliver the finished work here when it is ready — the restaurant reviews and approves it.',
  'Deliver the finished work here when it is ready, and the restaurant reviews and approves it.',
]

/** Lead-ins whose value is already a field on the card ("Booked shoot: X.", "Shoot day: Y."). */
const LEGACY_PREFIXES = ['Booked shoot', 'Booked work', 'Monthly plan', 'Custom job', 'Shoot day', 'This month', 'Deliver by']

/**
 * The part of a booking brief worth showing on a card: what the restaurant asked for, minus the
 * facts the card already displays. Returns '' when nothing is left (a job with no questions).
 */
export function trimBookingBrief(brief: string | null | undefined): string {
  let s = (brief ?? '').trim()
  if (!s) return ''
  for (const line of LEGACY_LINES) s = s.split(line).join(' ')
  // Drop leading "Label: value." pairs the card re-renders itself. Only from the FRONT, so a real
  // answer that happens to contain one of these words is never cut.
  let changed = true
  while (changed) {
    changed = false
    for (const p of LEGACY_PREFIXES) {
      if (!s.toLowerCase().startsWith(`${p.toLowerCase()}: `)) continue
      const end = s.indexOf('. ')
      if (end === -1) { if (s.toLowerCase().startsWith(`${p.toLowerCase()}: `)) { s = '' } ; changed = true; break }
      s = s.slice(end + 2).trim()
      changed = true
      break
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Split a trimmed brief into question/answer pairs for display. The mint writes each as
 * "Question?: answer." so a card can show the question quietly and the answer loudly. Anything that
 * doesn't parse comes back as a single unlabelled note, so nothing is ever dropped.
 */
export function briefLines(brief: string | null | undefined): { label: string | null; value: string }[] {
  const s = trimBookingBrief(brief)
  if (!s) return []
  // Split on ". " before a capital. Written without lookbehind on purpose: older iOS Safari throws a
  // SyntaxError parsing lookbehind, which would take the whole screen down rather than one card.
  const parts: string[] = []
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    buf += s[i]
    const nextIsBreak = s[i] === '.' && s[i + 1] === ' ' && /[A-Z"']/.test(s[i + 2] ?? '')
    if (nextIsBreak) { parts.push(buf.trim()); buf = ''; i++ }
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts.map((part) => {
    const m = /^(.{2,80}?\??):\s+(.+)$/.exec(part)
    if (!m) return { label: null, value: part.replace(/\.$/, '') }
    return { label: m[1].replace(/\.$/, ''), value: m[2].replace(/\.$/, '') }
  })
}
