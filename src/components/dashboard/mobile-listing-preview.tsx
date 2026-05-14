'use client'

/**
 * iPhone-style preview of what the GBP listing looks like on mobile.
 * Reads the same listing fields the editor uses and renders them in
 * a recognizable Google Maps-ish layout. Gives owners the "oh that's
 * what customers actually see" moment.
 */

import { useEffect, useState } from 'react'
import { Star, MapPin, Phone, Globe, Clock, Smartphone, Loader2 } from 'lucide-react'
import type { ListingFields } from '@/lib/gbp-listing'

interface Props {
  locationId?: string | null
}

interface Preview {
  title: string
  category: string
  rating: number
  reviewCount: number
  description: string
  phone: string
  website: string
  address: string
  hoursToday: string
  primaryPhoto?: string
}

export default function MobileListingPreview({ locationId }: Props) {
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : ''
    fetch(`/api/dashboard/listing/preview${q}`)
      .then(async r => r.ok ? r.json() as Promise<Preview> : null)
      .then(d => { if (!cancelled && d) setData(d) })
      .catch(() => { /* silent — preview is non-critical */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [locationId])

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">How it looks on mobile</h2>
      </div>
      <p className="text-xs text-ink-3 mb-4">
        What customers see when they tap your business on Google Maps.
      </p>

      <div className="mx-auto rounded-[28px] border-4 border-ink-2 bg-ink-1 p-1 max-w-[320px]">
        <div className="rounded-[22px] bg-white overflow-hidden">
          {/* Status bar */}
          <div className="h-7 bg-ink-1 flex items-center justify-between px-5 text-[10px] text-white">
            <span className="font-semibold">9:41</span>
            <span>•••</span>
          </div>

          {loading ? (
            <div className="h-72 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
            </div>
          ) : !data ? (
            <div className="h-72 flex items-center justify-center text-xs text-ink-4">
              Connect Google Business Profile to see preview
            </div>
          ) : (
            <div>
              {/* Photo strip */}
              <div className="h-32 bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center text-[10px] text-ink-3">
                {data.primaryPhoto ? '[photo]' : 'Photo will appear here'}
              </div>
              {/* Header */}
              <div className="p-3 border-b border-ink-7">
                <h3 className="text-[15px] font-semibold text-ink leading-tight">{data.title || 'Your business'}</h3>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-ink-3">
                  {data.rating > 0 && (
                    <>
                      <span className="font-medium text-ink-2">{data.rating.toFixed(1)}</span>
                      <span className="text-amber-400 inline-flex">{'★'.repeat(Math.round(data.rating))}</span>
                      <span>({data.reviewCount})</span>
                      <span className="text-ink-5">·</span>
                    </>
                  )}
                  <span>{data.category}</span>
                </div>
              </div>
              {/* Action buttons */}
              <div className="grid grid-cols-3 border-b border-ink-7 text-[10px]">
                <button className="py-2 text-blue-600 font-medium border-r border-ink-7">Directions</button>
                <button className="py-2 text-blue-600 font-medium border-r border-ink-7">Call</button>
                <button className="py-2 text-blue-600 font-medium">Website</button>
              </div>
              {/* Info rows */}
              <div className="px-3 py-2 space-y-1.5 text-[11px]">
                {data.hoursToday && (
                  <div className="flex items-start gap-2 text-ink-2">
                    <Clock className="w-3 h-3 mt-0.5 flex-shrink-0 text-ink-4" />
                    <span>{data.hoursToday}</span>
                  </div>
                )}
                {data.address && (
                  <div className="flex items-start gap-2 text-ink-2">
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-ink-4" />
                    <span className="truncate">{data.address}</span>
                  </div>
                )}
                {data.phone && (
                  <div className="flex items-start gap-2 text-ink-2">
                    <Phone className="w-3 h-3 mt-0.5 flex-shrink-0 text-ink-4" />
                    <span>{data.phone}</span>
                  </div>
                )}
                {data.website && (
                  <div className="flex items-start gap-2 text-blue-600">
                    <Globe className="w-3 h-3 mt-0.5 flex-shrink-0 text-ink-4" />
                    <span className="truncate">{shortenUrl(data.website)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function shortenUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/* Re-export so callers that already import ListingFields don't break. */
export type { ListingFields }
