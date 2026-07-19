/**
 * Admin creator/vendor detail — manage one creator's profile (name, bio, craft,
 * avatar, active/paused), their portfolio, and see their real delivered-work
 * ratings (work_ratings): the live aggregate + recent comments. Ratings are
 * computed from real rows only; a creator with none shows "No ratings yet".
 *
 * Reads the vendors row directly (not getVendorBySlug) so a PAUSED creator is
 * still editable here — the public reader filters bookable=true by design.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Star } from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVendorPortfolio } from '@/lib/marketplace/portfolio'
import { creatorRatingAggregate, recentRatingsForCreator } from '@/lib/campaigns/work-ratings'
import { ratingLabel } from '@/lib/campaigns/work-ratings-core'
import PortfolioManager from './portfolio-manager'
import ProfileEditor from './profile-editor'
import ConnectPayouts from './connect-payouts'
import { getVendorConnectStatus } from '@/lib/campaigns/vendor-connect'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

interface VendorRow {
  id: string
  slug: string
  name: string
  vendor_type: 'individual' | 'company' | 'apnosh'
  description: string | null
  logo_url: string | null
  craft: string | null
  tier: string
  bookable: boolean
  verified: boolean
  service_area: string[] | null
  person_id: string | null
}

interface ListingRow {
  id: string
  title: string
  price_cents: number | null
  billing_period: string | null
}

export default async function AdminVendorDetailPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle() as { data: { role: string } | null }
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: vendor } = await admin
    .from('vendors')
    .select('id, slug, name, vendor_type, description, logo_url, craft, tier, bookable, verified, service_area, person_id')
    .eq('slug', slug)
    .maybeSingle() as { data: VendorRow | null }
  if (!vendor) notFound()

  const [portfolio, listingsRes, agg, recent] = await Promise.all([
    getVendorPortfolio(vendor.id),
    admin
      .from('vendor_listings')
      .select('id, title, price_cents, billing_period')
      .eq('vendor_id', vendor.id)
      .eq('active', true) as unknown as Promise<{ data: ListingRow[] | null }>,
    creatorRatingAggregate(vendor.id),
    recentRatingsForCreator(vendor.id, 10),
  ])
  const connectStatus = await getVendorConnectStatus(vendor.id).catch(() => ({ hasAccount: false, detailsSubmitted: false, payoutsEnabled: false, chargesEnabled: false, accountId: null }))
  const listings = listingsRes.data ?? []

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <Link
        href="/admin/vendors"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All creators
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin · creator</p>
          <h1 className="text-[24px] font-semibold text-ink mt-1">{vendor.name}</h1>
          <p className="text-ink-3 text-sm mt-0.5">
            {vendor.vendor_type} · {vendor.tier} · {(vendor.service_area ?? []).join(', ')}
            {!vendor.bookable && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">Paused</span>}
            {!vendor.person_id && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded" title="No login linked — cannot receive work">No login</span>}
          </p>
          <p className="text-[13px] text-ink-2 mt-1.5 inline-flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <span className="font-semibold">{ratingLabel(agg)}</span>
            <span className="text-ink-3 text-[11px]">from real delivered work</span>
          </p>
        </div>
        <Link
          href={`/marketplace/${vendor.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
        >
          View public profile <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <ProfileEditor
        vendorSlug={vendor.slug}
        name={vendor.name}
        description={vendor.description}
        craft={vendor.craft}
        logoUrl={vendor.logo_url}
        bookable={vendor.bookable}
      />

      {/* Stripe Connect payout onboarding (G5) — a vendor must finish this before a payout can be sent. */}
      <ConnectPayouts vendorId={vendor.id} initial={connectStatus} />

      {/* Ratings: real rows only. Empty state is honest, never a placeholder. */}
      <div className="bg-white border border-ink-6 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Ratings {agg ? `(${agg.count})` : ''}
        </p>
        {recent.length === 0 ? (
          <p className="text-[12px] text-ink-3">No ratings yet. Ratings come from clients rating delivered work.</p>
        ) : (
          <ul className="space-y-2.5">
            {recent.map(r => (
              <li key={r.id} className="border-b border-ink-7 last:border-0 pb-2.5 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-amber-500" aria-label={`${r.stars} of 5 stars`}>
                    {'★'.repeat(r.stars)}<span className="text-ink-6">{'★'.repeat(5 - r.stars)}</span>
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {r.orderTitle ?? 'A piece'}{r.campaignName ? ` · ${r.campaignName}` : ''}
                  </span>
                  <span className="ml-auto text-[10.5px] text-ink-3 tabular-nums">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </span>
                </div>
                {r.comment && <p className="text-[12.5px] text-ink-2 mt-1">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PortfolioManager vendorSlug={vendor.slug} portfolio={portfolio} />

      <div className="bg-white border border-ink-6 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">Listings ({listings.length})</p>
        <ul className="space-y-1.5">
          {listings.map(l => (
            <li key={l.id} className="flex justify-between text-[13px]">
              <span className="text-ink">{l.title}</span>
              <span className="text-ink-3 tabular-nums">
                {l.price_cents !== null ? `$${(l.price_cents / 100).toFixed(0)}${l.billing_period === 'monthly' ? '/mo' : ''}` : 'Quote'}
              </span>
            </li>
          ))}
          {listings.length === 0 && (
            <li className="text-[12px] text-ink-3">No listings yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
