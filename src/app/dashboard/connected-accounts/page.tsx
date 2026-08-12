'use client'

/**
 * Connected accounts — owner mobile (apnosh-mvp). Link the places the numbers
 * come from. Reuses the existing data + actions unchanged:
 *   getConnectionsForClient() -> UnifiedConnection[]
 *   disconnectPlatform(source, id) / syncConnection(source, id)
 * OAuth connect/reconnect are links to the existing /api/auth/* routes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, Globe, Tv, Briefcase, BarChart3, Search, MapPin, Star,
  CreditCard, Store, Link as LinkIcon, RefreshCw, ExternalLink, Loader2, Plus, X,
  CheckCircle2, AlertCircle, ThumbsUp, Music2, Play,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getConnectionsForClient, disconnectPlatform, syncConnection, type UnifiedConnection } from '@/lib/connection-actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C } from '@/components/mvp/mvp-detail'

const AMBER = '#bd7e16'
const AMBER_DK = '#8a5a0c'
const BLUE = '#3a6ea5'

type Cat = 'social' | 'google' | 'reviews' | 'pos'
interface CatalogItem { id: string; label: string; authPath: string; category: Cat; Icon: typeof Camera; description: string }

const CATALOG: CatalogItem[] = [
  /* Socials go through the active social vendor (zernio/ayrshare bake-off): each
   * platform is its own login on the vendor's hosted page, all landing on the ONE
   * vendor connection row (metadata.platforms). The nightly sync pulls the numbers. */
  { id: 'instagram', label: 'Instagram', authPath: '/api/channels/social/start?platform=instagram', category: 'social', Icon: Camera, description: 'Log in with your Instagram' },
  { id: 'facebook', label: 'Facebook', authPath: '/api/channels/social/start?platform=facebook', category: 'social', Icon: ThumbsUp, description: 'Log in with your Facebook page' },
  { id: 'tiktok', label: 'TikTok', authPath: '/api/channels/social/start?platform=tiktok', category: 'social', Icon: Music2, description: 'Log in with your TikTok' },
  { id: 'linkedin', label: 'LinkedIn', authPath: '/api/channels/social/start?platform=linkedin', category: 'social', Icon: Briefcase, description: 'Log in with your LinkedIn page' },
  { id: 'youtube', label: 'YouTube', authPath: '/api/channels/social/start?platform=youtube', category: 'social', Icon: Play, description: 'Log in with your YouTube channel' },
  { id: 'google_analytics', label: 'Google Analytics', authPath: '/api/auth/google', category: 'google', Icon: BarChart3, description: 'Website visitors and traffic' },
  { id: 'google_search_console', label: 'Google Search Console', authPath: '/api/auth/google-search-console', category: 'google', Icon: Search, description: 'What people search to find you' },
  { id: 'google_business_profile', label: 'Google Business Profile', authPath: '/api/auth/google-business', category: 'google', Icon: MapPin, description: 'Calls, directions, search views' },
  { id: 'yelp', label: 'Yelp', authPath: '/dashboard/connected-accounts/yelp', category: 'reviews', Icon: Star, description: 'Your Yelp rating and reviews' },
  { id: 'square', label: 'Square', authPath: '/api/channels/square/start', category: 'pos', Icon: CreditCard, description: 'Daily sales from your register' },
  { id: 'clover', label: 'Clover', authPath: '/api/channels/clover/start', category: 'pos', Icon: Store, description: 'Daily sales from your register' },
]
const CAT_LABEL: Record<Cat, string> = { social: 'Social media', google: 'Google', reviews: 'Reviews', pos: 'Point of sale' }
const CAT_ORDER: Cat[] = ['pos', 'social', 'google', 'reviews']
const SOCIAL_VENDORS = ['zernio', 'ayrshare']
const SOCIAL_PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }
const iconFor = (id: string) => (SOCIAL_VENDORS.includes(id) ? Camera : CATALOG.find(c => c.id === id)?.Icon ?? LinkIcon)

/* Per-platform rows synthesized from a social vendor connection keep the vendor's
 * source+id (sync and disconnect act on the one vendor row) but display as the
 * platform the owner actually logged into. */
const isSocialVendorRow = (c: UnifiedConnection) => c.source === 'channel_connections' && (SOCIAL_VENDORS.includes(c.platform) || c.platform in SOCIAL_PLATFORM_LABEL)
function expandSocial(conns: UnifiedConnection[]): UnifiedConnection[] {
  const out: UnifiedConnection[] = []
  for (const c of conns) {
    if (c.source === 'channel_connections' && SOCIAL_VENDORS.includes(c.platform) && c.linkedPlatforms?.length) {
      for (const p of c.linkedPlatforms) {
        const n = c.accountCounts?.[p] ?? 0
        out.push({ ...c, platform: p, label: SOCIAL_PLATFORM_LABEL[p] ?? p, accountName: n > 1 ? `${n} accounts` : c.accountName })
      }
    } else {
      out.push(c)
    }
  }
  return out
}

const canSync = (c: UnifiedConnection) => c.source === 'channel_connections' && (['google_business_profile', 'google_analytics', 'google_search_console', 'square', 'clover'].includes(c.platform) || isSocialVendorRow(c))
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

  /* Keep the vendor state fresh WITHOUT the owner ever tapping anything: check with
   * the vendor on page load whenever the connection is new (pending), the owner just
   * came back from a login, or the last check is older than ten minutes. Newly added
   * platforms and accounts appear on the next visit; the nightly cron covers the rest. */
  const autoChecked = useRef(false)
  useEffect(() => {
    if (autoChecked.current || loading) return
    const vendor = connections.find(c => c.source === 'channel_connections' && SOCIAL_VENDORS.includes(c.platform))
    if (!vendor) return
    const cameBack = new URLSearchParams(window.location.search).get('connected') === 'social'
    const staleMs = vendor.lastSyncAt ? Date.now() - new Date(vendor.lastSyncAt).getTime() : Infinity
    if (vendor.status !== 'pending' && !cameBack && staleMs < 10 * 60_000) return
    autoChecked.current = true
    ;(async () => {
      setBanner({ ok: true, text: 'Checking your social login...' })
      const r = await syncConnection(vendor.source, vendor.id)
      if (r.success) {
        setBanner({ ok: true, text: 'Linked. Your numbers start flowing tonight.' })
        load()
      } else {
        /* say exactly where the chain is stuck — a silent card reads as broken */
        setBanner({ ok: false, text: r.error })
      }
    })()
  }, [connections, loading, load])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const NAME: Record<string, string> = { square: 'Square', clover: 'Clover', ayrshare: 'Social accounts', social: 'Social accounts' }
    const connected = p.get('connected')
    const connectError = p.get('connect_error')
    if (connected && NAME[connected]) setBanner({ ok: true, text: `${NAME[connected]} connected. Your sales will show up shortly.` })
    else if (connected) setBanner({ ok: true, text: 'Connected.' })
    else if (connectError) {
      const reason = p.get('reason')
      const who = NAME[connectError] ?? 'That account'
      const text = reason === 'bad_state' ? `That connect link expired. Tap ${who} and try again.`
        : reason === 'denied' ? `${who} was not connected. You can try again any time.`
        : `Could not connect ${who}. Try again in a moment.`
      setBanner({ ok: false, text })
    }
    else if (p.get('error')) setBanner({ ok: false, text: p.get('error') || 'Could not connect. Try again.' })
  }, [])

  const connectHref = (authPath: string) => `${authPath}${authPath.includes('?') ? '&' : '?'}clientId=${encodeURIComponent(clientId)}&returnTo=/dashboard/connected-accounts`

  /* Social vendor rows expand to one row per platform the owner has linked;
   * a vendor row with nothing linked yet stays visible as "Setting up". */
  const display = expandSocial(connections)
  const attention = display.filter(c => needsAttention(c.status))
  const ok = display.filter(c => !needsAttention(c.status))
  const connectedCount = display.filter(c => c.status === 'connected').length
  const summary = attention.length > 0 ? `${attention.length} need${attention.length > 1 ? '' : 's'} attention`
    : connectedCount > 0 ? `${connectedCount} connected` : 'Nothing connected yet'

  /* which individual social platforms are linked THROUGH THE VENDOR. Legacy
   * direct-API rows (source platform_connections) do not count — they surface
   * under Needs attention as "Old connection. Tap to relink" instead, and the
   * fresh per-platform connect rows stay available. */
  const linkedSocial = new Set(display.filter(c => c.category === 'social' && c.source === 'channel_connections' && !SOCIAL_VENDORS.includes(c.platform)).map(c => c.platform))
  const connectedSet = new Set(display.map(c => c.platform))
  const unconnected = CATALOG.filter(p => (p.category === 'social' ? !linkedSocial.has(p.id) : !connectedSet.has(p.id)))

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
                  {attention.map(c => <ConnRow key={`${c.id}-${c.platform}`} conn={c} onTap={() => setDetail(c)} />)}
                </Group>
              )}

              {CAT_ORDER.filter(cat => byCat[cat]?.length).map(cat => (
                <Group key={cat} title={CAT_LABEL[cat]}>
                  {byCat[cat].map(c => <ConnRow key={`${c.id}-${c.platform}`} conn={c} onTap={() => setDetail(c)} />)}
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
        {conn.source === 'channel_connections' && conn.platform in SOCIAL_PLATFORM_LABEL && !needs && (
          <>
            <a href={connectHref(`/api/channels/social/start?platform=${conn.platform}`)} style={actionBtn}>
              <Plus size={16} /> Add another {SOCIAL_PLATFORM_LABEL[conn.platform]} account
            </a>
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45, margin: '2px 2px 10px' }}>
              Personal or business, they all count. All your {SOCIAL_PLATFORM_LABEL[conn.platform]} accounts add into one {SOCIAL_PLATFORM_LABEL[conn.platform]} number.
            </div>
          </>
        )}

        {isSocialVendorRow(conn) && conn.actions.canDisconnect && (
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45, margin: '2px 2px 10px' }}>
            Your social logins live together. Disconnecting removes all of them at once.
          </div>
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
