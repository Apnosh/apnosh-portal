'use client'

/**
 * Google Drive files card — surfaces the linked Drive folder's contents
 * right inside the client detail page. Handles three states:
 *
 *   1. Drive not connected → "Connect Google Drive" button
 *   2. Connected, no folder linked → folder URL input
 *   3. Connected + folder linked → file list with open-in-Drive links
 *
 * File icons are mapped from MIME type. Images get thumbnails where
 * possible. Sorted: folders first, then by name.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  FileText, FileSpreadsheet, Presentation, Image as ImageIcon,
  Folder, Film, ExternalLink, Link as LinkIcon, Loader2,
  AlertTriangle, RefreshCw, Unlink, Plus, HardDrive, Check,
} from 'lucide-react'
import {
  isDriveConnected, listClientDriveFiles, linkDriveFolder, unlinkDriveFolder,
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
  const router = useRouter()
  const pathname = usePathname()

  const [connecting, setConnecting] = useState(true)
  const [connected, setConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)

  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderUrl, setFolderUrl] = useState<string | null>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [linkInput, setLinkInput] = useState('')
  const [linking, setLinking] = useState(false)

  const refresh = useCallback(async () => {
    const conn = await isDriveConnected()
    setConnecting(false)
    setConnected(conn.connected)
    setConnectedEmail(conn.email ?? null)
    if (!conn.connected) return

    setLoading(true); setError(null)
    const res = await listClientDriveFiles(clientId)
    setFolderId(res.folderId ?? null)
    setFolderUrl(res.folderUrl ?? null)
    setFiles(res.files)
    if (res.error && res.error !== 'No Drive folder linked') setError(res.error)
    setLoading(false)
  }, [clientId])

  useEffect(() => { void refresh() }, [refresh])

  function startOAuth() {
    // Preserve current tab context so we return here after consent
    const returnTo = `${pathname}?tab=docs`
    window.location.href = `/api/auth/google-drive?returnTo=${encodeURIComponent(returnTo)}`
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkInput.trim()) return
    setLinking(true); setError(null)
    const res = await linkDriveFolder(clientId, linkInput.trim())
    setLinking(false)
    if (!res.success) { setError(res.error ?? 'Could not link folder'); return }
    setLinkInput('')
    await refresh()
  }

  async function handleUnlink() {
    if (!confirm('Unlink this Drive folder from the client? The files stay in Drive untouched.')) return
    await unlinkDriveFolder(clientId)
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
              Grant access to your team&apos;s Drive once. Each client can then be linked to a specific folder — docs show up here, images surface in the Brand tab, and Claude can extract the strategic profile.
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

  /* ─── State 2: Connected, no folder linked ─────────────────────── */
  if (!folderId) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-ink-4" />
              Link a Drive folder
            </h3>
            <p className="text-[11px] text-ink-4 mt-0.5">Paste any folder URL from Drive</p>
          </div>
          {connectedEmail && (
            <span className="text-[10.5px] text-ink-4 inline-flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-600" />
              {connectedEmail}
            </span>
          )}
        </div>
        <form onSubmit={handleLink} className="flex items-center gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className="flex-1 px-3 py-2 border border-ink-6 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
          <button
            type="submit"
            disabled={linking || !linkInput.trim()}
            className="bg-brand hover:bg-brand-dark text-white text-[13px] font-medium rounded-lg px-3.5 py-2 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
            Link
          </button>
        </form>
        {error && (
          <div className="mt-2 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>
    )
  }

  /* ─── State 3: Files list ──────────────────────────────────────── */
  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-6">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-ink-4" />
            Google Drive
            <span className="text-[10px] font-medium text-ink-4 bg-bg-2 rounded-full px-1.5 py-0.5 tabular-nums">
              {files.length}
            </span>
          </h3>
          <p className="text-[11px] text-ink-4 mt-0.5 inline-flex items-center gap-1">
            <Check className="w-2.5 h-2.5 text-emerald-600" />
            Linked · {connectedEmail ?? 'Apnosh team'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {folderUrl && (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-ink-4 hover:text-brand-dark transition-colors"
              title="Open folder in Drive"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="p-1.5 text-ink-4 hover:text-ink-2 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleUnlink}
            className="p-1.5 text-ink-4 hover:text-red-600 transition-colors"
            title="Unlink folder"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center text-ink-4">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : error ? (
        <div className="m-4 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      ) : files.length === 0 ? (
        <div className="py-10 text-center">
          <Folder className="w-6 h-6 text-ink-5 mx-auto mb-2" />
          <p className="text-[12.5px] text-ink-3 font-medium">This folder is empty</p>
          <p className="text-[11px] text-ink-4 mt-0.5">Drop files in Drive and hit refresh</p>
        </div>
      ) : (
        <ul>
          {files.map((f, i) => {
            const meta = describeMime(f.mimeType)
            const Icon = iconFor(meta.category)
            return (
              <li key={f.id} className={i > 0 ? 'border-t border-ink-6' : ''}>
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 px-5 py-3 hover:bg-bg-2 transition-colors"
                >
                  {f.thumbnailLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.thumbnailLink}
                      alt=""
                      className="w-8 h-8 rounded object-cover border border-ink-6 flex-shrink-0"
                    />
                  ) : (
                    <Icon className={`w-4 h-4 flex-shrink-0 ${toneFor(meta.category)}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink font-medium truncate">{f.name}</div>
                    <div className="flex items-center gap-2 text-[10.5px] text-ink-4 mt-0.5">
                      <span>{meta.label}</span>
                      {f.size && <span>· {formatSize(f.size)}</span>}
                      <span>· Updated {new Date(f.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
