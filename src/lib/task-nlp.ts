/**
 * Tiny NLP helper for detecting follow-up intent in free text.
 *
 * Input: the outcome/body of a logged interaction.
 * Output: a suggested due date + a title for an auto-generated task, or
 * null if nothing detected.
 *
 * We keep the logic intentionally simple — a short list of patterns
 * that cover the phrases admins actually type. Wrong guesses are cheap
 * because we only SUGGEST the task; the admin has to confirm.
 */

export interface FollowupSuggestion {
  title: string
  due_at: Date
  matched: string  // the original phrase that fired the match
}

interface Pattern {
  // Regex against the lowercased text. First capture group = number,
  // second capture group = unit ('day'/'week'/'month'); or use the
  // `fixed` function to compute a date from the matched text directly.
  re: RegExp
  fixed?: (now: Date, match: RegExpMatchArray) => Date
}

const UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1,
  week: 7, weeks: 7,
  month: 30, months: 30,
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function nextWeekday(now: Date, targetDow: number): Date {
  const d = new Date(now)
  const current = d.getDay()
  let delta = targetDow - current
  if (delta <= 0) delta += 7
  d.setDate(d.getDate() + delta)
  d.setHours(9, 0, 0, 0)
  return d
}

function addDays(now: Date, days: number): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d
}

const PATTERNS: Pattern[] = [
  // "follow up in 2 weeks", "check back in 3 days", "circle back in 1 month"
  {
    re: /\b(?:follow[\s-]?up|check[\s-]?back|circle[\s-]?back|touch[\s-]?base|reach[\s-]?out)\s+(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months)\b/i,
  },
  // "next week", "next Tuesday"
  {
    re: /\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    fixed: (now, m) => {
      const word = m[1].toLowerCase()
      if (word === 'week') return addDays(now, 7)
      return nextWeekday(now, WEEKDAYS.indexOf(word))
    },
  },
  // "tomorrow", "in 2 days"
  {
    re: /\btomorrow\b/i,
    fixed: now => addDays(now, 1),
  },
  {
    re: /\bin\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i,
  },
  // "by Friday", "by end of week"
  {
    re: /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    fixed: (now, m) => nextWeekday(now, WEEKDAYS.indexOf(m[1].toLowerCase())),
  },
  {
    re: /\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week\b/i,
    fixed: now => nextWeekday(now, 5), // Friday
  },
  {
    re: /\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?month\b/i,
    fixed: now => {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 0, 9, 0, 0)
      return d
    },
  },
]

export function detectFollowup(text: string, now: Date = new Date()): FollowupSuggestion | null {
  if (!text) return null
  const lower = text.toLowerCase()

  for (const p of PATTERNS) {
    const match = lower.match(p.re)
    if (!match) continue

    let due: Date | null = null
    if (p.fixed) {
      due = p.fixed(now, match)
    } else if (match[1] && match[2]) {
      const n = parseInt(match[1], 10)
      const days = UNIT_DAYS[match[2].toLowerCase()] ?? 0
      if (n > 0 && days > 0) due = addDays(now, n * days)
    }
    if (!due) continue

    return {
      title: suggestTitle(text, match[0]),
      due_at: due,
      matched: match[0],
    }
  }
  return null
}

// Build a concise task title from the outcome text. If it's short
// enough, just use it. Otherwise extract the clause around the match.
function suggestTitle(text: string, matched: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 80) return capitalize(trimmed)
  // Try to find a short clause containing the match
  const parts = trimmed.split(/[.;\n]/).map(s => s.trim()).filter(Boolean)
  const hit = parts.find(p => p.toLowerCase().includes(matched.toLowerCase()))
  if (hit && hit.length <= 100) return capitalize(hit)
  return capitalize(matched)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
