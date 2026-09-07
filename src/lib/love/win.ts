/**
 * love/win — which proof cards are WINS, and the token that gives one a public address.
 *
 * A win is the thing an owner would show a friend. It is not "any card": the deck also carries
 * heads-ups (a quiet week) and state cards (connect Google, reviews waiting), and none of those
 * is something you send anybody. Two rules, and both of them come from ledgers that already exist:
 *
 *   1. The card's TONE is 'win' (src/lib/proof/present.ts). That is the same table the deck and
 *      the archive read, so a card that is mint on Home is a win here and a grey one never is.
 *   2. The card carries a POSITIVE NUMBER. The promises ledger says a number is only real in the
 *      'counted' state (src/lib/promises/lines.ts); a card whose big line has no number in it is
 *      the ledger's not_counted in card form, and putting it on a share page would be printing a
 *      claim with nothing behind it. So a card with no number is not a win, it is just news.
 *
 * State cards (card_key starting 'state-') are never wins whatever their tone: they are computed
 * on read, they are not stored, and they describe where the account stands rather than what
 * happened. Nothing without a row can carry a share token.
 *
 * Pure — no server imports, no clock, no I/O — so the page, the API and scripts/verify-wins.ts all
 * read the same rules.
 */

import { presentCardType, type AnyCardType } from '@/lib/proof/present'

/** The card fields these rules need. The stored row and the API's mapped card both satisfy it. */
export interface WinInput {
  /** proof_cards.card_key — 'state-…' for the computed state cards */
  cardKey: string
  /** proof_cards.card_type */
  cardType: string
  /** the big line, e.g. "9 calls · 31 direction taps" */
  big: string
}

/**
 * The first real number in the card's big line, or null when there is not one.
 *
 * Reads the line the owner reads rather than a separate field, because the big line IS the claim:
 * "2,418 people saw it" is a win, "Start your first campaign" is not, and no column anywhere says
 * which is which. Thousands separators are stripped so 2,418 counts as 2418 and not as 2.
 * A zero is not a win — "0 calls" is a true sentence and a terrible thing to hand a friend.
 */
export function winNumber(big: string): number | null {
  const m = String(big ?? '').match(/\d[\d,]*(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Mint on Home, by the same table the deck reads. */
export function isWinType(cardType: string): boolean {
  return presentCardType(cardType as AnyCardType).tone === 'win'
}

/** A card worth showing someone: stored, mint, and carrying a number. */
export function isWin(card: WinInput): boolean {
  if (!card || typeof card.cardKey !== 'string') return false
  if (card.cardKey.startsWith('state-')) return false
  if (!isWinType(card.cardType)) return false
  return winNumber(card.big) !== null
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
