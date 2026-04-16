'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BarChart3, Loader2, Check, AlertCircle } from 'lucide-react'
import { fetchGA4PropertiesForClient, finalizeGA4Connection } from '@/lib/ga4-actions'
import type { GA4Property } from '@/lib/google'

function PropertyPicker() {
  const params = useSearchParams()
  const router = useRouter()
  const clientId = params.get('clientId')
  const returnTo = params.get('returnTo')

  const [properties, setProperties] = useState<GA4Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) { setError('Missing clientId'); setLoading(false); return }
    fetchGA4PropertiesForClient(clientId).then((res) => {
      if (res.success) setProperties(res.properties)
      else setError(res.error)
      setLoading(false)
    })
  }, [clientId])

  async function handlePick(property: GA4Property) {
    if (!clientId) return
    setSaving(property.propertyId)
    const res = await finalizeGA4Connection(clientId, property)
    if (res.success) {
      const dest = returnTo || '/dashboard/connect-accounts?connected=google_analytics'
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
        <p className="text-sm text-ink-3">Finding your Google Analytics properties...</p>
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

  if (properties.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <BarChart3 className="w-10 h-10 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink mb-2">No Google Analytics properties found</p>
        <p className="text-xs text-ink-4 mb-6 max-w-xs mx-auto">
          The account you connected doesn&apos;t have access to any GA4 properties. Make sure you signed in with the Google account that owns your website analytics.
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
          <BarChart3 className="w-5 h-5 text-brand" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Pick your website</h1>
        <p className="text-sm text-ink-3">
          Choose which Google Analytics property to connect to this portal.
        </p>
      </div>

      <div className="space-y-2">
        {properties.map((p) => (
          <button
            key={p.propertyId}
            onClick={() => handlePick(p)}
            disabled={saving !== null}
            className="w-full text-left p-4 bg-white border border-ink-6 rounded-xl hover:border-brand hover:bg-brand-tint/30 transition-colors disabled:opacity-50 flex items-center justify-between group"
          >
            <div>
              <p className="text-sm font-semibold text-ink group-hover:text-brand-dark">{p.propertyName}</p>
              <p className="text-xs text-ink-4 mt-0.5">{p.accountName}</p>
            </div>
            {saving === p.propertyId ? (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-ink-5 group-hover:text-brand" />
            )}
          </button>
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

export default function GA4PropertyPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-ink-4">Loading...</div>}>
      <PropertyPicker />
    </Suspense>
  )
}
