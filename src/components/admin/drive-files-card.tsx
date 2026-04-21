'use client'

/**
 * Google Drive files card — multi-folder per client. Each linked
 * folder renders as a collapsible section with its files inside. Admin
 * can add multiple folders (brand assets / contracts / content etc.),
 * label them, rename, and remove individually.
 *
 * Handles three states:
 *   1. Drive not connected → "Connect Google Drive" button
 *   2. Connected, no folders linked → paste-folder input
 *   3. Connected + folders linked → per-folder file lists + "Add folder"
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  FileText, FileSpreadsheet, Presentation, Image as ImageIcon,
  Folder, Film, ExternalLink, Link as LinkIcon, Loader2,
  AlertTriangle, RefreshCw, Trash2, Plus, HardDrive, Check,
  ChevronDown, ChevronRight, Pencil, X,
} from 'lucide-react'
import {
  isDriveConnected, listClientDriveFolders, addDriveFolder,
  removeDriveFolder, renameDriveFolder,
  type LinkedFolder,
} from '@/lib/drive-actions'
import { describeMime, type DriveFile } from '@/lib/google-drive'

interface Props {
  clientId: string
}

function iconFor(category: ReturnType<typeof describeMime>['category']) {
  switch (category) {
    case 'folder': return Folder
    case 'doc':    return FileText
    case 'sheet':  return FileSpreadsheet
    case 'slides': return Presentation
    case 'image':  return ImageIcon
    case 'video':  return Film
    case 'pdf':    return FileText
    default:       return FileText
  }
}

function toneFor(category: ReturnType<typeof describeMime>['category']): string {
  switch (category) {
    case 'folder': return 'text-ink-3'
    case 'doc':    return 'text-blue-600'
    case 'sheet':  return 'text-emerald-600'
    case 'slides': return 'text-amber-600'
    case 'image':  return 'text-purple-600'
    case 'video':  return 'text-pink-600'
    case 'pdf':    return 'text-red-600'
    default:       return 'text-ink-4'
  }
}

function formatSize(size?: string): string {
  if (!size) return ''
  const n = parseInt(size, 10)
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default function DriveFilesCard({ clientId }: Props) {
  const pathname = usePathname()

  const [connecting, setConnecting] = useState(true)
  const [connected, setConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)

  const [folders, setFolders] = useState<LinkedFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linking, setLinking] = useState(false)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const refresh = useCallback(async () => {
    const conn = await isDriveConnected()
    setConnecting(false)
    setConnected(conn.connected)
    setConnectedEmail(conn.email ?? null)
    if (!conn.connected) return

    setLoading(true); setTopError(null)
    const res = await listClientDriveFolders(clientId)
    setFolders(res.folders)
    // Expand all by default on first load
    setExpanded(new Set(res.folders.map(f => f.id)))
    if (res.error && res.error !== 'No folders linked') setTopError(res.error)
    setLoading(false)
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startOAuth() {
    const returnTo = `${pathname}?tab=docs`
    window.location.href = `/api/auth/google-drive?returnTo=${encodeURIComponent(returnTo)}`
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!linkInput.trim()) return
    setLinking(true); setTopError(null)
    const res = await addDriveFolder(clientId, linkInput.trim(), linkLabel.trim() || undefined)
    setLinking(false)
    if (!res.success) { setTopError(res.error ?? 'Could not add folder'); return }
    setLinkInput(''); setLinkLabel(''); setShowAdd(false)
    await refresh()
  }

  async function handleRemove(folder: LinkedFolder) {
    if (!confirm(`Remove "${folder.label ?? folder.folderId}" from this client? The files stay in Drive untouched.`)) return
    await removeDriveFolder(folder.id)
    await refresh()
  }

  async function commitRename(folder: LinkedFolder) {
    if (renameValue.trim() === (folder.label ?? '')) { setRenamingId(null); return }
    await renameDriveFolder(folder.id, renameValue.trim())
    setRenamingId(null)
    await refresh()
  }

  if (connecting) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-ink-4" />
        <span className="text-[12.5px] text-ink-4">Checking Drive connection…</span>
      </div>
    )
  }

  /* ─── State 1: Drive not connected ─────────────────────────────── */
  if (!connected) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-ink">Connect Google Drive</h3>
            <p className="text-[12.5px] text-ink-3 mt-1 leading-relaxed max-w-md">
              Grant access to your team&apos;s Drive once. Each client can then have multiple folders linked — brand assets, contracts, content deliverables — and Claude can extract the strategic profile from Google Docs inside them.
            </p>
            <button
              onClick={startOAuth}
              className="mt-3 inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-[13px] font-medium rounded-lg px-3.5 py-2 transition-colors"
            >
              <HardDrive className="w-3.5 h-3.5" />
              Connect Drive
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ─── State 2: Connected, no folders ───────────────────────────── */
  if (folders.length === 0 && !showAdd) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-ink-4" />
              Link a Drive folder
            </h3>
            <p className="text-[11px] text-ink-4 mt-0.5">You can add multiple folders per client</p>
          </div>
          {connectedEmail && (
            <span className="text-[10.5px] text-ink-4 inline-flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-600" />
              {connectedEmail}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-[13px] font-medium rounded-lg px-3.5 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add folder
        </button>
      </div>
    )
  }

  /* ─── State 3: Folders list ────────────────────────────────────── */
  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-6">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-ink-4" />
            Google Drive
            <span className="text-[10px] font-medium text-ink-4 bg-bg-2 rounded-full px-1.5 py-0.5 tabular-nums">
              {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
            </span>
          </h3>
          <p className="text-[11px] text-ink-4 mt-0.5 inline-flex items-center gap-1">
            <Check className="w-2.5 h-2.5 text-emerald-600" />
            Linked · {connectedEmail ?? 'Apnosh team'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 text-[12px] text-brand-dark hover:underline font-medium px-2 py-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add folder
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="p-1.5 text-ink-4 hover:text-ink-2 transition-colors disabled:opacity-50"
            title="Refresh all"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {topError && (
        <div className="m-4 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {topError}
        </div>
      )}

      {/* Add-folder inline form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="px-5 py-4 border-b border-ink-6 bg-bg-2/40 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              autoFocus
              className="flex-1 px-3 py-2 border border-ink-6 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white"
            />
            <input
              type="text"
              value={linkLabel}
              onChange={e => setLinkLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-40 px-3 py-2 border border-ink-6 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white"
            />
            <button
              type="submit"
              disabled={linking || !linkInput.trim()}
              className="bg-brand hover:bg-brand-dark text-white text-[13px] font-medium rounded-lg px-3.5 py-2 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              Link
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setLinkInput(''); setLinkLabel('') }}
              className="text-ink-4 hover:text-ink p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-ink-4">
            Tip: you can copy the folder URL from Drive&apos;s address bar.
          </p>
        </form>
      )}

      {/* Folder sections */}
      {folders.length === 0 && !showAdd ? (
        <div className="py-10 text-center">
          <Folder className="w-6 h-6 text-ink-5 mx-auto mb-2" />
          <p className="text-[12.5px] text-ink-3 font-medium">No folders linked</p>
          <p className="text-[11px] text-ink-4 mt-0.5">Click &ldquo;Add folder&rdquo; above to link your first one</p>
        </div>
      ) : (
        folders.map((folder, idx) => (
          <FolderSection
            key={folder.id}
            folder={folder}
            isLast={idx === folders.length - 1}
            expanded={expanded.has(folder.id)}
            onToggle={() => toggle(folder.id)}
            onRemove={() => handleRemove(folder)}
            onRenameStart={() => {
              setRenamingId(folder.id)
              setRenameValue(folder.label ?? '')
            }}
            onRenameCommit={() => commitRename(folder)}
            onRenameCancel={() => setRenamingId(null)}
            isRenaming={renamingId === folder.id}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
          />
        ))
      )}
    </div>
  )
}

interface FolderSectionProps {
  folder: LinkedFolder
  isLast: boolean
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  onRenameStart: () => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  isRenaming: boolean
  renameValue: string
  setRenameValue: (v: string) => void
}

function FolderSection({
  folder, isLast, expanded, onToggle, onRemove,
  onRenameStart, onRenameCommit, onRenameCancel,
  isRenaming, renameValue, setRenameValue,
}: FolderSectionProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight
  const displayLabel = folder.label || 'Untitled folder'

  return (
    <div className={isLast ? '' : 'border-b border-ink-6'}>
      {/* Folder header */}
      <div className="group flex items-center gap-2 px-5 py-3 hover:bg-bg-2/40 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <Chevron className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
          <Folder className="w-4 h-4 text-ink-3 flex-shrink-0" />
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={onRenameCommit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onRenameCommit() }
                if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
              }}
              autoFocus
              className="flex-1 min-w-0 text-[13px] font-medium text-ink bg-white border border-brand rounded px-1.5 py-0.5 focus:outline-none"
            />
          ) : (
            <>
              <span className="text-[13px] font-medium text-ink truncate">{displayLabel}</span>
              <span className="text-[10.5px] text-ink-4 tabular-nums">{folder.files.length}</span>
            </>
          )}
        </button>
        {!isRenaming && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onRenameStart() }}
              className="p-1 text-ink-4 hover:text-ink-2"
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {folder.folderUrl && (
              <a
                href={folder.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-ink-4 hover:text-brand-dark"
                title="Open in Drive"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="p-1 text-ink-4 hover:text-red-600"
              title="Remove folder"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Folder contents */}
      {expanded && (
        <>
          {folder.error ? (
            <div className="mx-5 mb-3 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {folder.error}
            </div>
          ) : folder.files.length === 0 ? (
            <div className="px-5 pb-4 text-[11.5px] text-ink-4 italic">This folder is empty</div>
          ) : (
            <ul className="pb-1">
              {folder.files.map(f => (
                <li key={f.id}>
                  <FileRow file={f} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function FileRow({ file }: { file: DriveFile }) {
  const meta = describeMime(file.mimeType)
  const Icon = iconFor(meta.category)
  return (
    <a
      href={file.webViewLink}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 pl-12 pr-5 py-2 hover:bg-bg-2 transition-colors"
    >
      {file.thumbnailLink ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.thumbnailLink}
          alt=""
          className="w-7 h-7 rounded object-cover border border-ink-6 flex-shrink-0"
        />
      ) : (
        <Icon className={`w-4 h-4 flex-shrink-0 ${toneFor(meta.category)}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-ink font-medium truncate">{file.name}</div>
        <div className="flex items-center gap-2 text-[10.5px] text-ink-4 mt-0.5">
          <span>{meta.label}</span>
          {file.size && <span>· {formatSize(file.size)}</span>}
          <span>· Updated {new Date(file.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
      <ExternalLink className="w-3 h-3 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  )
}
