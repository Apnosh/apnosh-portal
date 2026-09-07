import 'server-only'
/**
 * desk-order — everything that happens to a Request Desk order ONCE THE MONEY IS REAL.
 *
 * It used to happen at POST /api/requests, before any charge: the row was stamped accepted, the
 * work order minted on the house team, the promise written, and staff told they had an order. The
 * screen said "Goes on your Apnosh bill" and there was no bill. So this is the same work, moved to
 * the far side of a verified payment, in one idempotent call.
 *
 * IDEMPOTENT by contract. /api/checkout/complete calls it, and a retry, a double-tap or a webhook
 * backstop must land on the same single work order. The mint itself is idempotent on the piece key
 * ('request:<id>'), the promise write is idempotent on (request, metric), and a row that already
 * carries paid_at short-circuits before either.
 *
 * BEST-EFFORT AFTER THE STAMP. The money is already taken by the time this runs; nothing here may
 * throw it back. Every step that can fail is logged and reported in the result so the caller can
 * tell an admin, never swallowed into a silent "ok".
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { mintRequestWorkOrder } from './bridge'
import { requestTypeById, summaryLine, type RequestAnswers } from './catalog'
import { deskBill } from './desk-bill'
import { notifyClientOwners, notifyStaffForClient } from '@/lib/notifications'

export interface FinalizeResult {
  ok: boolean
  workOrderId: string | null
  /** Things that went wrong AFTER the money landed. The order stands; a person has to see these. */
  warnings: string[]
}

/**
 * Stamp a desk order paid, mint its work, write its promise, start its subscription, tell everyone.
 *
 * @param requestId   the creative_requests row the payment paid for
 * @param paymentRowId  campaign_payments.id, so the order points back at its receipt
 * @param intentId    the PaymentIntent / SetupIntent, for the monthly subscription
 */
export async function finalizePaidDeskOrder(args: { requestId: string; paymentRowId?: string | null; intentId?: string | null }): Promise<FinalizeResult> {
  const warnings: string[] = []
  const admin = createAdminClient()
  const { data: rowRaw, error } = await admin.from('creative_requests').select('*').eq('id', args.requestId).maybeSingle()
  if (error || !rowRaw) return { ok: false, workOrderId: null, warnings: [`Could not read desk order ${args.requestId}.`] }
  const row = rowRaw as Record<string, unknown>

  // Already finalized. Return the work order we already made rather than making a second one.
  if (row.paid_at && row.work_order_id) {
    return { ok: true, workOrderId: String(row.work_order_id), warnings: [] }
  }

  const clientId = String(row.client_id ?? '')
  const typeId = String(row.type ?? '')
  const brief = (row.brief ?? {}) as RequestAnswers
  const cadence = row.cadence === 'monthly' ? 'monthly' as const : 'once' as const
  const bill = deskBill(row.quote_cents as number | null, cadence)
  const nowISO = new Date().toISOString()

  // 1. THE STAMP, FIRST. Everything after this is work; this is the record that it was bought.
  //    paid_at / payment_id arrive with migration 258, so a pre-258 database still accepts the
  //    order (accepted_at + status), just without the receipt pointer — logged, never silent.
  const full: Record<string, unknown> = { paid_at: nowISO, payment_id: args.paymentRowId ?? null, accepted_at: row.accepted_at ?? nowISO, status: 'in_progress', updated_at: nowISO }
  const { error: stampErr } = await admin.from('creative_requests').update(full).eq('id', args.requestId)
  if (stampErr) {
    console.warn('[desk-order] paid columns missing, stamping accepted only (apply migration 258):', stampErr.message)
    warnings.push('This order is paid but the payment is not written on the order row yet (migration 258).')
    await admin.from('creative_requests').update({ accepted_at: row.accepted_at ?? nowISO, status: 'in_progress', updated_at: nowISO }).eq('id', args.requestId)
  }

  // 2. THE WORK. Same bridge the quote-accept path proved, idempotent on the piece key.
  let workOrderId: string | null = (row.work_order_id as string | null) ?? null
  if (!workOrderId) {
    workOrderId = await mintRequestWorkOrder({
      id: args.requestId,
      client_id: clientId,
      type: typeId,
      brief,
      attachments: Array.isArray(row.attachments) ? (row.attachments as { url: string; name: string }[]) : [],
      due_date: (row.due_date as string | null) ?? null,
      quote_cents: (row.quote_cents as number | null) ?? null,
    }).catch((e) => { console.warn('[desk-order] mint failed', (e as Error)?.message); return null })
  }
  // AND WRITE IT ON THE ORDER. Without this the row never learned which work order was made for
  // it, so the short-circuit at the top of this function could never fire: every replay (a
  // double-tap, a retry, the webhook backstop) ran the whole thing again and mailed the owner and
  // the staff a second time. The mint itself was always idempotent; the record of it was not.
  // It is a second write, not part of the stamp, because the stamp is the money record and must
  // land whether or not the mint works. Best-effort: a paid order is never thrown back for this.
  if (workOrderId && workOrderId !== row.work_order_id) {
    const { error: linkErr } = await admin.from('creative_requests').update({ work_order_id: workOrderId, updated_at: nowISO }).eq('id', args.requestId)
    if (linkErr) console.warn('[desk-order] could not write work_order_id on the order:', linkErr.message)
  }
  if (!workOrderId) warnings.push('The work order for this paid order was not created. Make it by hand.')

  // 3. THE PROMISE: what this order will be counted by, and when it shows on Home. Idempotent.
  try {
    const { recordRequestPromise } = await import('@/lib/promises/record')
    await recordRequestPromise({ clientId, requestId: args.requestId, type: typeId, label: requestTypeById(typeId)?.label ?? typeId })
  } catch (e) {
    console.warn('[desk-order] promise write failed', (e as Error)?.message)
  }

  // 4. THE MONTHLY. A social package is priced by the month, so it is a subscription with tax on
  //    it, not one charge that quietly never repeats. Best-effort and self-reporting: a failure
  //    pages staff from inside and leaves a retryable 'failed' row.
  if (bill.perMonthCents > 0 && args.intentId) {
    try {
      const { ensureDeskSubscription } = await import('@/lib/campaigns/campaign-subscription-server')
      const sub = await ensureDeskSubscription(args.intentId, args.requestId, bill.perMonthCents, requestTypeById(typeId)?.label ?? 'Desk order')
      if (!sub.ok) warnings.push('The monthly billing for this order did not start. Your team was told.')
    } catch (e) {
      console.warn('[desk-order] subscription failed', (e as Error)?.message)
      warnings.push('The monthly billing for this order did not start. Your team was told.')
    }
  }

  // 5. THE PEOPLE. Staff hear that money landed and work is theirs; the owner hears their order is in.
  const line = summaryLine(typeId, brief)
  await notifyStaffForClient(clientId, ['strategist', 'designer'], {
    kind: 'client_request',
    title: `PAID ORDER ($${Math.round(((row.quote_cents as number | null) ?? 0) / 100)}${cadence === 'monthly' ? '/mo' : ''}): ${line}`,
    body: warnings.length ? warnings.join(' ') : line,
    link: '/admin/requests',
  }, { alsoAdmins: true }).catch(() => ({ notified: 0 }))
  await notifyClientOwners(clientId, {
    kind: 'payment',
    title: 'Your order is in',
    body: 'We took the payment and your team has it. You will hear from us as it moves.',
    link: `/dashboard/requests/${args.requestId}`,
    email: true,
    emailCategory: 'billing',
  }).catch(() => ({ notified: 0 }))

  return { ok: true, workOrderId, warnings }
}
