'use client'

/**
 * /dashboard/more — the owner More hub, rendered in the apnosh-mvp shell.
 *
 * This page owns three things and hands the rest to MvpMore:
 *
 *   1. THE HEADER. It is MvpDetailHeader's exact shape (mvp-detail.tsx:40-43) with the search in
 *      the middle instead of a title, and a one-line 12.5 C.mute subtitle under it — the reference
 *      hub's opening move (business-info/page.tsx:73-75). It stays IN FLOW rather than floating,
 *      so the subtitle can never sit on top of the first row.
 *   2. THE FETCH, because the subtitle is computed from the same answer the rows are.
 *   3. THE THREE STATES. Until 2026-09-08 there were none: the hub rendered a half-drawn business
 *      while the request was in flight and, if it 403'd, forever — a state indistinguishable from
 *      a real business with nothing filled in, because the .catch swallowed it.
 */

import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { signOut } from '@/lib/supabase/hooks'
import MvpShell from '@/components/mvp/mvp-shell'
import TopRow, { TopSearch } from '@/components/mvp/top-row'
import MvpMore, { type MoreData, type MoreState } from '@/components/mvp/mvp-more'
import { C, MvpEmpty, MvpGroup, MvpRow, MvpSkeleton } from '@/components/mvp/mvp-detail'
import { useLang } from '@/components/mvp/mvp-language'

export default function MorePage() {
  const [query, setQuery] = useState('')
  const { client, loading } = useClient()
  const { T } = useLang()
  /* The answer is stamped with the client id it belongs to, and the state is DERIVED from that
     rather than set at the top of the effect. Two things fall out of it: switching location shows
     the wait again instead of the last business's counts under this one's name, and nothing calls
     setState synchronously inside an effect (react-hooks/set-state-in-effect). */
  const [res, setRes] = useState<{ id: string; data: MoreData | null } | null>(null)

  const clientId = client?.id ?? null
  useEffect(() => {
    if (!clientId) return
    let live = true
    fetch(`/api/dashboard/more?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setRes({ id: clientId, data: j?.profile ? (j as MoreData) : null }) })
      .catch(() => { if (live) setRes({ id: clientId, data: null }) })
    return () => { live = false }
  }, [clientId])

  const fresh = res && res.id === clientId ? res : null
  const data = fresh?.data ?? null
  const state: MoreState = !fresh ? 'loading' : fresh.data ? 'ready' : 'error'

  const toRate = data?.toRate.length ?? 0
  const subtitle = toRate > 0
    ? T('{n} waiting for your rating', { n: toRate })
    : T('Everything about your business, in one place')

  return (
    <MvpShell
      active="more"
      header={(
        <div style={{ flexShrink: 0, background: '#fff' }}>
          <TopRow middle={<TopSearch value={query} onChange={setQuery} placeholder={T('Search settings and tools')} />} />
          <div style={{ fontSize: 12.5, color: C.mute, padding: '0 18px 10px', textAlign: 'center' }}>{subtitle}</div>
        </div>
      )}
    >
      {loading ? (
        <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', boxSizing: 'border-box' }}>
          <MvpSkeleton heights={[88, 60, 120, 180]} />
        </div>
      ) : client ? (
        <MvpMore name={client.name || 'Your restaurant'} tier={client.tier} query={query} data={data} state={state} />
      ) : (
        /* No client on this login. Says why, names the one next thing, and keeps the way out —
           an owner who cannot be resolved must still be able to sign out of the wrong account. */
        <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
          <MvpEmpty title={T('No business linked yet')} text={T('Sign in with the account your restaurant is on.')} />
          <MvpGroup>
            <MvpRow icon={<LogOut size={18} />} label={T('Sign out')} danger onClick={() => { void signOut() }} />
          </MvpGroup>
        </div>
      )}
    </MvpShell>
  )
}
