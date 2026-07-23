/**
 * Public vendor profile — /marketplace/[slug].
 *
 * Anyone (signed in or not) can view a vendor's profile and listings.
 * Booking requires sign-in (handled at the booking flow level).
 *
 * For Apnosh's profile: each bundle listing is anchored by slug
 * (#starter-plate, #full-plate, etc.) so the marketplace dashboard
 * featured cards can deep-link.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, Star, MapPin, ShieldCheck, Building2, ArrowLeft,
  CheckCircle2, Camera, Film, Palette, Code,
  Megaphone, Mail, Newspaper, Compass,
} from 'lucide-react'
import { getVendorBySlug } from '@/lib/dashboard/get-marketplace'
import { getVendorPortfolio } from '@/lib/marketplace/portfolio'
import { rowToPackage, formatCents, maxPriceCents } from '@/lib/marketplace/package'
import BookButton from './book-button'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

function priceLabel(cents: number | null, period: string | null): string {
  if (cents === null) return 'Quote on request'
  const dollars = Math.floor(cents / 100)
  if (period === 'monthly') return `$${dollars}/mo`
  if (period === 'annual') return `$${dollars}/yr`
  return `$${dollars}`
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  food_influencer: Sparkles,
  photographer: Camera,
  videographer: Film,
  graphic_designer: Palette,
  web_designer: Code,
  social_manager: Megaphone,
  email_marketer: Mail,
  pr_specialist: Newspaper,
  local_seo: Compass,
  strategist: Sparkles,
  full_service_agency: Building2,
  other: Sparkles,
}

const CATEGORY_LABELS: Record<string, string> = {
  food_influencer: 'Influencer',
  photographer: 'Photographer',
  videographer: 'Videographer',
  graphic_designer: 'Graphic designer',
  web_designer: 'Web designer',
  social_manager: 'Social manager',
  email_marketer: 'Email marketer',
  pr_specialist: 'PR specialist',
  local_seo: 'Local SEO',
  strategist: 'Strategist',
  full_service_agency: 'Full-service agency',
  other: 'Other',
}

export default async function VendorProfilePage({ params }: PageProps) {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()
  const portfolio = await getVendorPortfolio(vendor.id)

  const typeLabel = vendor.vendorType === 'company' ? 'Agency'
    : vendor.vendorType === 'individual' ? 'Freelancer'
    : 'Apnosh'

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/marketplace"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to marketplace
      </Link>

      {/* Cover */}
      {vendor.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vendor.coverUrl}
          alt=""
          className="w-full h-48 object-cover rounded-2xl"
        />
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-2xl bg-ink-7 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {vendor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.logoUrl} alt={vendor.name} className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-8 h-8 text-ink-3" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-[28px] font-semibold text-ink">{vendor.name}</h1>
            {vendor.verified && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-brand text-white px-2 py-1 rounded-full">
                <ShieldCheck className="w-3 h-3" />
                {vendor.isApnosh ? 'Apnosh Verified' : 'Verified'}
              </span>
            )}
            <span className="inline-block bg-ink-7 text-ink-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider">
              {typeLabel}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[12.5px] text-ink-3">
            {vendor.avgRating !== null && (
              <span className="inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span className="text-ink-2 font-semibold">{vendor.avgRating.toFixed(1)}</span>
                <span>({vendor.totalBookings} bookings)</span>
              </span>
            )}
            {vendor.serviceArea.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                Serves {vendor.serviceArea.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {vendor.description && (
        <div className="bg-white rounded-2xl border border-ink-6 p-5">
          <p className="text-[14px] text-ink leading-relaxed">{vendor.description}</p>
        </div>
      )}

      {/* Portfolio gallery */}
      {portfolio.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
            Selected work ({portfolio.length})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {portfolio.map(item => (
              <a
                key={item.id}
                href={item.externalUrl ?? item.url}
                target={item.externalUrl ? '_blank' : undefined}
                rel={item.externalUrl ? 'noopener noreferrer' : undefined}
                className="group block aspect-square overflow-hidden rounded-xl bg-ink-7 relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl ?? item.url}
                  alt={item.caption ?? ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  loading="lazy"
                />
                {item.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] p-2 opacity-0 group-hover:opacity-100 transition">
                    {item.caption}
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Listings */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
          {vendor.isApnosh ? 'Bundles' : 'Services'}
        </p>
        <div className="space-y-4">
          {vendor.listings.length === 0 && (
            <div className="bg-white border border-ink-6 rounded-2xl p-6 text-center text-[13px] text-ink-3">
              No active listings right now.
            </div>
          )}
          {vendor.listings.map(l => {
            const Icon = CATEGORY_ICONS[l.category] ?? Sparkles
            const details = (l.details ?? {}) as Record<string, unknown>
            const popular = details.popular === true
            const stage = details.stage as string | undefined
            const tagline = details.tagline as string | undefined
            const firstMonthFree = details.firstMonthFree === true
            const onboardingValue = details.onboardingValue as number | undefined
            const setup = details.setup as number | undefined

            return (
              <div
                key={l.id}
                id={l.slug}
                className="bg-white rounded-2xl border border-ink-6 p-6 scroll-mt-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-brand-tint/40 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-brand-dark" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-[18px] font-semibold text-ink">{l.title}</h3>
                      {popular && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-dark bg-brand-tint px-1.5 py-0.5 rounded">
                          Popular
                        </span>
                      )}
                      {stage && (
                        <span className="text-[10px] uppercase tracking-wider text-ink-3">
                          {stage}
                        </span>
                      )}
                    </div>
                    {(tagline || l.description) && (
                      <p className="text-[13.5px] text-ink-2 mb-3">
                        {tagline || l.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-baseline gap-3 mb-3">
                      <span className="text-[24px] font-bold text-ink tabular-nums">
                        {priceLabel(l.priceCents, l.billingPeriod)}
                      </span>
                      {setup !== undefined && setup > 0 && (
                        <span className="text-[12px] text-ink-3">
                          + ${setup / 100} setup
                        </span>
                      )}
                      {firstMonthFree && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          First month free
                        </span>
                      )}
                    </div>

                    {onboardingValue !== undefined && onboardingValue > 0 && (
                      <p className="text-[11px] text-ink-3 mb-3">
                        Onboarding deliverables valued at ${onboardingValue.toLocaleString()}
                      </p>
                    )}

                    {/* Creator-package presentation: the deliverables and priced add-ons a
                        creator set in their own storefront editor. Read through the shared model
                        so what a buyer sees is exactly what the creator published. Apnosh's
                        bundle listings do not carry this shape, so nothing extra renders for them. */}
                    {(() => {
                      const pkg = rowToPackage({
                        slug: l.slug, title: l.title, category: l.category, listing_type: l.listingType,
                        description: l.description, price_cents: l.priceCents, billing_period: l.billingPeriod,
                        details: l.details, active: true,
                      })
                      const max = maxPriceCents(pkg)
                      const hasRange = pkg.priceCents != null && max != null && max > pkg.priceCents
                      return (
                        <>
                          {pkg.deliverables.length > 0 && (
                            <ul className="mb-3 space-y-1">
                              {pkg.deliverables.map((d, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /> {d}
                                </li>
                              ))}
                            </ul>
                          )}
                          {pkg.options.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">Add-ons</p>
                              <div className="flex flex-wrap gap-1.5">
                                {pkg.options.map((o) => (
                                  <span key={o.id} className="text-[12px] text-ink-2 bg-ink-7/40 rounded-full px-2.5 py-1">
                                    {o.label} <span className="text-ink-3">+{formatCents(o.priceDeltaCents)}</span>
                                  </span>
                                ))}
                              </div>
                              {hasRange && (
                                <p className="text-[11px] text-ink-3 mt-1.5">
                                  With every add-on: up to {formatCents(max)}
                                </p>
                              )}
                            </div>
                          )}
                          {(pkg.turnaroundDays != null || pkg.revisions != null) && (
                            <p className="text-[11px] text-ink-3 mb-3">
                              {[pkg.turnaroundDays != null ? `${pkg.turnaroundDays}-day turnaround` : null,
                                pkg.revisions != null ? `${pkg.revisions} revision${pkg.revisions === 1 ? '' : 's'} included` : null]
                                .filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </>
                      )
                    })()}

                    <p className="text-[11px] text-ink-3 mb-3">
                      Category: {CATEGORY_LABELS[l.category] ?? l.category}
                    </p>

                    <BookButton
                      vendorSlug={vendor.slug}
                      listingSlug={l.slug}
                      listingType={l.listingType}
                      isApnosh={vendor.isApnosh}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Trust signals */}
      <div className="bg-ink-7/30 border border-ink-6 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">Why Apnosh marketplace</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-ink-2">Every vendor is reviewed before listing</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-ink-2">Bookings handled through your dashboard</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-ink-2">Reviews from real restaurant owners</p>
          </div>
        </div>
      </div>
    </div>
  )
}
