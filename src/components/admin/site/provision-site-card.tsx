'use client'

/**
 * Provisioning state card on the per-client admin site page.
 *
 * Three states:
 *   1. Not provisioned: shows "Provision site" button -> creates
 *      GitHub repo from template + Vercel project
 *   2. Provisioned (external_repo): shows repo URL, live URL,
 *      deploy hook status; offers a "Trigger redeploy" button
 *   3. Other site types (apnosh_generated, apnosh_custom, none):
 *      shows a small status line, no actions
 *
 * Provisioning takes ~10-20 seconds because we wait briefly between
 * GitHub generate + the patch-content calls. Button shows a spinner
 * + a "this can take ~30s" hint.
 */

import { useState, useTransition } from 'react'
import {
  GitBranch, ExternalLink, Loader2, Rocket, CheckCircle2, AlertCircle, Webhook,
} from 'lucide-react'
import { provisionClientSite } from '@/lib/admin/provision-client-site'

interface Props {
  clientId: string
  clientName: string
  clientSlug: string
  siteType: string | null
  repoUrl: string | null
  siteUrl: string | null
  hasDeployHook: boolean
}

export default function ProvisionSiteCard({
  clientId, clientName, clientSlug, siteType, repoUrl, siteUrl, hasDeployHook,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [, startTransition] = useTransition()

  const provisioned = siteType === 'external_repo' && !!repoUrl

  async function handleProvision() {
    if (busy) return
    if (!confirm(`Provision a new GitHub repo + Vercel project for ${clientName}?\n\nThis creates Apnosh/${clientSlug} from the site-template and links it to a new Vercel project at ${clientSlug}.vercel.app.`)) {
      return
    }
    setBusy(true)
    setResult(null)
    const res = await provisionClientSite(clientId)
    setBusy(false)
    if (res.success) {
      setResult({ ok: true, msg: `Repo: ${res.repoHtmlUrl}` })
      startTransition(() => { window.location.reload() })
    } else {
      setResult({ ok: false, msg: res.error })
    }
  }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-ink-7 flex items-center justify-center flex-shrink-0">
          <GitBranch className="w-5 h-5 text-ink-2" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-ink">Hosting & deploys</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Each client gets their own GitHub repo + Vercel project, auto-deployed on push to <code className="text-[11px] bg-bg-2 px-1 rounded">main</code>.
          </p>
        </div>
      </div>

      {provisioned ? (
        <div className="space-y-2.5">
          <Row
            label="GitHub repo"
            icon={GitBranch}
            href={repoUrl!}
            value={repoUrl!.replace('https://github.com/', '')}
          />
          {siteUrl && (
            <Row
              label="Live URL"
              icon={ExternalLink}
              href={siteUrl}
              value={siteUrl.replace(/^https?:\/\//, '')}
            />
          )}
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <Webhook className="w-3.5 h-3.5" />
            Deploy hook: {hasDeployHook
              ? <span className="text-emerald-700 font-medium">Connected</span>
              : <span className="text-amber-700 font-medium">Not configured</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] text-ink-3 leading-relaxed">
            {siteType === 'none' || siteType === null
              ? `No site repo yet. Provisioning creates Apnosh/${clientSlug} from the site-template + a Vercel project.`
              : siteType === 'apnosh_generated' || siteType === 'apnosh_custom'
                ? `This client is on an Apnosh-managed site (site_type=${siteType}). Provisioning a GitHub-per-client repo would migrate them to the new architecture.`
                : `Site type is "${siteType}".`}
          </div>
          <button
            type="button"
            onClick={handleProvision}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            {busy ? 'Provisioning...' : 'Provision site'}
          </button>
          {busy && (
            <p className="text-[11px] text-ink-4">Takes ~20-30s (GitHub repo + Vercel project + deploy hook)</p>
          )}
        </div>
      )}

      {result && (
        <div className={`mt-3 flex items-start gap-2 p-3 rounded-lg text-[12.5px] ${
          result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <div className="break-all">{result.msg}</div>
        </div>
      )}
    </div>
  )
}

function Row({ label, icon: Icon, href, value }: {
  label: string
  icon: typeof GitBranch
  href: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-bg-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">{label}</span>
        <span className="text-[12.5px] text-ink-2 truncate">{value}</span>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-medium text-brand hover:underline inline-flex items-center gap-1"
      >
        Open <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  )
}
