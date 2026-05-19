/**
 * Live audit page — runs the real audit engine against the signed-in
 * client's data. Same visual structure as /dashboard/audit-preview
 * (static mockup) but pulls real findings from src/lib/audit/.
 *
 * Runs on every visit for now (cheap — just DB queries). Optionally
 * persists results to audit_runs for trend tracking via ?persist=1.
 */

import { redirect } from 'next/navigation'
import {
  Sparkles, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight,
  Search, MessageCircle, Megaphone, Target,
} from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAudit, getAuditTrend, sortFindings, quickWins, type Finding, type Category } from '@/lib/audit'
import AuditCategorySection from './category-section'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ persist?: string; client?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  /* Resolve client_id. Two paths:
       1. Normal: signed-in client_users → their client
       2. Admin override: ?client=<slug> when an admin wants to test
          another client's audit (only honored if user has role='admin') */
  let clientId: string | null = null
  let clientName = 'your restaurant'
  /* Only set when this view was loaded via admin override; threaded into
     CTAs so subsequent navigation preserves the impersonation. */
  let clientSlug: string | undefined

  /* If ?client= is present, only honor it for admins. Non-admins silently
     fall through to their normal client_users resolution — this happens
     when a CTA preserves the param through chat navigation but the user
     isn't actually an admin. Don't surface a scary error. */
  let useOverride = false
  if (params.client) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle() as { data: { role: string } | null }
    useOverride = profile?.role === 'admin'
  }

  if (useOverride && params.client) {
    const { data: c } = await admin
      .from('clients')
      .select('id, name')
      .eq('slug', params.client)
      .maybeSingle() as { data: { id: string; name: string } | null }
    if (!c) {
      return (
        <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-8 pb-20">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No client found with slug &quot;{params.client}&quot;.
          </div>
        </div>
      )
    }
    clientId = c.id
    clientName = c.name
    clientSlug = params.client
  } else {
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id, clients(name)')
      .eq('auth_user_id', user.id)
      .maybeSingle() as { data: { client_id: string; clients: { name: string } | Array<{ name: string }> | null } | null }
    if (!cu?.client_id) {
      return (
        <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-8 pb-20">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">No client account linked to your user.</p>
            <p className="text-[12.5px]">
              If you&apos;re an admin testing, append <code className="bg-amber-100 px-1 rounded">?client=&lt;slug&gt;</code> to the URL.
              For example: <code className="bg-amber-100 px-1 rounded">/dashboard/audit?client=yellowbee-market-cafe-1778830617</code>
            </p>
          </div>
        </div>
      )
    }
    clientId = cu.client_id
    clientName = (Array.isArray(cu.clients) ? cu.clients[0]?.name : cu.clients?.name) ?? 'your restaurant'
  }

  /* Pull cuisine for personalizing the narrative. */
  const { data: clientProfile } = await admin
    .from('client_profiles')
    .select('cuisine')
    .eq('client_id', clientId)
    .maybeSingle() as { data: { cuisine: string | null } | null }

  /* Run audit (with narrative) + pull trend in parallel. */
  const [audit, trend] = await Promise.all([
    runAudit(clientId, {
      persist: params.persist === '1',
      withNarrative: true,
      restaurantName: clientName,
      cuisine: clientProfile?.cuisine ?? null,
    }),
    getAuditTrend(clientId),
  ])
  const wins = quickWins(audit.findings, 3)
  const delta = trend.previous ? audit.scoreOverall - trend.previous.scoreOverall : null

  const breakdown = [
    { key: 'get_found' as Category, label: 'Get Found', score: audit.scoreGetFound, weight: 40 },
    { key: 'look_engaged' as Category, label: 'Look Engaged', score: audit.scoreLookEngaged, weight: 30 },
    { key: 'stay_active' as Category, label: 'Stay Active', score: audit.scoreStayActive, weight: 30 },
  ]

  const findingsByCategory: Record<Category, Finding[]> = {
    get_found: sortFindings(audit.findings.filter(f => f.category === 'get_found')),
    look_engaged: sortFindings(audit.findings.filter(f => f.category === 'look_engaged')),
    stay_active: sortFindings(audit.findings.filter(f => f.category === 'stay_active')),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Your Apnosh Audit</p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center gap-2">
          {clientName} <span className="text-2xl">👋</span>
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Here&apos;s what we found about your business. Re-scored when you visit, saved when you act.
        </p>
      </div>

      {/* AI narrative — Claude's read of the situation */}
      {audit.narrative && (
        <div className="bg-brand-tint/40 border border-brand/30 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-brand-dark" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-dark mb-1">
                Apnosh AI · reading your data
              </p>
              <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                {audit.narrative}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Score card */}
      <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex flex-col items-center md:items-start">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">
              Your Apnosh Score
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-[72px] leading-none font-bold text-ink tabular-nums">{audit.scoreOverall}</span>
              <span className="text-[16px] text-ink-3">/ 100</span>
              {delta !== null && delta !== 0 && (
                <span className={[
                  'text-[12px] font-bold px-2 py-1 rounded-full',
                  delta > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50',
                ].join(' ')}>
                  {delta > 0 ? '+' : ''}{delta} this week
                </span>
              )}
            </div>
            <div className="mt-2 text-[11px] text-ink-3">
              Top quartile: <strong className="text-ink-2">72</strong> · Next goal:{' '}
              <strong className="text-emerald-700">{Math.min(audit.scoreOverall + 15, 100)}</strong>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 rounded-full px-2 py-0.5">
              Live — re-scored on visit
            </div>

            {/* Sparkline of recent scores */}
            {trend.history.length >= 2 && (
              <div className="mt-3">
                <p className="text-[10px] text-ink-3 mb-1">Last {trend.history.length} scores</p>
                <Sparkline values={trend.history.map(h => h.scoreOverall)} />
              </div>
            )}
          </div>
          <div className="flex-1 w-full space-y-3 md:pl-6 md:border-l md:border-ink-7">
            {breakdown.map(b => (
              <div key={b.key}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="text-ink-2 font-medium">{b.label}</span>
                  <span className="text-ink tabular-nums font-semibold">{b.score} / 100</span>
                </div>
                <div className="h-2 bg-ink-7 rounded-full overflow-hidden">
                  <div
                    className={[
                      'h-full rounded-full transition-all',
                      b.score >= 60 ? 'bg-emerald-500' : b.score >= 40 ? 'bg-amber-500' : 'bg-rose-500',
                    ].join(' ')}
                    style={{ width: `${b.score}%` }}
                  />
                </div>
                <div className="text-[10px] text-ink-4 mt-0.5">Weight: {b.weight}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top quick wins */}
      {wins.length > 0 && (
        <div>
          <h2 className="text-[16px] font-bold text-ink flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-rose-600" />
            Top {wins.length} {wins.length === 1 ? 'quick win' : 'quick wins'} — start here
          </h2>
          <div className="space-y-2">
            {wins.map((f, i) => <QuickWinCard key={f.id} finding={f} index={i + 1} clientSlug={clientSlug} />)}
          </div>
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-semibold text-ink-2">All findings</h2>
        <AuditCategorySection
          icon="search"
          title="Get Found"
          subtitle="Local SEO + Google Business Profile + connections"
          score={audit.scoreGetFound}
          findings={findingsByCategory.get_found}
          clientSlug={clientSlug}
        />
        <AuditCategorySection
          icon="engage"
          title="Look Engaged"
          subtitle="Reviews + photos + visual presence"
          score={audit.scoreLookEngaged}
          findings={findingsByCategory.look_engaged}
          clientSlug={clientSlug}
        />
        <AuditCategorySection
          icon="active"
          title="Stay Active"
          subtitle="Menu freshness + AI usage"
          score={audit.scoreStayActive}
          findings={findingsByCategory.stay_active}
          clientSlug={clientSlug}
        />
      </div>

      {/* Path picker */}
      <div className="mt-10 bg-bg-2 rounded-2xl p-6">
        <div className="text-center mb-5">
          <Sparkles className="w-5 h-5 text-brand mx-auto mb-1" />
          <h2 className="text-[18px] font-semibold text-ink">How do you want to handle this?</h2>
          <p className="text-[12.5px] text-ink-3 mt-1">Start free, upgrade when you outgrow it. No contracts.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PathCard
            tone="muted"
            badge="FREE"
            title="I'll do it myself"
            price="$0"
            priceNote="forever"
            bullets={['See all findings + score', '5 AI messages/mo', 'No CC required']}
            ctaLabel="Get started free"
            ctaHref="/dashboard"
          />
          <PathCard
            tone="brand"
            badge="STARTER · ⭐ recommended"
            title="AI helps me"
            price="$15"
            priceNote="/month"
            bullets={['AI fixes the quick wins', '100 messages/mo', 'Drafts reviews + posts', 'Weekly re-score']}
            ctaLabel="Choose Starter"
            ctaHref="/dashboard/billing?upgrade=basic"
          />
          <PathCard
            tone="dark"
            badge="HANDS-OFF · DONE FOR YOU"
            title="Apnosh does it for me"
            price="$349"
            priceNote="/month · Foundation"
            bullets={['Our team handles everything', 'Monthly content shoot (Growth+)', 'Dedicated strategist', 'Free 30-min kickoff call']}
            ctaLabel="Talk to us"
            ctaHref="/dashboard/messages?topic=Apnosh+Foundation"
          />
        </div>
      </div>
    </div>
  )
}

function QuickWinCard({ finding, index, clientSlug }: { finding: Finding; index: number; clientSlug?: string }) {
  const ringClass = finding.severity === 'critical' ? 'border-rose-200' : 'border-amber-200'
  const numClass = finding.severity === 'critical' ? 'bg-rose-600' : 'bg-amber-600'
  const params = new URLSearchParams()
  if (finding.ctaPrompt) params.set('ask', finding.ctaPrompt)
  if (clientSlug) params.set('client', clientSlug)
  const ctaHref = finding.ctaPrompt ? `/dashboard/audit?${params.toString()}` : undefined
  const impact = finding.scoreImpact ?? 0
  return (
    <div className={`bg-white rounded-xl border ${ringClass} p-4 flex items-start gap-3`}>
      <div className={`w-7 h-7 rounded-full ${numClass} text-white flex items-center justify-center text-[12px] font-bold flex-shrink-0`}>
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h3 className="text-[14px] font-semibold text-ink">{finding.headline}</h3>
          {impact > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex-shrink-0">
              +{impact} pts possible
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-ink-3 mt-1">{finding.evidence}</p>
        <p className="text-[11px] text-ink-4 mt-1 italic">{finding.benchmark}</p>
        {finding.whyItMatters && (
          <details className="mt-2">
            <summary className="text-[11px] text-ink-3 hover:text-ink cursor-pointer font-medium">
              Why this matters →
            </summary>
            <p className="text-[11.5px] text-ink-2 mt-1.5 leading-relaxed pl-1">{finding.whyItMatters}</p>
          </details>
        )}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {finding.ctaPrimary && (
            ctaHref ? (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-semibold text-white bg-brand hover:bg-brand-dark"
              >
                {finding.ctaPrimary}
                <ArrowRight className="w-3 h-3" />
              </a>
            ) : (
              <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-semibold text-white bg-brand hover:bg-brand-dark">
                {finding.ctaPrimary}
                <ArrowRight className="w-3 h-3" />
              </button>
            )
          )}
          {finding.ctaSecondary && (
            <button className="text-[11.5px] text-ink-3 hover:text-ink px-2 py-1">
              {finding.ctaSecondary}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 140
  const height = 28
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 100)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = values[values.length - 1]
  const first = values[0]
  const stroke = last >= first ? 'rgb(5 150 105)' : 'rgb(225 29 72)'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Score history">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PathCard({
  tone, badge, title, price, priceNote, bullets, ctaLabel, ctaHref,
}: {
  tone: 'muted' | 'brand' | 'dark'
  badge: string
  title: string
  price: string
  priceNote: string
  bullets: string[]
  ctaLabel: string
  ctaHref: string
}) {
  const styles = tone === 'dark'
    ? { card: 'bg-ink text-white border-ink-2', badge: 'bg-brand text-white', title: 'text-white', price: 'text-white', note: 'text-white/60', bullet: 'text-white/80', cta: 'text-ink bg-white hover:bg-white/90' }
    : tone === 'brand'
    ? { card: 'bg-white border-ink-3 shadow-md', badge: 'bg-ink text-white', title: 'text-ink', price: 'text-ink', note: 'text-ink-3', bullet: 'text-ink-2', cta: 'text-white bg-brand hover:bg-brand-dark' }
    : { card: 'bg-white border-ink-6', badge: 'bg-bg-2 text-ink-3', title: 'text-ink', price: 'text-ink', note: 'text-ink-3', bullet: 'text-ink-2', cta: 'text-ink-2 bg-ink-7 hover:bg-ink-6' }
  return (
    <div className={`rounded-2xl border p-5 flex flex-col ${styles.card}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full self-start mb-2 ${styles.badge}`}>
        {badge}
      </span>
      <h3 className={`text-[16px] font-bold ${styles.title}`}>{title}</h3>
      <div className="mt-3 mb-4">
        <span className={`text-[28px] font-bold tabular-nums ${styles.price}`}>{price}</span>
        <span className={`text-[12px] ${styles.note}`}> {priceNote}</span>
      </div>
      <ul className="space-y-1.5 mb-4 flex-1">
        {bullets.map((b, i) => (
          <li key={i} className={`flex items-start gap-2 text-[12.5px] ${styles.bullet}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a
        href={ctaHref}
        className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold ${styles.cta}`}
      >
        {ctaLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

/* Suppress unused warnings for the icons we re-import in category-section. */
void Search; void MessageCircle; void Megaphone; void AlertCircle; void AlertTriangle
