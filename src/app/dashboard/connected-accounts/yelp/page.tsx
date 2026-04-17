'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Star, Loader2, AlertCircle, CheckCircle2, ExternalLink, MapPin,
} from 'lucide-react'
import { previewYelpBusiness, connectYelp } from '@/lib/connection-actions'
import type { YelpPreview } from '@/lib/yelp-helpers'

export default function ConnectYelpPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<YelpPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPreview(null)
    setLoading(true)

    const result = await previewYelpBusiness(url)
    if (result.success) {
      setPreview(result.preview)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)

    const result = await connectYelp(url)
    if (result.success) {
      router.push('/dashboard/connected-accounts?connected=yelp')
    } else {
      setError(result.error)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/connected-accounts"
        className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink transition-colors mt-6 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Connected Accounts
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
          <Star className="w-5 h-5 text-white fill-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">Connect Yelp</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Paste your Yelp business page URL to track your rating and review count.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-5 mb-6">
        <form onSubmit={handlePreview}>
          <label htmlFor="yelp-url" className="block text-xs font-medium text-ink-2 mb-2">
            Your Yelp page URL
          </label>
          <input
            id="yelp-url"
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.yelp.com/biz/your-business-name"
            className="w-full px-3 py-2 text-sm bg-white border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            disabled={loading || saving}
          />
          <p className="text-[11px] text-ink-4 mt-2">
            Find it by searching your business on{' '}
            <a href="https://www.yelp.com" target="_blank" rel="noopener" className="text-brand hover:underline inline-flex items-center gap-0.5">
              yelp.com <ExternalLink className="w-2.5 h-2.5" />
            </a>{' '}
            and copying the URL from your business page.
          </p>

          <button
            type="submit"
            disabled={loading || saving || !url.trim()}
            className="mt-4 w-full bg-brand hover:bg-brand-dark disabled:bg-ink-5 text-white text-sm font-medium rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Finding your business...
              </>
            ) : (
              'Find my business'
            )}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900 mb-0.5">We hit a snag</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {preview && !error && (
        <div className="bg-white rounded-xl border border-ink-6 p-5 mb-6">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 mb-3">
            <CheckCircle2 className="w-4 h-4" />
            We found your Yelp page
          </div>

          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-ink truncate">{preview.name}</h2>
              {preview.city && preview.state && (
                <p className="text-xs text-ink-4 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {preview.city}, {preview.state}
                </p>
              )}
              {preview.categories.length > 0 && (
                <p className="text-[11px] text-ink-4 mt-1">
                  {preview.categories.slice(0, 3).join(' · ')}
                </p>
              )}
            </div>
            <a
              href={preview.url}
              target="_blank"
              rel="noopener"
              className="text-xs text-brand hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            >
              View on Yelp <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-bg-2 rounded-lg p-3">
              <div className="text-[10px] text-ink-3 uppercase tracking-wide">Rating</div>
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-lg font-semibold text-ink">{preview.rating || '—'}</span>
              </div>
            </div>
            <div className="bg-bg-2 rounded-lg p-3">
              <div className="text-[10px] text-ink-3 uppercase tracking-wide">Reviews</div>
              <div className="text-lg font-semibold text-ink mt-1">
                {preview.review_count.toLocaleString()}
              </div>
            </div>
            <div className="bg-bg-2 rounded-lg p-3">
              <div className="text-[10px] text-ink-3 uppercase tracking-wide">Status</div>
              <div className="text-xs text-ink mt-1.5">
                {preview.is_closed ? (
                  <span className="text-red-600">Closed</span>
                ) : (
                  <span className="text-emerald-600">Active</span>
                )}
                {preview.is_claimed && <span className="text-ink-4"> · claimed</span>}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 bg-brand hover:bg-brand-dark disabled:bg-ink-5 text-white text-sm font-medium rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect this business'
              )}
            </button>
            <button
              onClick={() => { setPreview(null); setUrl('') }}
              disabled={saving}
              className="px-4 py-2.5 text-sm text-ink-3 hover:text-ink border border-ink-6 rounded-lg transition-colors"
            >
              Not this one
            </button>
          </div>
        </div>
      )}

      <div className="bg-bg-2 rounded-xl p-4">
        <p className="text-xs font-semibold text-ink mb-1">What we&apos;ll track</p>
        <ul className="text-xs text-ink-3 space-y-1 list-disc list-inside">
          <li>Your overall Yelp rating, updated daily</li>
          <li>Total review count and change over time</li>
          <li>&quot;New reviews&quot; signal based on daily count changes</li>
        </ul>
        <p className="text-[11px] text-ink-4 mt-2">
          Individual review text isn&apos;t available on Yelp&apos;s free API tier. If you want full review monitoring, ask your AM about Yelp&apos;s paid partnership.
        </p>
      </div>
    </div>
  )
}
