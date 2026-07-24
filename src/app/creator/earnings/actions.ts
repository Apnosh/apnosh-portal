'use server'

/**
 * Creator payout actions — the self-onboarding half of Stripe Connect. A creator connects their OWN
 * bank through Stripe's hosted onboarding (Apnosh never sees bank details), then Apnosh transfers
 * their earnings to that connected account (sendCreatorPayout, admin/cron side). Both reuse the
 * existing Connect backend, gated on STRIPE_CONNECT_PAYOUTS (test mode only) until it's turned on.
 */

import { currentVendor } from '@/lib/marketplace/creator-schedule'
import { createVendorOnboardingLink, getVendorConnectStatus, type VendorConnectStatus } from '@/lib/campaigns/vendor-connect'

/** Start (or continue) the creator's own Stripe payout onboarding. Returns the Stripe-hosted URL to
 *  open — they enter their identity + bank on Stripe, then land back on /creator/earnings. */
export async function startMyPayoutOnboarding(origin: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const vendor = await currentVendor()
  if (!vendor) return { ok: false, error: 'You are not set up as a creator yet.' }
  const res = await createVendorOnboardingLink(vendor.id, origin, '/creator/earnings')
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, url: res.url }
}

/** Re-read the creator's live Stripe status (called after they return from onboarding). */
export async function refreshMyPayoutStatus(): Promise<VendorConnectStatus | null> {
  const vendor = await currentVendor()
  if (!vendor) return null
  return getVendorConnectStatus(vendor.id)
}
