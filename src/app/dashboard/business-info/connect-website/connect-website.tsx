'use client'

/**
 * Connect-your-website flow.
 *
 * Three steps for the owner:
 *   1. Grant Apnosh write access to their repo (instructions)
 *   2. Enter the repo + test the connection
 *   3. Save — we push apnosh-content.json + their Vercel auto-deploys
 *
 * Once connected, every business-info save commits the file and the
 * site redeploys. The owner's site reads apnosh-content.json (snippet
 * shown below).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Code2, Globe,
  ShieldCheck, FileJson, Link2Off,
} from 'lucide-react'
import {
  testWebsiteConnection, saveWebsiteConnection, disconnectWebsite,
  type WebsiteConnection,
} from '../website-actions'

interface Props {
  connection: WebsiteConnection
}

export default function ConnectWebsite({ connection }: Props) {
  const router = useRouter()
  const [repo, setRepo] = useState(connection.repo ?? '')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tested, setTested] = useState<{ ok: boolean; error?: string; defaultBranch?: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const onTest = () => {
    setTested(null)
    setTesting(true)
    testWebsiteConnection(repo)
      .then(r => setTested(r.ok ? { ok: true, defaultBranch: r.defaultBranch } : { ok: false, error: r.error }))
      .finally(() => setTesting(false))
  }

  const onSave = () => {
    setSaving(true)
    saveWebsiteConnection({ repoInput: repo })
      .then(r => {
        if (r.ok) router.push('/dashboard/business-info')
        else setTested({ ok: false, error: r.error })
      })
      .finally(() => setSaving(false))
  }

  const onDisconnect = () => {
    if (!confirm('Disconnect your website? Future changes won\'t sync to it.')) return
    setDisconnecting(true)
    disconnectWebsite().finally(() => {
      setDisconnecting(false)
      router.refresh()
    })
  }

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-[12px] text-ink-3 active:text-ink mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h1 className="text-[24px] font-semibold text-ink leading-tight">Connect your website</h1>
        <p className="text-[12.5px] text-ink-3 mt-0.5">
          Sync hours, contact, and info straight to your Vercel/GitHub site.
        </p>
      </div>

      {/* Already connected */}
      {connection.connected && (
        <div className="px-4 pt-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-ink">Connected</p>
              <p className="text-[12.5px] text-ink-2 mt-0.5 break-words">{connection.repo}</p>
              {connection.lastSyncedAt && (
                <p className="text-[11.5px] text-ink-3 mt-1">
                  Last synced {new Date(connection.lastSyncedAt).toLocaleString()}
                </p>
              )}
              <button
                onClick={onDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 active:text-rose-700 mt-2.5"
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {/* Step 1: grant access */}
        <StepCard n={1} icon={ShieldCheck} title="Give Apnosh access to your repo">
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            In GitHub, add <span className="font-semibold">apnosh</span> as a collaborator with
            <span className="font-semibold"> write</span> access to your website repo:
          </p>
          <ol className="text-[12.5px] text-ink-2 space-y-1 list-decimal pl-4">
            <li>Open your repo on GitHub → <span className="font-semibold">Settings → Collaborators</span></li>
            <li>Click <span className="font-semibold">Add people</span>, search <span className="font-semibold">apnosh</span></li>
            <li>Choose <span className="font-semibold">Write</span> and send the invite</li>
          </ol>
          <p className="text-[11.5px] text-ink-4 mt-2">
            We only touch one file — <code className="bg-ink-7 px-1 rounded">apnosh-content.json</code>.
          </p>
        </StepCard>

        {/* Step 2: enter repo + test */}
        <StepCard n={2} icon={Code2} title="Enter your repo & test">
          <input
            value={repo}
            onChange={e => { setRepo(e.target.value); setTested(null) }}
            placeholder="yourname/your-website"
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input mb-2"
          />
          <p className="text-[11.5px] text-ink-4 mb-3">
            Paste the GitHub URL or the <code className="bg-ink-7 px-1 rounded">owner/name</code> form.
          </p>
          <button
            onClick={onTest}
            disabled={testing || !repo.trim()}
            className="w-full bg-white border border-ink-6 rounded-full py-2.5 text-[13.5px] font-semibold text-ink-2 active:bg-ink-7 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing access...</> : 'Test connection'}
          </button>
          {tested && (
            <div className={`mt-3 rounded-xl p-3 flex items-start gap-2 ${tested.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
              {tested.ok
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
              <p className={`text-[12.5px] ${tested.ok ? 'text-emerald-900' : 'text-rose-800'}`}>
                {tested.ok
                  ? `Access confirmed. Apnosh can write to this repo (branch: ${tested.defaultBranch}).`
                  : tested.error}
              </p>
            </div>
          )}
        </StepCard>

        {/* Step 3: how the site reads it */}
        <StepCard n={3} icon={FileJson} title="Your site reads the file">
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            We commit <code className="bg-ink-7 px-1 rounded">apnosh-content.json</code> to your repo.
            Read it in your site to show always-current info:
          </p>
          <pre className="bg-ink text-white text-[11px] rounded-xl p-3 overflow-x-auto touch-scroll leading-relaxed">
{`import content from './apnosh-content.json'

// content.name, content.phone, content.website,
// content.description, content.hours,
// content.specialHours`}
          </pre>
          <p className="text-[11.5px] text-ink-4 mt-2">
            Vercel auto-deploys on each commit, so your site stays in sync.
          </p>
        </StepCard>
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 bg-white border-t border-ink-6 px-4 py-3 safe-bottom">
        <button
          onClick={onSave}
          disabled={saving || !tested?.ok}
          className="w-full bg-brand text-white rounded-full py-3.5 text-[15px] font-semibold active:bg-brand-dark disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[52px]"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Connecting & syncing...</>
          ) : (
            <><Globe className="w-4 h-4" /> {connection.connected ? 'Update connection' : 'Connect & sync now'}</>
          )}
        </button>
        {!tested?.ok && (
          <p className="text-[11px] text-ink-4 text-center mt-2">Test the connection first to enable this.</p>
        )}
      </div>
    </div>
  )
}

function StepCard({ n, icon: Icon, title, children }: {
  n: number
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand text-white text-[12px] font-bold flex-shrink-0">{n}</span>
        <Icon className="w-4 h-4 text-ink-3" />
        <p className="text-[14px] font-semibold text-ink">{title}</p>
      </div>
      <div className="pl-1">{children}</div>
    </div>
  )
}
