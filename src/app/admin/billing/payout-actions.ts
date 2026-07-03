'use server'

/**
 * Creator-payout actions for the admin billing page.
 *
 * The ledger (creator_payouts, migration 181) accrues on owner approval and
 * flips accrued→payable when the client's invoice is PAID (the invoice bridge's
 * webhook) — money-out follows money-in. These actions are the human end of the
 * rail: list what is owed, and push one payout through Stripe Connect
 * (sendCreatorPayout — env-gated, idempotent, vendor-only).
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCreatorPayout, creatorNamesByIds } from '@/lib/campaigns/vendor-supply'

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  // Same vocabulary as vendor-applications: whoever can approve a vendor can pay one.
  if (!profile || !['admin', 'super_admin'].includes(profile.role as string)) return { ok: false, error: 'Admin access required' }
  return { ok: true }
}

export interface PayoutListRow {
  id: string
  creatorId: string
  creatorName: string
  isVendor: boolean
  clientName: string
  campaignName: string
  grossCents: number
  feeCents: number
  netCents: number
  status: string
  createdAt: string
  paidAt: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Payouts for the admin card: EVERY unpaid row (a payout must never age off the
 *  only surface that can pay it), plus the recent paid history. Enriched
 *  server-side because creator_payouts.creator_id is a text id (pool or vendor
 *  UUID) with no FK — PostgREST cannot join it from the browser. */
export async function listCreatorPayouts(): Promise<{ ok: true; payouts: PayoutListRow[]; connectEnabled: boolean } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const [unpaidRes, paidRes] = await Promise.all([
    admin
      .from('creator_payouts')
      .select('id, creator_id, client_id, campaign_id, gross_cents, fee_cents, net_cents, status, created_at, paid_at')
      .in('status', ['accrued', 'payable'])
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('creator_payouts')
      .select('id, creator_id, client_id, campaign_id, gross_cents, fee_cents, net_cents, status, created_at, paid_at')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(20),
  ])
  if (unpaidRes.error) return { ok: false, error: unpaidRes.error.message }
  const rows = [...(unpaidRes.data ?? []), ...(paidRes.data ?? [])]

  const clientIds = [...new Set(rows.map((r) => r.client_id as string).filter(Boolean))]
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id as string | null).filter((v): v is string => !!v))]
  const [names, clientsRes, campsRes] = await Promise.all([
    creatorNamesByIds(rows.map((r) => (r.creator_id as string) ?? '')),
    clientIds.length ? admin.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] }),
    campaignIds.length ? admin.from('campaigns').select('id, name').in('id', campaignIds) : Promise.resolve({ data: [] }),
  ])
  const clientName = new Map(((clientsRes.data ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name || 'Client']))
  const campName = new Map(((campsRes.data ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name || 'Campaign']))

  return {
    ok: true,
    connectEnabled: process.env.STRIPE_CONNECT_PAYOUTS === '1',
    payouts: rows.map((r) => {
      const creatorId = (r.creator_id as string) ?? ''
      return {
        id: r.id as string,
        creatorId,
        creatorName: names.get(creatorId) ?? creatorId,
        isVendor: UUID.test(creatorId),
        clientName: clientName.get((r.client_id as string) ?? '') ?? 'Client',
        campaignName: campName.get((r.campaign_id as string) ?? '') ?? '—',
        grossCents: (r.gross_cents as number) ?? 0,
        feeCents: (r.fee_cents as number) ?? 0,
        netCents: (r.net_cents as number) ?? 0,
        status: (r.status as string) ?? 'accrued',
        createdAt: (r.created_at as string) ?? '',
        paidAt: (r.paid_at as string | null) ?? null,
      }
    }),
  }
}

/** Pay one payout for real (Stripe Connect transfer). All the guards live in
 *  sendCreatorPayout: env gate, vendor-only, connected account required,
 *  idempotent by payout id. */
export async function payCreatorPayout(payoutId: string): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  return sendCreatorPayout(payoutId)
}
