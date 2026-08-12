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
    // the distinct insights stages this campaign's real (included) pieces touch
    const hit = new Set<string>()
    for (const line of c.draft.items ?? []) {
      if (!line.included || line.optOut) continue
      const fk = funnelStageForSection(line.stage)
      const ins = fk ? FUNNEL_TO_INSIGHTS[fk] : undefined
      if (ins) hit.add(ins)
    }
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
      const stages = ORDER_TYPE_STAGES[type]
      if (!stages) continue
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

  return out
}
