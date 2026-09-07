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
 * browser copy in localStorage exists for two reasons: the first paint, before the client row
 * lands (otherwise a Spanish owner reads a flash of English on every load), and ONBOARDING,
 * which happens before a client row exists at all.
 *
 * `T(...)` is `t(..., lang)` already bound, because a screen that has to pass the language to
 * every single string will eventually forget one.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LANG, isLang, localeOf, t, type Lang } from '@/lib/i18n/t'
import { useClient } from '@/lib/client-context'

const STORAGE_KEY = 'apnosh:language'

export interface LangCtx {
  lang: Lang
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

/** The remembered answer, for the first paint. Never throws (private windows). */
export function readStoredLang(): Lang | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
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

function writeStoredLang(l: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* storage off; the client row still decides */ }
}

export function MvpLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  const { client } = useClient()
  /** the client we have already written the browser's answer up for, so it happens once */
  const pushedFor = useRef<string | null>(null)

  // 1. The remembered answer paints first, so a Spanish owner never reads a flash of English.
  useEffect(() => {
    const saved = readStoredLang()
    if (saved) setLangState(saved)
  }, [])

  // 2. The client row is the record and wins — with ONE exception, because the column's
  //    default is 'en'. A row that says English cannot be told apart from a row nobody has
  //    answered for, so an 'en' on the record must never overwrite a browser that remembers
  //    Spanish: that owner would tap Español in setup and be handed English on every load
  //    until they found Settings. When they disagree that way we keep Spanish and write it
  //    up, best-effort, so the record catches up with the owner. Once the record says 'es'
  //    (or the owner picks English in Settings, which writes 'en' up itself) they agree and
  //    the record leads from then on.
  useEffect(() => {
    const v = client?.preferred_language
    const id = client?.id
    if (!isLang(v)) return
    const saved = readStoredLang()
    if (v === DEFAULT_LANG && saved && saved !== DEFAULT_LANG) {
      setLangState(saved)
      if (id && pushedFor.current !== id) { pushedFor.current = id; pushLang(id, saved) }
      return
    }
    setLangState(v)
    writeStoredLang(v)
  }, [client?.preferred_language, client?.id])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    writeStoredLang(l)
  }, [])

  const value = useMemo<LangCtx>(() => ({
    lang,
    T: (key: string, vars?: Record<string, string | number>) => t(key, lang, vars),
    locale: localeOf(lang),
    setLang,
  }), [lang, setLang])

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
