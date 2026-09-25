/**
 * ONE PRICE FOR EACH PIECE (owner 2026-09-24): the plan page shows it and the order charges it.
 * =============================================================================================
 * Before this, the plan page priced pieces in the page and the order priced them again in the
 * route from different sheets: a graphic and a Reel showed a price with the 10% fee already inside
 * and then the summary added 10% again, two Reels were charged as one, and a content day was charged
 * with no fee at all. Now every piece has ONE pre-fee price, computed here, shown on the plan page
 * and sent as the order's price; the 10% service fee is added once, on the work Apnosh makes.
 *
 * EFFORT LEVELS reuse what was already built and signed into the app, nothing new is invented:
 * graphics use the design tiers (tier-specs.ts: 1 concept / 1 round, 2 / 2, 3 / 3 + source files,
 * priced by the active design price sheet), Reels use the request desk's two levels (pricing.ts
 * CREATIVE_LEVELS.video: Standard, The works). The names are the same on every piece.
 *
 * CLIENT-SAFE: pure, no server imports, so the page and the route share it.
 */
import { PACKAGES, PACKAGE_EXTRA, type ItemPick, type PackageTier } from './suggest'
import { TIER_SPECS, specLine } from '@/lib/design/tier-specs'

export interface MenuPrices {
  /** one graphic at the Standard level, pre-fee */
  graphic: number
  /** one graphic at each level, pre-fee (1 Quick, 2 Standard, 3 The works) */
  graphicTiers?: { 1: number; 2: number; 3: number }
  /** one Reel at the Standard level, pre-fee */
  video: number
  /** one Reel at The works, pre-fee */
  videoWorks?: number
  print: number
  shootFor: (n: number) => number
  shootLabel: (n: number) => string
}

/** a creator's own prices, as the plan page has them */
export interface CreatorPrices { offers: { tiers: { name: string; priceCents: number }[]; startingCents: number | null }[]; audience?: { whitelistCents?: number | null } | null }

export type GraphicLevel = 1 | 2 | 3
export type VideoLevel = 'standard' | 'works'
export const LEVEL_NAME = { 1: 'Quick', 2: 'Standard', 3: 'The works' } as const
export const VIDEO_LEVEL_NAME: Record<VideoLevel, string> = { standard: 'Standard', works: 'The works' }
/** what each level promises, in the words the order carries */
export const GRAPHIC_LEVEL_LINE = (l: GraphicLevel) => specLine(l)
export const VIDEO_LEVEL_LINE: Record<VideoLevel, string> = {
  standard: 'Cut as picked · captions · 1 to 2 revisions · 3 to 5 days',
  works: 'A shot list · pro edit with titles and motion · senior editor · 2 revisions · 7 days',
}
export { TIER_SPECS }

export const graphicLevel = (o: Record<string, unknown>): GraphicLevel => (o.level === 1 || o.level === 3 ? o.level : 2)
export const videoLevel = (o: Record<string, unknown>): VideoLevel => (o.level === 'works' ? 'works' : 'standard')
const tierCost = (p: MenuPrices, l: GraphicLevel) => p.graphicTiers?.[l] ?? (l === 2 ? p.graphic : l === 1 ? Math.round(p.graphic * 0.55) : Math.round(p.graphic * 2.1))
const reelCost = (p: MenuPrices, l: VideoLevel) => (l === 'works' ? p.videoWorks ?? 70000 : p.video)

/** One graphic's pre-fee price at a level, with its extras. */
const graphicExtras = (o: Record<string, unknown>) => { const where = (o.where as string[] | undefined) ?? ['post']; return (where.includes('tent') ? 2500 : 0) + (where.includes('poster') ? 2500 : 0) + (o.spanish ? 4000 : 0) }
export function oneGraphicCents(o: Record<string, unknown>, p: MenuPrices): number {
  return tierCost(p, graphicLevel(o)) + graphicExtras(o)
}

/** The upgrade on a piece that comes with the content day: the difference to the chosen level, never a refund. */
export const graphicUpgrade = (o: Record<string, unknown>, p: MenuPrices) => Math.max(0, tierCost(p, graphicLevel(o)) - tierCost(p, 2))
export const reelUpgrade = (o: Record<string, unknown>, p: MenuPrices) => Math.max(0, reelCost(p, videoLevel(o)) - reelCost(p, 'standard'))

/** Price of the i-th graphic of a line (0-based), pre-fee: what that one order is charged before the fee. */
export function graphicPieceCents(it: ItemPick, p: MenuPrices, i: number): number {
  const o = it.options
  const n = Math.max(1, Math.min(6, Number(o.count) || 1))
  if (o.from === 'shoot') return (i < (Number(o.included) || 0) ? 0 : PACKAGE_EXTRA.graphic) + graphicUpgrade(o, p) + graphicExtras(o)
  return Math.round(oneGraphicCents(o, p) * (n >= 2 ? 0.9 : 1))
}

export function itemCents(it: ItemPick, p: MenuPrices, profile?: CreatorPrices | null): number {
  const o = it.options
  switch (it.id) {
    case 'custom': return 0
    case 'graphic': { const n = Math.max(1, Math.min(6, Number(o.count) || 1)); let sum = 0; for (let i = 0; i < n; i++) sum += graphicPieceCents(it, p, i); return sum }
    case 'video': {
      const n = Math.max(1, Math.min(6, Number(o.count) || 1))
      if (o.filmed === 'shoot') return Math.max(0, n - (Number(o.included) || 0)) * PACKAGE_EXTRA.video + n * reelUpgrade(o, p)
      const each = reelCost(p, videoLevel(o)) + (o.style === 'chef' ? 7500 : 0) + (o.tiktok ? 6000 : 0) + (o.spanish ? 2500 : 0)
      return Math.round(each * n * (n >= 2 ? 0.9 : 1)) + (o.filmed === 'visit' ? 15000 : 0)
    }
    case 'photos': return o.queue ? 0 : o.tier ? PACKAGES[o.tier as PackageTier].cents : p.shootFor(1 + ((o.list as string[] | undefined)?.length ?? 0))
    case 'boost': return Number(o.cents) || 2000
    case 'creator': { const t = profile?.offers.flatMap((x) => x.tiers).find((x) => x.name === o.tierName); const first = (t?.priceCents ?? profile?.offers[0]?.startingCents ?? it.cents ?? 0) + (o.whitelist && profile?.audience?.whitelistCents ? profile.audience.whitelistCents : 0); const more = ((o.more as { slug: string; fromCents: number | null }[] | undefined) ?? []).reduce((s, m) => s + (m.fromCents ?? 0), 0); return first + more }
    case 'print': return p.print * Math.max(1, ((o.kinds as string[] | undefined) ?? [o.kind === 'poster' ? 'poster' : 'tent']).length)
    default: return 0
  }
}

/** The pieces Apnosh makes and charges for when the order is placed: the 10% service fee is on these.
 *  Not on the boost (ad money, spent in Boost), not on a creator (their own price), not on print or a
 *  custom piece (quoted by the team first). */
export const FEE_IDS = ['graphic', 'video', 'photos'] as const
export function feeBaseCents(items: ItemPick[], p: MenuPrices, profile?: CreatorPrices | null): number {
  return items.filter((x) => x.on && (FEE_IDS as readonly string[]).includes(x.id)).reduce((n, x) => n + itemCents(x, p, profile), 0)
}
