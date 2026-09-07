/**
 * resolve-lang — the one rule that decides which language a screen draws, and whether the
 * browser's answer is written back up to the record.
 *
 * It lives here, apart from the provider, because it is the part that can be WRONG in a way
 * nobody sees: an admin looking at a Spanish client and then an English one used to hand the
 * second one Spanish and then save that onto its row. A pure function can be proved
 * (scripts/verify-i18n.ts section 6) without a browser, a database or a React tree.
 *
 * The three answers it weighs:
 *
 *   db      clients.preferred_language, the record. Missing until migration 259 runs.
 *   local   what THIS browser remembers FOR THIS CLIENT (apnosh:language:<clientId>). Never the
 *           plain apnosh:language key: that one is the pre-login / onboarding hint and belongs
 *           to whoever last used the browser, which is exactly how one client's language leaked
 *           onto another client's row.
 *   isAdmin the viewer is staff, looking at somebody else's business.
 *
 * The rules:
 *
 *   · An admin READS. The record wins, always, and nothing is written — not the row, not the
 *     browser. Staff are not the owner and their browser is not the owner's browser.
 *   · The owner's browser can correct the record in ONE case: the column's default is 'en', so
 *     a row that says English cannot be told apart from a row nobody has answered for. If this
 *     browser remembers Spanish FOR THIS CLIENT, we keep Spanish and write it up, so the owner
 *     who tapped Español in setup is not handed English on every load.
 *   · Otherwise the record leads and the browser copy catches up with it.
 */
import { DEFAULT_LANG, isLang, type Lang } from './t'

export interface LangResolution {
  /** what the screens draw */
  lang: Lang
  /** write this onto the client row (PATCH), or null for "leave the record alone" */
  push: Lang | null
  /** remember this in the browser for this client, or null for "write nothing" */
  store: Lang | null
}

export function resolveLang(db: unknown, local: Lang | null, isAdmin: boolean): LangResolution {
  // No record yet (or no migration 259). Staff get English; the owner keeps what their own
  // browser remembers. Nothing is written either way, because nothing has been decided.
  if (!isLang(db)) return { lang: isAdmin ? DEFAULT_LANG : (local ?? DEFAULT_LANG), push: null, store: null }

  // Staff read the record and touch nothing.
  if (isAdmin) return { lang: db, push: null, store: null }

  // The one exception: 'en' on the record loses to a browser that remembers Spanish here.
  if (db === DEFAULT_LANG && local && local !== DEFAULT_LANG) return { lang: local, push: local, store: local }

  return { lang: db, push: null, store: db }
}
