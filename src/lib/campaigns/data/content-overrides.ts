/**
 * Campaign content OVERRIDES (Phase C1 of the campaign-catalog systemization) — the
 * client-safe half of the CMS overlay. The admin CMS writes sparse override rows
 * (catalog_content_overrides); this module merges one campaign's override onto its
 * canonical in-code record at render time.
 *
 * HONESTY: the overlay never invents content. A field only replaces the code default
 * when the admin actually typed something (non-empty after trim); everything else
 * falls back to CAMPAIGN_CONTENT. No override map at all (fetch failed, table not
 * applied yet, nothing edited) means the store renders pure code content.
 * CLIENT-SAFE: pure data merge, no server imports.
 */

import { campaignContent, type CampaignContent } from './campaign-content'
import type { FunnelStage } from './create-catalog'
import type { CampaignGatesConfig } from '../gates/config'

/** A campaign's rush option: a flat fee to deliver `days` sooner. Draft/display only for now. */
export interface CampaignRush {
  /** Flat rush fee added to the item. */
  fee: number
  /** How many business days sooner the rushed delivery lands. */
  days: number
}

/** Keep a well-formed rush setting (positive fee + positive days), else undefined. */
export function cleanRush(v: unknown): CampaignRush | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const fee = Math.max(0, Math.round(Number(r.fee) || 0))
  const days = Math.max(0, Math.round(Number(r.days) || 0))
  if (fee <= 0 || days <= 0) return undefined
  return { fee, days }
}

/** One "how it's done" lane (a tab in the product-page picker). Display/draft only for now. */
export interface CampaignLane {
  label: string
  /** Free-text price shown under the tab: "$100", "Free", "Included". */
  price: string
  /** Pro badge on the tab. */
  pro?: boolean
  /** The detail line shown under the tabs when this lane is selected. */
  detail?: string
  /** Per-tab "What you get". Absent = the campaign default / derived list. */
  whatYouGet?: string[]
  /** Per-tab "When you'll have it" (plain lines). Absent = the derived dated timeline. */
  timeline?: string[]
  /** Per-tab "What we'll need from you". Absent = the campaign default / derived list. */
  requirements?: string[]
}

/** ── Post-checkout "what we need from you" config (owner-editable per campaign) ── */
export type NeedInputType = 'text' | 'textarea' | 'select' | 'date'
/** Override for an auto-detected ask: force it required, make it optional, or hide it. */
export type NeedOverride = 'required' | 'optional' | 'off'
/** An ask the owner wrote themselves for this campaign's post-checkout setup. */
export interface CustomNeed {
  id: string
  title: string
  why?: string
  inputType: NeedInputType
  options?: string[]
  required?: boolean
}
/** The owner's config: per-auto-ask overrides + their own custom asks. */
export interface CampaignNeedsConfig {
  overrides?: Record<string, NeedOverride>
  custom?: CustomNeed[]
}

/** Keep only a well-formed needs config (valid overrides + custom asks), else undefined. */
export function cleanNeeds(v: unknown): CampaignNeedsConfig | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const out: CampaignNeedsConfig = {}
  if (r.overrides && typeof r.overrides === 'object') {
    const ov: Record<string, NeedOverride> = {}
    for (const [k, val] of Object.entries(r.overrides as Record<string, unknown>)) {
      if ((val === 'required' || val === 'optional' || val === 'off') && k.trim()) ov[k.trim()] = val
    }
    if (Object.keys(ov).length) out.overrides = ov
  }
  if (Array.isArray(r.custom)) {
    const custom: CustomNeed[] = []
    const seen = new Set<string>()
    for (const raw of r.custom) {
      if (!raw || typeof raw !== 'object') continue
      const c = raw as Record<string, unknown>
      const title = typeof c.title === 'string' ? c.title.trim() : ''
      if (!title) continue
      const inputType: NeedInputType = ['text', 'textarea', 'select', 'date'].includes(c.inputType as string) ? (c.inputType as NeedInputType) : 'text'
      // Stable, storage-safe id (answers persist to execution under it). Derive from title if missing.
      let id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `custom-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)}`
      if (!id || seen.has(id)) id = `${id || 'custom'}-${custom.length + 1}`
      seen.add(id)
      const need: CustomNeed = { id, title, inputType, required: !!c.required }
      const why = typeof c.why === 'string' ? c.why.trim() : ''
      if (why) need.why = why
      if (inputType === 'select') { const opts = cleanStringList(c.options, 8); if (opts.length) need.options = opts }
      custom.push(need)
      if (custom.length >= 12) break
    }
    if (custom.length) out.custom = custom
  }
  return out.overrides || out.custom ? out : undefined
}

/** Sparse edited fields for one campaign. Absent/empty = use the code default. */
export interface ContentOverride {
  title?: string
  tagline?: string
  description?: string
  promise?: string
  why?: string
  expectation?: string
  heroImage?: string
  bestFor?: string
  faq?: { q: string; a: string }[]
  /** Re-tagged product-page funnel chips. Absent = the card's built-in stages. */
  stages?: FunnelStage[]
  /** Edited "how it's done" lanes. Absent = the card's built-in lanes. Draft/display only. */
  lanes?: CampaignLane[]
  /** Edited "what we'll need from you" list. Absent = the list derived from services. */
  requirements?: string[]
  /** Edited "what you get" base list. Absent = the list derived from services. */
  whatYouGet?: string[]
  /** A configurable rush option (flat fee to deliver sooner). Absent = no rush offered. */
  rush?: CampaignRush
  /** Owner config for the post-checkout "needs from you" step. Absent = smart defaults. */
  needs?: CampaignNeedsConfig
  /** Owner config for pre-checkout gates (shoot on/off/required + custom agreement/input). Absent = smart defaults. */
  gates?: CampaignGatesConfig
}

/** Trim, drop empties + dupes, cap — the store contract for a plain string list. */
export function cleanStringList(v: unknown, cap = 8): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of v) {
    if (typeof raw !== 'string') continue
    const s = raw.trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= cap) break
  }
  return out
}

/** Keep only well-formed lanes (a real label), trimmed, capped — the store contract. */
export function cleanLanes(v: unknown): CampaignLane[] {
  if (!Array.isArray(v)) return []
  const out: CampaignLane[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    if (!label) continue
    const lane: CampaignLane = {
      label,
      price: typeof r.price === 'string' && r.price.trim() ? r.price.trim() : 'Free',
      pro: !!r.pro,
      detail: typeof r.detail === 'string' && r.detail.trim() ? r.detail.trim() : undefined,
    }
    const wig = cleanStringList(r.whatYouGet); if (wig.length) lane.whatYouGet = wig
    const tl = cleanStringList(r.timeline); if (tl.length) lane.timeline = tl
    const req = cleanStringList(r.requirements); if (req.length) lane.requirements = req
    out.push(lane)
    if (out.length >= 4) break
  }
  return out
}

/** item_id -> its edited fields. Only edited campaigns appear at all. */
export type ContentOverrideMap = Record<string, ContentOverride>

const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** The one resolver the render layers use: the code record with any admin-edited
 *  fields laid over it. Null only when the id itself is unknown. */
export function contentFor(itemId: string, overrides?: ContentOverrideMap | null): CampaignContent | null {
  const base = campaignContent(itemId)
  if (!base) return null
  const o = overrides?.[itemId]
  if (!o) return base
  const merged: CampaignContent = { ...base }
  if (filled(o.title)) merged.title = o.title.trim()
  if (filled(o.tagline)) merged.tagline = o.tagline.trim()
  if (filled(o.description)) merged.description = o.description.trim()
  if (filled(o.promise)) merged.promise = o.promise.trim()
  if (filled(o.why)) merged.why = o.why.trim()
  if (filled(o.expectation)) merged.expectation = o.expectation.trim()
  if (filled(o.heroImage)) merged.heroImage = o.heroImage.trim()
  if (filled(o.bestFor)) merged.bestFor = o.bestFor.trim()
  if (Array.isArray(o.faq)) {
    const faq = o.faq.filter((f) => f && filled(f.q) && filled(f.a)).map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
    if (faq.length) merged.faq = faq
  }
  if (Array.isArray(o.stages) && o.stages.length) merged.stages = o.stages
  if (Array.isArray(o.lanes) && o.lanes.length) merged.lanes = o.lanes
  if (Array.isArray(o.requirements) && o.requirements.length) merged.requirements = o.requirements
  if (Array.isArray(o.whatYouGet) && o.whatYouGet.length) merged.whatYouGet = o.whatYouGet
  const rush = cleanRush(o.rush); if (rush) merged.rush = rush
  const needs = cleanNeeds(o.needs); if (needs) merged.needs = needs
  return merged
}
