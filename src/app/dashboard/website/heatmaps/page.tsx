import Link from 'next/link'
import {
  Activity, ExternalLink, Eye, Film, Flame, Zap, MousePointerClick,
  ArrowDownToLine, Plug, Sparkles, AlertCircle,
} from 'lucide-react'
import { getWebsiteSetupState } from '@/lib/dashboard/website-setup'

/**
 * Heatmaps tab. Anchors a client's Microsoft Clarity project inside
 * the Apnosh portal -- not via iframe (Clarity blocks X-Frame) but
 * via deep links into specific Clarity views. We also explain what
 * each Clarity feature does so owners know which link to click for
 * which question.
 *
 * Long-term, hook the Clarity Data Export API in here to render
 * summary stats (sessions, rage clicks, dead clicks, scroll depth)
 * in-portal so owners only leave for the actual recordings.
 */

const CLARITY_BASE = 'https://clarity.microsoft.com/projects/view'

interface ClarityFeature {
  id: string
  label: string
  description: string
  icon: typeof Eye
  path: string  // appended to CLARITY_BASE/[projectId]
}

const FEATURES: ClarityFeature[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Sessions, pages per session, scroll depth, top countries — your at-a-glance Clarity overview.',
    icon: Activity,
    path: '/dashboard',
  },
  {
    id: 'recordings',
    label: 'Session recordings',
    description: 'Watch real videos of visitors browsing your site. Best for "what are they actually doing on the menu page?"',
    icon: Film,
    path: '/impressions',
  },
  {
    id: 'heatmaps',
    label: 'Heatmaps',
    description: 'See where people click and how far they scroll. Useful for "is our hero working?" or "do they ever reach the footer?"',
    icon: Flame,
    path: '/heatmaps',
  },
  {
    id: 'rage-clicks',
    label: 'Rage clicks',
    description: 'Visitors clicking the same spot over and over — usually a broken button or a non-clickable element that looks clickable.',
    icon: Zap,
    path: '/impressions?filter=rage',
  },
  {
    id: 'dead-clicks',
    label: 'Dead clicks',
    description: 'Clicks that lead nowhere — confused visitors clicking on images, headlines, or decorative elements.',
    icon: MousePointerClick,
    path: '/impressions?filter=dead',
  },
  {
    id: 'excessive-scrolling',
    label: 'Excessive scrolling',
    description: 'People scrolling up and down hunting for something. Sign your information architecture needs work.',
    icon: ArrowDownToLine,
    path: '/impressions?filter=excessiveScrolling',
  },
]

export default async function HeatmapsPage() {
  const state = await getWebsiteSetupState()

  // No client context (shouldn't happen for a signed-in client, but
  // guard so the page never explodes).
  if (!state) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20">
        <p className="text-ink-3">Please sign in to view this page.</p>
      </div>
    )
  }

  const projectId = state.clarityProjectId

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Website
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <Activity className="w-6 h-6 text-ink-4" />
            Heatmaps & recordings
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            See what visitors actually do on your site — powered by Microsoft Clarity.
          </p>
        </div>
        {projectId && (
          <a
            href={`${CLARITY_BASE}/${projectId}/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            Open Clarity
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {!projectId ? (
        <EmptyState />
      ) : (
        <>
          {/* Heads-up about Clarity's gating behavior. Until Clarity
             records its first session, every link below force-redirects
             to their "Almost there" install page. This is Clarity's
             behavior, not ours, but the chip explains it so owners
             aren't confused when they click. */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <div className="font-semibold">Clarity is waiting for your first visitor</div>
              <p className="mt-0.5 leading-relaxed">
                Until Clarity records its first session (usually 30 min – 2 hours after the snippet goes live),
                clicking the cards below will land on Clarity&apos;s &quot;Almost there&quot; install page. Once data arrives,
                these links open straight into the right view. Send a couple of test visits to{' '}
                {state.websiteUrl ? (
                  <a href={state.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    your site
                  </a>
                ) : 'your site'}{' '}
                to speed it up.
              </p>
            </div>
          </div>

          {/* Why iframe-free notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-2 border border-ink-6 text-[12px] text-ink-3">
            <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-brand" />
            <p>
              Clarity doesn&apos;t let us show recordings or heatmaps inside the portal — those open in a
              new tab. Pick a view below and we&apos;ll deep-link you straight to it.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <a
                  key={f.id}
                  href={`${CLARITY_BASE}/${projectId}${f.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-white rounded-xl border border-ink-6 p-4 hover:border-brand hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5 text-brand" />
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-ink-4 group-hover:text-brand" />
                  </div>
                  <div className="font-semibold text-ink text-[14px] mt-1">{f.label}</div>
                  <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">{f.description}</p>
                </a>
              )
            })}
          </div>

          {/* Project info footer */}
          <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
                Clarity project
              </div>
              <div className="text-sm text-ink font-medium mt-0.5">{projectId}</div>
            </div>
            <Link
              href="/dashboard/website/setup"
              className="text-[12px] text-ink-3 hover:text-ink-2 inline-flex items-center gap-1"
            >
              Manage in setup
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
      <div className="w-14 h-14 rounded-full bg-brand/10 mx-auto mb-4 flex items-center justify-center">
        <Activity className="w-7 h-7 text-brand" />
      </div>
      <h2 className="text-[18px] font-semibold text-ink">Connect Microsoft Clarity</h2>
      <p className="text-[13px] text-ink-3 mt-1 max-w-md mx-auto">
        Free heatmaps, session recordings, and frustration signals — see exactly what visitors do on your site.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Link
          href="/dashboard/website/setup"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
        >
          <Plug className="w-3.5 h-3.5" />
          Start setup
        </Link>
        <a
          href="https://clarity.microsoft.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-ink-2 bg-ink-7 hover:bg-ink-6"
        >
          Learn more
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
        <Feature icon={Film} title="Session recordings" body="Watch real visits like a movie." />
        <Feature icon={Flame} title="Heatmaps" body="See clicks and scroll depth on every page." />
        <Feature icon={AlertCircle} title="Frustration signals" body="Catch rage clicks, dead clicks, hesitation." />
      </div>
    </div>
  )
}

function Feature({ icon: Icon, title, body }: { icon: typeof Eye; title: string; body: string }) {
  return (
    <div className="bg-bg-2 rounded-lg p-3">
      <Icon className="w-4 h-4 text-brand mb-1.5" />
      <div className="text-[13px] font-medium text-ink">{title}</div>
      <div className="text-[11px] text-ink-3 mt-0.5">{body}</div>
    </div>
  )
}
