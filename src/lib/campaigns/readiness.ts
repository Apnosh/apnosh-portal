/**
 * Post-ship campaign readiness: what the owner still needs to provide or do so
 * the campaign can actually execute. Two kinds of items — INPUTS (the owner
 * fills in; they persist on campaigns.execution and flow into the creator brief)
 * and ACTIONS (computed gaps linking to where they get resolved). Only items
 * that are actually needed are returned. Server-only.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign, getCampaignProgress } from './server'
import { listWorkOrdersForCampaign } from './work-orders'
import { deriveSchedule } from './schedule'
import { deriveServiceNeeds } from './service-needs'
import { cleanNeeds, type CampaignNeedsConfig } from './data/content-overrides'

// Types + GROUP_ORDER live in the client-safe readiness-types.ts (this module is 'server-only').
import type { ReadinessItem, ReadinessReport } from './readiness-types'
export type { NeedGroup, ReadinessItem, ReadinessReport } from './readiness-types'

export async function getCampaignReadiness(campaignId: string): Promise<ReadinessReport | null> {
  const admin = createAdminClient()
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null
  const clientId = campaign.clientId
  const exec = campaign.execution ?? {}
  const detailHref = `/dashboard/campaigns/${campaignId}`

  const [bizRes, orders, progress, catRes] = await Promise.all([
    admin.from('businesses').select('hours, phone, website_url, address, brand_voice_words, brand_tone, brand_colors').eq('client_id', clientId).maybeSingle(),
    listWorkOrdersForCampaign(campaignId),
    getCampaignProgress(campaignId),
    // Which catalog product this order came from, so we can apply the owner's per-campaign needs config.
    admin.from('campaigns').select('source_catalog_id').eq('id', campaignId).maybeSingle(),
  ])
  const biz = bizRes.data as Record<string, unknown> | null

  const pendingConcepts = orders.filter((o) => o.conceptStatus === 'pending' || o.conceptStatus === 'changes').length
  const awaiting = progress?.awaitingYou ?? 0
  const sched = deriveSchedule({ targetDate: campaign.draft.targetDate, occasion: campaign.draft.occasion, contentBeats: campaign.draft.brief?.contentBeats }, campaign.shippedAt ?? new Date().toISOString())
  const scheduleSet = !!campaign.draft.targetDate && !sched.tooSoon
  const offerLabel = campaign.draft.brief?.offer?.label ?? null

  // Best-effort: only flag "connect" when the campaign needs a social channel and
  // no instagram/facebook is connected. Never block the report on this query.
  const usesSocial = (campaign.draft.brief?.channelIds ?? []).some((c) => ['reels', 'social', 'ads'].includes(c))
  let socialConnected = true
  if (usesSocial) {
    try {
      const { data: conns } = await admin.from('platform_connections').select('platform, status').eq('client_id', clientId)
      socialConnected = (conns ?? []).some((c) => ['instagram', 'facebook'].includes(c.platform as string) && (c.status as string) === 'connected')
    } catch { socialConnected = true }
  }

  // Best-effort "already set up" signals + menu presence, so we skip needs that are handled and
  // pre-satisfy others. Never block the report on these — mirror the socialConnected try/catch.
  const doneSetup = new Set<string>()
  let hasMenuItems = false
  // Card on file? Pieces bill as they publish (campaign_charges accrual), so the ready
  // page asks for a payment method up front. billing_customers is the webhook-fresh
  // mirror of the Stripe default payment method. Default true on any read failure so
  // a billing hiccup never nags the owner falsely.
  let hasPaymentMethod = true
  try {
    const [chanRes, socRes, menuRes, payRes] = await Promise.all([
      admin.from('channel_connections').select('channel').eq('client_id', clientId).eq('status', 'active'),
      admin.from('social_connections').select('platform').eq('client_id', clientId).eq('sync_status', 'active'),
      admin.from('menu_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      admin.from('billing_customers').select('default_payment_method_id, payment_method_last4').eq('client_id', clientId).maybeSingle(),
    ])
    if (((chanRes.data ?? []) as { channel?: string }[]).some((c) => c.channel === 'google_business_profile')) { doneSetup.add('gbp-setup'); doneSetup.add('review-claim') }
    if (((socRes.data ?? []) as { platform?: string }[]).some((s) => s.platform === 'instagram' || s.platform === 'facebook')) doneSetup.add('channel-connect')
    hasMenuItems = (menuRes.count ?? 0) > 0
    const pay = payRes.data as { default_payment_method_id?: string | null; payment_method_last4?: string | null } | null
    hasPaymentMethod = !!(pay && (pay.default_payment_method_id || pay.payment_method_last4))
  } catch { /* best-effort */ }
  const hasAddress = typeof biz?.address === 'string' && (biz.address as string).trim().length > 0

  const items: ReadinessItem[] = []

  // ── content inputs (persist to campaigns.execution, feed the brief) ──────────
  // DIY campaigns mint no creator orders/brief, so these inputs would be dead
  // data — DIY readiness is action-only (schedule, channels, brand/contact).
  // Same for service-only plans (a Google-profile fix, listings sync): nothing
  // creative is being made, so "what should we feature" would be a dead ask.
  const isDiy = campaign.draft.path === 'diy'
  const hasContentWork = (campaign.draft.brief?.contentBeats?.length ?? 0) > 0
    || (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && /^content-/.test(it.serviceId ?? ''))
  if (!isDiy && hasContentWork) {
    // Seed from the madlib answers so these read as a CONFIRM, not a from-scratch re-ask — the owner
    // already named the dish and offer once. done still requires the saved execution value.
    const specFeature = campaign.draft.brief?.spec?.feature?.trim() || ''
    items.push({ id: 'featuring', kind: 'input', group: 'Content', field: 'featuring', inputType: 'text', title: 'What should we feature?', why: 'The exact dish or item the content should show off.', placeholder: 'e.g. our birria tacos', value: exec.featuring ?? specFeature, done: !!exec.featuring })
    if (offerLabel) {
      items.push({ id: 'offerText', kind: 'input', group: 'Content', field: 'offerText', inputType: 'text', title: 'Confirm the offer wording', why: 'The exact text + any terms, so the copy is right.', placeholder: offerLabel, value: exec.offerText ?? offerLabel, done: !!exec.offerText })
    }
    items.push({ id: 'mustSay', kind: 'input', group: 'Content', field: 'mustSay', inputType: 'textarea', title: 'Anything we must include?', why: 'A tagline, a hashtag, a date — anything that has to be in it.', placeholder: 'Optional', value: exec.mustSay ?? '', done: !!exec.mustSay, optional: true })
    items.push({ id: 'avoid', kind: 'input', group: 'Content', field: 'avoid', inputType: 'textarea', title: 'Anything to avoid?', why: 'Words, claims, or looks to keep out.', placeholder: 'Optional', value: exec.avoid ?? '', done: !!exec.avoid, optional: true })
  }

  // ── scheduling: only CONTENT campaigns have a "go live" the owner schedules. A pure
  // service fix (Google-profile polish, listings sync) is done when it is done — there is
  // no launch date to pick, so asking one just confuses. ──
  if (hasContentWork) items.push({ id: 'go_live', kind: 'input', group: 'Scheduling', field: 'go_live', inputType: 'date', saveTo: 'target_date', title: 'When do you want to go live?', why: 'Pick a target so the team has runway to produce.', value: campaign.draft.targetDate ?? '', done: scheduleSet })

  // ── service-driven needs: only what THIS campaign's services require ──
  for (const n of deriveServiceNeeds(campaign, { doneSetup, hasMenuItems, hasAddress, hasPaymentMethod, exec })) {
    if (items.some((i) => i.id === n.id || (n.field && i.field === n.field))) continue
    items.push(n)
  }

  // ── computed actions (only when needed) ───────────────────────────────────────
  if (pendingConcepts > 0) items.push({ id: 'concepts', kind: 'action', group: 'Anything else', title: `Approve ${pendingConcepts} concept${pendingConcepts > 1 ? 's' : ''}`, why: 'The creators are waiting on your OK before they produce.', actionLabel: 'Review', href: detailHref, done: false })
  if (awaiting > 0) items.push({ id: 'review', kind: 'action', group: 'Anything else', title: `Review ${awaiting} piece${awaiting > 1 ? 's' : ''}`, why: 'Pieces are ready for your approval before they post.', actionLabel: 'Review', href: detailHref, done: false })
  // "Connect Instagram" only matters when we are actually making something to post to
  // your feed. A service fix can carry leftover social channel tags on its brief, so gate
  // on real content work — not just the tag.
  if (usesSocial && hasContentWork && !socialConnected && !doneSetup.has('channel-connect') && !items.some((i) => i.id === 'gbp-access')) items.push({ id: 'connect', kind: 'action', group: 'Access', title: 'Connect Instagram', why: 'So this campaign can actually post to your feed.', actionLabel: 'Connect', href: '/dashboard/connected-accounts', done: false })

  // NOTE: general profile completeness ("Add your brand details", "Add your hours + link")
  // was removed from a campaign's "needs you" on purpose. Those are not required to fulfill
  // THIS campaign — they belong on /dashboard/business-info, not mixed into the order's asks.
  // Keep this list to what the team actually needs to deliver what was bought.

  // ── owner's per-campaign "needs from you" config (LIVE): resolve the catalog product this order
  // came from, then apply Required/Optional/Off overrides to the auto asks + append custom asks. ──
  const catalogId = (catRes.data as { source_catalog_id?: string | null } | null)?.source_catalog_id || null
  if (catalogId) {
    try {
      // Built-in campaigns store needs on catalog_content_overrides; admin-created DB campaigns on
      // catalog_campaigns (migration 220, G10). Check the override first, then the DB campaign.
      const { data: ovRow } = await admin.from('catalog_content_overrides').select('needs').eq('item_id', catalogId).maybeSingle()
      let needs = cleanNeeds((ovRow as { needs?: unknown } | null)?.needs)
      if (!needs) {
        const { data: dbRow } = await admin.from('catalog_campaigns').select('needs').eq('id', catalogId).maybeSingle()
        needs = cleanNeeds((dbRow as { needs?: unknown } | null)?.needs)
      }
      if (needs) applyNeedsConfig(items, needs, exec as unknown as Record<string, string>)
    } catch { /* smart defaults on any failure */ }
  }

  // Setup actions the owner chose to defer ("Skip for now") drop out of the required count, so they can
  // finish their part without connecting accounts right now — each stays visible to undo. The in-campaign
  // work actions (approve concepts / review pieces) are the real work and are never skippable.
  const skipped = new Set((exec.setupSkipped ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  // Skippable is now an ALLOWLIST: only an item explicitly marked optional can be deferred.
  //
  // This was a denylist naming three ids, which meant every new required step arrived
  // skippable by default and nobody had to notice. A required thing offering "Skip for
  // now" is a contradiction: either it is genuinely needed, and the button is a trap that
  // strands the campaign, or it is not, and it should not be required. Whoever adds the
  // next required step should not have to remember to defend against this.
  //
  // Items declare `optional: true` at the point they are created (service-needs.ts), which
  // is where the person writing the ask knows whether it can wait.
  for (const it of items) {
    if (it.kind !== 'action') continue
    it.skippable = it.optional === true
    if (it.skippable && skipped.has(it.id)) it.skipped = true
  }

  const required = items.filter((i) => !i.optional && !i.skipped)
  return { campaignName: campaign.draft.name, items, done: required.filter((i) => i.done).length, total: required.length, doneSetupIds: Array.from(doneSetup) }
}

/** Apply the owner's per-campaign needs config: Required/Optional/Off overrides on the auto-detected
 *  asks (by id), plus their own custom asks appended. Mutates `items` in place. */
function applyNeedsConfig(items: ReadinessItem[], needs: CampaignNeedsConfig, exec: Record<string, string>): void {
  if (needs.overrides) {
    for (let i = items.length - 1; i >= 0; i--) {
      const ov = needs.overrides[items[i].id]
      if (!ov) continue
      if (ov === 'off') items.splice(i, 1)
      else if (ov === 'required') items[i].optional = false
      else if (ov === 'optional') items[i].optional = true
    }
  }
  for (const c of needs.custom ?? []) {
    if (items.some((it) => it.id === c.id)) continue
    const value = exec[c.id] ?? ''
    items.push({
      id: c.id, kind: 'input', group: 'From you', field: c.id, inputType: c.inputType,
      options: c.options, title: c.title, why: c.why ?? '',
      value, done: value.trim().length > 0, optional: !c.required,
    })
  }
}
