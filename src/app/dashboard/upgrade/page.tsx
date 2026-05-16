import Link from 'next/link'
import {
  Check, Sparkles, ArrowRight, Shield, MessageCircle, Globe, Building2, Zap,
} from 'lucide-react'
import { TIERS, type TierId } from '@/lib/agent/tiers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Product selection page. Three things to choose between:
 *   1. AI tier (Assistant / Strategist / Strategist+) — the subscription
 *   2. Website add-on — separate Apnosh hosting product, optional
 *   3. Enterprise — coming soon, contact-only
 *
 * Website is shown loosely-separate: in its own section below the AI
 * tier picker so owners see it as an add-on, not a tier.
 */
export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let currentTier: TierId = 'starter'
  if (user) {
    const admin = createAdminClient()
    const { data: cu } = await admin
      .from('client_users').select('client_id, clients(tier)').eq('auth_user_id', user.id).maybeSingle()
    const clientsField = (cu as unknown as { clients?: { tier?: string } | Array<{ tier?: string }> } | null)?.clients
    const tierRaw = Array.isArray(clientsField) ? clientsField[0]?.tier : clientsField?.tier
    if (tierRaw && tierRaw.toLowerCase() in TIERS) currentTier = tierRaw.toLowerCase() as TierId
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-8 pb-20">
      {/* === Header === */}
      <div className="text-center mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Apnosh
        </p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center justify-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Pick your AI plan
        </h1>
        <p className="text-ink-3 text-sm mt-1 max-w-2xl mx-auto">
          Per location, billed monthly. Cancel anytime, no contracts.
          <br />
          <span className="text-ink-4 text-[12px]">14-day money-back guarantee on your first month.</span>
        </p>
      </div>

      {/* === 3 AI Tier Cards === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TierCard
          id="basic"
          headline="For owners who want AI when they ask"
          highlights={[
            'Updates Google hours & info',
            'Drafts review responses',
            'Generates content ideas',
            'Weekly recap of what changed',
          ]}
          gotchas="Manual mode — you ask, AI does"
          isCurrent={currentTier === 'basic'}
          ctaStyle="secondary"
        />
        <TierCard
          id="standard"
          headline="AI that reads your data and plans for you"
          highlights={[
            'Everything in AI Assistant +',
            'Reads sales, reviews, analytics continuously',
            'Weekly proactive briefings with insights',
            'Suggests campaigns based on your actual data',
            'Drafts a 2-week GBP post calendar',
            'Tracks what worked, adapts over time',
          ]}
          gotchas="Where most owners land"
          isCurrent={currentTier === 'standard'}
          ctaStyle="primary"
          recommended
        />
        <TierCard
          id="pro"
          headline="For multi-location operators & power users"
          highlights={[
            'Everything in AI Strategist +',
            'Unlimited messages',
            'Daily proactive check-ins (vs weekly)',
            'Multi-location rollup dashboard',
            'Custom playbooks for your brand',
            'Priority compute, latest model',
          ]}
          gotchas="Up to 5 locations included (more with multi-loc discount)"
          isCurrent={currentTier === 'pro'}
          ctaStyle="secondary"
        />
      </div>

      {/* === Multi-loc + guarantee + strategist note === */}
      <div className="mt-6 max-w-4xl mx-auto bg-bg-2 rounded-2xl p-5 text-[12.5px] text-ink-2 space-y-3">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink">14-day money-back guarantee.</strong> Try any plan
            risk-free. Cancel within 14 days for a full refund.
          </div>
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6">
          <strong className="text-ink-2">Multi-location pricing:</strong> 2nd location 20% off ·
          3rd-5th 30% off · 6+ locations 40% off.
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6 flex items-start gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-ink-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="text-ink-2">Need design, brand strategy, or one-off campaign help?</strong>{' '}
            Strategist sessions are billed hourly outside your subscription — $125/hr.{' '}
            <Link href="/dashboard/messages" className="text-brand hover:underline">Book a session →</Link>
          </div>
        </div>
      </div>

      {/* === Website add-on section === */}
      <div className="mt-12 mb-4">
        <h2 className="text-[20px] font-semibold text-ink flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand" />
          Want AI to manage your website too?
        </h2>
        <p className="text-ink-3 text-sm mt-1 max-w-2xl">
          Optional add-on. If you move your website to Apnosh, your AI plan can directly update
          menu items, hours, page copy, and photos on your site — not just on Google.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WebsiteCard
          name="Template"
          setupPrice="Free"
          setupNote="90-day commit"
          highlights={[
            'Choose from restaurant-tuned templates',
            'AI helps customize colors, photos, content',
            'Launch in days, not weeks',
            'Switch templates anytime',
          ]}
          isHighlighted
        />
        <WebsiteCard
          name="Custom"
          setupPrice="$1,500"
          setupNote="one-time"
          highlights={[
            'Designer-built unique site',
            'Brand colors, fonts, photography',
            'Custom sections (events, catering, etc.)',
            '~2 week turnaround',
          ]}
        />
        <WebsiteCard
          name="Premium"
          setupPrice="$3,500+"
          setupNote="one-time"
          highlights={[
            'Everything in Custom +',
            'Professional photography session',
            'Copywriting + brand voice setup',
            'Ongoing design retainer available',
          ]}
        />
      </div>

      <div className="mt-3 text-center text-[12.5px] text-ink-3">
        All website plans: <strong className="text-ink-2">$29/location/mo</strong> hosting & AI editing,
        billed monthly after launch.{' '}
        <Link href="/dashboard/messages?topic=Website+setup" className="text-brand hover:underline">
          Talk to us about a website →
        </Link>
      </div>

      {/* === Enterprise teaser === */}
      <div className="mt-12 max-w-4xl mx-auto rounded-2xl border-2 border-dashed border-ink-5 p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-ink text-white mb-3">
          <Building2 className="w-5 h-5" />
        </div>
        <h2 className="text-[18px] font-semibold text-ink">Enterprise — coming soon</h2>
        <p className="text-ink-3 text-sm mt-1 max-w-2xl mx-auto">
          For multi-region chains, franchisors, and groups with 25+ locations. Custom integrations
          (POS, accounting, reservation systems), API access, dedicated account manager,
          white-label options.
        </p>
        <Link
          href="/dashboard/messages?topic=Enterprise"
          className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-full text-sm font-semibold text-ink-2 bg-bg-2 hover:bg-ink-7"
        >
          <Zap className="w-3.5 h-3.5" />
          Get early access
        </Link>
      </div>
    </div>
  )
}

function TierCard({
  id, headline, highlights, gotchas, isCurrent, ctaStyle, recommended,
}: {
  id: TierId
  headline: string
  highlights: string[]
  gotchas: string
  isCurrent: boolean
  ctaStyle: 'primary' | 'secondary'
  recommended?: boolean
}) {
  const tier = TIERS[id]
  return (
    <div className={[
      'rounded-2xl border p-5 flex flex-col bg-white',
      isCurrent ? 'border-brand ring-2 ring-brand/20'
        : recommended ? 'border-ink-3 shadow-md'
          : 'border-ink-6',
    ].join(' ')}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold text-ink">{tier.label}</h3>
        {isCurrent ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white">
            Current
          </span>
        ) : recommended ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-ink text-white">
            Most popular
          </span>
        ) : null}
      </div>
      <p className="text-[12.5px] text-ink-3 mb-3 min-h-[2.5em]">{headline}</p>
      <div className="mb-4">
        <span className="text-[30px] font-bold text-ink tabular-nums">
          ${tier.priceCents / 100}
        </span>
        <span className="text-sm text-ink-3"> / location / mo</span>
      </div>
      <ul className="space-y-1.5 mb-4 flex-1">
        {highlights.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-2">
            <Check className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-ink-3 italic mb-3">{gotchas}</div>
      {isCurrent ? (
        <button disabled className="w-full px-4 py-2.5 rounded-full text-sm font-semibold text-ink-3 bg-ink-7 cursor-not-allowed">
          Current plan
        </button>
      ) : (
        <Link
          href={`/dashboard/billing?upgrade=${id}`}
          className={[
            'w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold',
            ctaStyle === 'primary'
              ? 'text-white bg-brand hover:bg-brand-dark'
              : 'text-ink-2 bg-ink-7 hover:bg-ink-6',
          ].join(' ')}
        >
          Choose {tier.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  )
}

function WebsiteCard({
  name, setupPrice, setupNote, highlights, isHighlighted,
}: {
  name: string
  setupPrice: string
  setupNote: string
  highlights: string[]
  isHighlighted?: boolean
}) {
  return (
    <div className={[
      'rounded-2xl border p-5 flex flex-col bg-white',
      isHighlighted ? 'border-brand bg-brand-tint/20' : 'border-ink-6',
    ].join(' ')}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-bold text-ink">Website — {name}</h3>
        {isHighlighted && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white">
            Free setup
          </span>
        )}
      </div>
      <div className="mb-3">
        <span className="text-[24px] font-bold text-ink tabular-nums">
          {setupPrice}
        </span>
        <span className="text-[12px] text-ink-3"> setup · {setupNote}</span>
      </div>
      <ul className="space-y-1.5 mb-4 flex-1">
        {highlights.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-2">
            <Check className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/dashboard/messages?topic=Website+${encodeURIComponent(name)}`}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-ink-2 bg-bg-2 hover:bg-ink-7"
      >
        Talk to us
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
