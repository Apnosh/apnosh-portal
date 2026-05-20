/**
 * Admin vendor detail — manage profile + portfolio for one vendor.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVendorBySlug } from '@/lib/dashboard/get-marketplace'
import { getVendorPortfolio } from '@/lib/marketplace/portfolio'
import PortfolioManager from './portfolio-manager'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
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

  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()
  const portfolio = await getVendorPortfolio(vendor.id)

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <Link
        href="/admin/vendors"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All vendors
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin · vendor</p>
          <h1 className="text-[24px] font-semibold text-ink mt-1">{vendor.name}</h1>
          <p className="text-ink-3 text-sm mt-0.5">
            {vendor.vendorType} · {vendor.tier} · {vendor.serviceArea.join(', ')}
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

      <PortfolioManager vendorSlug={vendor.slug} portfolio={portfolio} />

      <div className="bg-white border border-ink-6 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">Listings ({vendor.listings.length})</p>
        <ul className="space-y-1.5">
          {vendor.listings.map(l => (
            <li key={l.id} className="flex justify-between text-[13px]">
              <span className="text-ink">{l.title}</span>
              <span className="text-ink-3 tabular-nums">
                {l.priceCents !== null ? `$${(l.priceCents / 100).toFixed(0)}${l.billingPeriod === 'monthly' ? '/mo' : ''}` : 'Quote'}
              </span>
            </li>
          ))}
          {vendor.listings.length === 0 && (
            <li className="text-[12px] text-ink-3">No listings yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
