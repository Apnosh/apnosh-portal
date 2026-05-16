import Link from 'next/link'
import { Check, Sparkles, ArrowRight, Shield, Globe, Search, MessageCircle } from 'lucide-react'
import { TIERS, type TierId } from '@/lib/agent/tiers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Product picker (not a tier ladder). Two distinct products:
 *   1. AI Assistant ($29) — works with your existing website. Manages
 *      everything off-site: GBP, social, reviews, photos, insights.
 *   2. Website + AI ($99) — your website lives on Apnosh; AI can
 *      directly edit menu/hours/copy/photos.
 *
 * Setup fees are one-time and quoted separately. Strategist help is
 * billed hourly outside any subscription. Owners can switch between
 * the two products (cancel one, subscribe to the other) at any time.
 */
export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /* Resolve the current tier so we can mark the active product. */
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
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-8 pb-20">
      <div className="text-center mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Apnosh
        </p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center justify-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Pick your product
        </h1>
        <p className="text-ink-3 text-sm mt-1 max-w-2xl mx-auto">
          Per location, billed monthly. Cancel anytime — no contracts.
          <br />
          <span className="text-ink-4 text-[12px]">14-day money-back guarantee on your first month.</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
        <ProductCard
          id="basic"
          icon={<Search className="w-5 h-5 text-brand" />}
          headline="Keep your website. We handle everything else."
          bullets={[
            'Manages your Google Business Profile (posts, hours, photos)',
            'Drafts thoughtful review responses for you to approve',
            'Generates social content ideas based on your menu and reviews',
            'Weekly insights: what worked, what to try next',
            'Connects: Google Business, Instagram, Facebook, Analytics',
          ]}
          notIncluded="Cannot edit your existing website (Squarespace, Wix, WordPress, etc.) — we don't touch your site."
          isCurrent={currentTier === 'basic'}
          ctaLabel={currentTier === 'standard' ? 'Switch to AI Assistant' : 'Start AI Assistant'}
          ctaStyle="secondary"
        />
        <ProductCard
          id="standard"
          icon={<Globe className="w-5 h-5 text-white" />}
          headline="Your website + AI, all in one."
          bullets={[
            'Everything in AI Assistant, plus:',
            'Your website hosted on Apnosh (fast, secure, mobile-first)',
            'AI updates your menu, hours, page copy, and photos directly',
            'One source of truth across your site, Google, and social',
            'Setup billed separately: free template OR custom design',
          ]}
          notIncluded="Requires moving your website to Apnosh (we can migrate from most platforms)."
          isCurrent={currentTier === 'standard' || currentTier === 'pro'}
          ctaLabel={currentTier === 'basic' ? 'Add my website' : 'Get Website + AI'}
          ctaStyle="primary"
          recommended
        />
      </div>

      <div className="mt-8 max-w-4xl mx-auto bg-bg-2 rounded-2xl p-5 text-[12.5px] text-ink-2 space-y-3">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink">14-day money-back guarantee.</strong> Try either product
            risk-free. Cancel within 14 days for a full refund — no questions asked.
          </div>
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6">
          <strong className="text-ink-2">Multi-location pricing:</strong> 2nd location 20% off ·
          3rd-5th 30% off · 6+ locations 40% off.
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6">
          <strong className="text-ink-2">Website setup (one-time):</strong>{' '}
          <span className="text-emerald-700 font-semibold">Free</span> with a template ·
          <strong> $1,500</strong> for custom design.
          {' '}Template includes a 30-day commit; cancel sooner and we&apos;ll export your content.
        </div>
        <div className="text-ink-3 pt-1 border-t border-ink-6 flex items-start gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-ink-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong className="text-ink-2">Strategist help</strong> (design, brand, one-off
            campaigns) is billed hourly outside your subscription. $125/hr.{' '}
            <Link href="/dashboard/messages" className="text-brand hover:underline">Book a session →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProductCard({
  id, icon, headline, bullets, notIncluded, isCurrent, ctaLabel, ctaStyle, recommended,
}: {
  id: TierId
  icon: React.ReactNode
  headline: string
  bullets: string[]
  notIncluded: string
  isCurrent: boolean
  ctaLabel: string
  ctaStyle: 'primary' | 'secondary'
  recommended?: boolean
}) {
  const tier = TIERS[id]
  return (
    <div className={[
      'rounded-2xl border p-6 flex flex-col bg-white',
      isCurrent ? 'border-brand ring-2 ring-brand/20'
        : recommended ? 'border-ink-3 shadow-md'
          : 'border-ink-6',
    ].join(' ')}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          ctaStyle === 'primary' ? 'bg-brand' : 'bg-brand-tint'
        }`}>
          {icon}
        </div>
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
      <h2 className="text-[18px] font-bold text-ink leading-tight">{tier.label}</h2>
      <p className="text-[13px] text-ink-3 mt-1 mb-4">{headline}</p>
      <div className="mb-4">
        <span className="text-[32px] font-bold text-ink tabular-nums">
          ${tier.priceCents / 100}
        </span>
        <span className="text-sm text-ink-3"> / location / mo</span>
      </div>
      <ul className="space-y-2 mb-4 flex-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
            <Check className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-ink-3 mb-4 italic">
        {notIncluded}
      </div>
      {isCurrent ? (
        <button
          disabled
          className="w-full px-4 py-2.5 rounded-full text-sm font-semibold text-ink-3 bg-ink-7 cursor-not-allowed"
        >
          Current product
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
          {ctaLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  )
}
