/**
 * i18n — the product in the owner's language, without a library and without a network call.
 *
 * Ten of the twenty owners in the walk speak Spanish at home. Three of them could not tell what
 * they were being charged for. This is the plumbing that fixes it, and it is deliberately the
 * smallest thing that can work.
 *
 * THE KEY IS THE ENGLISH SENTENCE. `t('Get help', lang)` returns 'Pedir ayuda' in Spanish and
 * 'Get help' in English. Three reasons, and they are all about not breaking the product:
 *
 *   1. English can never go missing. A key with no translation renders the key, which IS the
 *      English copy. A screen half-translated reads half-Spanish, never half-blank.
 *   2. The stored values stay English. Onboarding's goal chips, the shelf's chip names and the
 *      shape values are all saved to the database as their English strings. Translating at
 *      RENDER time means a Spanish owner's row still says 'More foot traffic overall', so the
 *      ranker, the shelf and every report keep working unchanged.
 *   3. A reviewer can read the diff. `t('Above your budget', lang)` says what it draws.
 *
 * WHAT IS TRANSLATED, TODAY. Home, the Create shelf's chrome, the onboarding flow's frame and
 * questions, Get help and Settings. The ORDER screens (checkout, campaigns, the creative flow)
 * are still English on purpose — a sibling move owns those files this week — and every string
 * that still needs Spanish there is listed in the move's report.
 *
 * No translation library, no service, no network. Pure: safe from a server component, a client
 * component and a script.
 */

import { ES } from './es'

export type Lang = 'en' | 'es'

export const LANGS: readonly Lang[] = ['en', 'es']

/** What each language calls itself, which is the only honest way to label the picker. */
export const LANG_LABEL: Record<Lang, string> = { en: 'English', es: 'Español' }

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'es'
}

/** The language we draw in when nobody has said otherwise — which is what every owner has been
 *  reading since the day they signed up. */
export const DEFAULT_LANG: Lang = 'en'

/**
 * The string, in this language. English is the key, so an untranslated key renders as English
 * rather than as a blank or a key name the owner would have to decode.
 *
 * `vars` fills `{name}` holes, which is the only way a number or an amount can sit in the
 * middle of a sentence and still let the translator move it: English says "Above $500 to start"
 * and Spanish says "Más de $500 para empezar", and neither has to be glued together from
 * fragments at the call site.
 */
export function t(key: string, lang: Lang | null | undefined, vars?: Record<string, string | number>): string {
  const raw = lang === 'es' ? (ES[key] ?? key) : key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** The locale tag for numbers, dates and money. es-US, not es-ES: these owners are in the
 *  United States, so it is $1,200 and September, in Spanish. */
export function localeOf(lang: Lang | null | undefined): string {
  return lang === 'es' ? 'es-US' : 'en-US'
}

/** A whole number, grouped the way this owner reads numbers. */
export function num(n: number, lang: Lang | null | undefined): string {
  return n.toLocaleString(localeOf(lang))
}

/** Whole dollars. Both locales here are United States dollars; only the grouping changes. */
export function money(n: number, lang: Lang | null | undefined): string {
  return n.toLocaleString(localeOf(lang), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** A date the owner reads, e.g. "Sep 8" / "8 sept". */
export function shortDate(iso: string | Date, lang: Lang | null | undefined): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric' })
}
