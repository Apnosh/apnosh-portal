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

export interface ReadinessItem {
  id: string
  kind: 'input' | 'action'
  title: string
  why: string
  done: boolean
  optional?: boolean
  // input
  field?: keyof import('./view').CampaignExecution
  inputType?: 'text' | 'textarea'
  placeholder?: string
  value?: string
  // action
  actionLabel?: string
  href?: string
}

export interface ReadinessReport {
  items: ReadinessItem[]
  done: number
  total: number   // required (non-optional) items
}

export async function getCampaignReadiness(campaignId: string): Promise<ReadinessReport | null> {
  const admin = createAdminClient()
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null
  const clientId = campaign.clientId
  const exec = campaign.execution ?? {}
  const detailHref = `/dashboard/campaigns/${campaignId}`

  const [bizRes, orders, progress] = await Promise.all([
    admin.from('businesses').select('hours, phone, website_url, brand_voice_words, brand_tone, brand_colors').eq('client_id', clientId).maybeSingle(),
    listWorkOrdersForCampaign(campaignId),
    getCampaignProgress(campaignId),
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

  const items: ReadinessItem[] = []

  // ── inputs (persist to campaigns.execution, feed the brief) ──────────
  items.push({ id: 'featuring', kind: 'input', field: 'featuring', inputType: 'text', title: 'What should we feature?', why: 'The exact dish or item the content should show off.', placeholder: 'e.g. our birria tacos', value: exec.featuring ?? '', done: !!exec.featuring })
  if (offerLabel) {
    items.push({ id: 'offerText', kind: 'input', field: 'offerText', inputType: 'text', title: 'Confirm the offer wording', why: 'The exact text + any terms, so the copy is right.', placeholder: offerLabel, value: exec.offerText ?? '', done: !!exec.offerText })
  }
  items.push({ id: 'mustSay', kind: 'input', field: 'mustSay', inputType: 'textarea', title: 'Anything we must include?', why: 'A tagline, a hashtag, a date — anything that has to be in it.', placeholder: 'Optional', value: exec.mustSay ?? '', done: !!exec.mustSay, optional: true })
  items.push({ id: 'avoid', kind: 'input', field: 'avoid', inputType: 'textarea', title: 'Anything to avoid?', why: 'Words, claims, or looks to keep out.', placeholder: 'Optional', value: exec.avoid ?? '', done: !!exec.avoid, optional: true })

  // ── actions (only when needed) ───────────────────────────────────────
  if (!scheduleSet) items.push({ id: 'schedule', kind: 'action', title: 'Lock the schedule', why: 'Pick a start date so the team has runway to produce.', actionLabel: 'Set a date', href: detailHref, done: false })
  if (pendingConcepts > 0) items.push({ id: 'concepts', kind: 'action', title: `Approve ${pendingConcepts} concept${pendingConcepts > 1 ? 's' : ''}`, why: 'The creators are waiting on your OK before they produce.', actionLabel: 'Review', href: detailHref, done: false })
  if (awaiting > 0) items.push({ id: 'review', kind: 'action', title: `Review ${awaiting} piece${awaiting > 1 ? 's' : ''}`, why: 'Pieces are ready for your approval before they post.', actionLabel: 'Review', href: detailHref, done: false })
  if (usesSocial && !socialConnected) items.push({ id: 'connect', kind: 'action', title: 'Connect Instagram', why: 'So this campaign can actually post to your feed.', actionLabel: 'Connect', href: '/dashboard/connect-accounts', done: false })

  const brandThin = !((Array.isArray(biz?.brand_voice_words) && (biz!.brand_voice_words as unknown[]).length) || biz?.brand_tone || Object.keys((biz?.brand_colors as object) ?? {}).length)
  if (brandThin) items.push({ id: 'brand', kind: 'action', title: 'Add your brand details', why: 'Your voice + colors so the content matches you.', actionLabel: 'Add', href: '/dashboard/business-info', done: false })
  const contactThin = !(biz?.hours && (biz?.phone || biz?.website_url))
  if (contactThin) items.push({ id: 'contact', kind: 'action', title: 'Add your hours + link', why: 'So the content can point people where + when to find you.', actionLabel: 'Add', href: '/dashboard/business-info', done: false })

  const required = items.filter((i) => !i.optional)
  return { items, done: required.filter((i) => i.done).length, total: required.length }
}
