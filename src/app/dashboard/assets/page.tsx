'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Image as ImageIcon, X, Search, Loader2, Folder, Plus,
  Copy, Check, Trash2, FolderPlus, Grid, List, FileText, Film,
  Download, Edit3, Tag, ChevronRight, MoreHorizontal, Type,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { useRealtimeRefresh } from '@/lib/realtime'
import {
  createAssetFolder, deleteAssetFolder,
  createAsset, updateAsset, deleteAsset as deleteAssetAction,
  createTextSnippet,
} from '@/lib/asset-actions'
import type { Asset, AssetFolder, GlobalAssetType } from '@/types/database'

const TAG_PRESETS = [
  'food', 'exterior', 'interior', 'team', 'product', 'behind the scenes',
  'lifestyle', 'event', 'seasonal', 'testimonial', 'logo', 'menu',
]

const TYPE_ICONS: Record<GlobalAssetType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  text: Type,
  document: FileText,
}

const TYPE_LABELS: Record<GlobalAssetType, string> = {
  image: 'Images',
  video: 'Videos',
  text: 'Text snippets',
  document: 'Documents',
}

export default function AssetsPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [assets, setAssets] = useState<Asset[]>([])
  const [folders, setFolders] = useState<AssetFolder[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<GlobalAssetType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Upload
  const [uploading, setUploading] = useState(false)

  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // Text snippet
  const [showSnippet, setShowSnippet] = useState(false)
  const [snippetName, setSnippetName] = useState('')
  const [snippetContent, setSnippetContent] = useState('')

  // Detail panel
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [assetsRes, foldersRes] = await Promise.all([
      supabase
        .from('assets')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('asset_folders')
        .select('*')
        .eq('client_id', client.id)
        .order('name'),
    ])

    setAssets((assetsRes.data ?? []) as Asset[])
    setFolders((foldersRes.data ?? []) as AssetFolder[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['assets', 'asset_folders'] as never[], load)

  // Filtered assets
  const filtered = assets.filter(a => {
    if (selectedFolderId === '__unfiled__' && a.folder_id !== null) return false
    if (selectedFolderId && selectedFolderId !== '__unfiled__' && a.folder_id !== selectedFolderId) return false
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.name.toLowerCase().includes(q) && !a.tags.some(t => t.toLowerCase().includes(q))) return false
    }
    return true
  })

  // Counts
  const totalCount = assets.length
  const unfiledCount = assets.filter(a => !a.folder_id).length

  // ── Upload handler ──
  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !client?.id) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${client.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('client-assets')
        .upload(path, file, { upsert: false, contentType: file.type })

      if (uploadError) continue

      const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path)

      // Detect type
      let assetType: GlobalAssetType = 'document'
      if (file.type.startsWith('image/')) assetType = 'image'
      else if (file.type.startsWith('video/')) assetType = 'video'

      // Detect dimensions for images
      let dimensions: string | null = null
      if (assetType === 'image') {
        try {
          const img = await createImageBitmap(file)
          dimensions = `${img.width}x${img.height}`
        } catch { /* skip */ }
      }

      await createAsset({
        name: file.name,
        type: assetType,
        fileUrl: urlData.publicUrl,
        fileSize: file.size,
        mimeType: file.type,
        dimensions,
        folderId: selectedFolderId && selectedFolderId !== '__unfiled__' ? selectedFolderId : null,
        tags: [],
      })
    }

    setUploading(false)
    load()
  }

  // ── Folder creation ──
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    await createAssetFolder(newFolderName)
    setNewFolderName('')
    setShowNewFolder(false)
    setCreatingFolder(false)
    load()
  }

  // ── Text snippet ──
  async function handleCreateSnippet() {
    if (!snippetName.trim() || !snippetContent.trim()) return
    await createTextSnippet({
      name: snippetName,
      content: snippetContent,
      folderId: selectedFolderId && selectedFolderId !== '__unfiled__' ? selectedFolderId : null,
    })
    setSnippetName('')
    setSnippetContent('')
    setShowSnippet(false)
    load()
  }

  // ── Delete ──
  async function handleDelete(id: string) {
    await deleteAssetAction(id)
    if (selectedAsset?.id === id) setSelectedAsset(null)
    load()
  }

  // ── Detail panel ──
  function openDetail(asset: Asset) {
    setSelectedAsset(asset)
    setEditName(asset.name)
    setEditTags([...asset.tags])
    setEditingName(false)
  }

  async function saveEdits() {
    if (!selectedAsset) return
    await updateAsset(selectedAsset.id, {
      name: editName,
      tags: editTags,
    })
    setEditingName(false)
    load()
  }

  function toggleTag(tag: string) {
    setEditTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            Asset Library
          </h1>
          <p className="text-ink-3 text-sm mt-1">
            Your photos, videos, logos, and brand files. Used across all your content.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowSnippet(true)}
            className="text-sm text-ink-3 hover:text-ink border border-ink-6 rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors"
          >
            <Type className="w-4 h-4" />
            Text snippet
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || clientLoading}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={e => handleFileUpload(e.target.files)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* ── Folder sidebar ── */}
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

          {/* All */}
          <FolderBtn
            label="All files"
            icon={ImageIcon}
            count={totalCount}
            active={selectedFolderId === null}
            onClick={() => setSelectedFolderId(null)}
          />

          {/* Real folders */}
          {folders.map(f => (
            <FolderBtn
              key={f.id}
              label={f.name}
              icon={Folder}
              count={assets.filter(a => a.folder_id === f.id).length}
              active={selectedFolderId === f.id}
              onClick={() => setSelectedFolderId(f.id)}
              onDelete={async () => {
                await deleteAssetFolder(f.id)
                if (selectedFolderId === f.id) setSelectedFolderId(null)
                load()
              }}
            />
          ))}

          {/* Unfiled */}
          {unfiledCount > 0 && (
            <FolderBtn
              label="Unfiled"
              icon={Folder}
              count={unfiledCount}
              active={selectedFolderId === '__unfiled__'}
              onClick={() => setSelectedFolderId('__unfiled__')}
              italic
            />
          )}

          {/* New folder dialog */}
          {showNewFolder && (
            <div className="mt-2 p-2 bg-bg-2 rounded-lg">
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder() }}
                placeholder="Folder name"
                autoFocus
                className="w-full border border-ink-6 rounded px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 bg-white"
              />
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={handleCreateFolder}
                  disabled={creatingFolder}
                  className="text-[10px] font-medium text-brand hover:text-brand-dark"
                >
                  {creatingFolder ? 'Creating...' : 'Create'}
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

          {/* Type filter */}
          <div className="mt-4 pt-4 border-t border-ink-6">
            <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide px-2 block mb-2">Type</span>
            {(['all', 'image', 'video', 'text', 'document'] as const).map(t => {
              const Icon = t === 'all' ? ImageIcon : TYPE_ICONS[t]
              const label = t === 'all' ? 'All types' : TYPE_LABELS[t]
              const count = t === 'all' ? totalCount : assets.filter(a => a.type === t).length
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    typeFilter === t ? 'bg-brand-tint/50 text-brand-dark font-medium' : 'text-ink-3 hover:bg-bg-2'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </span>
                  <span className="text-[10px] text-ink-4">{count}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or tag..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
            <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-ink' : 'text-ink-4'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-ink' : 'text-ink-4'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-ink-4">{filtered.length} items</span>
          </div>

          {/* Text snippet creator */}
          {showSnippet && (
            <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Type className="w-4 h-4 text-ink-4" /> New text snippet
                </h3>
                <button onClick={() => setShowSnippet(false)} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
              </div>
              <input
                type="text"
                value={snippetName}
                onChange={e => setSnippetName(e.target.value)}
                placeholder="Name (e.g. 'Instagram bio', 'Tagline')"
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <textarea
                value={snippetContent}
                onChange={e => setSnippetContent(e.target.value)}
                placeholder="Paste your text here..."
                rows={4}
                className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleCreateSnippet}
                  disabled={!snippetName.trim() || !snippetContent.trim()}
                  className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  Save snippet
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          {loading || clientLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square bg-ink-6 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
              <Upload className="w-6 h-6 text-ink-4 mx-auto mb-3" />
              <p className="text-sm font-medium text-ink-2">
                {totalCount === 0 ? 'Your asset library is empty' : 'Nothing matches your filters'}
              </p>
              <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
                {totalCount === 0
                  ? 'Upload your logos, photos, and brand files here. Your team will always have what they need to create great content for you.'
                  : 'Try a different search or filter.'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(asset => (
                <AssetGridCard
                  key={asset.id}
                  asset={asset}
                  onClick={() => openDetail(asset)}
                  onDelete={() => handleDelete(asset.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              {filtered.map((asset, i) => (
                <AssetListRow
                  key={asset.id}
                  asset={asset}
                  isFirst={i === 0}
                  onClick={() => openDetail(asset)}
                  onDelete={() => handleDelete(asset.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Detail side panel ── */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedAsset(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-ink-6 px-5 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-ink truncate">{selectedAsset.name}</h3>
              <button onClick={() => setSelectedAsset(null)} className="text-ink-4 hover:text-ink"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Preview */}
              {selectedAsset.type === 'image' && selectedAsset.file_url && (
                <img src={selectedAsset.file_url} alt="" className="w-full rounded-lg border border-ink-6" />
              )}
              {selectedAsset.type === 'video' && selectedAsset.file_url && (
                <video src={selectedAsset.file_url} controls className="w-full rounded-lg bg-black" />
              )}
              {selectedAsset.type === 'text' && selectedAsset.content && (
                <div className="bg-bg-2 rounded-lg p-4">
                  <p className="text-sm text-ink whitespace-pre-wrap">{selectedAsset.content}</p>
                </div>
              )}
              {selectedAsset.type === 'document' && (
                <div className="bg-bg-2 rounded-lg p-6 text-center">
                  <FileText className="w-8 h-8 text-ink-4 mx-auto mb-2" />
                  <p className="text-sm text-ink-2">{selectedAsset.mime_type || 'Document'}</p>
                </div>
              )}

              {/* Name */}
              <div>
                <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Name</span>
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-ink-6 rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20"
                      autoFocus
                    />
                    <button onClick={saveEdits} className="text-xs text-brand font-medium">Save</button>
                    <button onClick={() => setEditingName(false)} className="text-xs text-ink-4">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setEditingName(true)} className="text-sm text-ink hover:text-brand-dark flex items-center gap-1">
                    {selectedAsset.name} <Edit3 className="w-3 h-3 text-ink-4" />
                  </button>
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Type</span>
                  <p className="text-sm text-ink-2 capitalize">{selectedAsset.type}</p>
                </div>
                {selectedAsset.file_size && (
                  <div>
                    <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Size</span>
                    <p className="text-sm text-ink-2">{(selectedAsset.file_size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                )}
                {selectedAsset.dimensions && (
                  <div>
                    <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Dimensions</span>
                    <p className="text-sm text-ink-2">{selectedAsset.dimensions.replace('x', ' × ')} px</p>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Added</span>
                  <p className="text-sm text-ink-2">{new Date(selectedAsset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>

              {/* Uploader */}
              <div>
                <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-1">Uploaded by</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  selectedAsset.uploaded_by_client ? 'bg-blue-50 text-blue-700' : 'bg-brand-tint text-brand-dark'
                }`}>
                  {selectedAsset.uploaded_by_client ? 'You' : 'Apnosh team'}
                </span>
              </div>

              {/* Tags */}
              <div>
                <span className="text-[10px] text-ink-4 font-medium uppercase tracking-wide block mb-2">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_PRESETS.map(t => (
                    <button
                      key={t}
                      onClick={() => { toggleTag(t); saveEdits() }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        editTags.includes(t)
                          ? 'bg-brand-tint text-brand-dark border-brand/30'
                          : 'bg-white text-ink-4 border-ink-6 hover:border-ink-5'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-ink-6">
                {selectedAsset.file_url && (
                  <a
                    href={selectedAsset.file_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                )}
                {selectedAsset.type === 'text' && selectedAsset.content && (
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedAsset.content!)}
                    className="flex-1 bg-white border border-ink-6 text-ink-2 text-xs font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 hover:border-brand/40 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy text
                  </button>
                )}
                {selectedAsset.file_url && (
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedAsset.file_url!)}
                    className="bg-white border border-ink-6 text-ink-2 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 hover:border-brand/40 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> URL
                  </button>
                )}
                <button
                  onClick={() => handleDelete(selectedAsset.id)}
                  className="bg-white border border-ink-6 text-red-500 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 hover:border-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Sub-components ───────────────────────────────────────── */

function FolderBtn({
  label, icon: Icon, count, active, onClick, onDelete, italic,
}: {
  label: string
  icon: typeof Folder
  count: number
  active: boolean
  onClick: () => void
  onDelete?: () => void
  italic?: boolean
}) {
  return (
    <div className={`group flex items-center rounded-lg transition-colors ${
      active ? 'bg-brand-tint/50 text-brand-dark' : 'text-ink-2 hover:bg-bg-2'
    }`}>
      <button
        onClick={onClick}
        className="flex-1 text-left px-3 py-2 text-sm flex items-center justify-between min-w-0"
      >
        <span className={`flex items-center gap-2 min-w-0 ${italic ? 'italic text-ink-4' : ''} ${active ? 'font-medium' : ''}`}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-[10px] text-ink-4 flex-shrink-0 ml-2">{count}</span>
      </button>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-red-500 pr-2 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function AssetGridCard({
  asset, onClick, onDelete,
}: {
  asset: Asset
  onClick: () => void
  onDelete: () => void
}) {
  const Icon = TYPE_ICONS[asset.type]

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square rounded-xl overflow-hidden border border-ink-6 hover:border-brand/30 transition-all bg-white text-left"
    >
      {asset.type === 'image' && asset.file_url ? (
        <img src={asset.file_url} alt={asset.name} className="w-full h-full object-cover" />
      ) : asset.type === 'video' && asset.file_url ? (
        <div className="w-full h-full bg-bg-2 flex items-center justify-center relative">
          <Film className="w-8 h-8 text-ink-4" />
        </div>
      ) : (
        <div className="w-full h-full bg-bg-2 flex flex-col items-center justify-center gap-2 p-4">
          <Icon className="w-6 h-6 text-ink-4" />
          <p className="text-[10px] text-ink-3 text-center line-clamp-3">
            {asset.type === 'text' ? (asset.content || '').slice(0, 80) : asset.name}
          </p>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
        <div className="w-full opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-white truncate font-medium">{asset.name}</p>
          <p className="text-[9px] text-white/70 capitalize">{asset.type}</p>
        </div>
      </div>

      {/* Upload badge */}
      <div className="absolute top-2 right-2">
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm ${
          asset.uploaded_by_client ? 'bg-blue-500/80 text-white' : 'bg-brand/80 text-white'
        }`}>
          {asset.uploaded_by_client ? 'yours' : 'Apnosh'}
        </span>
      </div>
    </button>
  )
}

function AssetListRow({
  asset, isFirst, onClick, onDelete,
}: {
  asset: Asset
  isFirst: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const Icon = TYPE_ICONS[asset.type]

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${
        !isFirst ? 'border-t border-ink-6' : ''
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {asset.type === 'image' && asset.file_url ? (
          <img src={asset.file_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-4 h-4 text-ink-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{asset.name}</p>
        <div className="flex items-center gap-2 text-[10px] text-ink-4">
          <span className="capitalize">{asset.type}</span>
          {asset.file_size && <><span>·</span><span>{(asset.file_size / 1024 / 1024).toFixed(1)} MB</span></>}
          <span>·</span>
          <span>{new Date(asset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
        asset.uploaded_by_client ? 'bg-blue-50 text-blue-700' : 'bg-brand-tint text-brand-dark'
      }`}>
        {asset.uploaded_by_client ? 'You' : 'Apnosh'}
      </span>
      <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
    </button>
  )
}
