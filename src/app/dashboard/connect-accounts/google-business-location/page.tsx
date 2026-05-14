'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MapPin, Loader2, Check, AlertCircle, Search } from 'lucide-react'
import { fetchGBPLocationsForClient, finalizeGBPConnections, getLinkedGBPLocationTitles, type GBPAccountWithLocations } from '@/lib/gbp-actions'
import type { GBPLocation } from '@/lib/google'

function LocationPicker() {
  const params = useSearchParams()
  const router = useRouter()
  const clientId = params.get('clientId')
  const returnTo = params.get('returnTo')

  const [groups, setGroups] = useState<GBPAccountWithLocations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [linkedNames, setLinkedNames] = useState<Set<string>>(new Set())
  /* Selection keyed by the full resource name "accountName/locations/{id}"
     so the same selection survives across filter changes. */
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!clientId) { setError('Missing clientId'); setLoading(false); return }
    fetchGBPLocationsForClient(clientId).then((res) => {
      if (res.success) setGroups(res.data)
      else setError(res.error)
      setLoading(false)
    })
    /* Mark already-linked locations so users on a reconnect don't
       redo work they've already done. Pre-check them too — the
       default state matches what's currently linked. */
    getLinkedGBPLocationTitles(clientId)
      .then(titles => {
        const set = new Set(titles)
        setLinkedNames(set)
        /* Wait for groups to load before pre-selecting; if groups
           arrive first this is a no-op and the second effect below
           handles it. */
      })
      .catch(() => { /* ignore */ })
  }, [clientId])

  /* Once both groups and linkedNames are loaded, pre-check the
     already-linked rows so reconnects default to "keep what you had". */
  useEffect(() => {
    if (groups.length === 0 || linkedNames.size === 0) return
    setSelected(prev => {
      if (prev.size > 0) return prev  // user has touched the form already
      const next = new Set<string>()
      for (const g of groups) {
        for (const l of g.locations) {
          if (linkedNames.has(l.title || '')) next.add(`${g.account.name}/${l.name}`)
        }
      }
      return next
    })
  }, [groups, linkedNames])

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllVisible(visible: GBPAccountWithLocations[]) {
    const next = new Set(selected)
    for (const g of visible) {
      for (const l of g.locations) next.add(`${g.account.name}/${l.name}`)
    }
    setSelected(next)
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function handleConnect() {
    if (!clientId || selected.size === 0) return
    setSaving(true)
    setError(null)
    const picks: Array<{ accountName: string; location: GBPLocation }> = []
    for (const g of groups) {
      for (const l of g.locations) {
        if (selected.has(`${g.account.name}/${l.name}`)) {
          picks.push({ accountName: g.account.name, location: l })
        }
      }
    }
    const res = await finalizeGBPConnections(clientId, picks)
    if (res.success) {
      const dest = returnTo || '/dashboard/connect-accounts?connected=google_business_profile'
      router.push(dest)
    } else {
      setError(res.error)
      setSaving(false)
    }
  }

  /* Filter applies across all groups by title or locality. We compute
     filtered groups but keep account headers stable so the user
     understands which Google account each match belongs to. */
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => ({
        ...g,
        locations: g.locations.filter(l =>
          (l.title || '').toLowerCase().includes(q) ||
          (l.locality || '').toLowerCase().includes(q) ||
          (l.primaryCategory || '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.locations.length > 0)
  }, [groups, query])

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <Loader2 className="w-8 h-8 text-brand mx-auto mb-3 animate-spin" />
        <p className="text-sm text-ink-3">Finding your business locations...</p>
      </div>
    )
  }

  if (error && groups.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink mb-2">Something went wrong</p>
        <p className="text-xs text-ink-4 mb-6">{error}</p>
        <button
          onClick={() => router.push('/dashboard/connect-accounts')}
          className="text-sm font-medium text-brand hover:underline"
        >
          Back to accounts
        </button>
      </div>
    )
  }

  const allLocations = groups.flatMap((g) => g.locations)

  if (allLocations.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <MapPin className="w-10 h-10 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink mb-2">No Business Profile locations found</p>
        <p className="text-xs text-ink-4 mb-6 max-w-xs mx-auto">
          The Google account you connected doesn&apos;t manage any verified Business Profile locations. Sign in with the account that owns your listing.
        </p>
        <button
          onClick={() => router.push('/dashboard/connect-accounts')}
          className="px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg"
        >
          Try again
        </button>
      </div>
    )
  }

  const totalLocations = allLocations.length
  const showFilter = totalLocations >= 6

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center mx-auto mb-3">
          <MapPin className="w-5 h-5 text-brand" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Pick your locations</h1>
        <p className="text-sm text-ink-3">
          {totalLocations} location{totalLocations === 1 ? '' : 's'} across {groups.length} account{groups.length === 1 ? '' : 's'}.
          Select all that belong to your business.
        </p>
      </div>

      {showFilter && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by name or city…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-3 text-xs text-ink-4">
        <span>
          {selected.size === 0
            ? 'None selected'
            : `${selected.size} selected`}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => selectAllVisible(filteredGroups)}
            className="font-medium text-brand-dark hover:underline"
          >
            Select all{query ? ' visible' : ''}
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="font-medium text-ink-3 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {filteredGroups.length === 0 && query && (
          <p className="text-center text-sm text-ink-3 py-4">No matches for &ldquo;{query}&rdquo;.</p>
        )}
        {filteredGroups.map((g) => (
          g.locations.length > 0 && (
            <div key={g.account.name}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-4 mb-2">{g.account.accountName}</p>
              <div className="space-y-2">
                {g.locations.map((loc) => {
                  const key = `${g.account.name}/${loc.name}`
                  const isLinked = linkedNames.has(loc.title || '')
                  const isSelected = selected.has(key)
                  return (
                    <button
                      key={loc.name}
                      type="button"
                      onClick={() => toggle(key)}
                      disabled={saving}
                      className={`w-full text-left p-4 rounded-xl border transition-colors disabled:opacity-50 flex items-center gap-3 ${
                        isSelected
                          ? 'bg-brand-tint/60 border-brand ring-1 ring-brand'
                          : isLinked
                            ? 'bg-brand-tint/20 border-brand/40'
                            : 'bg-white border-ink-6 hover:border-brand hover:bg-brand-tint/30'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border ${
                        isSelected ? 'bg-brand border-brand' : 'bg-white border-ink-5'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-semibold ${isSelected ? 'text-brand-dark' : 'text-ink'}`}>
                            {loc.title || 'Unnamed location'}
                          </p>
                          {isLinked && (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-brand/15 text-brand-dark px-1.5 py-0.5 rounded">
                              Linked
                            </span>
                          )}
                        </div>
                        {(loc.locality || loc.regionCode) && (
                          <p className="text-xs text-ink-4 mt-0.5 truncate">
                            {[loc.locality, loc.regionCode].filter(Boolean).join(', ')}
                            {loc.primaryCategory && <span className="ml-2 text-ink-5">{loc.primaryCategory}</span>}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        ))}
      </div>

      {error && (
        <div className="mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-4 mt-8">
        <button
          onClick={handleConnect}
          disabled={saving || selected.size === 0}
          className="w-full py-3 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting {selected.size} location{selected.size === 1 ? '' : 's'}...
            </>
          ) : selected.size === 0 ? (
            'Select at least one location'
          ) : (
            <>Connect {selected.size} location{selected.size === 1 ? '' : 's'}</>
          )}
        </button>
      </div>

      <div className="mt-3 text-center">
        <button
          onClick={() => router.push('/dashboard/connect-accounts')}
          className="text-xs text-ink-4 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function GBPLocationPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-ink-4">Loading...</div>}>
      <LocationPicker />
    </Suspense>
  )
}
