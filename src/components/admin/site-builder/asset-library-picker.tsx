'use client'

/**
 * Asset library modal — browses already-uploaded images for the client
 * (from the existing brand_assets / assets table) so the AM can pick from
 * what's there instead of re-pasting URLs.
 */

import { useEffect, useState } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Asset {
  id: string
  name: string
  url: string
  thumbnailUrl?: string | null
  tags?: string[] | null
}

interface Props {
  clientId: string
  open: boolean
  onClose: () => void
  onPick: (url: string) => void
}

export default function AssetLibraryPicker({ clientId, open, onClose, onPick }: Props) {
  const [items, setItems] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    // Try the legacy `assets` table first (per src/lib/asset-actions.ts).
    // Fall back to `brand_assets` if needed. Both shapes have a public
    // file_url field.
    ;(async () => {
      const { data: a, error: aErr } = await supabase
        .from('assets')
        .select('id, name, file_url, type, tags')
        .eq('client_id', clientId)
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(60)

      if (!aErr && a && a.length > 0) {
        setItems(a.map(r => ({
          id: r.id as string,
          name: r.name as string,
          url: r.file_url as string,
          tags: (r.tags as string[]) ?? [],
        })))
        setLoading(false)
        return
      }

      // Fallback: brand_assets table (older shape)
      const { data: b, error: bErr } = await supabase
        .from('brand_assets')
        .select('id, name, url, tags')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(60)

      if (bErr) {
        setError(bErr.message)
        setLoading(false)
        return
      }
      setItems((b ?? []).map(r => ({
        id: r.id as string,
        name: (r.name as string) ?? 'Asset',
        url: r.url as string,
        tags: (r.tags as string[]) ?? [],
      })))
      setLoading(false)
    })()
  }, [open, clientId])

  if (!open) return null

  const filtered = filter.trim()
    ? items.filter(it =>
        it.name.toLowerCase().includes(filter.toLowerCase()) ||
        (it.tags ?? []).some(t => t.toLowerCase().includes(filter.toLowerCase())),
      )
    : items

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-x-8 top-12 bottom-12 max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl z-50 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-ink-6">
          <div>
            <h3 className="text-sm font-semibold text-ink">Pick from your assets</h3>
            <p className="text-[11px] text-ink-3 mt-0.5">Browse images already uploaded for this client.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-3 border-b border-ink-6 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-ink-4" />
          <input
            type="text"
            placeholder="Search by name or tag…"
            className="flex-1 text-sm border-none outline-none bg-transparent"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <span className="text-[11px] text-ink-4">{filtered.length} of {items.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-ink-3 py-12 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading assets…
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
          )}
          {!loading && filtered.length === 0 && !error && (
            <div className="text-center py-12 text-xs text-ink-3">
              {items.length === 0
                ? 'No images uploaded yet for this client. Upload via the Assets tab or use the upload button on each field.'
                : 'No assets match your search.'}
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {filtered.map(asset => (
              <button
                key={asset.id}
                type="button"
                onClick={() => { onPick(asset.url); onClose() }}
                className="group relative aspect-square rounded-lg overflow-hidden border border-ink-6 hover:border-brand transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <span className="text-[11px] text-white font-medium truncate">{asset.name}</span>
                  {asset.tags && asset.tags.length > 0 && (
                    <span className="text-[9px] text-white/70 truncate">{asset.tags.slice(0, 3).join(' · ')}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
