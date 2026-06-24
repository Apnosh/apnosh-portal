/**
 * Server-side ship-integration sim: exercises the REAL ship path (createCampaign
 * → materializeCampaignDrafts → mintWorkOrders → updateWorkOrder status machine)
 * with the admin client, asserting the cross-module invariants that the pure
 * harness and the table-only db-e2e cannot see together. Spins up a throwaway
 * campaign and cascade-deletes it. Powers the /admin/sim button.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaign, materializeCampaignDrafts } from '../server'
import { mintWorkOrders, listWorkOrdersForCampaign, updateWorkOrder, IllegalTransition } from '../work-orders'
import { buildWorkOrderRows } from '../work-orders-core'
import { reconcileBeatsToLines, buildContentLine } from '../catalog'
import type { CampaignBrief, CampaignDraft, ContentBeat, LineItem } from '../types'
import type { SavedCampaign } from '../view'

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'

export interface SimCheck { name: string; ok: boolean; detail?: string }
export interface ShipSimReport { ok: boolean; checks: SimCheck[]; ranAt: string }

export async function runShipIntegrationSim(): Promise<ShipSimReport> {
  const checks: SimCheck[] = []
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }) }
  const admin = createAdminClient()
  let campaignId: string | null = null

  try {
    // 2 reels + 1 photo + 1 post → Video (2 pieces), Photo, Design.
    const items: LineItem[] = [
      buildContentLine('reel', 'li-r', { qty: 2 })!,
      buildContentLine('photo', 'li-p')!,
      buildContentLine('post', 'li-g')!,
    ]
    const beats: ContentBeat[] = [
      { week: 1, type: 'reel', label: 'Reel one', channel: 'instagram' },
      { week: 2, type: 'reel', label: 'Reel two', channel: 'instagram' },
      { week: 2, type: 'photo', label: 'Hero dish', channel: 'instagram' },
      { week: 3, type: 'post', label: 'Promo post', channel: 'instagram' },
    ]
    const targetDate = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)
    const brief = { templateId: 'sim', objective: 'Test launch', contentBeats: beats } as unknown as CampaignBrief
    const draft = { id: '', name: 'ADMIN_SIM_DELETE_ME', path: 'strategist', items, goalKey: 'launch', occasion: 'launch night', targetDate, brief } as unknown as CampaignDraft

    campaignId = await createCampaign(TEST_CLIENT, null, draft)
    add('createCampaign returns an id', !!campaignId, campaignId ?? 'no id')
    if (!campaignId) return { ok: false, checks, ranAt: new Date().toISOString() }

    const saved: SavedCampaign = {
      clientId: TEST_CLIENT, draft: { ...draft, id: campaignId }, phase: 'build', status: 'draft',
      shippedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), creatorChoices: {},
    }
    const shipISO = new Date().toISOString()
    const shipDay = shipISO.slice(0, 10)

    const reconciled = reconcileBeatsToLines(saved.draft.items, beats)
    const expectedOrders = buildWorkOrderRows(saved, shipISO).length

    // The REAL ship path.
    const made = await materializeCampaignDrafts(campaignId, TEST_CLIENT, saved.draft, shipISO)
    const minted = await mintWorkOrders(saved, shipISO)
    add('materialized drafts == reconciled calendar (bill=calendar=production)', made === reconciled.length, `made=${made} beats=${reconciled.length}`)
    add('minted orders == expected per-piece count', minted === expectedOrders, `minted=${minted} expected=${expectedOrders}`)

    const orders = await listWorkOrdersForCampaign(campaignId)
    add('orders persisted to the table', orders.length === minted, `${orders.length}`)
    add('two Video orders (per-piece, not collapsed)', orders.filter((o) => o.discipline === 'Video').length === 2)
    add('no order due date is in the past', orders.every((o) => !o.dueDate || o.dueDate >= shipDay), orders.map((o) => o.dueDate).join(','))

    // Real status machine + guard.
    const first = orders[0]
    if (first) {
      await updateWorkOrder(first.id, { status: 'accepted' })
      await updateWorkOrder(first.id, { status: 'in_progress' })
      await updateWorkOrder(first.id, { status: 'delivered', delivered_url: 'https://example.com/work.mp4' })
      await updateWorkOrder(first.id, { status: 'approved' })
      add('legal status walk accept → start → deliver → approve', true)

      let reopened = false
      try { await updateWorkOrder(first.id, { status: 'in_progress' }) } catch (e) { reopened = e instanceof IllegalTransition }
      add('terminal reopen rejected (approved → in_progress)', reopened)
    }
    const second = orders.find((o) => o.id !== first?.id)
    if (second) {
      await updateWorkOrder(second.id, { status: 'accepted' })
      await updateWorkOrder(second.id, { status: 'in_progress' })
      let noLink = false
      try { await updateWorkOrder(second.id, { status: 'delivered' }) } catch (e) { noLink = e instanceof IllegalTransition }
      add('deliver with no link rejected', noLink)
    }
  } catch (e) {
    add('sim ran without throwing', false, e instanceof Error ? e.message : String(e))
  } finally {
    if (campaignId) await admin.from('campaigns').delete().eq('id', campaignId)
  }

  return { ok: checks.every((c) => c.ok), checks, ranAt: new Date().toISOString() }
}
