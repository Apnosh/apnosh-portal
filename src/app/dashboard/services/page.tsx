/**
 * /dashboard/services -- the menu of paid services a restaurant can
 * add on top of the always-free portal.
 *
 * Apnosh's monetization model: portal is free, services are à la carte
 * subscriptions or one-time projects. Restaurant browses, picks what
 * they want, signs an agreement on first paid purchase, pays via
 * Stripe.
 *
 * "Already subscribed" pill renders on services the client is already
 * paying for so they can't accidentally double-buy.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Check, ArrowRight, ShoppingBag, Settings } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import {
  getServicesCatalog, getActiveSubscriptions,
  type CatalogService, type ActiveSubscription,
} from '@/lib/dashboard/get-services-catalog'

export const dynamic = 'force-dynamic'

function fmtPrice(s: CatalogService): { primary: string; unit: string } {
  if (s.price === 0) {
    return { primary: 'Custom', unit: 'quote-based' }
  }
  const dollars = `$${s.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  const unit = s.priceUnit === 'per_month' ? '/ month'
    : s.priceUnit === 'one_time' ? 'one-time'
    : s.priceUnit === 'per_post' ? '/ post'
    : s.priceUnit
  return { primary: dollars, unit }
}

export default async function ServicesCatalogPage() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) redirect('/login')

  const [categories, activeSubs] = await Promise.all([
    getServicesCatalog(),
    getActiveSubscriptions(),
  ])

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-8">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Apnosh services
        </p>
        <h1 className="text-[28px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-ink-4" />
          What can we help with?
        </h1>
        <p className="text-ink-3 text-[14px] mt-1 max-w-2xl">
          Your portal is free forever. Add services à la carte when you want hands-on help from our team.
          Cancel anytime.
        </p>
      </div>

      {/* Active subscriptions -- only if the client has any */}
      {activeSubs.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[16px] font-bold text-ink tracking-tight inline-flex items-center gap-2">
              <Settings className="w-4 h-4 text-ink-4" />
              Your active services
            </h2>
            <Link
              href="/dashboard/billing"
              className="text-[12px] text-ink-3 hover:text-ink"
            >
              Billing & invoices →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSubs.map(sub => <ActiveServiceCard key={sub.clientServiceId} sub={sub} />)}
          </div>
        </section>
      )}

      {/* Promotional banner -- first 100 customers */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-50 via-rose-50 to-rose-50 ring-1 ring-amber-200/60 p-4 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-white ring-1 ring-amber-200 grid place-items-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-amber-600" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-ink leading-tight">
            Founding member pricing: 50% off services, forever.
          </p>
          <p className="text-[12px] text-ink-2 mt-0.5">
            Limited to the first 100 customers. Discount auto-applies at checkout.
          </p>
        </div>
      </div>

      {/* Categories */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-6 bg-white p-12 text-center">
          <p className="text-[14px] font-semibold text-ink">No services configured yet</p>
          <p className="text-[12px] text-ink-3 mt-1">Your account manager will set up the catalog shortly.</p>
        </div>
      ) : (
        categories.map(cat => (
          <section key={cat.id}>
            <div className="mb-3">
              <h2 className="text-[18px] font-bold text-ink">{cat.label}</h2>
              {cat.description && (
                <p className="text-[12.5px] text-ink-3 mt-0.5">{cat.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.services.map(s => (
                <ServiceCard key={s.id} service={s} clientHasContext={!!clientId} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Bottom CTA */}
      <div className="rounded-2xl border border-ink-6 bg-white p-6 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink">Not sure what you need?</p>
          <p className="text-[12px] text-ink-3 mt-0.5">
            Tell your strategist your goals. They&apos;ll recommend the services that fit your budget and growth stage.
          </p>
        </div>
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-ink-2 bg-bg-2 hover:bg-bg-3 transition-colors flex-shrink-0"
        >
          Message your strategist
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

function ActiveServiceCard({ sub }: { sub: ActiveSubscription }) {
  const dollars = `$${(sub.monthlyPriceCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  const statusColor = sub.status === 'active' ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
    : sub.status === 'paused' ? 'text-amber-700 bg-amber-50 ring-amber-100'
    : 'text-ink-3 bg-bg-2 ring-ink-6'
  const statusLabel = sub.status === 'active' ? 'Active'
    : sub.status === 'paused' ? 'Paused'
    : 'Pending'
  return (
    <Link
      href={`/dashboard/services/${sub.serviceId}`}
      className="group block bg-white rounded-2xl border border-emerald-200/60 ring-1 ring-emerald-50 hover:border-emerald-300 p-4 transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${statusColor}`}>
          {statusLabel}
        </span>
        <span className="text-[10.5px] text-ink-4">
          {sub.startedAt && `Since ${new Date(sub.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </span>
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">{sub.serviceName}</p>
      <div className="flex items-end justify-between mt-3 pt-2 border-t border-ink-7">
        <div>
          <p className="text-[16px] font-bold text-ink tabular-nums leading-none">{dollars}</p>
          <p className="text-[10.5px] text-ink-4 mt-0.5">/ month</p>
        </div>
        <span className="text-[11px] font-medium text-ink-3 group-hover:text-ink-2">Manage →</span>
      </div>
    </Link>
  )
}

function ServiceCard({ service, clientHasContext }: { service: CatalogService; clientHasContext: boolean }) {
  const { primary, unit } = fmtPrice(service)
  const isActive = service.clientStatus === 'active'
  const isPaused = service.clientStatus === 'paused'

  return (
    <Link
      href={`/dashboard/services/${service.id}`}
      className="group relative flex flex-col bg-white rounded-2xl border border-ink-6 hover:border-ink-4 hover:shadow-sm p-4 transition-all"
    >
      {isActive && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-1.5 py-0.5 rounded">
          <Check className="w-2.5 h-2.5" />
          Active
        </span>
      )}
      {isPaused && (
        <span className="absolute top-3 right-3 inline-flex items-center text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-amber-100 px-1.5 py-0.5 rounded">
          Paused
        </span>
      )}

      <p className="text-[14.5px] font-semibold text-ink leading-tight pr-16">{service.name}</p>
      {service.shortDescription && (
        <p className="text-[12px] text-ink-3 mt-1 leading-relaxed line-clamp-2">{service.shortDescription}</p>
      )}

      {service.features.length > 0 && (
        <ul className="mt-3 space-y-1 flex-1">
          {service.features.slice(0, 3).map((f, i) => (
            <li key={i} className="text-[11.5px] text-ink-2 flex items-start gap-1.5">
              <Check className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-ink-7 flex items-end justify-between gap-2">
        <div>
          <p className="text-[20px] font-bold text-ink tabular-nums leading-none">{primary}</p>
          <p className="text-[11px] text-ink-4 mt-0.5">{unit}</p>
        </div>
        {isActive || isPaused ? (
          <span className="text-[11px] font-medium text-ink-3 group-hover:text-ink-2">Manage →</span>
        ) : (
          <span className="text-[11px] font-medium text-brand group-hover:text-brand-dark">
            {clientHasContext ? 'Subscribe →' : 'Learn more →'}
          </span>
        )}
      </div>
    </Link>
  )
}
