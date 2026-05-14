'use client'

/**
 * SEO toolkit -- strategist-only operational tools for managing a
 * client's local presence. Currently hosts the schema markup
 * generator; will grow to include NAP citation audit, competitor
 * benchmark, and Q&A monitoring as those ship.
 *
 * Each section is collapsible so a strategist can focus on one job
 * at a time without scrolling past everything else.
 */

import { useEffect, useState } from 'react'
import { Loader2, Code, Copy, Check, ChevronDown, Building2 } from 'lucide-react'

interface Props { clientId: string }

interface SchemaInput {
  name: string
  description?: string
  phone?: string
  website?: string
  address?: { street: string; locality: string; region: string; postal: string; country: string }
  hours?: Array<{ day: string; opens: string; closes: string }>
  priceRange?: string
  acceptsReservations?: boolean
  servesCuisine?: string
  menuUrl?: string
  rating?: { value: number; count: number }
}

export default function SeoToolkitTab({ clientId }: Props) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">SEO toolkit</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Operational tools for managing this client&rsquo;s local presence. Strategist-only.
        </p>
      </div>
      <SchemaGenerator clientId={clientId} />
    </div>
  )
}

function SchemaGenerator({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState<SchemaInput | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/clients/${clientId}/schema-input`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as SchemaInput
      })
      .then(d => { if (!cancelled) setInput(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  const jsonLd = input ? buildJsonLd(input) : ''

  async function copy() {
    if (!jsonLd) return
    await navigator.clipboard.writeText(jsonLd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <Code className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Schema markup generator</h3>
        <span className="text-[11px] text-ink-4">LocalBusiness JSON-LD for the client&rsquo;s website</span>
      </summary>
      <div className="border-t border-ink-6 p-5 space-y-3">
        <p className="text-xs text-ink-3">
          Paste this into the <code className="px-1 py-0.5 rounded bg-bg-2 text-[11px]">&lt;head&gt;</code> of the client&rsquo;s homepage. Google reads it for rich snippets (stars, hours, menu) on Search results.
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-3 py-6 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading listing fields…
          </div>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
        {input && (
          <>
            <div className="rounded-lg bg-ink-7 p-4 max-h-[400px] overflow-auto">
              <pre className="text-[11.5px] text-ink-2 font-mono whitespace-pre-wrap">{jsonLd}</pre>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy JSON-LD'}
              </button>
              <a
                href={`https://search.google.com/test/rich-results?utm_source=apnosh&code=${encodeURIComponent(jsonLd)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3 hover:text-ink"
              >
                <Building2 className="w-3 h-3" />
                Validate in Rich Results Test
              </a>
            </div>
          </>
        )}
      </div>
    </details>
  )
}

function buildJsonLd(input: SchemaInput): string {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
  }
  if (input.description) ld.description = input.description
  if (input.phone) ld.telephone = input.phone
  if (input.website) ld.url = input.website
  if (input.address) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: input.address.street,
      addressLocality: input.address.locality,
      addressRegion: input.address.region,
      postalCode: input.address.postal,
      addressCountry: input.address.country,
    }
  }
  if (input.hours && input.hours.length > 0) {
    ld.openingHoursSpecification = input.hours.map(h => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.day,
      opens: h.opens,
      closes: h.closes,
    }))
  }
  if (input.servesCuisine) ld.servesCuisine = input.servesCuisine
  if (input.priceRange) ld.priceRange = input.priceRange
  if (input.acceptsReservations !== undefined) ld.acceptsReservations = input.acceptsReservations
  if (input.menuUrl) ld.menu = input.menuUrl
  if (input.rating && input.rating.count > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.rating.value,
      reviewCount: input.rating.count,
    }
  }
  return JSON.stringify(ld, null, 2)
}
