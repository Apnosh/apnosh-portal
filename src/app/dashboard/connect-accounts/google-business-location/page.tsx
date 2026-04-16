'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MapPin, Loader2, Check, AlertCircle } from 'lucide-react'
import { fetchGBPLocationsForClient, finalizeGBPConnection, type GBPAccountWithLocations } from '@/lib/gbp-actions'
import type { GBPLocation } from '@/lib/google'

function LocationPicker() {
  const params = useSearchParams()
  const router = useRouter()
  const clientId = params.get('clientId')
  const returnTo = params.get('returnTo')

  const [groups, setGroups] = useState<GBPAccountWithLocations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) { setError('Missing clientId'); setLoading(false); return }
    fetchGBPLocationsForClient(clientId).then((res) => {
      if (res.success) setGroups(res.data)
      else setError(res.error)
      setLoading(false)
    })
  }, [clientId])

  async function handlePick(accountName: string, location: GBPLocation) {
    if (!clientId) return
    setSaving(location.name)
    const res = await finalizeGBPConnection(clientId, accountName, location)
    if (res.success) {
      const dest = returnTo || '/dashboard/connect-accounts?connected=google_business_profile'
      router.push(dest)
    } else {
      setError(res.error)
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <Loader2 className="w-8 h-8 text-brand mx-auto mb-3 animate-spin" />
        <p className="text-sm text-ink-3">Finding your business locations...</p>
      </div>
    )
  }

  if (error) {
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

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center mx-auto mb-3">
          <MapPin className="w-5 h-5 text-brand" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Pick your location</h1>
        <p className="text-sm text-ink-3">
          Choose which Google Business Profile to track.
        </p>
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          g.locations.length > 0 && (
            <div key={g.account.name}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-4 mb-2">{g.account.accountName}</p>
              <div className="space-y-2">
                {g.locations.map((loc) => (
                  <button
                    key={loc.name}
                    onClick={() => handlePick(g.account.name, loc)}
                    disabled={saving !== null}
                    className="w-full text-left p-4 bg-white border border-ink-6 rounded-xl hover:border-brand hover:bg-brand-tint/30 transition-colors disabled:opacity-50 flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink group-hover:text-brand-dark">{loc.title || 'Unnamed location'}</p>
                      {(loc.locality || loc.regionCode) && (
                        <p className="text-xs text-ink-4 mt-0.5">
                          {[loc.locality, loc.regionCode].filter(Boolean).join(', ')}
                          {loc.primaryCategory && <span className="ml-2 text-ink-5">{loc.primaryCategory}</span>}
                        </p>
                      )}
                    </div>
                    {saving === loc.name ? (
                      <Loader2 className="w-4 h-4 text-brand animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 text-ink-5 group-hover:text-brand" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
      </div>

      <div className="mt-6 text-center">
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
