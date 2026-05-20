'use client'

/**
 * Marketplace v2 — multi-category vendor surface.
 *
 * Renders a featured Apnosh row first (with all 4 bundle cards), then
 * category browse chips (with counts), then a filterable grid of
 * vendor cards. Vendors can be:
 *   - Apnosh (the platform owner; "Apnosh Verified" badge)
 *   - Agencies (companies offering multiple services)
 *   - Freelancers (individuals offering one or two service categories)
 *
 * Each card links to /marketplace/[slug] (public profile + booking).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search, Sparkles, Camera, Film, Palette, Code, Megaphone, Mail,
  Newspaper, Compass, Building2, Star, MapPin, ShieldCheck, ArrowRight,
  Users,
} from 'lucide-react'
import type { MarketplaceVendor, VendorCategory } from '@/lib/dashboard/get-marketplace'

interface Props {
  vendors: MarketplaceVendor[]
  categoryCounts: Record<string, number>
}

/* Category labels + icons. Keep in sync with VendorCategory union. */
const CATEGORIES: Array<{ key: VendorCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'full_service_agency', label: 'Full-service agency', icon: Building2 },
  { key: 'food_influencer', label: 'Influencers', icon: Sparkles },
  { key: 'photographer', label: 'Photographers', icon: Camera },
  { key: 'videographer', label: 'Videographers', icon: Film },
  { key: 'graphic_designer', label: 'Graphic designers', icon: Palette },
  { key: 'web_designer', label: 'Web designers', icon: Code },
  { key: 'social_manager', label: 'Social managers', icon: Megaphone },
  { key: 'email_marketer', label: 'Email marketers', icon: Mail },
  { key: 'pr_specialist', label: 'PR specialists', icon: Newspaper },
  { key: 'local_seo', label: 'Local SEO', icon: Compass },
  { key: 'strategist', label: 'Strategists', icon: Sparkles },
]

type TypeFilter = 'all' | 'agency' | 'freelancer'

function priceLabel(cents: number | null, period: string | null): string {
  if (cents === null) return 'Quote'
  const dollars = Math.floor(cents / 100)
  if (period === 'monthly') return `$${dollars}/mo`
  if (period === 'annual') return `$${dollars}/yr`
  return `$${dollars}`
}

function categoryToLabel(c: VendorCategory): string {
  return CATEGORIES.find(cat => cat.key === c)?.label ?? c
}

export default function MarketplaceV2View({ vendors, categoryCounts }: Props) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<VendorCategory | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const apnosh = vendors.find(v => v.isApnosh)
  const otherVendors = useMemo(() => vendors.filter(v => !v.isApnosh), [vendors])

  const filtered = useMemo(() => {
    let out = otherVendors

    if (categoryFilter !== 'all') {
      out = out.filter(v => v.listings.some(l => l.category === categoryFilter))
    }

    if (typeFilter === 'agency') out = out.filter(v => v.vendorType === 'company')
    if (typeFilter === 'freelancer') out = out.filter(v => v.vendorType === 'individual')

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(v => {
        const haystack = [
          v.name,
          v.description ?? '',
          ...v.listings.map(l => l.title),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }

    return out
  }, [otherVendors, categoryFilter, typeFilter, search])

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-8">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Marketplace</p>
        <h1 className="text-[28px] font-semibold text-ink mt-1">Find help for your restaurant</h1>
        <p className="text-ink-3 text-sm mt-1">
          Agencies, freelancers, and creators in Washington — vetted and bookable.
        </p>
      </div>

      {/* Featured: Apnosh */}
      {apnosh && (
        <div className="bg-gradient-to-br from-brand-tint/60 to-white rounded-2xl border border-brand/30 p-6 shadow-sm">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-brand/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-7 h-7 text-brand-dark" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[20px] font-semibold text-ink">{apnosh.name}</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-brand text-white px-2 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  Apnosh Verified
                </span>
              </div>
              <p className="text-[13px] text-ink-2 mt-1">{apnosh.description}</p>
            </div>
            <Link
              href={`/marketplace/${apnosh.slug}`}
              className="hidden md:inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-dark hover:text-brand"
            >
              View profile <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Bundle cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {apnosh.listings.map(l => {
              const popular = (l.details as Record<string, unknown> | null)?.popular === true
              const stage = (l.details as Record<string, unknown> | null)?.stage as string | undefined
              return (
                <Link
                  key={l.id}
                  href={`/marketplace/${apnosh.slug}#${l.slug}`}
                  className="bg-white rounded-xl border border-ink-6 hover:border-brand/50 transition p-4 flex flex-col"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-[14px] font-semibold text-ink">{l.title}</p>
                    {popular && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-dark bg-brand-tint px-1.5 py-0.5 rounded">
                        Popular
                      </span>
                    )}
                  </div>
                  {stage && <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">{stage}</p>}
                  <p className="text-[20px] font-bold text-ink tabular-nums">
                    {priceLabel(l.priceCents, l.billingPeriod)}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">First month free</p>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Search + type filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors, freelancers, or services..."
            className="w-full bg-white border border-ink-6 rounded-full pl-10 pr-4 py-2.5 text-[13.5px] focus:outline-none focus:border-brand"
          />
        </div>
        <div className="flex gap-2">
          {(['all','agency','freelancer'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={[
                'px-4 py-2 rounded-full text-[12.5px] font-semibold transition',
                typeFilter === t
                  ? 'bg-ink text-white'
                  : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4',
              ].join(' ')}
            >
              {t === 'all' ? 'All' : t === 'agency' ? 'Agencies' : 'Freelancers'}
            </button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">Browse by category</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('all')}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition',
              categoryFilter === 'all'
                ? 'bg-ink text-white'
                : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4',
            ].join(' ')}
          >
            <Users className="w-3.5 h-3.5" />
            All categories
          </button>
          {CATEGORIES.filter(c => c.key !== 'full_service_agency').map(c => {
            const Icon = c.icon
            const count = categoryCounts[c.key] ?? 0
            const active = categoryFilter === c.key
            return (
              <button
                key={c.key}
                onClick={() => setCategoryFilter(c.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition',
                  active
                    ? 'bg-ink text-white'
                    : 'bg-white border border-ink-6 text-ink-2 hover:border-ink-4',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" />
                {c.label}
                {count > 0 && (
                  <span className={[
                    'text-[10px] font-semibold rounded-full px-1.5',
                    active ? 'bg-white/20 text-white' : 'bg-ink-7 text-ink-3',
                  ].join(' ')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Vendor grid */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </p>
        {filtered.length === 0 ? (
          <div className="bg-white border border-ink-6 rounded-2xl p-8 text-center">
            <p className="text-[14px] text-ink-2 mb-1">No vendors match yet.</p>
            <p className="text-[12.5px] text-ink-3">Try a different category, or check back as we onboard more vendors and freelancers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => (
              <VendorCard key={v.id} vendor={v} />
            ))}
          </div>
        )}
      </div>

      {/* Become a vendor CTA */}
      <div className="bg-ink-7/30 border border-ink-6 rounded-2xl p-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">Are you a vendor or freelancer?</p>
        <p className="text-[15px] text-ink font-medium mb-3">
          Join the Apnosh marketplace
        </p>
        <p className="text-[12.5px] text-ink-3 mb-4 max-w-md mx-auto">
          Photographers, designers, social managers, agencies, and other restaurant pros — get in front of restaurants actively shopping for help.
        </p>
        <Link
          href="/become-a-vendor"
          className="inline-flex items-center gap-2 bg-ink text-white text-[13px] font-semibold rounded-full px-5 py-2.5 hover:bg-ink-2 transition"
        >
          Apply to join
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

function VendorCard({ vendor }: { vendor: MarketplaceVendor }) {
  const startingPrice = vendor.startingPriceCents !== null
    ? `from $${Math.floor(vendor.startingPriceCents / 100)}`
    : 'Quote'

  const typeLabel = vendor.vendorType === 'company' ? 'Agency'
    : vendor.vendorType === 'individual' ? 'Freelancer'
    : 'Apnosh'

  const primaryCategory = vendor.listings[0]?.category
  const categoryLabel = primaryCategory ? categoryToLabel(primaryCategory) : null

  return (
    <Link
      href={`/marketplace/${vendor.slug}`}
      className="bg-white rounded-2xl border border-ink-6 hover:border-ink-4 transition p-5 block group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-ink-7 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {vendor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.logoUrl} alt={vendor.name} className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-5 h-5 text-ink-3" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[14px] font-semibold text-ink truncate group-hover:text-brand-dark">{vendor.name}</p>
            {vendor.verified && (
              <ShieldCheck className="w-3.5 h-3.5 text-brand-dark flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-ink-3">
            <span className="inline-block bg-ink-7 text-ink-2 px-1.5 py-0.5 rounded text-[10px] font-medium">
              {typeLabel}
            </span>
            {categoryLabel && <span>{categoryLabel}</span>}
          </div>
        </div>
      </div>

      {vendor.description && (
        <p className="text-[12.5px] text-ink-2 mb-3 line-clamp-2">{vendor.description}</p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-ink-7">
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          {vendor.avgRating !== null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              <span className="text-ink-2 font-semibold">{vendor.avgRating.toFixed(1)}</span>
              <span>({vendor.totalBookings})</span>
            </span>
          )}
          {vendor.serviceArea.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {vendor.serviceArea.join(', ')}
            </span>
          )}
        </div>
        <span className="text-[12.5px] font-semibold text-ink tabular-nums">{startingPrice}</span>
      </div>
    </Link>
  )
}
