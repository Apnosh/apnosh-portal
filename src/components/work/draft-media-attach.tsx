'use client'

/**
 * Inline media-attach panel for a draft card.
 *
 * Two inputs, one column: drop/click to upload, OR paste a public URL.
 * Both append into the same media_urls list on the draft. Existing
 * URLs render as thumbnails with per-item remove.
 *
 * Errors render inline so the strategist sees why a paste failed
 * (dead link, unsupported MIME, etc.) without leaving the panel.
 */

import { useCallback, useRef, useState } from 'react'
import { Loader2, Upload, Link as LinkIcon, X, AlertCircle, ImageOff, Plus } from 'lucide-react'

interface Props {
  draftId: string
  mediaUrls: string[]
  onChange: (next: string[]) => void
  onClose: () => void
}

export default function DraftMediaAttach({ draftId, mediaUrls, onChange, onClose }: Props) {
  const [busy, setBusy] = useState<'upload' | 'paste' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    setBusy('upload'); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/work/drafts/${draftId}/media`, { method: 'PUT', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onChange(j.mediaUrls ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }, [draftId, onChange])

  const paste = useCallback(async () => {
    const url = pasteUrl.trim()
    if (!url) return
    setBusy('paste'); setError(null)
    try {
      const res = await fetch(`/api/work/drafts/${draftId}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onChange(j.mediaUrls ?? [])
      setPasteUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add URL')
    } finally {
      setBusy(null)
    }
  }, [draftId, pasteUrl, onChange])

  const remove = useCallback(async (url: string) => {
    setBusy('remove'); setError(null)
    try {
      const res = await fetch(`/api/work/drafts/${draftId}/media?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onChange(j.mediaUrls ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setBusy(null)
    }
  }, [draftId, onChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }, [upload])

  return (
    <div className="rounded-xl border border-ink-6 bg-white p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Media</p>
        <button onClick={onClose} className="text-ink-4 hover:text-ink" aria-label="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Existing thumbnails */}
      {mediaUrls.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {mediaUrls.map(u => (
            <div key={u} className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-ink-6 bg-ink-7">
              {/\.(mp4|mov|m4v|webm)(\?|$)/i.test(u) ? (
                <video src={u} className="w-full h-full object-cover" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={u} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              )}
              <button
                onClick={() => remove(u)}
                disabled={busy !== null}
                className="absolute top-1 right-1 bg-white/90 hover:bg-white text-ink rounded-full w-5 h-5 inline-flex items-center justify-center shadow disabled:opacity-50"
                aria-label="Remove this asset"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-lg border border-dashed border-ink-6 hover:border-ink-4 cursor-pointer p-3 text-center transition-colors"
      >
        {busy === 'upload' ? (
          <p className="text-[12px] text-ink-3 inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
          </p>
        ) : (
          <p className="text-[12px] text-ink-3 inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Drop a photo or click to upload
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = '' // allow re-selecting the same file
          }}
        />
      </div>

      {/* Paste URL row */}
      <div className="mt-2 flex items-center gap-2">
        <LinkIcon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
        <input
          type="url"
          value={pasteUrl}
          onChange={e => setPasteUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); paste() } }}
          placeholder="Or paste a public image URL (Drive, Cloudinary, etc.)"
          className="flex-1 text-[12px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
        />
        <button
          onClick={paste}
          disabled={busy !== null || !pasteUrl.trim()}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-ink hover:bg-ink-2 text-white disabled:opacity-40 inline-flex items-center gap-1"
        >
          {busy === 'paste' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-rose-700 inline-flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {mediaUrls.length === 0 && !error && (
        <p className="mt-2 text-[10px] text-ink-4 inline-flex items-center gap-1">
          <ImageOff className="w-3 h-3" /> No media yet. Required to publish.
        </p>
      )}
    </div>
  )
}
