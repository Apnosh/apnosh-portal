/**
 * get-stage-campaigns — the active campaigns that contribute to each funnel
 * stage the owner sees on the Insights page.
 *
 * A campaign is "active" when it's shipped (live). Its real line items each carry
 * a catalog stage; funnelStageForSection() folds that into one of the campaign
 * funnel's five keys (saw/clicked/reserved/turnedup/return), which map 1:1 to the
 * five insights/home funnel keys (shown/engaged/moved/camein/back). A campaign can
 * touch several stages, so it appears under each stage it actually works on.
 */

import { listCampaigns } from '@/lib/campaigns/server'
import { funnelStageForSection } from '@/lib/campaigns/funnel-plays'
import { createAdminClient } from '@/lib/supabase/admin'

/* Creative ORDERS (the request-desk order lane) also move the funnel, so they
   pin on "Did it move" and list under their stage like campaigns do. Each
   request type pushes on the stages its deliverable actually affects. */
const ORDER_TYPE_STAGES: Record<string, string[]> = {
  photos: ['shown'], video: ['shown'], graphic: ['shown'], social: ['shown', 'engaged'],
  menu: ['engaged'], logo: ['shown'], website: ['engaged'], print: ['shown'],
  copy: ['shown'], ads: ['shown'], email: ['back'],
}
/* service_id prefix → the stages that service pushes on. First match wins;
 * anything unknown (a future service) lands on Awareness rather than vanishing. */
const SERVICE_STAGES: Array<[string, string[]]> = [
  ['gbp', ['shown', 'moved']],       // Google Business setup/fixes: be found + actions
  ['google-food-order', ['moved']],  // order button: a direct action path
  ['reviews', ['back']],             // review replies/requests: retention
  ['listing', ['shown']],            // listings sync: be found
  ['friction', ['engaged']],         // website friction fixes: exploring
  ['website', ['engaged']],
  ['social', ['shown', 'engaged']],
  ['measure', ['moved']],            // measurement setups support the action stage
  ['tracking', ['moved']],           // the Get-measurable service (Analytics + Search Console)
  ['email', ['back']],
]

const ORDER_TYPE_LABEL: Record<string, string> = {
  photos: 'Photo order', video: 'Video order', graphic: 'Graphic order', social: 'Social posts order',
  menu: 'Menu order', logo: 'Logo order', website: 'Website order', print: 'Print order',
  copy: 'Copy order', ads: 'Ads order', email: 'Email order',
}

// campaign-funnel key (from funnelStageForSection) → insights/home funnel stage key
const FUNNEL_TO_INSIGHTS: Record<string, string> = {
  saw: 'shown', // Awareness (reach)
  clicked: 'engaged', // Interest (engagement / social)
  reserved: 'moved', // Customer actions (interactions)
  turnedup: 'camein', // Orders (bookings)
  return: 'back', // Retention (reputation)
}

export interface StageCampaign {
  id: string
  name: string
  /** When the campaign actually went live (campaigns.shipped_at). Null if unknown. */
  shippedAt: string | null
  /** Where a tap goes; campaigns default to /dashboard/campaigns/{id}. */
  href?: string
}

/** Active campaigns grouped by the insights stage key their live pieces work on. */
export type StageCampaigns = Record<string, StageCampaign[]>

export async function getStageCampaigns(clientId: string): Promise<StageCampaigns> {
  const out: StageCampaigns = { shown: [], engaged: [], moved: [], camein: [], back: [] }

  let campaigns
  try {
    campaigns = await listCampaigns(clientId)
  } catch {
    return out // a campaigns read failure just leaves every stage quiet
  }

  for (const c of campaigns) {
    if (c.status !== 'shipped') continue // only live campaigns are moving the numbers today
    /* DONE campaigns leave the list. Completion is not a status — the wrap-up
     * sweep stamps execution.wrapUpSentAt when every piece has delivered — so
     * without this check a finished campaign read as "working on this" forever. */
    const exec = (c.execution ?? {}) as Record<string, unknown>
    if (exec.wrapUpSentAt) continue
    // the distinct insights stages this campaign's real (included) pieces touch
    const hit = new Set<string>()
    for (const line of c.draft.items ?? []) {
      if (!line.included || line.optOut) continue
      const fk = funnelStageForSection(line.stage)
      const ins = fk ? FUNNEL_TO_INSIGHTS[fk] : undefined
      if (ins) hit.add(ins)
    }
    /* NO LIVE CAMPAIGN MAY VANISH. A future catalog section this map does not
     * know yet would otherwise make a whole campaign invisible here — the exact
     * class of silent hole the owner asked to close (2026-08-18). Awareness is
     * the honest default home: every campaign at minimum puts the business in
     * front of people. */
    if (hit.size === 0) hit.add('shown')
    for (const ins of hit) out[ins]?.push({ id: c.draft.id, name: c.draft.name, shippedAt: c.shippedAt })
  }

  // Creative orders in flight or freshly delivered join their stages.
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('creative_requests')
      .select('id, type, status, accepted_at, created_at')
      .eq('client_id', clientId)
      .in('status', ['in_progress', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(20)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const type = String(r.type ?? '')
      /* a request type this map does not know yet still shows — under Awareness,
       * with the generic label — instead of silently disappearing */
      const stages = ORDER_TYPE_STAGES[type] ?? ['shown']
      const when = (r.accepted_at ?? r.created_at) as string | null
      for (const ins of stages) {
        out[ins]?.push({
          id: String(r.id),
          name: ORDER_TYPE_LABEL[type] ?? 'Creative order',
          shippedAt: when ? String(when) : null,
          href: '/dashboard/requests',
        })
      }
    }
  } catch { /* an orders read failure never hides the campaigns */ }

  /* STANDALONE SERVICE WORK ORDERS (the store lane: GBP setup, review replies,
   * listings...). Campaign-minted ones already surface through their campaign;
   * these have campaign_id null and were invisible here entirely. Active =
   * anything not yet delivered. */
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('service_work_orders')
      .select('id, service_id, title, status, created_at, campaign_id')
      .eq('client_id', clientId)
      .is('campaign_id', null)
      .in('status', ['queued', 'claimed', 'in_progress', 'blocked_client', 'blocked_gate', 'ready_for_client'])
      .order('created_at', { ascending: false })
      .limit(20)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const sid = String(r.service_id ?? '')
      const stages = SERVICE_STAGES.find(([prefix]) => sid.startsWith(prefix))?.[1] ?? ['shown']
      for (const ins of stages) {
        out[ins]?.push({
          id: String(r.id),
          name: String(r.title ?? 'Service in progress'),
          shippedAt: r.created_at ? String(r.created_at) : null,
          href: '/dashboard/orders',
        })
      }
    }
  } catch { /* pre-migration-190 or read failure: the rest still shows */ }

  /* STANDALONE CREATOR WORK (marketplace bookings; campaign_id null). Shoots
   * and edits produce content — Awareness work by nature. */
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('creator_work_orders')
      .select('id, title, status, created_at, campaign_id')
      .eq('client_id', clientId)
      .is('campaign_id', null)
      .in('status', ['accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(20)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.shown?.push({
        id: String(r.id),
        name: String(r.title ?? 'Creator work'),
        shippedAt: r.created_at ? String(r.created_at) : null,
        href: '/dashboard/bookings',
      })
    }
  } catch { /* read failure never hides the rest */ }

  return out
}
