/**
 * STATIC MOCKUP — Apnosh Score audit preview.
 *
 * Visual prototype of the Day-1 onboarding audit. Hardcoded findings
 * for "Maria's Tacos" so it renders the same regardless of which
 * client is signed in. No data fetching. Lives at /dashboard/audit-preview.
 *
 * Delete this route once we've validated the design and built the real
 * audit engine.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight,
  Search, MessageCircle, Megaphone, ChevronDown, ChevronUp, Target,
} from 'lucide-react'

type Severity = 'critical' | 'warning' | 'strength'

interface Finding {
  severity: Severity
  headline: string
  evidence: string
  benchmark: string
  ctaPrimary?: string
  ctaSecondary?: string
}

const QUICK_WINS: Finding[] = [
  {
    severity: 'critical',
    headline: '47 reviews waiting for a reply',
    evidence: 'Across Google (32), Yelp (12), TripAdvisor (3). Oldest unanswered is 67 days old.',
    benchmark: 'Restaurants replying within 24h see 18% more repeat customers.',
    ctaPrimary: 'Have AI draft replies',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'critical',
    headline: 'Your hours are inconsistent across 3 places',
    evidence: 'Google says Mon-Sat 9am-9pm. Yelp says Mon-Sun 10am-10pm. Your website shows different.',
    benchmark: 'Mismatched hours are the #1 cause of bad reviews and lost trust.',
    ctaPrimary: 'Tell us your real hours — AI updates everywhere',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'critical',
    headline: 'No Google posts in 14 days',
    evidence: 'Google posts appear in search and on your Maps listing for 7 days.',
    benchmark: 'Restaurants posting 2x/week see 30% more profile clicks.',
    ctaPrimary: 'Generate 3 post ideas — AI drafts them now',
    ctaSecondary: 'Skip',
  },
]

const GET_FOUND: Finding[] = [
  {
    severity: 'critical',
    headline: 'Your Google profile is missing 3 critical fields',
    evidence: "You haven't filled in: phone, attributes (outdoor seating, dog friendly, etc.), and website URL has a typo.",
    benchmark: 'Top performers fill 95%+ of available fields. You\'re at 71%.',
    ctaPrimary: 'Fix all 3 in 60 seconds',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'critical',
    headline: 'Your hours are inconsistent across 3 places',
    evidence: 'Google, Yelp, and your website all show different hours.',
    benchmark: 'Mismatched hours are the #1 cause of bad reviews.',
    ctaPrimary: 'Sync your hours everywhere',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'warning',
    headline: '3 listings unclaimed (Yelp, TripAdvisor, Apple Maps)',
    evidence: 'These sites already list Maria\'s Tacos but you don\'t manage them.',
    benchmark: 'Average restaurant gets 12% of "near me" searches from Yelp alone.',
    ctaPrimary: 'Claim all 3 — we\'ll guide you',
  },
]

const LOOK_ENGAGED: Finding[] = [
  {
    severity: 'critical',
    headline: '47 reviews waiting for a reply',
    evidence: 'Oldest unanswered is 67 days old.',
    benchmark: 'Replying within 24h → 18% more repeat customers.',
    ctaPrimary: 'Have AI draft replies for review',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'strength',
    headline: '4.2★ overall — above average for your area',
    evidence: "You're rated higher than 73% of taquerias within 5 miles.",
    benchmark: 'Most common praise: "fresh ingredients" and "fast service."',
  },
  {
    severity: 'warning',
    headline: '3 recent reviews flag the same issue: service speed',
    evidence: 'Reviews from May 1, May 8, and May 14 all mention "long wait" at lunch.',
    benchmark: 'Worth a look — same root cause?',
    ctaPrimary: 'See the 3 reviews',
    ctaSecondary: 'Skip for now',
  },
  {
    severity: 'warning',
    headline: 'Your photos are 6 months stale',
    evidence: 'Last new photo added: November 2025. You currently have 4 photos.',
    benchmark: 'Top performers add 4+ photos per month. Fresh photos → 27% more profile views.',
    ctaPrimary: 'Schedule a photo shoot',
    ctaSecondary: 'Upload from your phone',
  },
]

const STAY_ACTIVE: Finding[] = [
  {
    severity: 'critical',
    headline: 'No Google posts in 14 days',
    evidence: 'Google posts appear in search results for 7 days.',
    benchmark: 'Posting 2x/week → 30% more profile clicks.',
    ctaPrimary: 'Generate 3 post ideas',
    ctaSecondary: 'Skip',
  },
  {
    severity: 'warning',
    headline: 'Your menu hasn\'t changed on Google in 3 months',
    evidence: 'Last menu update on Google: February 2026.',
    benchmark: 'Mismatched menus → angry "they didn\'t have what was advertised" reviews.',
    ctaPrimary: 'Sync menu to Google — AI handles it',
  },
  {
    severity: 'strength',
    headline: 'Strong: 1,847 monthly searches for "tacos near me" in your area',
    evidence: 'That\'s high demand. You currently show in position 3-5 on Google Maps for these searches.',
    benchmark: 'Getting to position 1-2 would mean ~30% more discovery traffic.',
  },
]

const SCORE = 38
const SCORE_BREAKDOWN = [
  { label: 'Get Found',    value: 50, weight: 40 },
  { label: 'Look Engaged', value: 35, weight: 30 },
  { label: 'Stay Active',  value: 25, weight: 30 },
]

export default function AuditPreviewPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Mockup banner */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] text-amber-900 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5" />
        <strong>Static mockup.</strong> Hardcoded data for "Maria's Tacos" to preview the Day-1 audit design.
      </div>

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Welcome to Apnosh</p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center gap-2">
          Welcome, Maria <span className="text-2xl">👋</span>
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Here's what we found about Maria's Tacos in 30 seconds.
        </p>
      </div>

      {/* Apnosh Score */}
      <ScoreCard score={SCORE} breakdown={SCORE_BREAKDOWN} />

      {/* Top 3 Quick Wins */}
      <div>
        <h2 className="text-[16px] font-bold text-ink flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-rose-600" />
          Top 3 quick wins — fix these this week
        </h2>
        <div className="space-y-2">
          {QUICK_WINS.map((f, i) => (
            <QuickWinCard key={i} finding={f} index={i + 1} />
          ))}
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-semibold text-ink-2">See all 10 findings</h2>
        <CategorySection
          icon={<Search className="w-4 h-4 text-brand" />}
          title="Get Found"
          subtitle="Local SEO + Google Business Profile + listings"
          score={50}
          findings={GET_FOUND}
        />
        <CategorySection
          icon={<MessageCircle className="w-4 h-4 text-brand" />}
          title="Look Engaged"
          subtitle="Reviews + photos + visual presence"
          score={35}
          findings={LOOK_ENGAGED}
        />
        <CategorySection
          icon={<Megaphone className="w-4 h-4 text-brand" />}
          title="Stay Active"
          subtitle="Posts, menu freshness, content cadence"
          score={25}
          findings={STAY_ACTIVE}
        />
      </div>

      {/* Path Picker */}
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
            bullets={[
              'See all findings + score',
              '5 AI messages/mo',
              'No CC required',
            ]}
            cta="Get started free"
          />
          <PathCard
            tone="brand"
            badge="STARTER · ⭐ recommended"
            title="AI helps me"
            price="$15"
            priceNote="/month"
            bullets={[
              'AI fixes the quick wins',
              '100 messages/mo',
              'Drafts reviews + posts for you',
              'Weekly re-score',
            ]}
            cta="Choose Starter"
          />
          <PathCard
            tone="dark"
            badge="HANDS-OFF · DONE FOR YOU"
            title="Apnosh does it for me"
            price="$349"
            priceNote="/month · Foundation"
            bullets={[
              'Our team handles everything',
              'Monthly content shoot (Growth+)',
              'Dedicated strategist',
              'Free 30-min kickoff call',
            ]}
            cta="Talk to us"
          />
        </div>
      </div>
    </div>
  )
}

function ScoreCard({ score, breakdown }: { score: number; breakdown: typeof SCORE_BREAKDOWN }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* The Score */}
        <div className="flex flex-col items-center md:items-start">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">
            Your Apnosh Score
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-[72px] leading-none font-bold text-ink tabular-nums">{score}</span>
            <span className="text-[16px] text-ink-3">/ 100</span>
          </div>
          <div className="mt-2 text-[11px] text-ink-3">
            Top quartile: <strong className="text-ink-2">72</strong> · Goal next month: <strong className="text-emerald-700">55</strong>
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 rounded-full px-2 py-0.5">
            Re-scored weekly
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 w-full space-y-3 md:pl-6 md:border-l md:border-ink-7">
          {breakdown.map(b => (
            <div key={b.label}>
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="text-ink-2 font-medium">{b.label}</span>
                <span className="text-ink tabular-nums font-semibold">{b.value} / 100</span>
              </div>
              <div className="h-2 bg-ink-7 rounded-full overflow-hidden">
                <div
                  className={[
                    'h-full rounded-full transition-all',
                    b.value >= 60 ? 'bg-emerald-500' : b.value >= 40 ? 'bg-amber-500' : 'bg-rose-500',
                  ].join(' ')}
                  style={{ width: `${b.value}%` }}
                />
              </div>
              <div className="text-[10px] text-ink-4 mt-0.5">Weight: {b.weight}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function QuickWinCard({ finding, index }: { finding: Finding; index: number }) {
  return (
    <div className="bg-white rounded-xl border border-rose-200 p-4 flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-[12px] font-bold flex-shrink-0">
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold text-ink">{finding.headline}</h3>
        <p className="text-[12.5px] text-ink-3 mt-1">{finding.evidence}</p>
        <p className="text-[11px] text-ink-4 mt-1 italic">{finding.benchmark}</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {finding.ctaPrimary && (
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-semibold text-white bg-brand hover:bg-brand-dark">
              {finding.ctaPrimary}
              <ArrowRight className="w-3 h-3" />
            </button>
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

function CategorySection({
  icon, title, subtitle, score, findings,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  score: number
  findings: Finding[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-2/30 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {icon}
          <div>
            <div className="text-[13.5px] font-semibold text-ink">{title}</div>
            <div className="text-[11.5px] text-ink-3">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[13px] font-bold text-ink tabular-nums">{score}<span className="text-[10px] text-ink-4"> / 100</span></div>
            <div className="text-[10px] text-ink-3">{findings.length} findings</div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-ink-4" /> : <ChevronDown className="w-4 h-4 text-ink-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-ink-6 p-4 space-y-3 bg-bg-2/20">
          {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
        </div>
      )}
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  const icon = finding.severity === 'critical' ? <AlertCircle className="w-4 h-4 text-rose-600" />
    : finding.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-600" />
    : <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  return (
    <div className="bg-white rounded-lg border border-ink-7 p-3 flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[13px] font-semibold text-ink">{finding.headline}</h4>
        <p className="text-[12px] text-ink-3 mt-0.5">{finding.evidence}</p>
        <p className="text-[11px] text-ink-4 mt-0.5 italic">{finding.benchmark}</p>
        {(finding.ctaPrimary || finding.ctaSecondary) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {finding.ctaPrimary && (
              <button className={[
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                finding.severity === 'strength' ? 'text-ink-2 bg-ink-7 hover:bg-ink-6' : 'text-white bg-brand hover:bg-brand-dark',
              ].join(' ')}>
                {finding.ctaPrimary}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {finding.ctaSecondary && (
              <button className="text-[11px] text-ink-3 hover:text-ink px-1">
                {finding.ctaSecondary}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PathCard({
  tone, badge, title, price, priceNote, bullets, cta,
}: {
  tone: 'muted' | 'brand' | 'dark'
  badge: string
  title: string
  price: string
  priceNote: string
  bullets: string[]
  cta: string
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
      <button className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold ${styles.cta}`}>
        {cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
