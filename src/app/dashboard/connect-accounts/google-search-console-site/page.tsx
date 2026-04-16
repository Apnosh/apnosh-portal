'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Loader2, Check, AlertCircle } from 'lucide-react'
import { fetchGSCSitesForClient, finalizeGSCConnection } from '@/lib/gsc-actions'
import type { GSCSite } from '@/lib/google'

function SitePicker() {
  const params = useSearchParams()
  const router = useRouter()
  const clientId = params.get('clientId')
  const returnTo = params.get('returnTo')

  const [sites, setSites] = useState<GSCSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) { setError('Missing clientId'); setLoading(false); return }
    fetchGSCSitesForClient(clientId).then((res) => {
      if (res.success) setSites(res.sites)
      else setError(res.error)
      setLoading(false)
    })
  }, [clientId])

  async function handlePick(site: GSCSite) {
    if (!clientId) return
    setSaving(site.siteUrl)
    const res = await finalizeGSCConnection(clientId, site)
    if (res.success) {
      const dest = returnTo || '/dashboard/connect-accounts?connected=google_search_console'
      router.push(dest)
    } else {
      setError(res.error)
      setSaving(null)
    }
  }

  function formatSite(siteUrl: string): string {
    if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice(10) + ' (domain)'
    return siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <Loader2 className="w-8 h-8 text-brand mx-auto mb-3 animate-spin" />
        <p className="text-sm text-ink-3">Finding your Search Console sites...</p>
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

  if (sites.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <Search className="w-10 h-10 text-ink-4 mx-auto mb-3" />
        <p className="text-sm font-medium text-ink mb-2">No Search Console sites found</p>
        <p className="text-xs text-ink-4 mb-6 max-w-xs mx-auto">
          The account you connected doesn&apos;t have any verified Search Console properties. Verify your site at search.google.com/search-console first.
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
          <Search className="w-5 h-5 text-brand" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Pick your site</h1>
        <p className="text-sm text-ink-3">
          Choose which Search Console property to track.
        </p>
      </div>

      <div className="space-y-2">
        {sites.map((s) => (
          <button
            key={s.siteUrl}
            onClick={() => handlePick(s)}
            disabled={saving !== null}
            className="w-full text-left p-4 bg-white border border-ink-6 rounded-xl hover:border-brand hover:bg-brand-tint/30 transition-colors disabled:opacity-50 flex items-center justify-between group"
          >
            <div>
              <p className="text-sm font-semibold text-ink group-hover:text-brand-dark">{formatSite(s.siteUrl)}</p>
              <p className="text-xs text-ink-4 mt-0.5 capitalize">{s.permissionLevel.replace(/^site/, '').toLowerCase()}</p>
            </div>
            {saving === s.siteUrl ? (
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

export default function GSCSitePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-ink-4">Loading...</div>}>
      <SitePicker />
    </Suspense>
  )
}
