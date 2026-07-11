'use client'

/**
 * Admin editor for a creator's profile: display name, bio, craft (the dispatch
 * key work orders route on), avatar, and active/paused. Saves via the same
 * server-action idiom as PortfolioManager; avatar upload reuses the base64
 * data-URL upload pattern.
 */
import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload, AlertCircle } from 'lucide-react'
import { updateVendorProfile, uploadVendorLogo } from './actions'

const CRAFT_OPTIONS = [
  { key: '', label: 'No craft (not auto-dispatched)' },
  { key: 'Video', label: 'Video' },
  { key: 'Photo', label: 'Photo' },
  { key: 'Social', label: 'Social' },
  { key: 'Design', label: 'Design' },
]

interface Props {
  vendorSlug: string
  name: string
  description: string | null
  craft: string | null
  logoUrl: string | null
  bookable: boolean
}

export default function ProfileEditor(props: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(props.name)
  const [description, setDescription] = useState(props.description ?? '')
  const [craft, setCraft] = useState(props.craft ?? '')
  const [bookable, setBookable] = useState(props.bookable)
  const [saving, startSave] = useTransition()
  const [uploading, startUpload] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const onSave = () => {
    setError(null); setSaved(false)
    startSave(async () => {
      const r = await updateVendorProfile({
        vendorSlug: props.vendorSlug,
        name,
        description: description || null,
        craft: craft || null,
        bookable,
      })
      if (!r.ok) { setError(r.error ?? 'Save failed'); return }
      setSaved(true)
      router.refresh()
    })
  }

  const onAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > 5 * 1024 * 1024) { setError('Avatar must be under 5MB'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      startUpload(async () => {
        const r = await uploadVendorLogo({ vendorSlug: props.vendorSlug, dataUrl })
        if (!r.ok) setError(r.error ?? 'Upload failed')
        else router.refresh()
        if (fileRef.current) fileRef.current.value = ''
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-5 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Profile</p>

      <div className="flex items-start gap-4">
        {/* Avatar */}
        <label className="block cursor-pointer flex-shrink-0" title="Change avatar">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatar} className="hidden" />
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-ink-7 border border-ink-6 flex items-center justify-center">
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Upload className="w-4 h-4 text-ink-3" />
            )}
            {uploading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-ink-2" />
              </div>
            )}
          </div>
          <p className="text-[10px] text-ink-3 text-center mt-1">Avatar</p>
        </label>

        <div className="flex-1 space-y-2 min-w-0">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Display name"
            className="w-full bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-[13px] font-medium focus:outline-none focus:border-brand"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Bio (shown on their public profile)"
            rows={3}
            className="w-full bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-brand resize-y"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={craft}
              onChange={e => setCraft(e.target.value)}
              className="bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-brand"
            >
              {CRAFT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-[12px] text-ink-2">
              <input type="checkbox" checked={bookable} onChange={e => setBookable(e.target.checked)} />
              Active (unchecked = paused, no new work)
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-ink text-white text-[12px] font-semibold rounded-full px-4 py-1.5 hover:bg-ink-2 disabled:opacity-60"
        >
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" />Saving...</> : 'Save profile'}
        </button>
        {saved && !saving && <span className="text-[11.5px] text-emerald-700 font-medium">Saved</span>}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-rose-800">{error}</p>
        </div>
      )}
    </div>
  )
}
