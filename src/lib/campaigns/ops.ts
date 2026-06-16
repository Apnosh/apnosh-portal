/**
 * Operator economics — internal only. Reads the real cost model behind each
 * line (US-lead hours, offshore hours, shoots, tools) so the team can see
 * what a campaign costs, what it earns, and how to distribute the work.
 * Never rendered to owners.
 */
import { costOf, PROCESSING, type CostModel } from '@/lib/campaigns/data/priced-catalog'
import { serviceById } from '@/lib/campaigns/catalog'
import { lineTotal, type LineItem } from '@/lib/campaigns/types'

export interface LineOps {
  usHrs: number
  offHrs: number
  shoots: number
  tools: number
  cost: number
  price: number
  margin: number
  marginPct: number
}

export function lineOps(it: LineItem): LineOps | null {
  const s = serviceById(it.serviceId)
  if (!s) return null
  const c: CostModel = s.prices[0].cost
  const q = it.cadence.kind === 'per-occurrence' ? Math.max(1, it.qty ?? 1) : 1
  const cost = costOf(c) * q
  const price = lineTotal(it)
  const margin = price * (1 - PROCESSING) - cost
  return {
    usHrs: (c.us ?? 0) * q,
    offHrs: (c.offshore ?? 0) * q,
    shoots: ((c.batchedShoots ?? 0) + (c.soloShoots ?? 0)) * q,
    tools: (c.tools ?? 0) * q,
    cost, price, margin, marginPct: price ? margin / price : 0,
  }
}

export interface OpsRollup extends LineOps { count: number }

export function rollup(items: LineItem[]): OpsRollup {
  const live = items.filter(i => !i.optOut)
  const acc = { usHrs: 0, offHrs: 0, shoots: 0, tools: 0, cost: 0, price: 0, count: 0 }
  for (const it of live) {
    const o = lineOps(it)
    if (!o) continue
    acc.usHrs += o.usHrs; acc.offHrs += o.offHrs; acc.shoots += o.shoots
    acc.tools += o.tools; acc.cost += o.cost; acc.price += o.price; acc.count++
  }
  const margin = acc.price * (1 - PROCESSING) - acc.cost
  return { ...acc, margin, marginPct: acc.price ? margin / acc.price : 0 }
}
