/**
 * Stripe Connect ONBOARDING for marketplace vendors (G5) — the missing half of the payout rail.
 * sendCreatorPayout (vendor-supply.ts) already moves money to vendors.stripe_account_id; this creates
 * that connected account and the Stripe-hosted onboarding link, and reads back whether payouts are
 * enabled. Server-only.
 *
 * TEST MODE + FLAG: gated on STRIPE_CONNECT_PAYOUTS='1' (set only in preview/test), the SAME flag that
 * gates sending a payout — so a vendor can never be onboarded for real money on an un-flagged env, and
 * the `stripe` client's key (test) decides mode. Idempotent: an existing stripe_account_id is reused.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

const FLAG = () => process.env.STRIPE_CONNECT_PAYOUTS === '1'

export interface VendorConnectStatus {
  hasAccount: boolean
  detailsSubmitted: boolean
  payoutsEnabled: boolean
  chargesEnabled: boolean
  accountId: string | null
}

/** Ensure a Stripe Express connected account exists for the vendor; returns its id. Idempotent —
 *  reuses vendors.stripe_account_id when present. Requires the Connect flag + test Stripe key. */
export async function ensureVendorConnectAccount(vendorId: string): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  if (!FLAG()) return { ok: false, error: 'Connect onboarding is not enabled yet (set STRIPE_CONNECT_PAYOUTS=1 in the preview env).' }
  const admin = createAdminClient()
  const { data: v, error } = await admin.from('vendors').select('id, name, stripe_account_id').eq('id', vendorId).maybeSingle()
  if (error || !v) return { ok: false, error: 'Vendor not found.' }
  const existing = (v.stripe_account_id as string | null) ?? null
  if (existing) return { ok: true, accountId: existing }
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { vendor_id: vendorId, apnosh: 'creator' },
    })
    const { error: upErr } = await admin.from('vendors').update({ stripe_account_id: account.id }).eq('id', vendorId).is('stripe_account_id', null)
    if (upErr) return { ok: false, error: `Created the account but failed to save it: ${upErr.message}` }
    return { ok: true, accountId: account.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the connected account.' }
  }
}

/** Create a Stripe-hosted onboarding link for the vendor (ensures the account first). The vendor opens
 *  the returned url to complete Stripe onboarding (identity, bank). Links are single-use + short-lived. */
export async function createVendorOnboardingLink(vendorId: string, origin: string): Promise<{ ok: true; url: string; accountId: string } | { ok: false; error: string }> {
  const acct = await ensureVendorConnectAccount(vendorId)
  if (!acct.ok) return acct
  try {
    const link = await stripe.accountLinks.create({
      account: acct.accountId,
      refresh_url: `${origin}/admin/vendors?connect=refresh`,
      return_url: `${origin}/admin/vendors?connect=done`,
      type: 'account_onboarding',
    })
    return { ok: true, url: link.url, accountId: acct.accountId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the onboarding link.' }
  }
}

/** Read whether the vendor can receive payouts yet (Stripe account status). Never throws. */
export async function getVendorConnectStatus(vendorId: string): Promise<VendorConnectStatus> {
  const none: VendorConnectStatus = { hasAccount: false, detailsSubmitted: false, payoutsEnabled: false, chargesEnabled: false, accountId: null }
  try {
    const admin = createAdminClient()
    const { data: v } = await admin.from('vendors').select('stripe_account_id').eq('id', vendorId).maybeSingle()
    const accountId = (v?.stripe_account_id as string | null) ?? null
    if (!accountId) return none
    if (!FLAG()) return { ...none, hasAccount: true, accountId }   // can't query Stripe without the flag/key
    const acct = await stripe.accounts.retrieve(accountId)
    return {
      hasAccount: true,
      accountId,
      detailsSubmitted: !!acct.details_submitted,
      payoutsEnabled: !!acct.payouts_enabled,
      chargesEnabled: !!acct.charges_enabled,
    }
  } catch {
    return none
  }
}
