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
  CheckCircle2, Calendar, Camera, Film, Palette, Code,
  Megaphone, Mail, Newspaper, Compass,
} from 'lucide-react'
import { getVendorBySlug } from '@/lib/dashboard/get-marketplace'

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

                    <p className="text-[11px] text-ink-3 mb-3">
                      Category: {CATEGORY_LABELS[l.category] ?? l.category}
                    </p>

                    <Link
                      href={`/dashboard/marketplace?book=${vendor.slug}&listing=${l.slug}`}
                      className="inline-flex items-center gap-1.5 bg-ink text-white text-[12.5px] font-semibold rounded-full px-4 py-2 hover:bg-ink-2 transition"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {l.listingType === 'subscription' ? 'Subscribe' : 'Request booking'}
                    </Link>
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
