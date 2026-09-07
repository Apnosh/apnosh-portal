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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANG, isLang, localeOf, t, type Lang } from '@/lib/i18n/t'
import { useClient } from '@/lib/client-context'

const STORAGE_KEY = 'apnosh:language'

interface LangCtx {
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

function writeStoredLang(l: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* storage off; the client row still decides */ }
}

export function MvpLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
  const { client } = useClient()

  // 1. The remembered answer paints first, so a Spanish owner never reads a flash of English.
  useEffect(() => {
    const saved = readStoredLang()
    if (saved) setLangState(saved)
  }, [])

  // 2. The client row is the record and wins. Before migration 259 runs the field is simply
  //    absent, which reads as English — the same thing every owner sees today.
  useEffect(() => {
    const v = client?.preferred_language
    if (isLang(v)) { setLangState(v); writeStoredLang(v) }
  }, [client?.preferred_language])

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
