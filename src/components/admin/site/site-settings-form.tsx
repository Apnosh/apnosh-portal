'use client'

/**
 * Admin form for Apnosh Site settings.
 *
 * The biggest decision: which backend renders this restaurant's site?
 *
 *   none              -> No site through Apnosh, client uses their existing one
 *   apnosh_generated  -> Claude AI generates a unique site from their data
 *   apnosh_custom     -> Apnosh team hand-codes a one-off Next.js page
 *   external_repo     -> Client has their own GitHub + Vercel site,
 *                        we connect via deploy hooks + public API
 *
 * Most other settings are inferred from canonical client tables. This
 * form only stores presentation choices that don't fit elsewhere.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, CheckCircle2, AlertCircle, Globe, ExternalLink, Link2,
  Sparkles, Code, Server, Slash, Plug, XCircle, FastForward,
} from 'lucide-react'
import {
  upsertSiteSettings, testExternalSiteConnection,
  type SiteSettings, type SiteSettingsInput, type SiteType,
  type ExternalConnectionTestResult,
} from '@/lib/site-settings/actions'

interface Props {
  clientId: string
  clientSlug: string
  initial: SiteSettings | null
}

const SITE_TYPES: Array<{
  value: SiteType
  label: string
  description: string
  icon: typeof Globe
  status: 'available' | 'coming_soon' | 'admin_only'
}> = [
  {
    value: 'none',
    label: 'No site (marketing ops only)',
    description: 'Client keeps their existing website. Apnosh handles GBP, social, reviews, email but does not host or generate a site.',
    icon: Slash,
    status: 'available',
  },
  {
    value: 'apnosh_generated',
    label: 'AI-generated site',
    description: "Claude reads the client's brand voice, goals, target customer, photos, and generates a unique site. Re-generatable, editable per-section.",
    icon: Sparkles,
    status: 'coming_soon',
  },
  {
    value: 'apnosh_custom',
    label: 'Apnosh-built custom site',
    description: 'Apnosh team hand-codes a one-off Next.js page for restaurants who want bespoke design. Updates still flow through canonical data.',
    icon: Code,
    status: 'admin_only',
  },
  {
    value: 'external_repo',
    label: 'External site (GitHub + Vercel)',
    description: 'Client has their own site in their own repo. Apnosh fans out updates by triggering their Vercel deploy hook. Their site fetches data from our public API.',
    icon: Server,
    status: 'available',
  },
]

export default function SiteSettingsForm({ clientId, clientSlug, initial }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [form, setForm] = useState<SiteSettingsInput>(() => ({
    siteType: initial?.siteType ?? 'none',
    isPublished: initial?.isPublished ?? false,
    customDomain: initial?.customDomain ?? '',
    orderOnlineUrl: initial?.orderOnlineUrl ?? '',
    reservationUrl: initial?.reservationUrl ?? '',
    externalSiteUrl: initial?.externalSiteUrl ?? '',
    externalRepoUrl: initial?.externalRepoUrl ?? '',
    externalDeployHookUrl: initial?.externalDeployHookUrl ?? '',
    externalApiKey: initial?.externalApiKey ?? '',
  }))

  const update = <K extends keyof SiteSettingsInput>(k: K, v: SiteSettingsInput[K]) => {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const handleSave = async () => {
    setBusy(true)
    setMessage(null)
    const res = await upsertSiteSettings(clientId, form)
    setBusy(false)
    if (res.success) {
      setMessage({ ok: true, text: 'Saved.' })
      startTransition(() => router.refresh())
    } else {
      setMessage({ ok: false, text: res.error })
    }
  }

  const generateApiKey = () => {
    const key = `apk_${crypto.randomUUID().replace(/-/g, '')}`
    update('externalApiKey', key)
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-start gap-2 p-3 rounded-lg ${
          message.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
        }`}>
          {message.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* ── Backend type picker ───────────────────────────────── */}
      <Section title="Site backend" icon={Server}>
        <p className="text-xs text-ink-3">How is this restaurant's website built?</p>
        <div className="space-y-2">
          {SITE_TYPES.map(t => {
            const active = form.siteType === t.value
            const disabled = t.status === 'coming_soon'
            const Icon = t.icon
            return (
              <button
                key={t.value}
                type="button"
                disabled={disabled}
                onClick={() => update('siteType', t.value)}
                className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
                  active ? 'border-brand bg-brand/5' :
                  disabled ? 'border-ink-6 bg-bg-2/50 opacity-60 cursor-not-allowed' :
                  'border-ink-5 hover:border-ink-4 bg-white'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-brand' : 'text-ink-3'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${active ? 'text-ink' : 'text-ink-2'}`}>{t.label}</span>
                    {t.status === 'coming_soon' && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Coming soon</span>
                    )}
                    {t.status === 'admin_only' && (
                      <span className="text-[10px] uppercase tracking-wide text-ink-4 font-semibold">Admin only</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5 leading-snug">{t.description}</p>
                </div>
                {active && <CheckCircle2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />}
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── External-site config (only for external_repo) ─────── */}
      {form.siteType === 'external_repo' && (
        <Section title="External site connection" icon={ExternalLink}>
          <Field
            label="Public site URL"
            hint="Where the live site is. Used for the View Site link."
          >
            <input
              type="url"
              value={form.externalSiteUrl ?? ''}
              placeholder="https://yourrestaurant.com"
              onChange={e => update('externalSiteUrl', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            />
          </Field>

          <Field label="GitHub repository URL" hint="Optional, for reference">
            <input
              type="url"
              value={form.externalRepoUrl ?? ''}
              placeholder="https://github.com/yourorg/yourrestaurant-site"
              onChange={e => update('externalRepoUrl', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            />
          </Field>

          <Field
            label="Vercel deploy hook URL"
            hint="When updates publish, Apnosh POSTs here to trigger a rebuild. Get from Vercel project settings → Deploy Hooks."
          >
            <input
              type="url"
              value={form.externalDeployHookUrl ?? ''}
              placeholder="https://api.vercel.com/v1/integrations/deploy/..."
              onChange={e => update('externalDeployHookUrl', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg font-mono text-xs"
            />
          </Field>

          <Field
            label="API key (optional)"
            hint="Set this and add it to your site's env. Required for the public API to authorize fetches."
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={form.externalApiKey ?? ''}
                placeholder="apk_..."
                onChange={e => update('externalApiKey', e.target.value || null)}
                className="flex-1 px-3 py-2 text-sm border border-ink-5 rounded-lg font-mono text-xs"
              />
              <button
                type="button"
                onClick={generateApiKey}
                className="px-3 py-2 text-xs border border-ink-5 rounded-lg hover:bg-bg-2"
              >
                Generate
              </button>
            </div>
          </Field>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p className="font-semibold mb-1">External site integration</p>
            <p className="mb-2">Your external site fetches canonical data from:</p>
            <code className="block bg-white px-2 py-1 rounded font-mono text-[11px] mb-2">
              GET https://portal.apnosh.com/api/public/sites/{clientSlug}
            </code>
            <p className="mb-2">If you set an API key above, send it as <code className="font-mono">X-Apnosh-Key</code>.</p>
            <p>The endpoint returns hours, events, promotions, brand data, and social links. Apnosh POSTs to your deploy hook when updates happen.</p>
          </div>

          <ConnectionTester clientId={clientId} />
        </Section>
      )}

      {/* ── AI generation (placeholder for now) ───────────────── */}
      {form.siteType === 'apnosh_generated' && (
        <Section title="AI site generation" icon={Sparkles}>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">Coming soon</p>
            <p className="leading-snug">
              The AI generation system reads the client's brand voice, goals, target audience, brand colors,
              photos, and competitive context, then asks Claude to generate a unique site config. Build is
              planned for next session.
            </p>
          </div>
        </Section>
      )}

      {/* ── Publication state ─────────────────────────────────── */}
      {form.siteType !== 'none' && (
        <Section title="Publication" icon={Globe}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPublished ?? false}
              onChange={e => update('isPublished', e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <div>
              <div className="text-sm font-medium text-ink">Site is live</div>
              <p className="text-xs text-ink-3 mt-0.5">
                {form.siteType === 'external_repo'
                  ? 'When checked, Apnosh will trigger your deploy hook on every update.'
                  : `When checked, /sites/${clientSlug} is publicly accessible.`}
              </p>
            </div>
          </label>
        </Section>
      )}

      {/* ── Action links ──────────────────────────────────────── */}
      {form.siteType !== 'none' && (
        <Section title="Action links" icon={Link2}>
          <p className="text-xs text-ink-3">
            Used as primary CTAs on the site (Apnosh-hosted) or available via API for external sites to
            consume.
          </p>
          <Field label="Order online URL">
            <input
              type="url"
              value={form.orderOnlineUrl ?? ''}
              placeholder="https://order.toasttab.com/..."
              onChange={e => update('orderOnlineUrl', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            />
          </Field>
          <Field label="Reservation URL">
            <input
              type="url"
              value={form.reservationUrl ?? ''}
              placeholder="https://www.opentable.com/..."
              onChange={e => update('reservationUrl', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
            />
          </Field>
        </Section>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── UI helpers ────────────────────────────────────────────────

function Section({
  title, icon: Icon, children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5 space-y-4">
      <h2 className="text-sm font-bold text-ink flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-ink-3" />}
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ink-4 mt-1">{hint}</p>}
    </div>
  )
}

// ── Connection tester ──────────────────────────────────────────

function ConnectionTester({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExternalConnectionTestResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastDryRun, setLastDryRun] = useState(true)

  const run = async (dryRun: boolean) => {
    setBusy(true)
    setErrorMsg(null)
    setLastDryRun(dryRun)
    const res = await testExternalSiteConnection(clientId, { dryRun })
    setBusy(false)
    if (res.success) {
      setResult(res.data)
    } else {
      setErrorMsg(res.error)
      setResult(null)
    }
  }

  return (
    <div className="rounded-lg border border-ink-6 bg-white p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Plug className="w-4 h-4 text-ink-3" /> Connection test
          </p>
          <p className="text-[11px] text-ink-3 mt-0.5">
            Save first, then test. Dry run skips the deploy hook (no rebuild).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-ink-5 text-xs font-medium hover:bg-bg-2 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy && lastDryRun
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FastForward className="w-3.5 h-3.5" />}
            Test (dry)
          </button>
          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy && !lastDryRun
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plug className="w-3.5 h-3.5" />}
            Test full
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 text-xs rounded-md px-3 py-2 bg-red-50 text-red-700">
          {errorMsg}
        </div>
      )}

      {result && (
        <ul className="mt-3 space-y-1.5">
          <ResultRow label="Settings"          ok={result.settings.ok}              detail={result.settings.detail} />
          <ResultRow label="External site"     ok={result.externalSiteReachable.ok} detail={result.externalSiteReachable.detail} />
          <ResultRow label="Public API"        ok={result.publicApi.ok}             detail={result.publicApi.detail} />
          <ResultRow label="Deploy hook"       ok={result.deployHook.ok}            detail={result.deployHook.detail} skipped={result.deployHook.skipped} />
        </ul>
      )}
    </div>
  )
}

function ResultRow({
  label, ok, detail, skipped,
}: { label: string; ok: boolean; detail: string; skipped?: boolean }) {
  const Icon = skipped ? FastForward : ok ? CheckCircle2 : XCircle
  const color = skipped ? 'text-ink-3' : ok ? 'text-green-600' : 'text-red-600'
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <span className="font-medium text-ink">{label}: </span>
        <span className="text-ink-3">{detail}</span>
      </div>
    </li>
  )
}
