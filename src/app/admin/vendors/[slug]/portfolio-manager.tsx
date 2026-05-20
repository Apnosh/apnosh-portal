'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, Star, Trash2, Loader2, AlertCircle, X,
} from 'lucide-react'
import { uploadPortfolioItem, deletePortfolioItem, toggleFeatured } from './actions'

interface PortfolioItem {
  id: string
  url: string
  thumbnailUrl: string | null
  caption: string | null
  category: string | null
  featured: boolean
}

interface Props {
  vendorSlug: string
  portfolio: PortfolioItem[]
}

const CATEGORY_OPTIONS = [
  { key: '', label: 'No category' },
  { key: 'photographer', label: 'Photography' },
  { key: 'videographer', label: 'Videography' },
  { key: 'graphic_designer', label: 'Graphic design' },
  { key: 'web_designer', label: 'Web design' },
  { key: 'social_manager', label: 'Social' },
  { key: 'food_influencer', label: 'Influencer' },
  { key: 'full_service_agency', label: 'Full-service' },
  { key: 'other', label: 'Other' },
]

export default function PortfolioManager({ vendorSlug, portfolio }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingUpload, startUploadTransition] = useTransition()
  const [pendingMutation, startMutationTransition] = useTransition()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [category, setCategory] = useState('')
  const [featured, setFeatured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setPreviewUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const onUpload = () => {
    if (!previewUrl) return
    setError(null)
    startUploadTransition(async () => {
      const r = await uploadPortfolioItem({
        vendorSlug,
        dataUrl: previewUrl,
        caption: caption || undefined,
        category: category || undefined,
        featured,
      })
      if (!r.ok) {
        setError(r.error ?? 'Upload failed')
        return
      }
      setPreviewUrl(null)
      setCaption('')
      setCategory('')
      setFeatured(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    })
  }

  const onDelete = (itemId: string) => {
    if (!confirm('Delete this portfolio item?')) return
    startMutationTransition(async () => {
      const r = await deletePortfolioItem({ itemId, vendorSlug })
      if (!r.ok) setError(r.error ?? 'Delete failed')
      else router.refresh()
    })
  }

  const onToggleFeatured = (itemId: string, current: boolean) => {
    startMutationTransition(async () => {
      const r = await toggleFeatured({ itemId, vendorSlug, featured: !current })
      if (!r.ok) setError(r.error ?? 'Update failed')
      else router.refresh()
    })
  }

  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Portfolio ({portfolio.length})
        </p>
        <p className="text-[11px] text-ink-3">
          Featured items appear in the marketplace card hero. Max 3.
        </p>
      </div>

      {/* Existing items */}
      {portfolio.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {portfolio.map(item => (
            <div
              key={item.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-ink-7 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnailUrl ?? item.url}
                alt={item.caption ?? ''}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                <button
                  onClick={() => onToggleFeatured(item.id, item.featured)}
                  disabled={pendingMutation}
                  className={[
                    'inline-flex items-center justify-center w-7 h-7 rounded-full transition',
                    item.featured
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-white/80 text-ink-3 hover:bg-white opacity-0 group-hover:opacity-100',
                  ].join(' ')}
                  title={item.featured ? 'Featured (click to unfeature)' : 'Mark as featured'}
                >
                  <Star className={`w-3.5 h-3.5 ${item.featured ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  disabled={pendingMutation}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/80 text-rose-600 hover:bg-white opacity-0 group-hover:opacity-100 transition"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {item.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10.5px] p-2">
                  {item.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="border-t border-ink-7 pt-4 space-y-3">
        <p className="text-[12px] font-semibold text-ink">Upload new item</p>

        {previewUrl ? (
          <div className="flex gap-3">
            <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-ink-7 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-ink-2 hover:bg-white flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                placeholder="Caption (optional)"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-brand"
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-brand"
              >
                {CATEGORY_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={e => setFeatured(e.target.checked)}
                />
                Feature in marketplace card
              </label>
              <button
                onClick={onUpload}
                disabled={pendingUpload}
                className="inline-flex items-center gap-1.5 bg-ink text-white text-[12px] font-semibold rounded-full px-4 py-1.5 hover:bg-ink-2 disabled:opacity-60"
              >
                {pendingUpload
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Uploading...</>
                  : <><Upload className="w-3 h-3" />Upload</>}
              </button>
            </div>
          </div>
        ) : (
          <label className="block">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFile}
              className="hidden"
            />
            <div className="border-2 border-dashed border-ink-6 hover:border-brand transition rounded-xl py-8 px-4 text-center cursor-pointer">
              <Upload className="w-6 h-6 text-ink-3 mx-auto mb-1" />
              <p className="text-[12.5px] text-ink-2">Click to choose an image</p>
              <p className="text-[10.5px] text-ink-3 mt-0.5">JPG, PNG, WebP, GIF · up to 10MB</p>
            </div>
          </label>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-rose-800">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
