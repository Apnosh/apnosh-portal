'use client'

/**
 * 5-step Connect-your-website wizard.
 *
 * Steps:
 *   1. Website URL              -> writes clients.website
 *   2. Google Analytics         -> hands off to /api/auth/google (returnTo brings you back here)
 *   3. Google Search Console    -> hands off to /api/auth/google-search-console
 *   4. Microsoft Clarity        -> writes clients.clarity_project_id (optional)
 *   5. Done                     -> shows summary, links to /dashboard/website
 *
 * The wizard is "resumable": the active step is computed from the
 * DB state passed in via initialState, so refreshing or returning
 * from an OAuth callback lands the client on the right step.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Globe, BarChart3, Search, Activity, Check, ArrowRight,
  ArrowLeft, ExternalLink, Sparkles, AlertCircle,
} from 'lucide-react'
import {
  saveWebsiteUrl, saveClarityProjectId, type WebsiteSetupState,
} from '@/lib/dashboard/website-setup'

type StepKey = 'url' | 'ga' | 'gsc' | 'clarity' | 'done'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'url', label: 'Website' },
  { key: 'ga', label: 'Analytics' },
  { key: 'gsc', label: 'Search' },
  { key: 'clarity', label: 'Heatmaps' },
  { key: 'done', label: 'Done' },
]

function pickInitialStep(s: WebsiteSetupState): StepKey {
  if (!s.websiteUrl) return 'url'
  if (!s.gaConnected) return 'ga'
  if (!s.gscConnected) return 'gsc'
  if (!s.clarityProjectId) return 'clarity'
  return 'done'
}

export default function SetupWizard({ initialState }: { initialState: WebsiteSetupState }) {
  const router = useRouter()
  const [state, setState] = useState(initialState)
  const [step, setStep] = useState<StepKey>(() => pickInitialStep(initialState))

  const stepIndex = useMemo(() => STEPS.findIndex(s => s.key === step), [step])

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Website setup
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Connect your website
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Five quick steps. You can stop after any step and pick back up here later.
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-ink-6 p-4">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || step === 'done'
            const active = i === stepIndex && step !== 'done'
            return (
              <div key={s.key} className="flex-1 flex items-center gap-2">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold',
                      done ? 'bg-brand text-white' :
                      active ? 'bg-brand/15 text-brand border-2 border-brand' :
                      'bg-ink-7 text-ink-4',
                    ].join(' ')}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div className={[
                    'text-[10px] font-medium',
                    done || active ? 'text-ink-2' : 'text-ink-4',
                  ].join(' ')}>
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={['h-px flex-1 -mt-4', done ? 'bg-brand' : 'bg-ink-6'].join(' ')} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step body */}
      {step === 'url' && (
        <UrlStep
          initialUrl={state.websiteUrl}
          onSaved={(url) => {
            setState(s => ({ ...s, websiteUrl: url }))
            setStep('ga')
          }}
        />
      )}
      {step === 'ga' && (
        <GaStep
          clientId={state.clientId}
          connected={state.gaConnected}
          accountName={state.gaAccountName}
          onSkip={() => setStep('gsc')}
          onBack={() => setStep('url')}
        />
      )}
      {step === 'gsc' && (
        <GscStep
          clientId={state.clientId}
          connected={state.gscConnected}
          siteUrl={state.gscSiteUrl}
          onSkip={() => setStep('clarity')}
          onBack={() => setStep('ga')}
        />
      )}
      {step === 'clarity' && (
        <ClarityStep
          initialProjectId={state.clarityProjectId}
          onSaved={(id) => {
            setState(s => ({ ...s, clarityProjectId: id }))
            setStep('done')
          }}
          onSkip={() => setStep('done')}
          onBack={() => setStep('gsc')}
        />
      )}
      {step === 'done' && (
        <DoneStep state={state} onFinish={() => router.push('/dashboard/website')} />
      )}
    </div>
  )
}

/* --------------------- Step 1: Website URL --------------------- */

function UrlStep({
  initialUrl,
  onSaved,
}: {
  initialUrl: string | null
  onSaved: (url: string) => void
}) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await saveWebsiteUrl(url)
    setSaving(false)
    if (!res.success) {
      setError(res.error)
      return
    }
    onSaved(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
  }

  return (
    <Card icon={Globe} title="What's your website?" subtitle="The address visitors type into their browser.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="yourrestaurant.com"
          className="w-full px-4 py-3 rounded-lg border border-ink-6 bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          autoFocus
        />
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !url.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Continue'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </Card>
  )
}

/* --------------------- Step 2: Google Analytics --------------------- */

function GaStep({
  clientId,
  connected,
  accountName,
  onSkip,
  onBack,
}: {
  clientId: string
  connected: boolean
  accountName: string | null
  onSkip: () => void
  onBack: () => void
}) {
  const oauthUrl = `/api/auth/google?clientId=${clientId}&returnTo=${encodeURIComponent('/dashboard/website/setup')}`

  return (
    <Card
      icon={BarChart3}
      title="Connect Google Analytics"
      subtitle="See how many people visit your website and where they come from."
    >
      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-brand/5 border border-brand/20">
            <Check className="w-4 h-4 text-brand flex-shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-ink">Connected</div>
              {accountName && <div className="text-ink-3 text-xs">{accountName}</div>}
            </div>
          </div>
          <StepNav onBack={onBack} onNext={onSkip} nextLabel="Continue" />
        </div>
      ) : (
        <div className="space-y-3">
          <a
            href={oauthUrl}
            className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            Connect with Google
          </a>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-3 hover:text-ink-2 select-none">
              I don&apos;t have Google Analytics yet
            </summary>
            <div className="mt-3 p-4 rounded-lg bg-bg-2 text-ink-2 space-y-2 text-[13px]">
              <p>No problem. Google Analytics is free and takes about 10 minutes to set up.</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Go to <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">analytics.google.com <ExternalLink className="w-3 h-3" /></a></li>
                <li>Sign in with your Google account and click &quot;Start measuring&quot;</li>
                <li>Add a tracking tag to your website (your web designer can help, or message your AM)</li>
                <li>Come back here and click &quot;Connect with Google&quot; above</li>
              </ol>
            </div>
          </details>
          <StepNav onBack={onBack} onNext={onSkip} nextLabel="Skip for now" nextVariant="ghost" />
        </div>
      )}
    </Card>
  )
}

/* --------------------- Step 3: Google Search Console --------------------- */

function GscStep({
  clientId,
  connected,
  siteUrl,
  onSkip,
  onBack,
}: {
  clientId: string
  connected: boolean
  siteUrl: string | null
  onSkip: () => void
  onBack: () => void
}) {
  const oauthUrl = `/api/auth/google-search-console?clientId=${clientId}&returnTo=${encodeURIComponent('/dashboard/website/setup')}`

  return (
    <Card
      icon={Search}
      title="Connect Search Console"
      subtitle="See which Google searches bring people to your website."
    >
      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-brand/5 border border-brand/20">
            <Check className="w-4 h-4 text-brand flex-shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-ink">Connected</div>
              {siteUrl && <div className="text-ink-3 text-xs">{siteUrl}</div>}
            </div>
          </div>
          <StepNav onBack={onBack} onNext={onSkip} nextLabel="Continue" />
        </div>
      ) : (
        <div className="space-y-3">
          <a
            href={oauthUrl}
            className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            Connect with Google
          </a>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-3 hover:text-ink-2 select-none">
              I haven&apos;t set up Search Console yet
            </summary>
            <div className="mt-3 p-4 rounded-lg bg-bg-2 text-ink-2 space-y-2 text-[13px]">
              <p>Search Console is a free Google tool that shows what people search to find you.</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">search.google.com/search-console <ExternalLink className="w-3 h-3" /></a></li>
                <li>Add your website as a property</li>
                <li>Verify ownership (the &quot;HTML tag&quot; method is easiest if you have GA)</li>
                <li>Come back and click &quot;Connect with Google&quot; above</li>
              </ol>
            </div>
          </details>
          <StepNav onBack={onBack} onNext={onSkip} nextLabel="Skip for now" nextVariant="ghost" />
        </div>
      )}
    </Card>
  )
}

/* --------------------- Step 4: Microsoft Clarity --------------------- */

function ClarityStep({
  initialProjectId,
  onSaved,
  onSkip,
  onBack,
}: {
  initialProjectId: string | null
  onSaved: (id: string) => void
  onSkip: () => void
  onBack: () => void
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!projectId.trim()) { onSkip(); return }
    setSaving(true)
    setError(null)
    const res = await saveClarityProjectId(projectId)
    setSaving(false)
    if (!res.success) {
      setError(res.error)
      return
    }
    onSaved(projectId.trim())
  }

  return (
    <Card
      icon={Activity}
      title="Add Microsoft Clarity"
      subtitle="Watch session recordings of real visitors. Free and optional."
    >
      <div className="space-y-3">
        <input
          type="text"
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          placeholder="Clarity project ID (e.g. abc123xyz)"
          className="w-full px-4 py-3 rounded-lg border border-ink-6 bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
        {error && <ErrorBox message={error} />}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-3 hover:text-ink-2 select-none">
            Where do I find my Clarity project ID?
          </summary>
          <div className="mt-3 p-4 rounded-lg bg-bg-2 text-ink-2 space-y-2 text-[13px]">
            <p>Microsoft Clarity is free and shows you exactly what visitors click on your site.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Go to <a href="https://clarity.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-0.5">clarity.microsoft.com <ExternalLink className="w-3 h-3" /></a></li>
              <li>Sign in and create a new project for your website</li>
              <li>Copy the project ID from the setup page (short alphanumeric code)</li>
              <li>Paste it above</li>
            </ol>
          </div>
        </details>
        <StepNav
          onBack={onBack}
          onNext={handleSave}
          nextLabel={projectId.trim() ? (saving ? 'Saving...' : 'Continue') : 'Skip for now'}
          nextVariant={projectId.trim() ? 'primary' : 'ghost'}
          disabled={saving}
        />
      </div>
    </Card>
  )
}

/* --------------------- Step 5: Done --------------------- */

function DoneStep({ state, onFinish }: { state: WebsiteSetupState; onFinish: () => void }) {
  const items = [
    { label: 'Website URL', ok: !!state.websiteUrl, detail: state.websiteUrl },
    { label: 'Google Analytics', ok: state.gaConnected, detail: state.gaAccountName },
    { label: 'Search Console', ok: state.gscConnected, detail: state.gscSiteUrl },
    { label: 'Microsoft Clarity', ok: !!state.clarityProjectId, detail: state.clarityProjectId, optional: true },
  ]
  const connectedCount = items.filter(i => i.ok).length

  return (
    <Card
      icon={Check}
      title={`You're all set${connectedCount < 4 ? '!' : ' 🎉'}`}
      subtitle={`${connectedCount} of 4 connected. Your data will start syncing within a few hours.`}
    >
      <div className="space-y-2 mb-4">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-bg-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={[
                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                item.ok ? 'bg-brand text-white' : 'bg-ink-6 text-ink-4',
              ].join(' ')}>
                {item.ok ? <Check className="w-3 h-3" /> : null}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{item.label}</div>
                {item.detail && <div className="text-[11px] text-ink-3 truncate">{item.detail}</div>}
              </div>
            </div>
            {!item.ok && (
              <span className="text-[11px] text-ink-4">{item.optional ? 'Optional' : 'Skipped'}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/website/setup" className="text-sm text-ink-3 hover:text-ink-2">
          Connect more later
        </Link>
        <button
          onClick={onFinish}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
        >
          Go to dashboard
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  )
}

/* --------------------- Shared bits --------------------- */

function Card({
  icon: Icon, title, subtitle, children,
}: {
  icon: typeof Globe
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <p className="text-[13px] text-ink-3 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function StepNav({
  onBack, onNext, nextLabel, nextVariant = 'primary', disabled,
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextVariant?: 'primary' | 'ghost'
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className={[
          'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50',
          nextVariant === 'primary'
            ? 'text-white bg-brand hover:bg-brand-dark'
            : 'text-ink-2 hover:text-ink bg-ink-7 hover:bg-ink-6',
        ].join(' ')}
      >
        {nextLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}
