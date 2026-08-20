/**
 * Admin — Social Profiles: every client's Zernio profile at a glance.
 *
 * Built 2026-08-20, the day a test post landed on the wrong Instagram: the
 * Apnosh profile had dosikbbq's IG login attached and nothing showed the
 * actual usernames until AFTER a public post. This page reads the vendor's
 * own answers live — profile per client, each linked account WITH its real
 * username, and the last few API posts with their verified per-platform
 * status — so a wrong login is a ten-second glance, not a forensic hunt.
 *
 * Read-only by design. Actual edits (relink a login, delete a post) happen
 * in Zernio's dashboard with the Apnosh account; renaming/deleting profiles
 * there would orphan the portal's stored profile id — fix logins, not
 * profiles.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { listVendorAccounts, listVendorPosts, type VendorAccount, type VendorPostRecord } from '@/lib/publish/zernio'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Row {
  clientId: string
  clientName: string
  profileId: string | null
  status: string | null
  connectedAt: string | null
  lastSyncAt: string | null
  syncError: string | null
  accounts: VendorAccount[] | null
  posts: VendorPostRecord[]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusChip(status: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'published') return 'bg-emerald-50 text-emerald-700'
  if (s === 'failed') return 'bg-red-50 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function AdminSocialProfilesPage() {
  const admin = createAdminClient()
  const { data: conns } = await admin
    .from('channel_connections')
    .select('client_id, platform_account_id, status, connected_at, last_sync_at, sync_error')
    .eq('channel', 'zernio')
    .order('connected_at', { ascending: false })
    .limit(25)

  const clientIds = [...new Set((conns ?? []).map((c) => c.client_id as string))]
  const { data: clients } = clientIds.length > 0
    ? await admin.from('clients').select('id, name').in('id', clientIds)
    : { data: [] as { id: string; name: string }[] }
  const nameOf = new Map((clients ?? []).map((c) => [c.id as string, (c.name as string) ?? '']))

  const rows: Row[] = await Promise.all((conns ?? []).map(async (c) => {
    const profileId = (c.platform_account_id as string | null) || null
    const [accounts, posts] = profileId
      ? await Promise.all([
          listVendorAccounts(profileId).catch(() => null),
          listVendorPosts(profileId).catch(() => null),
        ])
      : [null, null]
    return {
      clientId: c.client_id as string,
      clientName: nameOf.get(c.client_id as string) || (c.client_id as string).slice(0, 8),
      profileId,
      status: (c.status as string | null) ?? null,
      connectedAt: (c.connected_at as string | null) ?? null,
      lastSyncAt: (c.last_sync_at as string | null) ?? null,
      syncError: (c.sync_error as string | null) ?? null,
      accounts,
      posts: (posts ?? []).slice(0, 3),
    }
  }))

  const totalAccounts = rows.reduce((n, r) => n + (r.accounts?.length ?? 0), 0)

  /* Same social login on more than one client's profile = a wrong link waiting
   * to post publicly (dosikbbq on the Apnosh profile, 2026-08-20) AND a wasted
   * plan slot. Flag it loudly. */
  const linkedOn = new Map<string, string[]>()
  for (const r of rows) {
    for (const a of r.accounts ?? []) {
      if (!a.name) continue
      const k = `${a.platform}|${a.name.toLowerCase()}`
      linkedOn.set(k, [...(linkedOn.get(k) ?? []), r.clientName])
    }
  }
  const duplicates = [...linkedOn.entries()]
    .filter(([, clients]) => clients.length > 1)
    .map(([k, clients]) => ({ platform: k.split('|')[0], name: k.split('|')[1], clients }))
  const dupeKeys = new Set(duplicates.map((d) => `${d.platform}|${d.name}`))

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Social Profiles</h1>
        <p className="text-sm text-gray-500 mt-1">
          One Zernio profile per client, all under the Apnosh vendor account. {rows.length} profile{rows.length === 1 ? '' : 's'},{' '}
          {totalAccounts} linked account{totalAccounts === 1 ? '' : 's'} (these count against the Zernio plan&apos;s slots).
          Read-only — relink logins or delete posts in Zernio&apos;s own dashboard; never rename or delete a profile there.
        </p>
      </div>

      {duplicates.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-amber-900">Same account linked on more than one profile</div>
          <div className="text-xs text-amber-800 mt-1 flex flex-col gap-1">
            {duplicates.map((d) => (
              <div key={`${d.platform}|${d.name}`}>
                <span className="capitalize font-medium">{d.platform}</span> <span className="font-medium">{d.name}</span> is
                linked on {d.clients.join(' and ')}. Each extra link uses a plan slot, and posts for the wrong client can land
                on it. In Zernio&apos;s dashboard, disconnect it from the profile it doesn&apos;t belong to.
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500">
          No client has connected socials yet.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.clientId} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="font-semibold text-gray-900">{r.clientName}</div>
              <div className="text-xs text-gray-400 font-mono">{r.profileId ?? 'no profile id'}</div>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {r.status === 'active' ? 'Active' : r.status ?? 'unknown'} · connected {fmtDate(r.connectedAt)} · last sync {fmtDate(r.lastSyncAt)}
              {r.syncError ? <span className="text-red-600"> · {r.syncError}</span> : null}
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Linked accounts</div>
              {r.accounts === null ? (
                <div className="text-sm text-gray-400">Could not reach the vendor just now.</div>
              ) : r.accounts.length === 0 ? (
                <div className="text-sm text-gray-400">None linked yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {r.accounts.map((a) => {
                    const isDupe = a.name !== '' && dupeKeys.has(`${a.platform}|${a.name.toLowerCase()}`)
                    return (
                      <span key={a.id} className={`inline-flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1 border ${isDupe ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                        <span className="capitalize text-gray-500">{a.platform}</span>
                        <span className="font-medium text-gray-900">{a.name || '(no name)'}</span>
                        {isDupe && <span className="text-[10px] font-semibold text-amber-700 uppercase">on 2+ profiles</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {r.posts.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Recent posts through us</div>
                <div className="flex flex-col gap-1.5">
                  {r.posts.map((post) => (
                    <div key={post.id} className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-gray-400 w-24 shrink-0">{fmtDate(post.createdAt)}</span>
                      {post.platforms.map((pl, i) => (
                        <span key={`${post.id}-${pl.platform}-${i}`} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${statusChip(pl.status)}`}>
                          <span className="capitalize">{pl.platform}</span>
                          <span>{pl.status ?? '?'}</span>
                          {pl.url && (
                            <a href={pl.url} target="_blank" rel="noopener noreferrer" className="underline">view</a>
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
