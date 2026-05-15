/**
 * /dashboard/services/[id] -- service detail + subscribe flow.
 *
 * Renders the full service description, features, price, and the
 * subscribe button. If the client hasn't signed the master agreement
 * yet, the flow walks them through clickwrap acceptance first.
 *
 * Stripe Checkout integration is wired in the client component once
 * stripe_price_id is populated for each service; until then the
 * activate step runs without a Stripe round-trip so the flow is
 * testable end-to-end in dev.
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Tag, Calendar, Sparkles } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServiceById } from '@/lib/dashboard/get-services-catalog'
import {
  getActiveAgreementTemplate,
  hasSignedActiveAgreement,
} from '@/lib/dashboard/subscribe-to-service'
import SubscribeFlow from './subscribe-flow'
import CancelServiceButton from './cancel-service-button'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const { user, clientId } = await resolveCurrentClient()
  if (!user) redirect('/login')

  const [service, agreementTemplate, alreadySigned] = await Promise.all([
    getServiceById(id),
    getActiveAgreementTemplate(),
    hasSignedActiveAgreement(),
  ])
  if (!service) notFound()

  /* Look up the existing client_services row id so the Cancel button
     can target it directly. Only relevant when status === 'active'. */
  let activeClientServiceId: string | null = null
  if (service.clientStatus === 'active' && clientId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('client_services')
      .select('id')
      .eq('client_id', clientId)
      .eq('service_slug', service.id)
      .eq('status', 'active')
      .maybeSingle()
    activeClientServiceId = (data?.id as string | undefined) ?? null
  }

  const priceDisplay = service.price === 0
    ? 'Custom quote'
    : `$${service.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  const priceUnit = service.priceUnit === 'per_month' ? '/ month'
    : service.priceUnit === 'one_time' ? 'one-time'
    : service.priceUnit

  return (
    <div className="max-w-[920px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/services"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All services
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: description */}
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              {service.category}
            </p>
            <h1 className="text-[28px] font-semibold text-ink leading-tight mt-1">
              {service.name}
            </h1>
            {service.shortDescription && (
              <p className="text-[14px] text-ink-2 mt-2 leading-relaxed">
                {service.shortDescription}
              </p>
            )}
          </div>

          {service.description && (
            <div className="rounded-2xl bg-white border border-ink-6 p-5">
              <p className="text-[13.5px] text-ink-2 leading-relaxed whitespace-pre-line">
                {service.description}
              </p>
            </div>
          )}

          {service.features.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
                What&apos;s included
              </p>
              <ul className="space-y-1.5">
                {service.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: purchase card */}
        <aside>
          <div className="sticky top-6 rounded-2xl border border-ink-6 bg-white p-5 space-y-3">
            <div className="flex items-baseline gap-2">
              <p className="text-[28px] font-bold text-ink tabular-nums leading-none">{priceDisplay}</p>
              <p className="text-[12px] text-ink-3">{priceUnit}</p>
            </div>

            {service.clientStatus === 'active' && activeClientServiceId ? (
              <div className="space-y-2">
                <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-3 flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-emerald-700">You&apos;re subscribed</p>
                    <p className="text-[11.5px] text-emerald-700/80 mt-0.5">
                      Your strategist is on it. Cancel anytime below.
                    </p>
                  </div>
                </div>
                <CancelServiceButton
                  clientServiceId={activeClientServiceId}
                  serviceName={service.name}
                />
              </div>
            ) : !clientId ? (
              <p className="text-[12px] text-ink-3 rounded-xl bg-bg-2 p-3">
                Sign in as a client to subscribe to a service.
              </p>
            ) : service.price === 0 ? (
              <Link
                href="/dashboard/messages"
                className="block w-full text-center px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
              >
                Request a quote
              </Link>
            ) : (
              <SubscribeFlow
                serviceId={service.id}
                serviceName={service.name}
                price={service.price}
                priceUnit={service.priceUnit}
                alreadySignedAgreement={alreadySigned}
                agreementTemplate={agreementTemplate}
              />
            )}

            <div className="pt-3 border-t border-ink-7 space-y-2">
              <div className="flex items-start gap-2 text-[11.5px] text-ink-3">
                <Tag className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Founding member: 50% off automatically applied at checkout (first 100 customers).</span>
              </div>
              <div className="flex items-start gap-2 text-[11.5px] text-ink-3">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Cancel anytime. No long-term contracts.</span>
              </div>
              <div className="flex items-start gap-2 text-[11.5px] text-ink-3">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Your strategist is in touch within 24 hours of subscribing.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
