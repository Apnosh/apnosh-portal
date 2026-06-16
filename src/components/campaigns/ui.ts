/** Shared design tokens + helpers for the campaign canvas (portal mvp look). */
import { lineTotal, type LineItem } from '@/lib/campaigns/types'

export const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  red: '#c0392b', redBg: '#fdecea',
}
export const DISPLAY = "'Cal Sans','Inter',sans-serif"
export const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

export const money = (n: number) => (n === 0 ? 'Free' : `$${Math.round(n).toLocaleString()}`)

/** Per-stage accent so each play / line reads at a glance. */
export const STAGE_HEX: Record<string, string> = {
  foundation: '#6b7280', awareness: '#4abd98', capture: '#3b82f6', convert: '#f59e0b',
  nurture: '#ec4899', retain: '#8b5cf6', winback: '#ef4444', advocate: '#10b981', anticipation: '#f97316',
}
export const stageHex = (s: string) => STAGE_HEX[s] ?? C.mute

/** Who builds a line — the handler chip. DIY flips it to "You". */
export function handlerMeta(handler?: LineItem['handler'], diy?: boolean): { label: string; icon: string; hex: string } {
  if (diy) return { label: 'You', icon: '🙋', hex: '#6b7280' }
  switch (handler) {
    case 'ai': return { label: 'AI', icon: '✨', hex: '#8b5cf6' }
    case 'hybrid': return { label: 'AI + Apnosh', icon: '✨', hex: '#3b82f6' }
    case 'apnosh':
    default: return { label: 'Apnosh', icon: '◆', hex: '#2e9a78' }
  }
}

/** The headline price label for a line at its current quantity. */
export function cadenceLabel(it: LineItem): string {
  if (it.cadence.kind === 'recurring') return `${money(it.price)}/mo`
  return money(lineTotal(it))
}

/** Sub-label under the price. */
export function cadenceSub(it: LineItem): string {
  if (it.cadence.kind === 'recurring') return 'each month it runs'
  if (it.cadence.kind === 'per-occurrence') return `${it.qty ?? 1} × ${money(it.price)}/${it.cadence.unit}`
  return 'once, on delivery'
}
