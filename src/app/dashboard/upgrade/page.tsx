import Link from 'next/link'
import { Check, Sparkles, ArrowRight, Shield } from 'lucide-react'
import { TIERS, type TierId } from '@/lib/agent/tiers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Plan comparison page. Owners land here from the chat cap-reached
 * banner or from billing. Shows the three paid tiers (we hide
 * "Inactive", which is the cancelled-sub fallback state), marks the
 * current one, and links the upgrade CTA to /dashboard/billing which
 * intercepts ?upgrade=<id> and starts Stripe Checkout.
 */
export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /* Resolve the current tier so we can highlight it. */
  let currentTier: TierId = 'basic'
  if (user) {
    const admin = createAdminClient()
    const { data: cu } = await admin
      .from('client_users').select('client_id, clients(tier)').eq('auth_user_id', user.id).maybeSingle()
    const clientsField = (cu as unknown as { clients?: { tier?: string } | Array<{ tier?: string }> } | null)?.clients
    const tierRaw = Array.isArray(clientsField) ? clientsField[0]?.tier : clientsField?.tier
    if (tierRaw && tierRaw.toLowerCase() in TIERS) currentTier = tierRaw.toLowerCase() as TierId
  }

  /* Hide 'starter' — it's the cancelled-subscription fallback, not a buyable tier. */
  const order: TierId[] = ['basic', 'standard', 'pro']

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-8 pb-20">
      <div className="text-center mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Apnosh AI
        </p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center justify-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Pick your plan
        </h1>
        <p className="text-ink-3 text-sm mt-1 max-w-2xl mx-auto">
          Per location, billed monthly. Cancel anytime — no contracts.
          <br />
          <span className="text-ink-4 text-[12px]">14-day money-back guarantee on first month.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {order.map(id => {
          const tier = TIERS[id]
          const isCurrent = id === currentTier
          const recommended = id === 'standard'
          return (
            <div
              key={id}
              className={[
                'rounded-2xl border p-5 flex flex-col',
                isCurrent ? 'border-brand bg-brand-tint/30'
                : recommended ? 'border-ink-4 bg-white shadow-md'
                : 'border-ink-6 bg-white',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[15px] font-bold text-ink">{tier.label}</h2>
                {recommended && !isCurrent && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-ink text-white">
                    Most pick this
                  </span>
                )}
                {isCurrent && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand text-white">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-3 mb-1">
                <span className="text-[28px] font-bold text-ink tabular-nums">
                  ${tier.priceCents / 100}
                </span>
                <span className="text-sm text-ink-3"> / location / mo</span>
              </div>
              <p className="text-[12px] text-ink-3 mb-4">{tier.pitch}</p>
              <ul className="space-y-1.5 mb-5 flex-1">
                <FeatureLine text={tier.monthlyMessageLimit != null
                  ? `${tier.monthlyMessageLimit.toLocaleString()} AI messages / month`
                  : 'Unlimited AI messages'} />
                {id === 'basic' && (
                  <FeatureLine text="Tactical tools: menu, hours, copy, review replies" />
                )}
                {(id === 'standard' || id === 'pro') && (
                  <FeatureLine text="All tools: + Google posts, content ideas, ads, photos" />
                )}
                {id === 'pro' && (
                  <FeatureLine text="Multi-location dashboard + priority queue" />
                )}
                <FeatureLine text={tier.locationsLimit != null
                  ? `${tier.locationsLimit} location${tier.locationsLimit === 1 ? '' : 's'} (add more, discounted)`
                  : 'Unlimited locations'} />
                <FeatureLine text="Strategist sessions à la carte (optional)" />
              </ul>
              {isCurrent ? (
                <button
                  disabled
                  className="w-full px-4 py-2 rounded-full text-sm font-semibold text-ink-3 bg-ink-7 cursor-not-allowed"
                >
                  Current plan
                </button>
              ) : (
                <Link
                  href={`/dashboard/billing?upgrade=${id}`}
                  className={[
                    'w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold',
                    recommended || tier.priceCents > TIERS[currentTier].priceCents
                      ? 'text-white bg-brand hover:bg-brand-dark'
                      : 'text-ink-2 bg-ink-7 hover:bg-ink-6',
                  ].join(' ')}
                >
                  {tier.priceCents > TIERS[currentTier].priceCents ? 'Upgrade' : 'Switch to this'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 max-w-3xl mx-auto bg-bg-2 rounded-2xl p-5 text-[12.5px] text-ink-2 space-y-2">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink">14-day money-back guarantee.</strong> Try any plan
            risk-free. Cancel within 14 days for a full refund — no questions asked.
          </div>
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6">
          <strong className="text-ink-2">Multi-location pricing:</strong> 2nd location 20% off ·
          3rd-5th 30% off · 6+ locations 40% off.
        </div>
        <div className="text-ink-3">
          <strong className="text-ink-2">Need design, strategy, or one-off help?</strong>{' '}
          <Link href="/dashboard/messages" className="text-brand hover:underline">Book a strategist session →</Link>
          {' '}(sold separately, hourly).
        </div>
      </div>
    </div>
  )
}

function FeatureLine({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
      <Check className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </li>
  )
}
