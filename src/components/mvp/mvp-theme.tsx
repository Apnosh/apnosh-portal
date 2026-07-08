'use client'

/**
 * mvp-theme — the single palette the whole owner Home reads from, in two skins:
 * the familiar LIGHT portal, and a DARK "Oyster Night" skin modelled on the
 * Claude funnel mockup (deep green-black ground, a soft green glow at the funnel
 * mouth, brighter ink + accents so the same green/amber honesty colours still
 * read on dark). One toggle flips the whole screen — the funnel canvas, the
 * range tabs, and every card below — so it's one design in two moods, not two
 * copies.
 *
 * Every component just calls `const { C } = useMvpTheme()` and keeps using the
 * same `C.ink / C.green / …` names it already had; the values come from the
 * active skin. Used outside a provider (e.g. the Insights page, which stays
 * light), the hook falls back to the light palette — nothing breaks.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark'

export interface Palette {
  // structure
  ink: string; mute: string; faint: string; line: string; bg: string
  card: string; cardSoft: string; ghost: string
  // brand green
  green: string; greenDk: string; greenInk: string; greenSoft: string; greenLine: string
  // estimate amber
  amber: string; amberDk: string; amberInk: string; amberBg: string; amberLine: string; amberBtn: string
  // locked grey
  grey: string; greyDk: string; greyInk: string
  // down / negative coral
  coral: string; coralBg: string
  // the single concern colour (the worst funnel leg)
  concern: string; concernRGB: [number, number, number]
  // tooltip (inverts per theme so it always contrasts the ground)
  tipBg: string; tipInk: string
  // the funnel canvas ground + the page ground (both may be gradients)
  funnelBg: string; pageBg: string
  // conversion pills (good leg / weak leg)
  pillGoodBg: string; pillGoodInk: string; pillWeakBg: string; pillWeakInk: string
  // the crowd sprites
  personGreen: string; personGreenGlow: string; personAmber: string; personAmberGlow: string
  crowdA: number
  // the soft connecting path down the funnel
  pathRGB: string; pathAlpha: number
}

const light: Palette = {
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  card: '#ffffff', cardSoft: '#fbfcfb', ghost: '#e6e6ea',
  green: '#4abd98', greenDk: '#2e9a78', greenInk: '#1c6b52', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.30)',
  amber: '#c99a3e', amberDk: '#a9822f', amberInk: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3', amberBtn: '#bd7e16',
  grey: '#9a9aa1', greyDk: '#7c7c85', greyInk: '#5c5c66',
  coral: '#a85c3c', coralBg: '#f8efe9',
  concern: '#c2410c', concernRGB: [194, 65, 12],
  tipBg: '#1d1d1f', tipInk: '#ffffff',
  funnelBg: 'radial-gradient(120% 42% at 28% 0%, rgba(74,189,152,0.09), rgba(255,255,255,0) 60%), #FCFCFD',
  pageBg: 'radial-gradient(135% 55% at 50% 0%, rgba(74,189,152,0.10), rgba(255,255,255,0) 52%), #ffffff',
  pillGoodBg: '#eaf6f1', pillGoodInk: '#2e9a78', pillWeakBg: '#fde7d6', pillWeakInk: '#b45309',
  personGreen: '#34B98A', personGreenGlow: '#EAFBF4', personAmber: '#C79A57', personAmberGlow: '#F7ECD6',
  crowdA: 0.62,
  pathRGB: '74,189,152', pathAlpha: 0.16,
}

const dark: Palette = {
  ink: '#eef3f0', mute: '#9fb0a8', faint: '#6d7d76', line: 'rgba(255,255,255,0.10)', bg: '#0c1310',
  card: '#16211c', cardSoft: '#121b17', ghost: 'rgba(255,255,255,0.13)',
  green: '#4abd98', greenDk: '#63d2ac', greenInk: '#8ee5c6', greenSoft: 'rgba(74,189,152,0.15)', greenLine: 'rgba(74,189,152,0.32)',
  amber: '#d8ab53', amberDk: '#e5be76', amberInk: '#eccb88', amberBg: 'rgba(201,154,62,0.16)', amberLine: 'rgba(201,154,62,0.34)', amberBtn: '#d8ab53',
  grey: '#7e8c86', greyDk: '#96a49d', greyInk: '#adb9b2',
  coral: '#e39b7d', coralBg: 'rgba(200,110,80,0.18)',
  concern: '#f97316', concernRGB: [249, 115, 22],
  tipBg: '#e9efec', tipInk: '#12211b',
  funnelBg: 'radial-gradient(120% 44% at 28% 0%, rgba(74,189,152,0.16), rgba(13,21,18,0) 62%), #0d1512',
  pageBg: 'radial-gradient(135% 52% at 50% 0%, rgba(74,189,152,0.15), rgba(11,18,15,0) 55%), #0b120f',
  pillGoodBg: 'rgba(74,189,152,0.16)', pillGoodInk: '#63d2ac', pillWeakBg: 'rgba(249,115,22,0.18)', pillWeakInk: '#f9a35f',
  personGreen: '#57cfa7', personGreenGlow: '#d6fcee', personAmber: '#d8ab53', personAmberGlow: '#f7ecd6',
  crowdA: 0.72,
  pathRGB: '110,214,180', pathAlpha: 0.24,
}

export const PALETTES: Record<Theme, Palette> = { light, dark }

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void; C: Palette }
const ThemeContext = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {}, toggle: () => {}, C: light })

// One stable per-browser key. Deliberately NOT keyed on clientId — that resolves
// asynchronously, so the key would differ between first paint and post-load and the
// saved choice wouldn't restore. The skin is a personal display preference, not
// per-location data, so a single global key is both correct and robust.
const STORAGE_KEY = 'apnosh:home-theme'

export function MvpThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')

  // Restore the owner's last choice on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'dark' || saved === 'light') setThemeState(saved)
    } catch { /* defaults to light */ }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch { /* ignore */ }
  }, [])
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, C: PALETTES[theme] }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useMvpTheme(): ThemeCtx {
  return useContext(ThemeContext)
}
