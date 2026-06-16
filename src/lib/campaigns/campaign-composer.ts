/**
 * Campaign composer — turns a chosen template + the owner's short spec into a
 * concrete campaign: a strategic brief (objective, offer, audience, channels,
 * content calendar, projected outcome) and the priced deliverables that make
 * it up. A campaign's cost is honest and simple: the content pieces that ship
 * (charged per piece, on delivery) plus optional ad spend — no abstract
 * subscriptions stacked on top.
 */
import { serviceById, serviceToLine } from '@/lib/campaigns/catalog'
import { AUDIENCES, CHANNELS, type CampaignTemplate } from '@/lib/campaigns/data/campaign-templates'
import type { CampaignBrief, ContentBeat, LineItem } from '@/lib/campaigns/types'

/** Per-piece economics + presentation for each content type. */
const CONTENT_META: Record<string, { price: number; stage: LineItem['stage']; unit: string; label: string; plain: string }> = {
  reel: { price: 120, stage: 'awareness', unit: 'reel', label: 'Short-form video', plain: 'A reel' },
  photo: { price: 65, stage: 'awareness', unit: 'photo', label: 'Photo', plain: 'A photo' },
  post: { price: 70, stage: 'awareness', unit: 'post', label: 'Post / graphic', plain: 'A post' },
  story: { price: 45, stage: 'awareness', unit: 'story', label: 'Story', plain: 'A story' },
  email: { price: 85, stage: 'retain', unit: 'email', label: 'Email', plain: 'An email' },
  sms: { price: 40, stage: 'retain', unit: 'text', label: 'Text blast', plain: 'A text' },
}

const SENTINEL_NO_OFFER = new Set(['Just show it off', 'No offer — just the invite', 'No offer', 'Just ask, nicely'])

/** A readable campaign name from the spec. */
function nameFor(t: CampaignTemplate, spec: Record<string, string>): string {
  switch (t.id) {
    case 'event': return spec.what?.trim() || 'Event push'
    case 'new-menu': return spec.what?.trim() ? `Launch: ${spec.what.trim()}` : 'New launch'
    case 'recurring-night': return spec.night ? `${spec.night.replace(/s$/, '')} night` : 'Recurring night'
    case 'fill-shifts': return spec.shift ? `Fill ${spec.shift}` : 'Slow-shift push'
    default: return t.name
  }
}

/** The objective, enriched with the spec where it sharpens it. */
function objectiveFor(t: CampaignTemplate, spec: Record<string, string>): string {
  if (t.id === 'fill-shifts' && spec.shift) return `Fill ${spec.shift}`
  if (t.id === 'recurring-night' && spec.night) return `Build a busy ${spec.night.replace(/s$/, '')} habit`
  if (t.id === 'reviews' && spec.where) return `Grow fresh ${spec.where} reviews and lift your rating`
  return t.objective
}

export interface ComposeResult { name: string; brief: CampaignBrief; items: LineItem[] }

export function composeCampaign(t: CampaignTemplate, spec: Record<string, string>): ComposeResult {
  // Audience: spec answer (comma-separated ids) or the template default.
  const audienceIds = (spec.audience ? spec.audience.split(',') : t.defaultAudienceIds).filter(id => AUDIENCES[id])
  // Channels: template default, broadened by what the audience reaches.
  const channelIds = Array.from(new Set([
    ...t.defaultChannelIds,
    ...audienceIds.flatMap(id => AUDIENCES[id]?.channels ?? []),
  ])).filter(id => CHANNELS[id])

  // Offer (skip the "no offer" sentinels).
  const offerLabel = spec.offer?.trim()
  const offer = offerLabel && !SENTINEL_NO_OFFER.has(offerLabel) ? { label: offerLabel } : undefined

  // Content calendar: template cadence, lightly tailored by the feature note.
  const feature = spec.feature?.trim()
  const contentBeats: ContentBeat[] = t.contentPlan.map(b => ({
    week: b.week, type: b.type, channel: b.channel,
    label: feature && b.type === 'reel' && b.week === 1 ? `${b.label} — featuring ${feature}` : b.label,
  }))

  // Deliverables (priced): one per content type, quantity = its occurrences;
  // plus a paid-ads line when the campaign runs ads.
  const items: LineItem[] = []
  const byType = new Map<string, number>()
  for (const b of contentBeats) byType.set(b.type, (byType.get(b.type) ?? 0) + 1)
  let i = 0
  for (const [type, qty] of byType) {
    const m = CONTENT_META[type]
    if (!m) continue
    items.push({
      id: `li-c-${type}-${i++}`, serviceId: `content-${type}`,
      name: `${m.label} × ${qty}`, plain: `${qty} ${m.unit}${qty === 1 ? '' : 's'}`,
      does: `${qty} ${m.label.toLowerCase()}${qty === 1 ? '' : 's'} across the campaign`,
      stage: m.stage, price: m.price, cadence: { kind: 'per-occurrence', unit: m.unit }, qty,
      eta: '~5 days', included: true, lock: 'editable',
    })
  }
  if (channelIds.includes('ads')) {
    const s = serviceById('paid-ads')
    if (s) items.push(serviceToLine(s, 'li-c-ads'))
  }

  const brief: CampaignBrief = {
    templateId: t.id, objective: objectiveFor(t, spec), offer, audienceIds, channelIds,
    kpi: t.kpi, durationWeeks: t.durationWeeks, projected: t.projected, contentBeats, spec,
  }

  return { name: nameFor(t, spec), brief, items }
}
