import 'server-only'
/**
 * requests/bridge — accepted request → real work order.
 *
 * When an owner accepts a quote, the request stops being a conversation and
 * becomes work. Rather than growing a second, weaker fulfillment rail, we mint
 * a creator_work_orders row (the same spine bookings use: delivery requires a
 * link, the owner approves, approval drives money) keyed 'request:<id>' so the
 * mint is idempotent. The order is assigned to the house Apnosh vendor; admins
 * can reassign through the existing dispatch machinery.
 *
 * Never throws — an accept must never fail because the bridge did.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  requestTypeById, questionsFor, disciplineForRequestType,
  type RequestAnswers, type RequestAttachment,
} from '@/lib/requests/catalog'

interface RequestRowForMint {
  id: string
  client_id: string
  type: string
  brief: RequestAnswers
  attachments?: RequestAttachment[] | null
  due_date?: string | null
  quote_cents?: number | null
  team_note?: string | null
}

/** The brief a fulfiller reads: every question in the owner's words, then files. */
function briefText(row: RequestRowForMint): string {
  const type = requestTypeById(row.type)
  const lines: string[] = []
  if (type) {
    const prompts = new Map(questionsFor(type).map((q) => [q.id, q.prompt]))
    for (const [k, v] of Object.entries(row.brief ?? {})) {
      if (typeof v === 'string' && v.trim()) lines.push(`${prompts.get(k) ?? k}: ${v}.`)
    }
  }
  const files = Array.isArray(row.attachments) ? row.attachments : []
  if (files.length) lines.push(`Files from the owner: ${files.map((f) => `${f.name} ${f.url}`).join(' · ')}`)
  if (row.team_note?.trim()) lines.push(`Quoted plan: ${row.team_note.trim()}`)
  return lines.join(' ') || `${type?.label ?? 'Creative'} request.`
}

/**
 * Mint the work order for an ACCEPTED creative request. Idempotent on
 * campaign_piece_key 'request:<id>'. Returns the order id, or null when the
 * house vendor can't be resolved or the insert fails (the accept still stands —
 * the admin queue shows the request either way).
 */
export async function mintRequestWorkOrder(row: RequestRowForMint, opts?: { vendorId?: string }): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const key = `request:${row.id}`

    const { data: existing } = await admin
      .from('creator_work_orders')
      .select('id')
      .eq('campaign_piece_key', key)
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing.id as string

    // A chosen marketplace creator fulfills when the owner picked one (must be
    // a real bookable non-house vendor); otherwise the house vendor does,
    // until an admin reassigns.
    let vendor: { id: string } | null = null
    if (opts?.vendorId) {
      const { data: chosen } = await admin
        .from('vendors')
        .select('id')
        .eq('id', opts.vendorId)
        .eq('bookable', true)
        .neq('vendor_type', 'apnosh')
        .maybeSingle()
      if (chosen?.id) vendor = { id: chosen.id as string }
    }
    if (!vendor) {
      const { data: house } = await admin
        .from('vendors')
        .select('id')
        .eq('vendor_type', 'apnosh')
        .limit(1)
        .maybeSingle()
      if (house?.id) vendor = { id: house.id as string }
    }
    if (!vendor?.id) {
      console.error('[requests] no house vendor (vendor_type=apnosh); accept stands without a work order')
      return null
    }

    const type = requestTypeById(row.type)
    const orderRow: Record<string, unknown> = {
      campaign_id: null,
      client_id: row.client_id,
      creator_id: vendor.id,
      vendor_id: vendor.id,
      discipline: disciplineForRequestType(row.type),
      slot: 0,
      title: `${type?.label ?? 'Creative'} · request`,
      brief: briefText(row),
      due_date: row.due_date ?? null,
      status: 'accepted',
      concept_status: 'approved',
      amount_cents: Math.max(0, row.quote_cents ?? 0),
      campaign_piece_key: key,
      surcharge_cents: 0,
    }

    let { data, error } = await admin.from('creator_work_orders').insert(orderRow).select('id').single()
    if (error && (error as { code?: string }).code === '42703') {
      const stripped = { ...orderRow }; delete stripped.surcharge_cents
      ;({ data, error } = await admin.from('creator_work_orders').insert(stripped).select('id').single())
    }
    if (error && (error as { code?: string }).code === '23505') {
      const { data: ex } = await admin
        .from('creator_work_orders').select('id').eq('campaign_piece_key', key).maybeSingle()
      return (ex?.id as string) ?? null
    }
    if (error || !data) {
      console.error('[requests] work-order mint failed', error?.message)
      return null
    }
    return data.id as string
  } catch (e) {
    console.error('[requests] work-order mint threw', e)
    return null
  }
}
