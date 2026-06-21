'use client'

/**
 * Connect-your-website flow (deploy-hook model), in the apnosh-mvp design.
 *
 * The owner's site already pulls fresh data from Apnosh's public API on each
 * build. Connecting = giving us a Vercel DEPLOY HOOK URL; when business info
 * changes we POST to it and Vercel rebuilds with the fresh data.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, CheckCircle2, AlertCircle, Webhook, Globe, RefreshCw, Link2Off,
} from 'lucide-react'
import {
  testWebsiteConnection, saveWebsiteConnection, disconnectWebsite,
  type WebsiteConnection,
} from '../website-actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { EditorField } from '../editor-shell'
import { MvpDetailHeader, MvpSaveBar, C } from '@/components/mvp/mvp-detail'

export default function ConnectWebsite({ connection }: { connection: WebsiteConnection }) {
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
    testWebsiteConnection(hookUrl).then(setTested).finally(() => setTesting(false))
  }

  const onSave = () => {
    setSaving(true)
    saveWebsiteConnection({ hookUrl, siteUrl: siteUrl || undefined })
      .then(r => { if (r.ok) router.push('/dashboard/business-info'); else setTested({ ok: false, error: r.error }) })
      .finally(() => setSaving(false))
  }

  const onDisconnect = () => {
    if (!confirm("Disconnect your website? Changes won't auto-publish to it.")) return
    setDisconnecting(true)
    disconnectWebsite().finally(() => { setDisconnecting(false); router.refresh() })
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Connect your website" subtitle="Auto-publish your info to your site" backHref="/dashboard/business-info" backLabel="Business info" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '14px 14px 12px' }}>

          {connection.connected && (
            <div style={{ background: C.greenSoft, border: '0.5px solid rgba(74,189,152,0.34)', borderRadius: 16, padding: 14, marginBottom: 14, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <CheckCircle2 size={20} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Connected</div>
                <div style={{ fontSize: 12.5, color: '#2e6a58', marginTop: 1, wordBreak: 'break-word' }}>{connection.siteUrl ?? 'Deploy hook active'}</div>
                {connection.lastSyncedAt && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 3 }}>Last published {new Date(connection.lastSyncedAt).toLocaleString()}</div>}
                <button type="button" onClick={onDisconnect} disabled={disconnecting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'none', border: 'none', color: C.coral, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>
                  {disconnecting ? <Loader2 size={14} className="mvp-spin" /> : <Link2Off size={14} />} Disconnect
                </button>
              </div>
            </div>
          )}

          <div style={{ background: C.greenSoft, borderRadius: 14, padding: '13px 14px', marginBottom: 14, fontSize: 13, color: '#2e6a58', lineHeight: 1.5 }}>
            Your site already reads live data from Apnosh. When you save business info, we tell Vercel to rebuild, and your site shows the new info within a minute. We just need your site&apos;s deploy hook.
          </div>

          <StepCard n={1} icon={<Webhook size={16} />} title="Get your deploy hook from Vercel">
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.ink, lineHeight: 1.7 }}>
              <li>Open your project on vercel.com</li>
              <li>Go to Settings, then Git, then Deploy Hooks</li>
              <li>Create a hook (name it &ldquo;Apnosh&rdquo;, branch main)</li>
              <li>Copy the URL it gives you</li>
            </ol>
          </StepCard>

          <StepCard n={2} icon={<Globe size={16} />} title="Paste it and test">
            <EditorField label="Deploy hook URL" value={hookUrl} onChange={v => { setHookUrl(v); setTested(null) }} placeholder="https://api.vercel.com/v1/integrations/deploy/..." type="url" inputMode="url" />
            <EditorField label="Website address (optional)" value={siteUrl} onChange={setSiteUrl} placeholder="https://yourrestaurant.com" type="url" inputMode="url" />
            <button type="button" onClick={onTest} disabled={testing || !hookUrl.trim()} style={{ width: '100%', height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: (testing || !hookUrl.trim()) ? 'default' : 'pointer', opacity: (testing || !hookUrl.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {testing ? <><Loader2 size={16} className="mvp-spin" /> Testing, triggering a build...</> : <><RefreshCw size={16} /> Test connection</>}
            </button>
            {tested && (
              <div style={{ marginTop: 11, borderRadius: 12, padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', background: tested.ok ? C.greenSoft : '#fdeeee', border: `0.5px solid ${tested.ok ? 'rgba(74,189,152,0.34)' : '#f1c7c3'}` }}>
                {tested.ok ? <CheckCircle2 size={16} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} color={C.coral} style={{ flexShrink: 0, marginTop: 1 }} />}
                <p style={{ fontSize: 12.5, color: tested.ok ? '#2e6a58' : '#8a2f28', lineHeight: 1.45, margin: 0 }}>
                  {tested.ok ? 'It works. Vercel started a build. Check your project to confirm.' : tested.error}
                </p>
              </div>
            )}
          </StepCard>
        </div>

        <MvpSaveBar
          onClick={onSave}
          label={connection.connected ? 'Update connection' : 'Connect website'}
          disabled={!tested?.ok}
          saving={saving}
          hint={!tested?.ok ? 'Test the connection first to enable this' : undefined}
        />
      </div>
    </MvpShell>
  )
}

function StepCard({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 14px 15px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.green, color: '#fff', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
        <span style={{ color: C.greenDk, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
