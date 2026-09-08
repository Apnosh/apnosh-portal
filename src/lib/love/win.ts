/**
 * love/win — which proof cards are WINS, and the token that gives one a public address.
 *
 * A WIN IS A COUNTED PROMISE. Not "a card with a nice number on it": every order writes a promise
 * into the ledger — one number, and the day it shows on Home — and when that day comes with a real
 * number behind it, the cron composes one card for it (card_type 'promise_counted', written by
 * src/app/api/cron/count-is-in/route.ts from src/lib/promises/lines.ts). That card, and nothing
 * else, is a win.
 *
 * The rule used to be "the card is mint and has a number in it", which quietly made a win out of
 * any good week: a Google week that rose on its own, a post that did well, a review month. Those
 * are news, and they are true, but the card says "Counted by Apnosh" at the foot and the owner
 * sends it to somebody. Printing that on a week nobody was promised and nobody worked is a claim
 * with no work behind it. So the type IS the rule.
 *
 * Three locks, and all three have to hold:
 *   1. card_type is 'promise_counted' — a promise the owner bought, counted on its own day;
 *   2. it is not a SAMPLE — the seeded demo cards are real rows and must never get a public page;
 *   3. it carries a positive number that went the RIGHT WAY, because "0 taps" is true and is not
 *      something to show a friend, and neither is a rating that fell from 4.7 to 4.5.
 *
 * Pure — no server imports, no clock, no I/O — so the page, the API and scripts/verify-wins.ts all
 * read the same rules.
 */

import { presentCardType, type AnyCardType } from '@/lib/proof/present'
import { t, shortDate, type Lang } from '@/lib/i18n/t'

/** The one card type a win can be. Written by the count-is-in cron, and by nothing else. */
export const WIN_TYPE = 'promise_counted'

/** The card fields these rules need. The stored row and the API's mapped card both satisfy it. */
export interface WinInput {
  /** proof_cards.card_key — 'promise:<promise id>' for a counted promise */
  cardKey: string
  /** proof_cards.card_type */
  cardType: string
  /** the big line, e.g. "41 taps on your Google card" */
  big: string
  /** proof_cards.is_sample — a seeded demo card is never a win */
  isSample?: boolean
  /** proof_cards.metadata.metricKey — 'rating' reads its line as a pair. See winNumber. */
  metricKey?: string
}

/** Every number in a line, in order. A leading minus belongs to the number after it. */
function numbersIn(big: string): number[] {
  const out: number[] = []
  for (const m of String(big ?? '').matchAll(/[-−]?\d[\d,]*(\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, '').replace('−', '-'))
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** The metric a stored card was counted on, off its metadata. A card written before this has none. */
export function metricKeyOf(metadata: unknown): string | undefined {
  const k = (metadata as { metricKey?: unknown } | null)?.metricKey
  return typeof k === 'string' && k ? k : undefined
}

/**
 * The card's own number, or null when there is not one worth showing.
 *
 * Reads the line the owner reads rather than a separate field, because the big line IS the claim:
 * "2,418 people saw it" is a win, "Start your first campaign" is not, and no column anywhere says
 * which is which. Thousands separators are stripped so 2,418 counts as 2418 and not as 2.
 * A zero is not a win — "0 calls" is a true sentence and a terrible thing to hand a friend.
 *
 * A RATING IS A PAIR, AND THE PAIR IS THE WHOLE STORY. "4.7 → 4.5" is a rating that FELL, and both
 * halves of it are positive, so reading the first number called it a win. The number that is true
 * today is the SECOND one — the same one src/lib/promises/lines.ts composes the card on — and a
 * pair that ends lower than it started is not a number to hand anybody, whatever its value. That
 * closes the door on cards written before the composer learned the same rule.
 */
export function winNumber(big: string, metricKey?: string): number | null {
  // The minus sign belongs to the number after it. Without it "-5 calls" read as 5 and a card
  // that went BACKWARDS was a win.
  const nums = numbersIn(big)
  if (!nums.length) return null
  if (metricKey === 'rating') {
    const last = nums[nums.length - 1]
    if (last < nums[0]) return null
    return last > 0 ? last : null
  }
  return nums[0] > 0 ? nums[0] : null
}

/**
 * The one type. The tone table (src/lib/proof/present.ts) still calls it mint, because that is
 * how the deck draws it on Home — but the tone is not the rule any more, the type is: several
 * card types are mint and only this one is a promise somebody bought and we counted.
 */
export function isWinType(cardType: string): boolean {
  return cardType === WIN_TYPE
}

/** A card worth showing someone: a counted promise, real, with a positive number. */
export function isWin(card: WinInput): boolean {
  if (!card || typeof card.cardType !== 'string') return false
  if (!isWinType(card.cardType)) return false
  // Belt and braces: the computed state cards have no row, so they can never carry a token.
  if (typeof card.cardKey === 'string' && card.cardKey.startsWith('state-')) return false
  if (card.isSample) return false
  return winNumber(card.big, card.metricKey) !== null
}

/** Still mint on Home, by the same table the deck reads. Proved in scripts/verify-wins.ts. */
export function winTypeIsMint(): boolean {
  return presentCardType(WIN_TYPE as AnyCardType).tone === 'win'
}

/* ── the words, in the reader's language ────────────────────────────────────── */

/** The three lines of a card. */
export interface CardWords { label: string; big: string; context: string }

/** What the composer stored on the row so the card can be re-drawn: a key and its holes. */
interface StoredLine { key?: unknown; vars?: unknown }

const isPlainDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function drawLine(line: unknown, fallback: string, lang: Lang): string {
  const l = line as StoredLine | null
  if (!l || typeof l.key !== 'string' || !l.key) return fallback
  const vars: Record<string, string | number> = {}
  for (const [k, v] of Object.entries((l.vars ?? {}) as Record<string, unknown>)) {
    // A date is stored plain so it can be written out in the reader's own language.
    if (isPlainDate(v)) { vars[k] = shortDate(`${v}T12:00:00Z`, lang); continue }
    // A word that came out of the ledger ("taps on your Google card") goes through the same
    // dictionary as the sentence around it. t() renders an unknown key as itself, so a word
    // nobody has translated — the owner's own name for their order — stays exactly as they
    // wrote it, which is the only honest thing to do with it.
    vars[k] = typeof v === 'string' ? t(v, lang) : (v as string | number)
  }
  return t(l.key, lang, vars)
}

/**
 * The card's three lines in this language.
 *
 * The composer stored BOTH: the English sentences in label/big/context (so anything reading the
 * row raw still reads words), and the key plus its numbers in metadata.words (so the card can be
 * drawn again in Spanish without asking the ledger for the number a second time). Re-measuring at
 * render would be the dishonest way to do this: a card is a snapshot of the day its count came in,
 * and a shared link must keep saying what it said when it was sent.
 *
 * No metadata (a row written before migration 262) falls back to the stored English, which is what
 * every card said before this existed.
 */
export function renderCardWords(metadata: unknown, stored: CardWords, lang: Lang): CardWords {
  const words = (metadata as { words?: Record<string, unknown> } | null)?.words
  if (!words || typeof words !== 'object') return stored
  return {
    label: drawLine(words.label, stored.label, lang),
    big: drawLine(words.big, stored.big, lang),
    context: drawLine(words.context, stored.context, lang),
  }
}

/* ── the share token ────────────────────────────────────────────────────────── */

/** Lower-case letters and digits only, minus the pairs a person misreads out loud (o/0, l/1). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const TOKEN_LENGTH = 22
const TOKEN_RE = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`)

/**
 * A fresh public address for one win.
 *
 * 22 characters of a 31-letter alphabet is about 109 bits, which is more than enough that nobody
 * finds somebody else's card by guessing — and guessing is the ONLY door, because the public page
 * takes the token and nothing else. Web Crypto, never Math.random: a share link that can be
 * predicted is a client's numbers handed to a stranger.
 *
 * `crypto` here is the global (Node 18+ and every browser), so this stays pure and importable
 * from a script.
 */
export function newShareToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  // Rejection-free and unbiased enough for an id: 256 % 31 leaves a tiny skew that costs nothing
  // here, because the token is an address, not a key.
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** Is this a token we minted? Checked before any read, so a junk URL never reaches the database. */
export function isShareToken(v: unknown): v is string {
  return typeof v === 'string' && TOKEN_RE.test(v)
}
