'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Image as ImageIcon, X, Search, Loader2, Folder, Plus,
  Copy, Check, Trash2, FolderPlus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ClientAssetRow, ClientAssetType } from '@/types/database'

const TAG_PRESETS = [
  'food', 'exterior', 'interior', 'team', 'product', 'bts',
  'lifestyle', 'event', 'seasonal', 'testimonial', 'logo',
]

const DEFAULT_FOLDERS = [
  'Product Photos',
  'Behind the Scenes',
  'Team',
  'Logos',
  'Graphics',
  'Events',
]

export default function DashboardAssetsPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [assets, setAssets] = useState<ClientAssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [noClient, setNoClient] = useState(false)

  // Filters
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Upload state
  const [uploadingFolder, setUploadingFolder] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // New folder dialog
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!business?.client_id) { setNoClient(true); setLoading(false); return }

    setClientId(business.client_id)

    const { data } = await supabase
      .from('client_assets')
      .select('*')
      .eq('client_id', business.client_id)
      .order('uploaded_at', { ascending: false })

    setAssets((data ?? []) as ClientAssetRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // All folders = default folders + any custom folders from assets
  const customFolders = Array.from(new Set(assets.map(a => a.folder).filter((f): f is string => !!f)))
  const allFolders = Array.from(new Set([...DEFAULT_FOLDERS, ...customFolders]))

  // All tags from assets
  const allTags = Array.from(new Set(assets.flatMap(a => a.tags))).sort()

  // Filtered assets
  const filtered = assets.filter(a => {
    if (selectedFolder !== null && a.folder !== selectedFolder) return false
    if (tagFilter !== 'all' && !a.tags.includes(tagFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(a.filename ?? '').toLowerCase().includes(q) && !(a.description ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Folder counts
  const folderCounts = new Map<string, number>()
  folderCounts.set('__all__', assets.length)
  folderCounts.set('__unfiled__', assets.filter(a => !a.folder).length)
  for (const folder of allFolders) {
    folderCounts.set(folder, assets.filter(a => a.folder === folder).length)
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !clientId) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('client-photos')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(path)

      // Detect orientation
      let orientation: 'landscape' | 'portrait' | 'square' = 'square'
      try {
        const img = await createImageBitmap(file)
        if (img.width > img.height * 1.1) orientation = 'landscape'
        else if (img.height > img.width * 1.1) orientation = 'portrait'
      } catch { /* skip */ }

      await supabase.from('client_assets').insert({
        client_id: clientId,
        type: 'photo' as ClientAssetType,
        file_url: urlData.publicUrl,
        filename: file.name,
        folder: uploadingFolder || selectedFolder || null,
        tags: [],
        orientation,
        uploaded_by: 'client',
      })
    }

    setUploading(false)
    setUploadingFolder(null)
    load()
  }

  function createFolder() {
    if (!newFolderName.trim()) return
    setSelectedFolder(newFolderName.trim())
    setShowNewFolder(false)
    setNewFolderName('')
  }

  async function deleteAsset(id: string) {
    await supabase.from('client_assets').delete().eq('id', id)
    setAssets(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-ink-4" />
            Brand Assets
          </h1>
          <p className="text-ink-3 text-sm mt-1">
            Photos, logos, and graphics. Used across all your content.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || noClient}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFileUpload(e.target.files)}
        />
      </div>

      {noClient && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-900 font-medium">No client linked</p>
          <p className="text-xs text-amber-700 mt-1">Contact your Apnosh team to enable asset management.</p>
        </div>
      )}

      {!noClient && (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* ── Folder sidebar ──────────────────────────────────── */}
          <aside className="space-y-1">
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Folders</span>
              <button
                onClick={() => setShowNewFolder(true)}
                className="text-ink-4 hover:text-brand-dark transition-colors"
                title="New folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                selectedFolder === null ? 'bg-brand-tint/50 text-brand-dark font-medium' : 'text-ink-2 hover:bg-bg-2'
              }`}
            >
              <span className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 flex-shrink-0" />
                All Assets
              </span>
              <span className="text-[10px] text-ink-4">{folderCounts.get('__all__') ?? 0}</span>
            </button>

            {allFolders.map(folder => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  selectedFolder === folder ? 'bg-brand-tint/50 text-brand-dark font-medium' : 'text-ink-2 hover:bg-bg-2'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{folder}</span>
                </span>
                <span className="text-[10px] text-ink-4 flex-shrink-0 ml-2">{folderCounts.get(folder) ?? 0}</span>
              </button>
            ))}

            {(folderCounts.get('__unfiled__') ?? 0) > 0 && (
              <button
                onClick={() => setSelectedFolder('__unfiled__')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  selectedFolder === '__unfiled__' ? 'bg-brand-tint/50 text-brand-dark font-medium' : 'text-ink-2 hover:bg-bg-2'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="italic text-ink-4">Unfiled</span>
                </span>
                <span className="text-[10px] text-ink-4">{folderCounts.get('__unfiled__')}</span>
              </button>
            )}

            {showNewFolder && (
              <div className="mt-2 p-2 bg-bg-2 rounded-lg">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder() }}
                  placeholder="Folder name"
                  autoFocus
                  className="w-full border border-ink-6 rounded px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 bg-white"
                />
                <div className="flex items-center gap-1 mt-1">
                  <button
                    onClick={createFolder}
                    className="text-[10px] font-medium text-brand hover:text-brand-dark"
                  >
                    Create
                  </button>
                  <span className="text-[10px] text-ink-4">·</span>
                  <button
                    onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
                    className="text-[10px] text-ink-4 hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* ── Main grid ───────────────────────────────────────── */}
          <main className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search assets..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>
              {allTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value)}
                  className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
                >
                  <option value="all">All tags</option>
                  {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <span className="text-xs text-ink-4 ml-auto">{filtered.length} items</span>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square bg-ink-6 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
                <ImageIcon className="w-6 h-6 text-ink-4 mx-auto mb-3" />
                <p className="text-sm font-medium text-ink-2">
                  {assets.length === 0 ? 'No assets yet' : 'No assets match your filters'}
                </p>
                {assets.length === 0 && (
                  <p className="text-xs text-ink-4 mt-1">Click &ldquo;Upload&rdquo; above to add your first assets.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map(asset => (
                  <div key={asset.id} className="group relative aspect-square rounded-xl overflow-hidden border border-ink-6 hover:border-brand/30 transition-all bg-white">
                    <img src={asset.file_url} alt={asset.filename ?? ''} className="w-full h-full object-cover" />

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
                      <div className="w-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="text-[10px] text-white truncate">{asset.filename}</div>
                        <div className="flex items-center justify-between mt-1">
                          <button
                            onClick={async () => { await navigator.clipboard.writeText(asset.file_url) }}
                            className="text-[10px] text-white/80 hover:text-white flex items-center gap-0.5"
                          >
                            <Copy className="w-2.5 h-2.5" /> URL
                          </button>
                          <button
                            onClick={() => deleteAsset(asset.id)}
                            className="text-[10px] text-white/80 hover:text-red-400"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Client badge */}
                    {asset.uploaded_by === 'client' && (
                      <div className="absolute top-2 right-2">
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/80 text-white backdrop-blur-sm">
                          yours
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
