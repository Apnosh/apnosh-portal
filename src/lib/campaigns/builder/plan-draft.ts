/**
 * The plan (cart) store — Section 2 of the shopping redesign. "Add to plan" COLLECTS:
 * it saves the owner's picks locally and ships/bills NOTHING. Checkout (plan-checkout.ts)
 * is the only door to real work.
 *
 * One localStorage record, keyed by itemId (re-adding an item replaces its config — the
 * simplest mental model). Silent migration from the Section 1 append-only v1 draft.
 *
 * PRICE HONESTY: planItemMoney reuses the exact math the PDP buy footer shows —
 * ITEM_PRICES for the base (zeroed on the owner-run gbp lanes) + each option service's
 * real catalog price — so the plan total always equals the sum of the per-item PDP prices.
 *
 * Pure + client-safe (no React, no server imports); every storage access is guarded so
 * SSR and a blocked localStorage just read as an empty plan.
 */
import { ITEM_PRICES, type ItemPrice } from './item-prices'
import { gbpLaneFromDoer } from './adapter'
import { serviceById, cadenceOf } from '../catalog'

export interface PlanDraftItem {
  itemId: string
  /** The picked version (the gbp doer string) — null on unversioned cards. */
  doer: string | null
  /** Add-on serviceIds picked on the PDP. */
  options: string[]
  addedAt: number
}

const KEY_V2 = 'apnosh-plan-draft-v2'
const KEY_V1 = 'apnosh-plan-draft-v1'

/* ── storage (guarded: SSR / private mode / full storage read as empty) ── */
function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
function readRaw(key: string): unknown {
  const s = storage(); if (!s) return null
  try { return JSON.parse(s.getItem(key) ?? 'null') } catch { return null }
}
function writeItems(items: PlanDraftItem[]): void {
  const s = storage(); if (!s) return
  try { s.setItem(KEY_V2, JSON.stringify(items)) } catch { /* storage full/private — the add just doesn't stick */ }
}

/** Coerce one stored entry into a valid PlanDraftItem (null = malformed, dropped). */
function coerce(e: unknown): PlanDraftItem | null {
  if (!e || typeof e !== 'object') return null
  const r = e as Record<string, unknown>
  if (typeof r.itemId !== 'string' || !r.itemId.trim()) return null
  return {
    itemId: r.itemId,
    doer: typeof r.doer === 'string' && r.doer.trim() ? r.doer : null,
    options: Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === 'string') : [],
    addedAt: typeof r.addedAt === 'number' ? r.addedAt : Date.now(),
  }
}

/** Silent one-time migration: Section 1's v1 draft was an APPEND-ONLY list of
 *  {itemId, version, options, at}. Dedupe last-wins per itemId into the keyed v2
 *  shape, then remove v1 so a cleared plan can never resurrect stale picks. */
function migrateV1(): void {
  const s = storage(); if (!s) return
  const raw = readRaw(KEY_V1)
  if (raw !== null) {
    if (readRaw(KEY_V2) === null && Array.isArray(raw)) {
      const byId = new Map<string, PlanDraftItem>()
      for (const e of raw) {
        if (!e || typeof e !== 'object') continue
        const r = e as Record<string, unknown>
        const it = coerce({ itemId: r.itemId, doer: r.version, options: r.options, addedAt: r.at })
        if (it) byId.set(it.itemId, it)
      }
      writeItems([...byId.values()])
    }
    try { s.removeItem(KEY_V1) } catch { /* fine */ }
  }
}

/** True when the id is a sellable card RIGHT NOW: every built-in and every runtime-registered
 *  DB campaign has an ITEM_PRICES entry (registerItemPrice), so the price registry doubles as
 *  the merged-catalog membership check. */
export function isKnownPlanItem(itemId: string): boolean {
  return itemId in ITEM_PRICES
}

/** Read the plan. Unknown/stale itemIds and dead option serviceIds are filtered from the
 *  RETURNED list but never persisted away — a DB campaign that registers a moment later
 *  (the catalog fetch is async) reappears instead of being silently deleted. */
export function readPlanDraft(): PlanDraftItem[] {
  migrateV1()
  const raw = readRaw(KEY_V2)
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PlanDraftItem[] = []
  for (const e of raw) {
    const it = coerce(e)
    if (!it || seen.has(it.itemId) || !isKnownPlanItem(it.itemId)) continue
    seen.add(it.itemId)
    out.push({ ...it, options: it.options.filter((id) => !!serviceById(id)) })
  }
  return out
}

/** Add-or-replace by itemId (re-adding replaces the config; the item keeps its place). */
export function addToPlan(entry: { itemId: string; doer?: string | null; options?: string[] }): void {
  migrateV1()
  const stored = readRaw(KEY_V2)
  const list = (Array.isArray(stored) ? stored.map(coerce).filter((x): x is PlanDraftItem => !!x) : [])
  const next: PlanDraftItem = {
    itemId: entry.itemId,
    doer: entry.doer ?? null,
    options: Array.isArray(entry.options) ? entry.options.filter((o) => typeof o === 'string') : [],
    addedAt: Date.now(),
  }
  const i = list.findIndex((x) => x.itemId === entry.itemId)
  if (i >= 0) list[i] = next; else list.push(next)
  writeItems(list)
  notify()
}

export function removeFromPlan(itemId: string): void {
  migrateV1()
  const stored = readRaw(KEY_V2)
  const list = (Array.isArray(stored) ? stored.map(coerce).filter((x): x is PlanDraftItem => !!x) : [])
  writeItems(list.filter((x) => x.itemId !== itemId))
  notify()
}

export function clearPlan(): void {
  const s = storage(); if (!s) return
  try { s.removeItem(KEY_V2); s.removeItem(KEY_V1) } catch { /* fine */ }
  notify()
}

/* ── price math (the SAME math the PDP buy footer renders, never re-derived by hand) ── */

/** One plan item's money: base = ITEM_PRICES (zeroed on an owner-run gbp lane, exactly like
 *  pdpPrice/laneFree), plus each option service's real catalog price split by cadence
 *  (exactly like the PDP's optionsMoney). */
export function planItemMoney(it: Pick<PlanDraftItem, 'itemId' | 'doer' | 'options'>): ItemPrice {
  const lane = it.doer ? gbpLaneFromDoer(it.doer) : null
  const laneFree = lane === 'diy' || lane === 'ai'
  const base = laneFree ? { oneTime: 0, perMonth: 0 } : (ITEM_PRICES[it.itemId] ?? { oneTime: 0, perMonth: 0 })
  let oneTime = base.oneTime, perMonth = base.perMonth
  for (const id of it.options) {
    const s = serviceById(id); if (!s) continue
    const { price, cadence } = cadenceOf(s)
    if (cadence.kind === 'recurring') perMonth += price; else oneTime += price
  }
  return { oneTime, perMonth }
}

/** The plan's running total — the sum of the per-item PDP prices, nothing else. */
export function planTotals(items: Pick<PlanDraftItem, 'itemId' | 'doer' | 'options'>[]): ItemPrice {
  let oneTime = 0, perMonth = 0
  for (const it of items) { const m = planItemMoney(it); oneTime += m.oneTime; perMonth += m.perMonth }
  return { oneTime, perMonth }
}

/* ── change subscription (same-tab writes notify directly; other tabs via 'storage') ── */
type Listener = () => void
const listeners = new Set<Listener>()
function notify(): void { for (const fn of [...listeners]) { try { fn() } catch { /* a bad listener never breaks the store */ } } }

export function subscribePlanDraft(fn: Listener): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY_V2 || e.key === KEY_V1 || e.key === null) fn() }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
