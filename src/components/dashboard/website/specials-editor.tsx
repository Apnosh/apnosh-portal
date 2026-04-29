'use client'

/**
 * Daily specials / deals editor.
 *
 * Pattern mirrors MenuEditor: list of cards + an Add/Edit modal that
 * fires the deploy hook on save. Specials are optional — when the
 * client has zero active specials, the section auto-hides on the site.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Tag, Plus, Edit3, Trash2, X, Loader2, CheckCircle2, Upload, Image as ImageIcon,
} from 'lucide-react'
import {
  createMySpecial, updateMySpecial, deleteMySpecial,
  type Special,
} from '@/lib/dashboard/specials-actions'

interface Props {
  initialItems: Special[]
}

export default function SpecialsEditor({ initialItems }: Props) {
  const [editing, setEditing] = useState<Special | 'new' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink flex items-center gap-2">
            <Tag className="w-4 h-4 text-ink-3" /> Daily specials
          </h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Recurring deals like &ldquo;Happy Hour 3-5pm.&rdquo; Optional. Hides on your site when empty.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add special
        </button>
      </div>

      {initialItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-6 bg-white p-6 text-center text-sm text-ink-3">
          No specials yet. Add one to start showing deals on your site, or leave empty to hide the section.
        </div>
      ) : (
        <ul className="rounded-xl border border-ink-6 bg-white divide-y divide-ink-6">
          {initialItems.map(s => (
            <li key={s.id} className="p-4 flex items-start gap-4">
              {s.photoUrl ? (
                <img
                  src={s.photoUrl}
                  alt={s.title}
                  className="h-16 w-16 rounded border border-ink-6 bg-bg-2 object-cover shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded border border-ink-6 bg-bg-2 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5 text-ink-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{s.title}</span>
                  {!s.isActive && (
                    <span className="text-[10px] uppercase tracking-wide text-ink-4 bg-bg-2 border border-ink-6 px-1.5 py-0.5 rounded">
                      hidden
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3 mt-0.5">
                  {s.timeWindow && <span>{s.timeWindow}</span>}
                  {s.price && <span className="font-medium text-ink">{s.price}</span>}
                  {s.saveLabel && <span className="text-green-700">{s.saveLabel}</span>}
                </div>
                {s.tagline && (
                  <p className="text-xs text-ink-4 mt-1 line-clamp-2">{s.tagline}</p>
                )}
              </div>
              <button
                onClick={() => setEditing(s)}
                className="px-3 py-1.5 rounded-md border border-ink-6 text-xs font-medium hover:bg-bg-2 inline-flex items-center gap-1.5 shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SpecialModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={msg => {
            setEditing(null)
            setToast(msg)
            setTimeout(() => setToast(null), 6000)
            router.refresh()
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-ink text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm"
        >
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </section>
  )
}

// ─── Modal ────────────────────────────────────────────────────────

function SpecialModal({
  item, onClose, onSaved,
}: {
  item: Special | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = !item
  const [title, setTitle] = useState(item?.title ?? '')
  const [tagline, setTagline] = useState(item?.tagline ?? '')
  const [timeWindow, setTimeWindow] = useState(item?.timeWindow ?? '')
  const [price, setPrice] = useState(item?.price ?? '')
  const [saveLabel, setSaveLabel] = useState(item?.saveLabel ?? '')
  const [includesText, setIncludesText] = useState((item?.includes ?? []).join('\n'))
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? '')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    const includes = includesText.split('\n').map(s => s.trim()).filter(Boolean)
    const input = {
      title: title.trim(),
      tagline: tagline.trim() || null,
      timeWindow: timeWindow.trim() || null,
      price: price.trim() || null,
      saveLabel: saveLabel.trim() || null,
      includes,
      photoUrl: photoUrl.trim() || null,
      isActive,
    }
    const res = isNew
      ? await createMySpecial(input)
      : await updateMySpecial(item!.id, input)
    setBusy(false)
    if (res.success) {
      startTransition(() =>
        onSaved(`"${input.title}" ${isNew ? 'added' : 'updated'}. Live on your site shortly.`),
      )
    } else {
      setError(res.error)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return
    setBusy(true)
    const res = await deleteMySpecial(item.id)
    setBusy(false)
    if (res.success) {
      startTransition(() => onSaved(`"${item.title}" deleted.`))
    } else {
      setError(res.error)
    }
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/dashboard/upload-asset', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setPhotoUrl(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
          <h3 className="text-base font-semibold text-ink">
            {isNew ? 'Add special' : 'Edit special'}
          </h3>
          <button onClick={onClose} className="text-ink-3 hover:text-ink shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Field label="Title" hint="Make this the deal headline. e.g. 'Happy Hour Special'">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Buy a banh mi, get a free fruit tea"
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Time window (optional)" hint="When this deal runs">
              <input
                type="text"
                value={timeWindow}
                onChange={e => setTimeWindow(e.target.value)}
                placeholder="3PM – 5PM Daily"
                className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Price (optional)" hint="Free-form. e.g. '$12.99' or '+$1.99'">
              <input
                type="text"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="$12.99"
                className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="Save label (optional)" hint="Short call-out, e.g. 'Save $3+'">
            <input
              type="text"
              value={saveLabel}
              onChange={e => setSaveLabel(e.target.value)}
              placeholder="Save $3+"
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Tagline (optional)" hint="One short hook line">
            <textarea
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              rows={2}
              placeholder="The afternoon reset. Banh mi paired with fruit tea."
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="What's included (optional)" hint="One per line. Shown as a bullet list.">
            <textarea
              value={includesText}
              onChange={e => setIncludesText(e.target.value)}
              rows={3}
              placeholder={'Traditional Banh Mi\nFruit Tea with Topping'}
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm font-mono"
            />
          </Field>

          <Field label="Photo (optional)">
            <div className="flex items-start gap-3">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="preview"
                  className="h-20 w-20 rounded border border-ink-6 bg-bg-2 object-cover shrink-0"
                />
              ) : (
                <div className="h-20 w-20 rounded border border-ink-6 bg-bg-2 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5 text-ink-4" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <label className="px-3 py-1.5 rounded-md border border-ink-6 text-xs font-medium hover:bg-bg-2 inline-flex items-center gap-1.5 cursor-pointer">
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                    : <><Upload className="w-3.5 h-3.5" /> {photoUrl ? 'Replace' : 'Upload'}</>}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/avif,image/heic,image/heif"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFileUpload(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={e => setPhotoUrl(e.target.value)}
                  placeholder="Or paste an image URL"
                  className="w-full mt-2 rounded-md border border-ink-6 px-3 py-1.5 text-xs"
                />
              </div>
            </div>
          </Field>

          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="rounded"
            />
            Show on site
          </label>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-ink-6 bg-bg-2">
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-xs text-red-700 hover:text-red-800 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-md border border-ink-6 text-sm text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy || !title.trim()}
              className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isNew ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink mb-1">{label}</span>
      {hint && <span className="block text-[11px] text-ink-4 mb-1.5">{hint}</span>}
      {children}
    </label>
  )
}
