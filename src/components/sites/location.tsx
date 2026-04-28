/**
 * Location section with address, map link, and contact info.
 */

import { MapPin, Phone, Globe } from 'lucide-react'

interface LocationProps {
  address?: string
  phone?: string
  websiteUrl?: string
  parking?: string
  accessibility?: string
}

export default function Location({
  address, phone, websiteUrl, parking, accessibility,
}: LocationProps) {
  if (!address && !phone) return null

  const mapUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null

  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-stone-900 mb-8 text-center">Find us</h2>

        <div className="grid md:grid-cols-2 gap-6">
          {address && (
            <a
              href={mapUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-5 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors"
            >
              <MapPin className="w-5 h-5 text-stone-700 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-stone-900 mb-1">Address</div>
                <div className="text-sm text-stone-600 whitespace-pre-line">{address}</div>
                <div className="text-xs text-stone-500 mt-2">Open in maps →</div>
              </div>
            </a>
          )}

          {phone && (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, '')}`}
              className="flex items-start gap-3 p-5 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors"
            >
              <Phone className="w-5 h-5 text-stone-700 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-stone-900 mb-1">Phone</div>
                <div className="text-sm text-stone-600">{phone}</div>
                <div className="text-xs text-stone-500 mt-2">Tap to call →</div>
              </div>
            </a>
          )}

          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-5 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors"
            >
              <Globe className="w-5 h-5 text-stone-700 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-stone-900 mb-1">Website</div>
                <div className="text-sm text-stone-600 truncate">{websiteUrl.replace(/^https?:\/\//, '')}</div>
              </div>
            </a>
          )}
        </div>

        {(parking || accessibility) && (
          <div className="mt-8 text-sm text-stone-600 space-y-2">
            {parking && (
              <p><span className="font-semibold text-stone-700">Parking:</span> {parking}</p>
            )}
            {accessibility && (
              <p><span className="font-semibold text-stone-700">Accessibility:</span> {accessibility}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
