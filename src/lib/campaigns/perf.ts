/**
 * v2 mock performance — deterministic per-item readouts for the prototype,
 * shaped to mirror the real-signal scoring spec (metric · value vs plan ·
 * plain-language meaning). Keyed off the verdict so the story is coherent.
 */
import type { LineItem } from '@/lib/campaigns/types'

export type Verdict = 'working' | 'watch' | 'drop'

export interface PerfReadout {
  metric: string
  value: string
  up: boolean
  plain: string
}

const seed = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)

export function perfReadout(it: LineItem, v: Verdict): PerfReadout {
  const metric = it.metric?.label ?? 'tracking'
  const base = seed(it.id)
  if (v === 'working') return { metric, value: `+${8 + (base % 18)}%`, up: true, plain: 'Ahead of plan — keep it running.' }
  if (v === 'watch') return { metric, value: `+${1 + (base % 4)}%`, up: true, plain: 'Early signal — holding. Give it another month.' }
  return { metric, value: `−${3 + (base % 8)}%`, up: false, plain: 'Below plan — it isn’t earning its line.' }
}
