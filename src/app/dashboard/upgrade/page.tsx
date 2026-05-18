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
          Start free. Upgrade when you outgrow it. Cancel anytime, no contracts.
          <br />
          <span className="text-ink-4 text-[12px]">14-day money-back guarantee on paid plans.</span>
        </p>
      </div>

      {/* === The hybrid ladder: Free + 2 paid self-serve + Managed (sales-led) === */}
      <div className="text-center text-[11px] uppercase tracking-wider text-ink-4 mb-2">
        <span className="bg-bg-2 rounded-full px-3 py-1">Self-serve · You drive the AI</span>
        <span className="mx-2">→</span>
        <span className="bg-ink-7 rounded-full px-3 py-1">Done for you · Our team + AI</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <TierCard
          id="starter"
          headline="Try Apnosh free — no credit card"
          highlights={[
            'Read your Google insights',
            'See AI-suggested actions',
            '5 chat messages / month',
            '1 location',
          ]}
          gotchas="Read-only — upgrade to act on insights"
          isCurrent={currentTier === 'starter'}
          ctaStyle="secondary"
        />
        <TierCard
          id="basic"
          headline="The obvious yes for indie owners"
          highlights={[
            'AI handles Google posts + hours',
            'Drafts review responses',
            'Generates content ideas',
            'Weekly recap of what changed',
            '100 messages / month',
          ]}
          gotchas="1 location · You ask, AI does"
          isCurrent={currentTier === 'basic'}
          ctaStyle="primary"
          recommended
        />
        <TierCard
          id="standard"
          headline="For active operators + multi-location"
          highlights={[
            'Everything in Starter +',
            'Unlimited messages',
            'Daily proactive insights',
            'Reads sales, reviews, analytics continuously',
            'Multi-location rollup dashboard',
            'Custom playbooks for your brand',
          ]}
          gotchas="$35 per location — multi-loc scales linearly"
          isCurrent={currentTier === 'standard' || currentTier === 'pro'}
          ctaStyle="secondary"
        />
        {/* Managed: not in TIERS map — quote-based, sales-led. */}
        <ManagedCard />
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
          <strong className="text-ink-2">Multi-location:</strong> $35 per location on Pro — a 3-location group is $105/mo.
          Volume discounts available for 5+ locations — talk to us.
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
        {tier.priceCents === 0 ? (
          <>
            <span className="text-[30px] font-bold text-ink tabular-nums">Free</span>
            <span className="text-sm text-ink-3"> forever</span>
          </>
        ) : (
          <>
            <span className="text-[30px] font-bold text-ink tabular-nums">
              ${tier.priceCents / 100}
            </span>
            <span className="text-sm text-ink-3"> / {id === 'standard' ? 'location / mo' : 'mo'}</span>
          </>
        )}
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
      ) : id === 'starter' ? (
        /* Free tier — no Stripe checkout. If they're already a logged-in
           user, the "free plan" experience is just the dashboard; if they
           landed here unsigned, the Apnosh login flow gets them there. */
        <Link
          href="/dashboard"
          className={[
            'w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold',
            'text-ink-2 bg-ink-7 hover:bg-ink-6',
          ].join(' ')}
        >
          Get started free
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
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

/*
 * ManagedCard — the 4th rung on the ladder. Not in TIERS map because
 * it's quote-based / sales-led, not self-serve checkout. Renders as a
 * dark-themed card to visually signal "different motion" without
 * leaving the ladder.
 */
function ManagedCard() {
  const bullets = [
    'Everything in AI Strategist+',
    'Our team posts to your socials 3-5x/week',
    'Monthly strategy memo from a real strategist',
    'Photo direction + ad campaign management',
    'Dedicated point of contact',
    'White-glove onboarding',
  ]
  return (
    <div className="rounded-2xl border bg-ink text-white p-5 flex flex-col shadow-md border-ink-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold text-white">Apnosh Managed</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white">
          Done for you
        </span>
      </div>
      <p className="text-[12.5px] text-white/70 mb-3 min-h-[2.5em]">
        Our team does the work. AI does the heavy lifting behind the scenes.
      </p>
      <div className="mb-4">
        <span className="text-[30px] font-bold text-white tabular-nums">
          $399+
        </span>
        <span className="text-sm text-white/60"> / location / mo</span>
      </div>
      <ul className="space-y-1.5 mb-4 flex-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/90">
            <Check className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-white/50 italic mb-3">
        Quote-based · Custom to your locations + scope
      </div>
      <Link
        href="/dashboard/messages?topic=Apnosh+Managed+—+let%27s+talk"
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-ink bg-white hover:bg-white/90"
      >
        Talk to us
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
