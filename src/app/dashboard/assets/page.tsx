'use client'

/**
 * Photos & files (apnosh-mvp). A mobile media library: thumbnail grid, upload
 * photos/videos/files, and a per-asset detail sheet (rename, copy link,
 * download, delete). Reuses the exact Storage upload from the legacy page
 * (client-assets bucket) and the tested createAsset / updateAsset /
 * deleteAsset actions. Folders, text snippets, tags and the Google-photo push
 * are deliberately left to a follow-up.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, X, Loader2, Image as ImageIcon, Film, FileText, Type, Trash2, Download, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { createAsset, updateAsset, deleteAsset as deleteAssetAction } from '@/lib/asset-actions'
import type { Asset, GlobalAssetType } from '@/types/database'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'

const TYPE_ICON: Record<GlobalAssetType, typeof ImageIcon> = { image: ImageIcon, video: Film, text: Type, document: FileText }
const FILTERS: { key: 'all' | GlobalAssetType; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'image', label: 'Photos' }, { key: 'video', label: 'Videos' }, { key: 'document', label: 'Files' },
]

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AssetsPage() {
  const supabase = createClient()
  const { client } = useClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | GlobalAssetType>('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Asset | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase.from('assets').select('*').eq('client_id', client.id).order('created_at', { ascending: false })
    setAssets((data ?? []) as Asset[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !client?.id) return
    setUploading(true); setUploadError(null)
    let failed = 0
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${client.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('client-assets').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) { failed++; continue }
      const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path)
      let assetType: GlobalAssetType = 'document'
      if (file.type.startsWith('image/')) assetType = 'image'
      else if (file.type.startsWith('video/')) assetType = 'video'
      let dimensions: string | null = null
      if (assetType === 'image') {
        try { const img = await createImageBitmap(file); dimensions = `${img.width}x${img.height}` } catch { /* skip */ }
      }
      await createAsset({ name: file.name, type: assetType, fileUrl: urlData.publicUrl, fileSize: file.size, mimeType: file.type, dimensions, tags: [] })
    }
    if (failed > 0) setUploadError(`${failed} file${failed > 1 ? 's' : ''} couldn't upload.`)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()
  }

  const filtered = assets.filter(a => {
    if (filter !== 'all' && a.type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.name.toLowerCase().includes(q) && !(a.tags ?? []).some(t => t.toLowerCase().includes(q))) return false
    }
    return true
  })

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Photos & files" subtitle="Your logo, photos, and videos for your posts." backHref="/dashboard/more" backLabel="More" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '12px 14px 14px' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="mvp-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or tag" style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 14px 11px 36px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ flexShrink: 0, border: `1px solid ${filter === f.key ? C.green : '#d8d8de'}`, background: filter === f.key ? C.green : '#fff', color: filter === f.key ? '#fff' : C.ink, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>{f.label}</button>
            ))}
          </div>

          {uploadError && <p style={{ fontSize: 12.5, color: C.coral, margin: '0 2px 10px' }}>{uploadError}</p>}

          {loading ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '40px 0' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px dashed rgba(74,189,152,0.32)', borderRadius: 16, padding: '30px 20px', textAlign: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}><ImageIcon size={21} color={C.green} /></div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{assets.length === 0 ? 'No files yet' : 'Nothing matches'}</div>
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>{assets.length === 0 ? 'Add photos and videos your team can use in your posts.' : 'Try a different search or filter.'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {filtered.map(a => {
                const Icon = TYPE_ICON[a.type] ?? FileText
                return (
                  <button key={a.id} type="button" onClick={() => setDetail(a)} style={{ aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: `0.5px solid ${C.line}`, background: '#f3f3f5', padding: 0, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {a.type === 'image' && a.file_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.file_url} alt={a.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8 }}>
                        <Icon size={24} color={C.mute} />
                        <span style={{ fontSize: 10.5, color: C.mute, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25 }}>{a.name}</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `0.5px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))' }}>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: C.green, color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: uploading ? 0.7 : 1 }}>
            {uploading ? <><Loader2 size={18} className="mvp-spin" /> Uploading...</> : <><Plus size={18} /> Add photos</>}
          </button>
        </div>
      </div>

      {detail && <DetailSheet asset={detail} onClose={() => setDetail(null)} onChanged={(next) => { setAssets(prev => next ? prev.map(a => a.id === next.id ? next : a) : prev.filter(a => a.id !== detail.id)); setDetail(next) }} />}
    </MvpShell>
  )
}

function DetailSheet({ asset, onClose, onChanged }: { asset: Asset; onClose: () => void; onChanged: (next: Asset | null) => void }) {
  const [name, setName] = useState(asset.name)
  const [savingName, setSavingName] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = TYPE_ICON[asset.type] ?? FileText

  async function saveName() {
    const n = name.trim()
    if (!n || n === asset.name) return
    setSavingName(true); setError(null)
    const r = await updateAsset(asset.id, { name: n })
    setSavingName(false)
    if (!r.success) { setError(r.error); return }
    onChanged({ ...asset, name: n })
  }
  async function doDelete() {
    setBusy(true); setError(null)
    const r = await deleteAssetAction(asset.id)
    if (!r.success) { setError(r.error); setBusy(false); setConfirmDel(false); return }
    onChanged(null)
  }
  function copyLink() {
    if (!asset.file_url) return
    navigator.clipboard.writeText(asset.file_url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  const actionBtn: React.CSSProperties = { width: '100%', height: 46, borderRadius: 13, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, textDecoration: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: '#f0f0f3', display: 'flex', justifyContent: 'center', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.bg, display: 'flex', flexDirection: 'column', minHeight: 0, boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#fff', borderBottom: `0.5px solid ${C.line}` }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.mute, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={20} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>Details</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#f3f3f5', border: `0.5px solid ${C.line}`, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
          {asset.type === 'image' && asset.file_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.file_url} alt={asset.name} style={{ width: '100%', maxHeight: 320, objectFit: 'contain' }} />
          ) : asset.type === 'video' && asset.file_url ? (
            <video src={asset.file_url} controls style={{ width: '100%', maxHeight: 320 }} />
          ) : (
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 30 }}><Icon size={40} color={C.faint} /><span style={{ fontSize: 13, color: C.mute }}>{asset.name}</span></span>
          )}
        </div>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>Name</label>
        <input className="mvp-input" value={name} onChange={e => setName(e.target.value)} onBlur={saveName} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none', marginBottom: 4 }} />
        <p style={{ fontSize: 11.5, color: C.faint, margin: '0 2px 16px' }}>{savingName ? 'Saving...' : 'Tap away to save the name.'}</p>

        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '10px 14px', marginBottom: 18, fontSize: 12.5, color: C.mute, lineHeight: 1.7 }}>
          <div>Type: {asset.type}</div>
          {asset.dimensions && <div>Size: {asset.dimensions}</div>}
          {asset.file_size != null && <div>File: {fmtSize(asset.file_size)}</div>}
          {asset.created_at && <div>Added: {new Date(asset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
        </div>

        {asset.file_url && <a href={asset.file_url} download={asset.name} style={actionBtn}><Download size={16} /> Download</a>}
        {asset.file_url && <button type="button" onClick={copyLink} style={actionBtn}>{copied ? <><Check size={16} color={C.greenDk} /> Copied</> : <><Copy size={16} /> Copy link</>}</button>}

        {error && <p style={{ fontSize: 13, color: C.coral, textAlign: 'center', margin: '4px 4px 12px' }}>{error}</p>}

        {confirmDel ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setConfirmDel(false)} disabled={busy} style={{ ...actionBtn, marginBottom: 0, flex: 1, width: 'auto' }}>Cancel</button>
            <button type="button" onClick={doDelete} disabled={busy} style={{ ...actionBtn, marginBottom: 0, flex: 1, width: 'auto', border: 'none', background: C.coral, color: '#fff', fontWeight: 700 }}>{busy ? <Loader2 size={16} className="mvp-spin" /> : null} Delete</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} style={{ ...actionBtn, marginBottom: 0, color: C.coral, border: `1px solid ${C.coralSoft}` }}><Trash2 size={16} /> Delete</button>
        )}
      </div>
      </div>
    </div>
  )
}
