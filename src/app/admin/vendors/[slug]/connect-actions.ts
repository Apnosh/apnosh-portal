'use server'

/**
 * Admin actions for a vendor's Stripe Connect PAYOUT onboarding (G5). Start the Stripe-hosted
 * onboarding (creates the connected account + a single-use link) and read back whether payouts are
 * enabled. Gated by STRIPE_CONNECT_PAYOUTS (set only in preview/test) inside the lib; admin-only here.
 */
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createVendorOnboardingLink, getVendorConnectStatus, type VendorConnectStatus } from '@/lib/campaigns/vendor-connect'

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role as string)) return { ok: false, error: 'Admin access required' }
  return { ok: true }
}

async function origin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

export async function startVendorOnboarding(vendorId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const r = await createVendorOnboardingLink(vendorId, await origin())
  return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error }
}

export async function refreshVendorConnectStatus(vendorId: string): Promise<{ ok: true; status: VendorConnectStatus } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  return { ok: true, status: await getVendorConnectStatus(vendorId) }
}
