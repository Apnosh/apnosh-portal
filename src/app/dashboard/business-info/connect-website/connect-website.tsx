'use client'

/**
 * Connect-your-website flow (deploy-hook model).
 *
 * The owner's site already pulls fresh data from Apnosh's public API
 * on each build (via its src/_data/apnosh.js). So connecting means
 * giving us a Vercel DEPLOY HOOK URL — when business info changes we
 * POST to it and Vercel rebuilds with the fresh data.
 *
 * Two steps: (1) grab the deploy hook from Vercel, (2) paste + test.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Webhook, Globe,
  RefreshCw, Link2Off,
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
  const [hookUrl, setHookUrl] = useState(connection.deployHookUrl ?? '')
  const [siteUrl, setSiteUrl] = useState(connection.siteUrl ?? '')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const onTest = () => {
    setTested(null)
    setTesting(true)
    testWebsiteConnection(hookUrl)
      .then(setTested)
      .finally(() => setTesting(false))
  }

  const onSave = () => {
    setSaving(true)
    saveWebsiteConnection({ hookUrl, siteUrl: siteUrl || undefined })
      .then(r => {
        if (r.ok) router.push('/dashboard/business-info')
        else setTested({ ok: false, error: r.error })
      })
      .finally(() => setSaving(false))
  }

  const onDisconnect = () => {
    if (!confirm('Disconnect your website? Changes won\'t auto-publish to it.')) return
    setDisconnecting(true)
    disconnectWebsite().finally(() => { setDisconnecting(false); router.refresh() })
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
          Auto-publish hours, contact, and info to your Vercel site.
        </p>
      </div>

      {/* Already connected */}
      {connection.connected && (
        <div className="px-4 pt-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-ink">Connected</p>
              <p className="text-[12.5px] text-ink-2 mt-0.5 break-words">{connection.siteUrl ?? 'Deploy hook active'}</p>
              {connection.lastSyncedAt && (
                <p className="text-[11.5px] text-ink-3 mt-1">Last published {new Date(connection.lastSyncedAt).toLocaleString()}</p>
              )}
              <button onClick={onDisconnect} disabled={disconnecting} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 active:text-rose-700 mt-2.5">
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {/* How it works */}
        <div className="bg-brand-tint/40 border border-brand/20 rounded-2xl p-4">
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Your site already reads live data from Apnosh. When you save business info,
            we tell Vercel to rebuild — and your site shows the new info within a minute.
            We just need your site&apos;s <span className="font-semibold">deploy hook</span>.
          </p>
        </div>

        {/* Step 1: get the hook */}
        <StepCard n={1} icon={Webhook} title="Get your deploy hook from Vercel">
          <ol className="text-[12.5px] text-ink-2 space-y-1 list-decimal pl-4">
            <li>Open your project on <span className="font-semibold">vercel.com</span></li>
            <li>Go to <span className="font-semibold">Settings → Git → Deploy Hooks</span></li>
            <li>Create a hook (name it &ldquo;Apnosh&rdquo;, branch <span className="font-semibold">main</span>)</li>
            <li>Copy the URL it gives you</li>
          </ol>
        </StepCard>

        {/* Step 2: paste + test */}
        <StepCard n={2} icon={Globe} title="Paste it & test">
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Deploy hook URL</label>
          <input
            value={hookUrl}
            onChange={e => { setHookUrl(e.target.value); setTested(null) }}
            placeholder="https://api.vercel.com/v1/integrations/deploy/..."
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[14px] focus:outline-none focus:border-brand touch-input mb-3"
          />
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Website address <span className="text-ink-4 font-normal">(optional)</span></label>
          <input
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            placeholder="https://yourrestaurant.com"
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[14px] focus:outline-none focus:border-brand touch-input mb-3"
          />
          <button
            onClick={onTest}
            disabled={testing || !hookUrl.trim()}
            className="w-full bg-white border border-ink-6 rounded-full py-2.5 text-[13.5px] font-semibold text-ink-2 active:bg-ink-7 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {testing ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing — triggering a build...</> : <><RefreshCw className="w-4 h-4" /> Test connection</>}
          </button>
          {tested && (
            <div className={`mt-3 rounded-xl p-3 flex items-start gap-2 ${tested.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
              {tested.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
              <p className={`text-[12.5px] ${tested.ok ? 'text-emerald-900' : 'text-rose-800'}`}>
                {tested.ok ? 'It works! Vercel started a build. Check your project to confirm.' : tested.error}
              </p>
            </div>
          )}
        </StepCard>
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 bg-white border-t border-ink-6 px-4 py-3 safe-bottom">
        <button
          onClick={onSave}
          disabled={saving || !tested?.ok}
          className="w-full bg-brand text-white rounded-full py-3.5 text-[15px] font-semibold active:bg-brand-dark disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[52px]"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : <><Globe className="w-4 h-4" /> {connection.connected ? 'Update connection' : 'Connect website'}</>}
        </button>
        {!tested?.ok && <p className="text-[11px] text-ink-4 text-center mt-2">Test the connection first to enable this.</p>}
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
