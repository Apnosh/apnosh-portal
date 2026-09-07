'use client'

/**
 * mvp-language — the owner's language, provided to every screen the way the theme is.
 *
 * Same shape as MvpThemeProvider next door, on purpose: one provider mounted once in the
 * dashboard layout, and every component just calls `const { lang, T } = useLang()`. Used outside
 * a provider (a preview route, a script) it falls back to English, so nothing ever breaks by
 * being rendered somewhere new.
 *
 * WHERE THE ANSWER COMES FROM. clients.preferred_language (migration 259) is the record, and it
 * arrives on the client row the whole app already resolves — no extra fetch, and it is per
 * business, so a strategist switching between two clients sees each one's own language. The
 * browser copy in localStorage exists for two reasons: it is ready before the client row's
 * round trip is, and ONBOARDING, which happens before a client row exists at all.
 *
 * THE BROWSER COPY IS PER CLIENT. localStorage is one bucket for the whole browser, and the
 * language is not: an admin, or an owner with two locations, looks at more than one business in
 * the same tab. One shared key meant looking at a Spanish client and then an English one drew
 * the second one in Spanish AND saved Spanish onto its row. So the remembered answer is keyed
 * `apnosh:language:<clientId>`, and the plain `apnosh:language` is only the pre-login hint:
 * onboarding writes it before a client row exists, and the first paint reads it before the
 * client row has arrived. It never decides what is written to a row. The rule that weighs the
 * record against the browser lives in lib/i18n/resolve-lang.ts, where it can be proved.
 *
 * WHAT IT DOES NOT DO. It does not remove the flash of English. The server renders this tree
 * with no idea who is asking, and localStorage cannot be read until the first effect runs, so
 * a Spanish owner still sees one frame of English on a cold load — sooner over than waiting
 * for the client row, but there. Reading it in the browser earlier cannot fix that: React
 * would hydrate against markup the server wrote in English. The real fix is to render the
 * language on the SERVER (a cookie or the client row read in the dashboard layout, passed in
 * as the initial value); it is a follow-up, and until it ships this comment is the honest
 * description of what an owner sees.
 *
 * `T(...)` is `t(..., lang)` already bound, because a screen that has to pass the language to
 * every single string will eventually forget one.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DEFAULT_LANG, isLang, localeOf, t, type Lang } from '@/lib/i18n/t'
import { previewLangFrom, resolveLang } from '@/lib/i18n/resolve-lang'
import { useClient } from '@/lib/client-context'

/** the pre-login hint: what the last person to use this browser was reading */
const STORAGE_KEY = 'apnosh:language'
/** what this browser remembers for ONE business */
const keyFor = (clientId: string) => `${STORAGE_KEY}:${clientId}`

export interface LangCtx {
  lang: Lang
  /** staff are reading this in a language that is NOT the client's, and nothing is being saved */
  preview?: boolean
  /** t() with the language already bound. `vars` fills {name} holes. */
  T: (key: string, vars?: Record<string, string | number>) => string
  /** 'en-US' / 'es-US', for toLocaleString on numbers, dates and money. */
  locale: string
  setLang: (l: Lang) => void
}

const LanguageContext = createContext<LangCtx>({
  lang: DEFAULT_LANG,
  T: (k: string) => k,
  locale: 'en-US',
  setLang: () => {},
})

/**
 * The remembered answer. With a client id it is that business's own answer and nothing else —
 * no falling back to the plain key, because the plain key may belong to a different business
 * and would then be written onto this one. Without an id it is the pre-login hint, which is
 * what onboarding and the first paint want. Never throws (private windows).
 */
export function readStoredLang(clientId?: string | null): Lang | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(clientId ? keyFor(clientId) : STORAGE_KEY)
    return isLang(v) ? v : null
  } catch { return null }
}

/** Tell the record what the browser already knows. Best-effort in every direction: no await,
 *  no error surface, and a database without migration 259 answers ok:false, which is fine —
 *  the owner keeps reading the language they picked either way. */
function pushLang(clientId: string, l: Lang): void {
  fetch('/api/dashboard/more', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, language: l }),
  }).catch(() => { /* the browser copy still decides what they read */ })
}

/** Remember it for this business, and as the hint for the next cold load of this browser. The
 *  hint is only ever a first-paint guess: effect 2 below corrects it against the record. */
function writeStoredLang(l: Lang, clientId?: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, l)
    if (clientId) localStorage.setItem(keyFor(clientId), l)
  } catch { /* storage off; the client row still decides */ }
}

export function MvpLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  /** staff preview: ?lang=es draws Spanish and saves nothing (resolve-lang.ts) */
  const [preview, setPreview] = useState(false)
  const { client, isAdmin } = useClient()
  /** the client we have already written the browser's answer up for, so it happens once */
  const pushedFor = useRef<string | null>(null)

  // 1. The remembered answer, as early as the browser allows: the first effect after mount,
  //     which beats the client row's round trip but not the server's English first paint.
  useEffect(() => {
    const saved = readStoredLang()
    if (saved) setLangState(saved)
  }, [])

  // 2. The record against the browser. resolveLang() holds the whole rule (lib/i18n/resolve-lang.ts)
  //    so it can be proved without a browser: an admin reads the record and writes nothing, and
  //    the owner's browser can only correct an 'en' — the column's default, which cannot be told
  //    apart from a row nobody has answered for — using what it remembers FOR THIS CLIENT.
  const clientId = client?.id ?? null
  const pathname = usePathname()
  useEffect(() => {
    if (!clientId) return
    /* The preview is read here, off window, rather than through useSearchParams: that hook forces
     * every page under this provider into a Suspense boundary at build time, and this is a
     * read-only staff aid, not a route input. Re-read on every screen change, which is when a
     * strategist would drop ?lang=es on a URL. */
    const wanted = previewLangFrom(typeof window === 'undefined' ? null : window.location.search)
    const r = resolveLang(client?.preferred_language, readStoredLang(clientId), isAdmin, wanted)
    setLangState(r.lang)
    setPreview(isAdmin && !!wanted)
    if (r.store) writeStoredLang(r.store, clientId)
    if (r.push && pushedFor.current !== clientId) { pushedFor.current = clientId; pushLang(clientId, r.push) }
  }, [client?.preferred_language, clientId, isAdmin, pathname])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    writeStoredLang(l, clientId)
  }, [clientId])

  const value = useMemo<LangCtx>(() => ({
    lang,
    preview,
    T: (key: string, vars?: Record<string, string | number>) => t(key, lang, vars),
    locale: localeOf(lang),
    setLang,
  }), [lang, preview, setLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang(): LangCtx {
  return useContext(LanguageContext)
}

/**
 * Puts a language that was built somewhere else over a subtree. Onboarding needs it: the frame
 * owns the switch, and every screen inside the frame has to re-render the moment it is tapped.
 * Four independent copies of useStandaloneLang() (one per component) left the tiles in English
 * until the next screen, which is the bug this exists to make impossible.
 */
export function LanguageProvider({ value, children }: { value: LangCtx; children: React.ReactNode }) {
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/**
 * The language for a screen that has no provider above it — onboarding, which runs before a
 * client row exists. Reads the browser's remembered answer and nothing else.
 */
export function useStandaloneLang(): LangCtx {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  useEffect(() => { const saved = readStoredLang(); if (saved) setLangState(saved) }, [])
  const setLang = useCallback((l: Lang) => { setLangState(l); writeStoredLang(l) }, [])
  return useMemo<LangCtx>(() => ({
    lang,
    T: (key: string, vars?: Record<string, string | number>) => t(key, lang, vars),
    locale: localeOf(lang),
    setLang,
  }), [lang, setLang])
}
