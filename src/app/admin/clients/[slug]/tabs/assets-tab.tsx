'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Image as ImageIcon, X, Search, Filter, Loader2, Copy,
  Trash2, Save, Star, Eye, ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientAssetRow, ClientAssetType, AssetQuality, AssetOrientation, AssetMood } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_OPTIONS: { value: ClientAssetType; label: string }[] = [
  { value: 'logo', label: 'Logo' },
  { value: 'photo', label: 'Photo' },
  { value: 'graphic', label: 'Graphic' },
  { value: 'social_proof', label: 'Social Proof' },
  { value: 'other', label: 'Other' },
]

const QUALITY_OPTIONS: { value: AssetQuality; label: string; color: string }[] = [
  { value: 'hero', label: 'Hero', color: 'bg-amber-50 text-amber-700' },
  { value: 'good', label: 'Good', color: 'bg-emerald-50 text-emerald-700' },
  { value: 'filler', label: 'Filler', color: 'bg-ink-6 text-ink-3' },
]

const MOOD_OPTIONS: { value: AssetMood; label: string }[] = [
  { value: 'moody_warm', label: 'Moody Warm' },
  { value: 'bright_airy', label: 'Bright Airy' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'casual', label: 'Casual' },
  { value: 'minimal', label: 'Minimal' },
]

const TAG_PRESETS = ['food', 'exterior', 'team', 'product', 'bts', 'lifestyle', 'interior', 'event', 'seasonal']

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AssetsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [assets, setAssets] = useState<ClientAssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Preview modal
  const [selectedAsset, setSelectedAsset] = useState<ClientAssetRow | null>(null)
  const [editDraft, setEditDraft] = useState<ClientAssetRow | null>(null)
  const [savingAsset, setSavingAsset] = useState(false)
  const [deletingAsset, setDeletingAsset] = useState(false)

  // Upload form
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadType, setUploadType] = useState<ClientAssetType>('photo')
  const [uploadTags, setUploadTags] = useState<string[]>([])
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadQuality, setUploadQuality] = useState<AssetQuality>('good')
  const [uploadMood, setUploadMood] = useState<AssetMood>('casual')

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('client_assets')
      .select('*')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false })

    if (data) setAssets(data as ClientAssetRow[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  // All unique tags across assets
  const allTags = Array.from(new Set(assets.flatMap(a => a.tags))).sort()

  const filtered = assets.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (qualityFilter !== 'all' && a.quality_rating !== qualityFilter) return false
    if (tagFilter !== 'all' && !a.tags.includes(tagFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(a.filename ?? '').toLowerCase().includes(q) && !(a.description ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  /* ── Upload handler ─────────────────────────────────────────────── */

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const bucket = uploadType === 'logo' ? 'client-logos' : 'client-photos'

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      // Determine orientation from image
      let orientation: AssetOrientation = 'square'
      try {
        const img = await createImageBitmap(file)
        if (img.width > img.height * 1.1) orientation = 'landscape'
        else if (img.height > img.width * 1.1) orientation = 'portrait'
      } catch { /* skip */ }

      await supabase.from('client_assets').insert({
        client_id: clientId,
        type: uploadType,
        file_url: publicUrl,
        filename: file.name,
        tags: uploadTags,
        description: uploadDescription || null,
        quality_rating: uploadQuality,
        orientation,
        mood: uploadMood,
        uploaded_by: 'admin',
      })
    }

    setUploading(false)
    setShowUploadForm(false)
    setUploadTags([])
    setUploadDescription('')
    fetchAssets()
  }

  /* ── Asset update/delete ────────────────────────────────────────── */

  async function handleSaveAsset() {
    if (!editDraft) return
    setSavingAsset(true)

    await supabase
      .from('client_assets')
      .update({
        type: editDraft.type,
        tags: editDraft.tags,
        description: editDraft.description,
        quality_rating: editDraft.quality_rating,
        mood: editDraft.mood,
      })
      .eq('id', editDraft.id)

    setAssets(prev => prev.map(a => a.id === editDraft.id ? editDraft : a))
    setSelectedAsset(editDraft)
    setSavingAsset(false)
  }

  async function handleDeleteAsset() {
    if (!selectedAsset) return
    setDeletingAsset(true)

    await supabase.from('client_assets').delete().eq('id', selectedAsset.id)
    setAssets(prev => prev.filter(a => a.id !== selectedAsset.id))
    setSelectedAsset(null)
    setEditDraft(null)
    setDeletingAsset(false)
  }

  function toggleTag(tag: string) {
    setUploadTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  function toggleEditTag(tag: string) {
    if (!editDraft) return
    setEditDraft({
      ...editDraft,
      tags: editDraft.tags.includes(tag) ? editDraft.tags.filter(t => t !== tag) : [...editDraft.tags, tag],
    })
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-ink-6 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
            <option value="all">All Types</option>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={qualityFilter} onChange={e => setQualityFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
            <option value="all">All Quality</option>
            {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
              <option value="all">All Tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        <button
          onClick={() => setShowUploadForm(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Upload Assets</h3>
            <button onClick={() => setShowUploadForm(false)} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <select value={uploadType} onChange={e => setUploadType(e.target.value as ClientAssetType)} className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={uploadQuality} onChange={e => setUploadQuality(e.target.value as AssetQuality)} className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
              {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={uploadMood} onChange={e => setUploadMood(e.target.value as AssetMood)} className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white">
              {MOOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_PRESETS.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    uploadTags.includes(t) ? 'bg-brand-tint text-brand-dark border-brand/30' : 'bg-white text-ink-4 border-ink-6'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            value={uploadDescription}
            onChange={e => setUploadDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFileUpload(e.dataTransfer.files) }}
            className="border-2 border-dashed border-ink-5 rounded-xl p-8 text-center cursor-pointer hover:border-brand/50 hover:bg-brand-tint/20 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-ink-4 animate-spin mx-auto" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-ink-4 mx-auto mb-2" />
                <p className="text-sm text-ink-2">Click or drag files here to upload</p>
                <p className="text-xs text-ink-4 mt-1">PNG, JPG, WebP, SVG</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleFileUpload(e.target.files)}
          />
        </div>
      )}

      {/* Asset Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-ink-6 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <ImageIcon className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">{searchQuery || typeFilter !== 'all' ? 'No matching assets.' : 'No assets yet.'}</p>
          <p className="text-xs text-ink-4 mt-1">Upload photos, logos, and graphics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(asset => (
            <button
              key={asset.id}
              onClick={() => { setSelectedAsset(asset); setEditDraft({ ...asset }) }}
              className="group relative aspect-square rounded-xl overflow-hidden border border-ink-6 hover:border-brand/30 transition-all"
            >
              <img src={asset.file_url} alt={asset.filename ?? ''} className="w-full h-full object-cover" />

              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

              {/* Badges */}
              <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm">
                  {asset.type}
                </span>
                {asset.quality_rating && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm">
                    {asset.quality_rating}
                  </span>
                )}
              </div>

              {/* Uploaded by badge */}
              {asset.uploaded_by === 'client' && (
                <div className="absolute top-2 right-2">
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/80 text-white backdrop-blur-sm">
                    client
                  </span>
                </div>
              )}

              {/* Tags bottom */}
              {asset.tags.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {asset.tags.slice(0, 3).map(t => (
                    <span key={t} className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-white/80 text-ink-2 backdrop-blur-sm">{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Preview Modal ─────────────────────────────────────────── */}
      {selectedAsset && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setSelectedAsset(null); setEditDraft(null) }} />
          <div className="relative bg-white rounded-2xl border border-ink-6 shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink truncate">{editDraft.filename || 'Asset'}</h3>
              <button onClick={() => { setSelectedAsset(null); setEditDraft(null) }} className="text-ink-4 hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* Image preview */}
                <div className="bg-ink-6 flex items-center justify-center p-4" style={{ minHeight: '300px' }}>
                  <img src={editDraft.file_url} alt="" className="max-w-full max-h-[400px] object-contain rounded-lg" />
                </div>

                {/* Metadata */}
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Type</label>
                      <select
                        value={editDraft.type}
                        onChange={e => setEditDraft({ ...editDraft, type: e.target.value as ClientAssetType })}
                        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white"
                      >
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Quality</label>
                      <select
                        value={editDraft.quality_rating ?? ''}
                        onChange={e => setEditDraft({ ...editDraft, quality_rating: (e.target.value || null) as AssetQuality | null })}
                        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white"
                      >
                        <option value="">Unrated</option>
                        {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Mood</label>
                    <select
                      value={editDraft.mood ?? ''}
                      onChange={e => setEditDraft({ ...editDraft, mood: (e.target.value || null) as AssetMood | null })}
                      className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white"
                    >
                      <option value="">None</option>
                      {MOOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">Tags</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TAG_PRESETS.map(t => (
                        <button
                          key={t}
                          onClick={() => toggleEditTag(t)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            editDraft.tags.includes(t) ? 'bg-brand-tint text-brand-dark border-brand/30' : 'bg-white text-ink-4 border-ink-6'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Description</label>
                    <textarea
                      value={editDraft.description ?? ''}
                      onChange={e => setEditDraft({ ...editDraft, description: e.target.value || null })}
                      rows={2}
                      className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  {/* Usage history */}
                  {editDraft.usage_history.length > 0 && (
                    <div>
                      <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Used In</label>
                      <div className="flex flex-wrap gap-1.5">
                        {editDraft.usage_history.map(code => (
                          <span key={code} className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-2 text-ink-3">{code}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meta */}
                  <div className="text-[10px] text-ink-4 space-y-0.5 pt-2 border-t border-ink-6">
                    <p>Orientation: {editDraft.orientation ?? 'unknown'}</p>
                    <p>Uploaded by: {editDraft.uploaded_by}</p>
                    <p>Uploaded: {new Date(editDraft.uploaded_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-ink-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteAsset}
                  disabled={deletingAsset}
                  className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                >
                  {deletingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(editDraft.file_url)
                  }}
                  className="text-xs font-medium text-ink-3 hover:text-ink transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy URL
                </button>
              </div>
              <button
                onClick={handleSaveAsset}
                disabled={savingAsset}
                className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {savingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
