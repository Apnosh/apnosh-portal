'use client'

/**
 * Edit page copy.
 *
 * Renders the editable text fields the customer's site has declared in
 * apnosh-content.json, with hard-constraint validation (length, format)
 * and advisory voice checks (warns, never blocks).
 *
 * Pattern (per playbook): Apnosh provides the editor + validation + voice
 * suggestions. The customer's site owns its design. When the client clicks
 * Save, the new value flows through the public API and triggers a deploy.
 */

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Type, Edit3, X, Loader2, AlertTriangle, CheckCircle2, Sparkles, RotateCcw,
  Image as ImageIcon, Upload,
} from 'lucide-react'
import {
  updateMyContent, voiceCheck,
  type ContentFieldWithValue, type VoiceCheckResult,
} from '@/lib/dashboard/content-actions'

interface Props {
  fields: ContentFieldWithValue[]
}

export default function ContentEditor({ fields }: Props) {
  const [editing, setEditing] = useState<ContentFieldWithValue | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  // Group by page for nicer organization
  const byPage = new Map<string, ContentFieldWithValue[]>()
  for (const f of fields) {
    const p = f.page ?? 'Site-wide'
    const arr = byPage.get(p) ?? []
    arr.push(f)
    byPage.set(p, arr)
  }

  return (
    <section>
      <h2 className="text-[15px] font-bold text-ink mb-1 flex items-center gap-2">
        <Type className="w-4 h-4 text-ink-3" /> Edit page copy
      </h2>
      <p className="text-xs text-ink-3 mb-3">
        Update wording, fix typos, refine taglines. Changes go live on your site automatically.
      </p>

      <div className="space-y-4">
        {Array.from(byPage.entries()).map(([page, pageFields]) => (
          <div key={page}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-4 mb-2">{page}</h3>
            <ul className="rounded-xl border border-ink-6 bg-white divide-y divide-ink-6">
              {pageFields.map(f => (
                <li key={f.key} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink mb-0.5 flex items-center gap-2">
                      {f.type === 'asset' && <ImageIcon className="w-3.5 h-3.5 text-ink-3" />}
                      {f.label}
                      {f.hasOverride && (
                        <span className="text-[10px] uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                          edited
                        </span>
                      )}
                    </div>
                    {f.description && (
                      <p className="text-xs text-ink-4 mb-1.5">{f.description}</p>
                    )}
                    {f.type === 'asset' ? (
                      f.value ? (
                        <img
                          src={f.value}
                          alt={f.label}
                          className="h-16 w-auto max-w-[160px] rounded border border-ink-6 bg-bg-2 object-contain"
                        />
                      ) : (
                        <p className="text-sm text-ink-3 italic">(no image)</p>
                      )
                    ) : (
                      <p className="text-sm text-ink-3 italic line-clamp-2">{f.value || '(empty)'}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditing(f)}
                    className="px-3 py-1.5 rounded-md border border-ink-6 text-xs font-medium hover:bg-bg-2 inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          field={editing}
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

// ─── Edit modal ────────────────────────────────────────────────────

function EditModal({
  field, onClose, onSaved,
}: {
  field: ContentFieldWithValue
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [value, setValue] = useState(field.value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState<VoiceCheckResult | null>(null)
  const [voiceChecking, setVoiceChecking] = useState(false)
  const [, startTransition] = useTransition()

  const max = field.constraints?.maxChars
  const min = field.constraints?.minChars
  const overLimit = max !== undefined && value.length > max
  const underLimit = min !== undefined && value.length < min
  const dirty = value !== field.value
  const canResetToDefault = field.hasOverride && field.default !== undefined && value !== field.default

  const handleVoiceCheck = async () => {
    if (!dirty) return
    setVoiceChecking(true)
    const result = await voiceCheck(field.key, value)
    setVoice(result)
    setVoiceChecking(false)
  }

  const handleSave = async (acceptedVoiceWarning?: string) => {
    setBusy(true)
    setError(null)
    const res = await updateMyContent({
      fieldKey: field.key,
      value,
      acceptedVoiceWarning,
    })
    setBusy(false)
    if (res.success) {
      startTransition(() => onSaved(`"${field.label}" updated. Live on your site shortly.`))
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
          <div>
            <h3 className="text-base font-semibold text-ink">{field.label}</h3>
            {field.description && <p className="text-xs text-ink-3 mt-0.5">{field.description}</p>}
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {field.type === 'asset' ? (
            <AssetUploader
              value={value}
              onChange={v => setValue(v)}
              aspect={field.constraints?.aspect}
              recommendedSize={field.constraints?.recommendedSize}
            />
          ) : field.constraints?.multiline ? (
            <textarea
              value={value}
              onChange={e => { setValue(e.target.value); setVoice(null) }}
              rows={5}
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm font-mono"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={e => { setValue(e.target.value); setVoice(null) }}
              className="w-full rounded-md border border-ink-6 px-3 py-2 text-sm"
            />
          )}

          {/* Char count -- text fields only */}
          {field.type !== 'asset' && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={`${overLimit ? 'text-red-600' : underLimit ? 'text-amber-600' : 'text-ink-3'}`}>
                {value.length}{max !== undefined ? ` / ${max}` : ''} chars
                {min !== undefined && ` (min ${min})`}
              </span>
              {dirty && !voiceChecking && !voice && (
                <button
                  onClick={handleVoiceCheck}
                  className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
                >
                  <Sparkles className="w-3 h-3" /> Check voice
                </button>
              )}
              {voiceChecking && (
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                </span>
              )}
            </div>
          )}

          {/* Voice advisory (never blocks) */}
          {voice?.warning && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-amber-900 font-medium">Voice check</p>
                  <p className="text-amber-800 mt-1">{voice.warning}</p>
                  {voice.suggestion && (
                    <button
                      onClick={() => { setValue(voice.suggestion!); setVoice(null) }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline"
                    >
                      Use suggestion: <em>{voice.suggestion}</em>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {voice && !voice.warning && (
            <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <span className="text-green-900">Looks on-brand.</span>
            </div>
          )}

          {/* Diff: shows old vs new when the value has changed. Helps the
              client see what they're about to publish before clicking save. */}
          {dirty && field.type === 'asset' && (
            <div className="mt-4 rounded-md border border-ink-6 bg-bg-2 p-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="uppercase tracking-wide text-ink-4 mb-1 text-[10px]">Currently live</div>
                  {field.value
                    ? <img src={field.value} alt="current" className="h-20 w-auto max-w-full rounded border border-ink-6 bg-white object-contain" />
                    : <p className="text-ink-3">(empty)</p>}
                </div>
                <div>
                  <div className="uppercase tracking-wide text-ink-4 mb-1 text-[10px]">After publish</div>
                  {value
                    ? <img src={value} alt="new" className="h-20 w-auto max-w-full rounded border border-ink-6 bg-white object-contain" />
                    : <p className="text-ink-3">(empty)</p>}
                </div>
              </div>
            </div>
          )}

          {dirty && field.type !== 'asset' && (
            <div className="mt-4 rounded-md border border-ink-6 bg-bg-2 p-3 text-xs space-y-2">
              <div>
                <div className="uppercase tracking-wide text-ink-4 mb-1 text-[10px]">Currently live</div>
                <p className="text-ink-3 line-through decoration-red-300/70">{field.value || '(empty)'}</p>
              </div>
              <div>
                <div className="uppercase tracking-wide text-ink-4 mb-1 text-[10px]">After publish</div>
                <p className="text-ink font-medium">{value || '(empty)'}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-ink-6 bg-bg-2">
          <div>
            {canResetToDefault && (
              <button
                onClick={() => { setValue(field.default ?? ''); setVoice(null) }}
                disabled={busy}
                className="text-xs text-ink-3 hover:text-ink inline-flex items-center gap-1"
                title="Reset this field back to the design's default copy"
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
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
          {voice?.warning ? (
            <button
              onClick={() => handleSave(voice.warning ?? undefined)}
              disabled={busy || overLimit || underLimit || !dirty}
              className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Publish anyway
            </button>
          ) : (
            <button
              onClick={() => handleSave()}
              disabled={busy || overLimit || underLimit || !dirty}
              className="px-4 py-2 rounded-md bg-ink text-white text-sm font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save & publish
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Asset uploader ────────────────────────────────────────────────

function AssetUploader({
  value, onChange, aspect, recommendedSize,
}: {
  value: string
  onChange: (url: string) => void
  aspect?: string
  recommendedSize?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setErr(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/dashboard/upload-asset', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      onChange(data.url as string)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-dashed border-ink-6 bg-bg-2 p-4 flex items-center gap-4">
        <div className="w-32 h-24 rounded border border-ink-6 bg-white flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            <img src={value} alt="preview" className="max-w-full max-h-full object-contain" />
          ) : (
            <ImageIcon className="w-6 h-6 text-ink-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 rounded-md border border-ink-6 bg-white text-sm font-medium hover:bg-bg-2 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
              : <><Upload className="w-3.5 h-3.5" /> {value ? 'Replace image' : 'Upload image'}</>}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/avif,image/heic,image/heif"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <p className="text-[11px] text-ink-4 mt-1.5">
            JPG, PNG, WEBP, GIF, SVG, AVIF, or HEIC. Max 8MB.
            {recommendedSize && <> Recommended: {recommendedSize}.</>}
            {aspect && <> Aspect: {aspect}.</>}
          </p>
        </div>
      </div>
      {err && (
        <p className="mt-2 text-xs text-red-600">{err}</p>
      )}
    </div>
  )
}
