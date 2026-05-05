'use client'

/**
 * Drive Import drawer — browses the client's linked Google Drive folders,
 * shows a grid of image/video thumbnails, lets the operator pick a
 * destination for each (hero / about / location / gallery / skip), and
 * imports selected files into Supabase storage with the site_config
 * patched accordingly.
 */

import { useEffect, useState, useMemo } from 'react'
import {
  X, Loader2, FolderOpen, Image as ImageIcon, Check, AlertCircle,
  Download, Sparkles, Plus, Link2, Trash2,
} from 'lucide-react'
import { addDriveFolder, removeDriveFolder } from '@/lib/drive-actions'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string | null
  webViewLink?: string | null
  size?: string | null
}

interface LinkedFolder {
  id: string
  folderId: string
  folderUrl: string | null
  label: string | null
  files: DriveFile[]
  error?: string
}

interface Props {
  clientId: string
  open: boolean
  onClose: () => void
  /** Site draft so we can list location IDs for the destination picker. */
  draftLocations: RestaurantSite['locations']
}

type Destination =
  | 'skip'
  | 'hero.photoUrl'
  | 'about.photoUrl'
  | 'header.logo'
  | 'gallery'
  | `location:${string}`

interface FileSelection {
  fileId: string
  destination: Destination
}

export default function DriveImportDrawer({ clientId, open, onClose, draftLocations }: Props) {
  const [folders, setFolders] = useState<LinkedFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [selections, setSelections] = useState<Map<string, Destination>>(new Map())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; failed: number } | null>(null)

  // Add-folder state
  const [addOpen, setAddOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/admin/drive-list?clientId=${encodeURIComponent(clientId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) setLoadError(json.error)
        const fs = (json.folders ?? []) as LinkedFolder[]
        setFolders(fs)
        if (fs.length > 0 && !activeFolderId) setActiveFolderId(fs[0].id)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  async function linkFolder() {
    if (!addUrl.trim()) return
    setAddBusy(true)
    setAddError(null)
    const res = await addDriveFolder(clientId, addUrl.trim(), addLabel.trim() || undefined)
    setAddBusy(false)
    if (!res.success) {
      setAddError(res.error ?? 'Failed to link folder')
      return
    }
    setAddUrl('')
    setAddLabel('')
    setAddOpen(false)
    refresh()
  }

  async function unlinkFolder(folderRowId: string) {
    if (!confirm('Unlink this folder from this client? (Files in Drive aren\'t affected.)')) return
    const res = await removeDriveFolder(folderRowId)
    if (!res.success) {
      setLoadError(res.error ?? 'Failed to unlink')
      return
    }
    if (activeFolderId === folderRowId) setActiveFolderId(null)
    refresh()
  }

  useEffect(() => {
    if (!open) return
    setSelections(new Map())
    setImportResult(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId])

  const activeFolder = useMemo(
    () => folders.find(f => f.id === activeFolderId) ?? null,
    [folders, activeFolderId],
  )

  function setSelection(fileId: string, dest: Destination) {
    setSelections(prev => {
      const next = new Map(prev)
      if (dest === 'skip') next.delete(fileId)
      else next.set(fileId, dest)
      return next
    })
  }

  // Auto-suggest destinations from filenames
  function autoSuggest() {
    if (!activeFolder) return
    setSelections(prev => {
      const next = new Map(prev)
      let usedHero = false
      let usedAbout = false
      let usedLogo = false
      const usedLocations = new Set<string>()
      for (const file of activeFolder.files) {
        const n = file.name.toLowerCase()
        if (next.has(file.id)) continue // don't overwrite manual choices
        if (!usedLogo && n.includes('logo')) { next.set(file.id, 'header.logo'); usedLogo = true; continue }
        if (!usedHero && (n.includes('hero') || n.includes('banner'))) { next.set(file.id, 'hero.photoUrl'); usedHero = true; continue }
        if (!usedAbout && n.includes('about')) { next.set(file.id, 'about.photoUrl'); usedAbout = true; continue }
        // Match location by name in filename
        let matched = false
        for (const loc of draftLocations) {
          const locName = loc.name?.toLowerCase() ?? ''
          if (locName && !usedLocations.has(loc.id) && n.includes(locName)) {
            next.set(file.id, `location:${loc.id}` as Destination)
            usedLocations.add(loc.id)
            matched = true
            break
          }
        }
        if (matched) continue
        // Default any image to gallery if nothing else matched
        if (file.mimeType?.startsWith('image/')) {
          next.set(file.id, 'gallery')
        }
      }
      return next
    })
  }

  async function runImport() {
    if (!activeFolder || selections.size === 0) return
    setImporting(true)
    setImportResult(null)
    const items = Array.from(selections.entries()).map(([fileId, destination]) => {
      const file = activeFolder.files.find(f => f.id === fileId)
      return {
        fileId,
        fileName: file?.name ?? fileId,
        mimeType: file?.mimeType ?? 'application/octet-stream',
        destination,
      }
    })
    try {
      const res = await fetch('/api/admin/drive-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, items }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setLoadError(json.error || `HTTP ${res.status}`)
        setImportResult({ ok: 0, failed: items.length })
      } else {
        setImportResult(json.summary)
        setTimeout(() => window.location.reload(), 1800)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error')
      setImportResult({ ok: 0, failed: items.length })
    }
    setImporting(false)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <aside className="fixed inset-x-8 top-8 bottom-8 max-w-[1100px] mx-auto bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-ink-6">
          <div>
            <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-brand" /> Import from Google Drive
            </h3>
            <p className="text-[11px] text-ink-3 mt-0.5">Pick photos and assign each to where it goes on the site. Selected files copy into hosted storage.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-3 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading Drive folders…
          </div>
        ) : loadError && folders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-w-md">
              <p className="text-sm text-red-700 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {loadError}
              </p>
              {loadError.toLowerCase().includes('not connected') ? (
                <>
                  <p className="text-xs text-red-600 mt-2">
                    Authorize the Apnosh team&apos;s Google Drive access once, then this works for every client.
                  </p>
                  <a
                    href="/admin/integrations"
                    target="_blank"
                    rel="noopener"
                    className="mt-3 inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white text-[12px] font-semibold rounded-md px-3 py-1.5"
                  >
                    Connect Drive →
                  </a>
                </>
              ) : (
                <p className="text-xs text-red-600 mt-2">Try linking a Drive folder to this client first.</p>
              )}
            </div>
          </div>
        ) : folders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full">
              <p className="text-sm text-ink text-center mb-1">No Drive folders linked to this client yet.</p>
              <p className="text-xs text-ink-3 text-center mb-4">Paste a Google Drive folder URL to link it.</p>
              <InlineAddFolder
                url={addUrl} setUrl={setAddUrl}
                label={addLabel} setLabel={setAddLabel}
                busy={addBusy} error={addError}
                onSubmit={linkFolder}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-12 min-h-0">
            {/* Folder rail */}
            <div className="col-span-3 border-r border-ink-6 bg-bg-2/30 overflow-y-auto p-2 space-y-1">
              {folders.map(f => {
                const isActive = activeFolderId === f.id
                const hasError = !!f.error
                return (
                  <div
                    key={f.id}
                    className={`group relative w-full p-2 rounded-md flex items-start gap-2 ${
                      isActive ? 'bg-brand text-white' : 'hover:bg-bg-2 text-ink'
                    }`}
                  >
                    <button onClick={() => setActiveFolderId(f.id)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
                      <FolderOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold truncate">{f.label || 'Folder'}</div>
                        <div className={`text-[10px] truncate ${isActive ? 'text-white/80' : hasError ? 'text-red-600' : 'text-ink-3'}`}>
                          {hasError ? f.error : `${f.files.length} item${f.files.length === 1 ? '' : 's'}`}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => unlinkFolder(f.id)}
                      className={`opacity-0 group-hover:opacity-100 ${isActive ? 'text-white/60 hover:text-white' : 'text-ink-4 hover:text-red-600'}`}
                      title="Unlink folder"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}

              {/* Inline add-folder */}
              {addOpen ? (
                <div className="p-2 bg-white border border-ink-6 rounded-md space-y-2 mt-2">
                  <InlineAddFolder
                    url={addUrl} setUrl={setAddUrl}
                    label={addLabel} setLabel={setAddLabel}
                    busy={addBusy} error={addError}
                    onSubmit={linkFolder}
                    onCancel={() => { setAddOpen(false); setAddError(null); setAddUrl(''); setAddLabel('') }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddOpen(true)}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1 p-2 text-[11px] font-medium text-ink-3 hover:text-ink hover:bg-bg-2 border border-dashed border-ink-5 rounded-md"
                >
                  <Plus className="w-3 h-3" /> Link a folder
                </button>
              )}
            </div>

            {/* Files grid */}
            <div className="col-span-9 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2 p-3 border-b border-ink-6 shrink-0">
                <div className="text-[11px] text-ink-3">
                  {activeFolder ? `${activeFolder.files.length} file${activeFolder.files.length === 1 ? '' : 's'} · ${selections.size} selected` : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={autoSuggest}
                    disabled={!activeFolder?.files.length}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-ink-6 text-ink-3 hover:text-ink hover:bg-bg-2 disabled:opacity-50"
                    title="Auto-suggest destinations from filenames"
                  >
                    <Sparkles className="w-3 h-3 text-brand" /> Auto-route
                  </button>
                  <button
                    onClick={runImport}
                    disabled={importing || selections.size === 0}
                    className="inline-flex items-center gap-1.5 bg-ink hover:bg-black text-white text-[12px] font-semibold rounded-md px-3 py-1.5 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Import {selections.size}
                  </button>
                </div>
              </div>

              {importResult && (
                <div className="mx-3 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-700 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" />
                  Imported {importResult.ok} file{importResult.ok === 1 ? '' : 's'}{importResult.failed > 0 ? `, ${importResult.failed} failed` : ''}. Reloading…
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3">
                {!activeFolder || activeFolder.files.length === 0 ? (
                  <div className="text-center py-12 text-sm text-ink-3">
                    {activeFolder?.error ? `Could not load: ${activeFolder.error}` : 'No images or videos in this folder.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {activeFolder.files.map(file => {
                      const dest = selections.get(file.id) ?? 'skip'
                      const selected = dest !== 'skip'
                      return (
                        <article
                          key={file.id}
                          className={`border rounded-lg overflow-hidden bg-white transition ${
                            selected ? 'border-brand ring-1 ring-brand' : 'border-ink-6'
                          }`}
                        >
                          <div className="aspect-square bg-bg-2 relative overflow-hidden">
                            {file.thumbnailLink ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-ink-4">
                                <ImageIcon className="w-6 h-6" />
                              </div>
                            )}
                            {file.mimeType?.startsWith('video/') && (
                              <span className="absolute top-1 right-1 bg-black/60 text-white text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded">video</span>
                            )}
                          </div>
                          <div className="p-2 space-y-1.5">
                            <p className="text-[11px] text-ink truncate" title={file.name}>{file.name}</p>
                            <select
                              value={dest}
                              onChange={e => setSelection(file.id, e.target.value as Destination)}
                              className="w-full text-[11px] border border-ink-6 rounded px-1.5 py-1 bg-white"
                            >
                              <option value="skip">— skip —</option>
                              <option value="hero.photoUrl">Hero photo</option>
                              <option value="about.photoUrl">About photo</option>
                              <option value="header.logo">Logo</option>
                              <option value="gallery">Add to gallery</option>
                              <optgroup label="Locations">
                                {draftLocations.map(l => (
                                  <option key={l.id} value={`location:${l.id}`}>{l.name}</option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function InlineAddFolder({
  url, setUrl, label, setLabel, busy, error, onSubmit, onCancel,
}: {
  url: string
  setUrl: (v: string) => void
  label: string
  setLabel: (v: string) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
  onCancel?: () => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1">Drive folder URL</label>
        <div className="flex gap-1.5 items-start">
          <Link2 className="w-3 h-3 text-ink-4 mt-2 shrink-0" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 border border-ink-6 rounded px-2 py-1.5 text-[11px] focus:ring-2 focus:ring-brand/20 outline-none"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 block mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Food photography"
          className="w-full border border-ink-6 rounded px-2 py-1.5 text-[11px] focus:ring-2 focus:ring-brand/20 outline-none"
        />
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-1.5">
        <button
          onClick={onSubmit}
          disabled={busy || !url.trim()}
          className="flex-1 inline-flex items-center justify-center gap-1 bg-ink hover:bg-black text-white text-[11px] font-semibold rounded px-2 py-1.5 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {busy ? 'Linking…' : 'Link folder'}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-[11px] text-ink-3 hover:text-ink px-2">Cancel</button>
        )}
      </div>
    </div>
  )
}
