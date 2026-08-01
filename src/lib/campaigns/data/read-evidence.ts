/**
 * THE EVIDENCE LAW, extracted (design-ordering build rule: reuse, don't parallel).
 *
 * One implementation of "a read field only survives when the model quotes the words it came
 * from, and the quote actually appears in the text" — shared by the campaign describe-read
 * and the design describe-read. Vocabularies differ per flow; the law does not.
 */

/** Normalize for the quote-in-text check: case, curly quotes, collapsed whitespace. */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim()

/**
 * The gate every read field passes: a real quote, found in the text. Returns the value when
 * backed, undefined otherwise. An invented or paraphrased quote kills the field — a question
 * the walk asks beats a confident fabrication.
 */
export function backedValue(field: unknown, text: string): unknown {
  if (!field || typeof field !== 'object') return undefined
  const f = field as { value?: unknown; quote?: unknown }
  const q = typeof f.quote === 'string' ? norm(f.quote) : ''
  if (q.length < 2 || !norm(text).includes(q)) return undefined
  return f.value
}

/** The quote itself, for carrying cited words onto lines. */
export function backedQuote(field: unknown, text: string): string | undefined {
  if (!field || typeof field !== 'object') return undefined
  const f = field as { quote?: unknown }
  const q = typeof f.quote === 'string' ? f.quote.trim() : ''
  return q.length >= 2 && norm(text).includes(norm(q)) ? q : undefined
}
