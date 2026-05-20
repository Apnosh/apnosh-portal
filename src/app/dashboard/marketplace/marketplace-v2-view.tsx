'use client'

/**
 * Marketplace v2 — multi-category vendor surface.
 *
 * Cards are equal-weight (Apnosh is not visually featured; it
 * appears in the grid like every other vendor). Owners filter by
 * offering type (packages vs individual services), category, and
 * vendor type (agency vs freelancer).
 *
 * Cards show enough info to decide without clicking:
 *   - All categories the vendor covers
 *   - A preview of their listings with prices
 *   - Highlights (verified, popular packages, restaurant experience)
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search, Sparkles, Camera, Film, Palette, Code, Megaphone, Mail,
  Newspaper, Compass, Building2, Star, MapPin, ShieldCheck, ArrowRight,
  Users, Package, Briefcase, Check,
} from 'lucide-react'
import type { MarketplaceVendor, MarketplaceListing, VendorCategory } from '@/lib/dashboard/get-marketplace'

interface Props {
  vendors: MarketplaceVendor[]
  categoryCounts: Record<string, number>
}

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

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c.label.replace(/s$/, '')]),
)

type TypeFilter = 'all' | 'agency' | 'freelancer'
type OfferingFilter = 'all' | 'packages' | 'services'

function priceLabel(cents: number | null, period: string | null): string {
  if (cents === null) return 'Quote'
  const dollars = Math.floor(cents / 100)
  if (period === 'monthly') return `$${dollars}/mo`
  if (period === 'annual') return `$${dollars}/yr`
  return `$${dollars}`
}

function isPackageListing(l: MarketplaceListing): boolean {
  return l.listingType === 'subscription' || l.listingType === 'package'
}

export default function MarketplaceV2View({ vendors, categoryCounts }: Props) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<VendorCategory | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [offeringFilter, setOfferingFilter] = useState<OfferingFilter>('all')

  const filtered = useMemo(() => {
    let out = vendors

    if (offeringFilter === 'packages') {
      out = out.filter(v => v.listings.some(isPackageListing))
    } else if (offeringFilter === 'services') {
      out = out.filter(v => v.listings.some(l => !isPackageListing(l)))
    }

    if (categoryFilter !== 'all') {
      out = out.filter(v => v.listings.some(l => l.category === categoryFilter))
    }

    if (typeFilter === 'agency') out = out.filter(v => v.vendorType === 'company' || v.vendorType === 'apnosh')
    if (typeFilter === 'freelancer') out = out.filter(v => v.vendorType === 'individual')

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(v => {
        const haystack = [
          v.name,
          v.description ?? '',
          ...v.listings.map(l => l.title),
          ...v.listings.map(l => l.description ?? ''),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }

    return out
  }, [vendors, categoryFilter, typeFilter, offeringFilter, search])

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Marketplace</p>
        <h1 className="text-[28px] font-semibold text-ink mt-1">Find help for your restaurant</h1>
        <p className="text-ink-3 text-sm mt-1">
          Agencies, freelancers, and creators in Washington — vetted and bookable.
        </p>
      </div>

      {/* Offering type tabs (Packages vs Services) */}
      <div className="bg-white border border-ink-6 rounded-2xl p-1 inline-flex w-full sm:w-auto">
        {([
          { key: 'all', label: 'All', icon: Users },
          { key: 'packages', label: 'Marketing packages', icon: Package },
          { key: 'services', label: 'Individual services', icon: Briefcase },
        ] as Array<{ key: OfferingFilter; label: string; icon: React.ComponentType<{ className?: string }> }>).map(t => {
          const Icon = t.icon
          const active = offeringFilter === t.key
          return (
            <button
              key={t.key}
              onClick={() => setOfferingFilter(t.key)}
              className={[
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition flex-1 sm:flex-none justify-center',
                active ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink-2',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Search + type filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, service, or category..."
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
          {CATEGORIES.map(c => {
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
            <p className="text-[12.5px] text-ink-3">Try a different filter, or check back as we onboard more vendors and freelancers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(v => (
              <VendorCard
                key={v.id}
                vendor={v}
                offeringFilter={offeringFilter}
                categoryFilter={categoryFilter}
              />
            ))}
          </div>
        )}
      </div>

      {/* Become a vendor CTA */}
      <div className="bg-ink-7/30 border border-ink-6 rounded-2xl p-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">Are you a vendor or freelancer?</p>
        <p className="text-[15px] text-ink font-medium mb-3">Join the Apnosh marketplace</p>
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

function VendorCard({
  vendor,
  offeringFilter,
  categoryFilter,
}: {
  vendor: MarketplaceVendor
  offeringFilter: OfferingFilter
  categoryFilter: VendorCategory | 'all'
}) {
  const typeLabel = vendor.vendorType === 'company' ? 'Agency'
    : vendor.vendorType === 'individual' ? 'Freelancer'
    : 'Agency'

  /* Listings filtered by the active offering filter, so the card preview
     reflects what's relevant to the current view. */
  const visibleListings = useMemo(() => {
    let ls = vendor.listings
    if (offeringFilter === 'packages') ls = ls.filter(isPackageListing)
    else if (offeringFilter === 'services') ls = ls.filter(l => !isPackageListing(l))
    return ls.slice(0, 4)
  }, [vendor.listings, offeringFilter])

  /* All unique categories this vendor covers — surfaces breadth. */
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const l of vendor.listings) set.add(l.category)
    return [...set]
  }, [vendor.listings])

  return (
    <div className="bg-white rounded-2xl border border-ink-6 hover:border-ink-4 transition p-5 flex flex-col">
      {/* Header */}
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
            <Link
              href={`/marketplace/${vendor.slug}`}
              className="text-[15px] font-semibold text-ink truncate hover:text-brand-dark"
            >
              {vendor.name}
            </Link>
            {vendor.verified && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-brand-tint text-brand-dark px-1.5 py-0.5 rounded">
                <ShieldCheck className="w-2.5 h-2.5" />
                Verified
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider bg-ink-7 text-ink-2 px-1.5 py-0.5 rounded">
              {typeLabel}
            </span>
          </div>
          <div className="flex items-center gap-2.5 mt-1 text-[11px] text-ink-3">
            {vendor.avgRating !== null ? (
              <span className="inline-flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span className="text-ink-2 font-semibold">{vendor.avgRating.toFixed(1)}</span>
                <span>({vendor.totalBookings})</span>
              </span>
            ) : (
              <span className="text-ink-4">New</span>
            )}
            {vendor.serviceArea.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                {vendor.serviceArea.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {vendor.description && (
        <p className="text-[12.5px] text-ink-2 leading-relaxed mb-3 line-clamp-2">{vendor.description}</p>
      )}

      {/* Categories covered */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {allCategories.slice(0, 6).map(c => {
            const isActive = categoryFilter !== 'all' && categoryFilter === c
            return (
              <span
                key={c}
                className={[
                  'text-[10.5px] font-medium px-2 py-0.5 rounded-full',
                  isActive
                    ? 'bg-brand-tint text-brand-dark'
                    : 'bg-ink-7 text-ink-2',
                ].join(' ')}
              >
                {CATEGORY_LABELS[c] ?? c}
              </span>
            )
          })}
          {allCategories.length > 6 && (
            <span className="text-[10.5px] text-ink-3">+{allCategories.length - 6} more</span>
          )}
        </div>
      )}

      {/* Listings preview */}
      {visibleListings.length > 0 && (
        <div className="mb-3 pt-3 border-t border-ink-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
            {visibleListings.some(isPackageListing) ? 'Packages' : 'Services'}
          </p>
          <div className="space-y-1.5">
            {visibleListings.map(l => {
              const details = (l.details ?? {}) as Record<string, unknown>
              const popular = details.popular === true
              return (
                <div key={l.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                    <span className="text-ink truncate">{l.title}</span>
                    {popular && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-brand-dark bg-brand-tint px-1 py-0.5 rounded flex-shrink-0">
                        Popular
                      </span>
                    )}
                  </div>
                  <span className="text-ink-2 font-semibold tabular-nums flex-shrink-0">
                    {priceLabel(l.priceCents, l.billingPeriod)}
                  </span>
                </div>
              )
            })}
            {vendor.listings.length > visibleListings.length && (
              <p className="text-[10.5px] text-ink-3 pl-4.5">
                +{vendor.listings.length - visibleListings.length} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto pt-3 border-t border-ink-7 flex items-center justify-between">
        <span className="text-[11px] text-ink-3">
          {vendor.startingPriceCents !== null
            ? <>Starting at <span className="text-ink-2 font-semibold tabular-nums">${Math.floor(vendor.startingPriceCents / 100)}</span></>
            : <span>Quote on request</span>}
        </span>
        <Link
          href={`/marketplace/${vendor.slug}`}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark hover:text-brand"
        >
          View profile <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
