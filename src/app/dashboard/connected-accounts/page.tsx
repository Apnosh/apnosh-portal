'use client'

/**
 * Connected accounts — owner mobile (apnosh-mvp). Link the places the numbers
 * come from. Reuses the existing data + actions unchanged:
 *   getConnectionsForClient() -> UnifiedConnection[]
 *   disconnectPlatform(source, id) / syncConnection(source, id)
 * OAuth connect/reconnect are links to the existing /api/auth/* routes.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Camera, Globe, Tv, Briefcase, BarChart3, Search, MapPin, Star,
  Link as LinkIcon, RefreshCw, ExternalLink, Loader2, Plus, X,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getConnectionsForClient, disconnectPlatform, syncConnection, type UnifiedConnection } from '@/lib/connection-actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C } from '@/components/mvp/mvp-detail'

const AMBER = '#bd7e16'
const AMBER_DK = '#8a5a0c'
const BLUE = '#3a6ea5'

type Cat = 'social' | 'google' | 'reviews'
interface CatalogItem { id: string; label: string; authPath: string; category: Cat; Icon: typeof Camera; description: string }

const CATALOG: CatalogItem[] = [
  { id: 'instagram', label: 'Instagram', authPath: '/api/auth/instagram-direct', category: 'social', Icon: Camera, description: 'Followers, reach, engagement' },
  { id: 'facebook', label: 'Facebook', authPath: '/api/auth/instagram', category: 'social', Icon: Globe, description: 'Page performance (also pulls a linked Instagram)' },
  { id: 'tiktok', label: 'TikTok', authPath: '/api/auth/tiktok', category: 'social', Icon: Tv, description: 'Video views and engagement' },
  { id: 'linkedin', label: 'LinkedIn', authPath: '/api/auth/linkedin', category: 'social', Icon: Briefcase, description: 'Followers and post engagement' },
  { id: 'google_analytics', label: 'Google Analytics', authPath: '/api/auth/google', category: 'google', Icon: BarChart3, description: 'Website visitors and traffic' },
  { id: 'google_search_console', label: 'Google Search Console', authPath: '/api/auth/google-search-console', category: 'google', Icon: Search, description: 'What people search to find you' },
  { id: 'google_business_profile', label: 'Google Business Profile', authPath: '/api/auth/google-business', category: 'google', Icon: MapPin, description: 'Calls, directions, search views' },
  { id: 'yelp', label: 'Yelp', authPath: '/dashboard/connected-accounts/yelp', category: 'reviews', Icon: Star, description: 'Your Yelp rating and reviews' },
]
const CAT_LABEL: Record<Cat, string> = { social: 'Social media', google: 'Google', reviews: 'Reviews' }
const CAT_ORDER: Cat[] = ['social', 'google', 'reviews']
const iconFor = (id: string) => CATALOG.find(c => c.id === id)?.Icon ?? LinkIcon

const canSync = (c: UnifiedConnection) => c.source === 'channel_connections' && ['google_business_profile', 'google_analytics', 'google_search_console'].includes(c.platform)
const needsAttention = (s: UnifiedConnection['status']) => s === 'expired' || s === 'error'

function dotColor(s: UnifiedConnection['status']): string {
  if (s === 'connected') return C.green
  if (needsAttention(s)) return '#e0a93a'
  return BLUE
}
function relTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ConnectedAccountsPage() {
  const { client } = useClient()
  const clientId = client?.id || ''
  const [connections, setConnections] = useState<UnifiedConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<UnifiedConnection | null>(null)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await getConnectionsForClient()
    setConnections(d)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('connected')) setBanner({ ok: true, text: 'Connected.' })
    else if (p.get('error')) setBanner({ ok: false, text: p.get('error') || 'Could not connect. Try again.' })
  }, [])

  const connectHref = (authPath: string) => `${authPath}?clientId=${encodeURIComponent(clientId)}&returnTo=/dashboard/connected-accounts`

  const attention = connections.filter(c => needsAttention(c.status))
  const ok = connections.filter(c => !needsAttention(c.status))
  const connectedCount = connections.filter(c => c.status === 'connected').length
  const summary = attention.length > 0 ? `${attention.length} need${attention.length > 1 ? '' : 's'} attention`
    : connectedCount > 0 ? `${connectedCount} connected` : 'Nothing connected yet'

  const connectedSet = new Set(connections.map(c => c.platform))
  const unconnected = CATALOG.filter(p => !connectedSet.has(p.id))

  const byCat: Record<string, UnifiedConnection[]> = {}
  for (const c of ok) (byCat[c.category] ??= []).push(c)
  const unByCat: Record<string, CatalogItem[]> = {}
  for (const p of unconnected) (unByCat[p.category] ??= []).push(p)

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Connected accounts" subtitle="Link the places your numbers come from." backHref="/dashboard/more" backLabel="More" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '14px 14px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '40px 0' }}>Loading...</div>
          ) : (
            <>
              {banner && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: banner.ok ? C.greenSoft : '#fdeeee', border: `0.5px solid ${banner.ok ? 'rgba(74,189,152,0.34)' : '#f1c7c3'}`, borderRadius: 14, padding: '11px 13px', marginBottom: 16 }}>
                  {banner.ok ? <CheckCircle2 size={17} color={C.greenDk} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={17} color={C.coral} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span style={{ fontSize: 13, color: banner.ok ? '#2e6a58' : '#8a2f28', lineHeight: 1.45 }}>{banner.text}</span>
                </div>
              )}

              <div style={{ fontSize: 13, color: C.mute, margin: '0 6px 14px' }}>{summary}</div>

              {attention.length > 0 && (
                <Group title="Needs attention">
                  {attention.map(c => <ConnRow key={c.id} conn={c} onTap={() => setDetail(c)} />)}
                </Group>
              )}

              {CAT_ORDER.filter(cat => byCat[cat]?.length).map(cat => (
                <Group key={cat} title={CAT_LABEL[cat]}>
                  {byCat[cat].map(c => <ConnRow key={c.id} conn={c} onTap={() => setDetail(c)} />)}
                </Group>
              ))}

              {unconnected.length > 0 && (
                <>
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '6px 6px 7px' }}>Add a connection</div>
                  {CAT_ORDER.filter(cat => unByCat[cat]?.length).map(cat => (
                    <div key={cat} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                      {unByCat[cat].map((p, i) => (
                        <div key={p.id}>
                          {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 61 }} />}
                          <a href={connectHref(p.authPath)} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                            <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><p.Icon size={18} /></span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink }}>{p.label}</span>
                              <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                            </span>
                            <Plus size={18} color={C.greenDk} style={{ flexShrink: 0 }} />
                          </a>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {detail && (
        <DetailSheet conn={detail} connectHref={connectHref} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load() }} />
      )}
    </MvpShell>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>{title}</div>
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function ConnRow({ conn, onTap }: { conn: UnifiedConnection; onTap: () => void }) {
  const Icon = iconFor(conn.platform)
  return (
    <button type="button" onClick={onTap} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <Icon size={18} />
        <span style={{ position: 'absolute', right: -1, top: -1, width: 10, height: 10, borderRadius: 99, background: dotColor(conn.status), border: '2px solid #fff' }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink }}>{conn.label}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: needsAttention(conn.status) ? AMBER_DK : C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conn.accountName ? `${conn.accountName} · ${conn.friendlyStatus}` : conn.friendlyStatus}
        </span>
      </span>
    </button>
  )
}

function DetailSheet({ conn, connectHref, onClose, onChanged }: { conn: UnifiedConnection; connectHref: (p: string) => string; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<'sync' | 'disc' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDisc, setConfirmDisc] = useState(false)
  const Icon = iconFor(conn.platform)
  const needs = needsAttention(conn.status)

  async function doSync() {
    setBusy('sync'); setMsg(null)
    const r = await syncConnection(conn.source, conn.id)
    if (r.success) {
      const bits: string[] = []
      if (r.locationsDiscovered) bits.push(`${r.locationsDiscovered} location${r.locationsDiscovered === 1 ? '' : 's'}`)
      if (r.metricsImported) bits.push(`${r.metricsImported} day${r.metricsImported === 1 ? '' : 's'} of metrics`)
      if (r.reviewsImported) bits.push(`${r.reviewsImported} review${r.reviewsImported === 1 ? '' : 's'}`)
      setMsg({ ok: true, text: bits.length ? `Pulled ${bits.join(', ')}` : 'Nothing new yet.' })
    } else {
      setMsg({ ok: false, text: r.error })
    }
    setBusy(null)
  }
  async function doDisconnect() {
    setBusy('disc')
    const r = await disconnectPlatform(conn.source, conn.id)
    if (r.success) { onChanged(); return }
    setMsg({ ok: false, text: r.error }); setBusy(null); setConfirmDisc(false)
  }

  const actionBtn: React.CSSProperties = { width: '100%', height: 46, borderRadius: 13, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, textDecoration: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: '#f0f0f3', display: 'flex', justifyContent: 'center', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.bg, display: 'flex', flexDirection: 'column', minHeight: 0, boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#fff', borderBottom: `0.5px solid ${C.line}` }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.mute, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={20} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{conn.label}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 46, height: 46, borderRadius: 12, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={22} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 600, color: needs ? AMBER_DK : C.ink }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: dotColor(conn.status) }} />{conn.friendlyStatus}
            </span>
            {conn.accountName && <span style={{ display: 'block', fontSize: 13, color: C.mute, marginTop: 2 }}>{conn.accountName}</span>}
            {canSync(conn) && <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 2 }}>Last synced {relTime(conn.lastSyncAt)}</span>}
          </span>
        </div>

        {conn.syncError && (
          <div style={{ background: '#fbf3e4', border: '0.5px solid #eed9b3', borderRadius: 12, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: AMBER_DK, lineHeight: 1.45 }}>{conn.syncError}</div>
        )}
        {msg && (
          <div style={{ background: msg.ok ? C.greenSoft : '#fdeeee', border: `0.5px solid ${msg.ok ? 'rgba(74,189,152,0.34)' : '#f1c7c3'}`, borderRadius: 12, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: msg.ok ? '#2e6a58' : '#8a2f28', lineHeight: 1.45 }}>{msg.text}</div>
        )}

        {needs && conn.actions.reconnectUrl && (
          <a href={connectHref(conn.actions.reconnectUrl)} style={{ ...actionBtn, border: 'none', background: C.green, color: '#fff', fontWeight: 700 }}><RefreshCw size={17} /> Reconnect</a>
        )}
        {canSync(conn) && !needs && (
          <button type="button" onClick={doSync} disabled={busy !== null} style={{ ...actionBtn, opacity: busy ? 0.6 : 1 }}>
            {busy === 'sync' ? <Loader2 size={16} className="mvp-spin" /> : <RefreshCw size={16} />} Sync now
          </button>
        )}
        {conn.profileUrl && (
          <a href={conn.profileUrl} target="_blank" rel="noopener noreferrer" style={actionBtn}><ExternalLink size={16} /> Open profile</a>
        )}

        {conn.actions.canDisconnect && (
          confirmDisc ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDisc(false)} disabled={busy === 'disc'} style={{ ...actionBtn, marginBottom: 0, flex: 1, width: 'auto' }}>Cancel</button>
              <button type="button" onClick={doDisconnect} disabled={busy === 'disc'} style={{ ...actionBtn, marginBottom: 0, flex: 1, width: 'auto', border: 'none', background: C.coral, color: '#fff', fontWeight: 700 }}>
                {busy === 'disc' ? <Loader2 size={16} className="mvp-spin" /> : null} Disconnect
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDisc(true)} style={{ ...actionBtn, color: C.coral, border: `1px solid ${C.coralSoft}` }}>Disconnect</button>
          )
        )}
      </div>
      </div>
    </div>
  )
}
