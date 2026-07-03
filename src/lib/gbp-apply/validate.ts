/**
 * gbp-apply/validate — the deterministic guard every GBP description passes through, on BOTH paths:
 * after the AI drafts it (draft.ts) and again on the live push (dispatch.ts pushWrite). Code-level,
 * not model-level, so a jailbroken draft or a hand-edited value can never bypass it. Google rejects
 * descriptions over 750 chars and prohibits URLs/phones in the field; we also refuse degenerate
 * too-short output rather than shipping filler to a paying client's public listing.
 */

export const DESCRIPTION_MAX = 750
export const DESCRIPTION_MIN = 250

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|menu|shop|app|biz|info)\b/i
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/
// 7+ digit runs with common phone separators (555-123-4567, (555) 123 4567, 5551234567).
const PHONE_RE = /(\+?\d[\s().-]*){7,}/

export function validateDescription(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = text.trim()
  if (!v) return { ok: false, error: 'The description is empty.' }
  if (v.length > DESCRIPTION_MAX) return { ok: false, error: `The description is over Google's ${DESCRIPTION_MAX}-character limit (${v.length}). Trim it and try again.` }
  if (v.length < DESCRIPTION_MIN) return { ok: false, error: 'The description came out too short to be worth publishing. Draft it again.' }
  if (URL_RE.test(v)) return { ok: false, error: 'Google does not allow links in the description. Remove the URL.' }
  if (EMAIL_RE.test(v)) return { ok: false, error: 'Remove the email address; Google does not allow contact details in the description.' }
  if (PHONE_RE.test(v)) return { ok: false, error: 'Remove the phone number; it belongs in the phone field, not the description.' }
  return { ok: true, value: v }
}

/** Cut to the limit at a sentence boundary (falling back to a word boundary), never mid-word. */
export function truncateAtBoundary(text: string, max = DESCRIPTION_MAX): string {
  const v = text.trim()
  if (v.length <= max) return v
  const slice = v.slice(0, max)
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (sentenceEnd > max * 0.6) return slice.slice(0, sentenceEnd + 1).trim()
  const wordEnd = slice.lastIndexOf(' ')
  return (wordEnd > 0 ? slice.slice(0, wordEnd) : slice).trim()
}
