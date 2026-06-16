/**
 * Play engine — the single live generator for a focused campaign.
 *
 * Given a template + the owner's short spec, it reads the template's
 * PLAY_BLUEPRINT (the canonical best-practice checklist) and emits the
 * complete play as transparent line items: core deliverables always, the
 * recommended ones as optional adds, anything the owner already has
 * pre-opted-out. Every line routes through the priced catalog or CONTENT_META
 * so it carries why / market / metric / handler.
 *
 * This replaces the thin template-content-list path (composeCampaign) as the
 * live generator. composeCampaign stays as the legacy fallback for any
 * template without a blueprint, so nothing can regress.
 */
import { composeCampaign, type ComposeResult } from '@/lib/campaigns/campaign-composer'
import { serviceById, serviceToLine, buildContentLine } from '@/lib/campaigns/catalog'
import { HAS_MAP } from '@/lib/campaigns/plan-engine'
import { blueprintFor } from '@/lib/campaigns/data/play-blueprints'
import type { CampaignTemplate } from '@/lib/campaigns/data/campaign-templates'
import type { ContentBeat, LineItem } from '@/lib/campaigns/types'

export interface ComposePlayOpts {
  /** Onboarding capabilities the owner already has — auto-opts-out matches. */
  has?: string[]
}

/** Map a relative timing label to a calendar week for the content view. */
function weekFromOffset(label?: string): number {
  if (!label) return 1
  const l = label.toLowerCase()
  if (l.includes('day of') || l.includes('day-of')) return 3
  const m = l.match(/(\d+)\s*days?\s*before/)
  if (m) return Number(m[1]) >= 7 ? 1 : 2
  if (l.includes('week 2') || l.includes('1–2') || l.includes('1-2') || l.includes('weekly')) return 2
  return 1
}

/**
 * Compose the complete best-practice play for a template + spec.
 * Returns the same shape as composeCampaign so the API/persistence and the
 * brief renderer are unchanged.
 */
export function composePlay(t: CampaignTemplate, spec: Record<string, string>, opts?: ComposePlayOpts): ComposeResult {
  const bp = blueprintFor(t.id)
  if (!bp) return composeCampaign(t, spec)            // legacy fallback — never regress

  // Reuse composeCampaign for the brief scaffolding (name, objective, offer,
  // audience, channels, kpi, duration, projected); we replace only the
  // deliverables and the content calendar with the blueprint's.
  const base = composeCampaign(t, spec)
  const owned = new Set((opts?.has ?? []).flatMap((h) => HAS_MAP[h] ?? []))

  const items: LineItem[] = []
  const beats: ContentBeat[] = []
  let idx = 0
  for (const d of bp.deliverables) {
    let line: LineItem | null = null
    if (d.serviceId) {
      const s = serviceById(d.serviceId)
      if (s) line = serviceToLine(s, `pl-${idx}-${d.serviceId}`)
    } else if (d.contentType) {
      line = buildContentLine(d.contentType, `pl-${idx}-${d.contentType}`, { qty: d.qty, stage: d.stage, why: d.whyOverride })
    }
    idx++
    if (!line) continue

    if (d.stage) line.stage = d.stage
    if (d.whyOverride) line.why = d.whyOverride
    if (d.offsetLabel) line.when = d.offsetLabel
    // Apply blueprint qty to service-based per-occurrence lines too (serviceToLine
    // doesn't set it; content lines already got it via buildContentLine).
    if (d.qty != null && d.serviceId) {
      line.qty = d.qty
      if (line.cadence.kind === 'per-occurrence' && d.qty > 1) line.name = `${line.name} × ${d.qty}`
    }
    line.included = (d.tier ?? 'core') === 'core'           // recommended → optional add
    // Owned & actually in the plan → pre-mark "I already have this" (don't stamp owned on
    // un-added recommended lines, which would falsely inflate the savings/handle count).
    if (line.included && line.serviceId && owned.has(line.serviceId)) line.optOut = 'have-it'
    items.push(line)

    if (line.included) {
      beats.push({ week: weekFromOffset(d.offsetLabel), type: d.contentType ?? line.serviceId, label: line.name, channel: d.offsetLabel ?? '' })
    }
  }
  beats.sort((a, b) => a.week - b.week)

  return { name: base.name, brief: { ...base.brief, contentBeats: beats }, items }
}
