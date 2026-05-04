'use client'

/**
 * Generic schema-driven field renderer.
 *
 * Given a Zod type and a value, draws the right form input. Calls onChange
 * with the new value. Recurses into objects + arrays.
 *
 * Adding a new field type? Add a case in the switch + a renderer function.
 * Same form serves admin AND client portal — no duplicated UI.
 */

import { useRef, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, Loader2, X } from 'lucide-react'
import type { ZodTypeAny } from 'zod'
import { introspect, humanizeFieldName, emptyValueFor } from './zod-introspect'
import { useUploadAsset } from './upload-context'

interface FieldRendererProps {
  schema: ZodTypeAny
  fieldName: string
  value: unknown
  onChange: (next: unknown) => void
  /** Override the auto-derived label */
  label?: string
  /** Compact rendering inside arrays */
  compact?: boolean
}

export function FieldRenderer({
  schema, fieldName, value, onChange, label, compact,
}: FieldRendererProps) {
  const meta = introspect(schema, fieldName)
  const displayLabel = label ?? humanizeFieldName(fieldName)
  const desc = meta.description

  switch (meta.kind) {
    case 'string':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <input
            type="text"
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            value={(value as string) ?? ''}
            maxLength={meta.maxChars}
            onChange={e => onChange(e.target.value)}
          />
          {meta.maxChars && <CharCount value={(value as string) ?? ''} max={meta.maxChars} />}
        </FieldShell>
      )

    case 'longString':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <textarea
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none min-h-[120px] resize-y"
            value={(value as string) ?? ''}
            maxLength={meta.maxChars}
            onChange={e => onChange(e.target.value)}
          />
          {meta.maxChars && <CharCount value={(value as string) ?? ''} max={meta.maxChars} />}
        </FieldShell>
      )

    case 'number':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <input
            type="number"
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            value={(value as number | undefined) ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </FieldShell>
      )

    case 'boolean':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact} inline>
          <button
            type="button"
            onClick={() => onChange(!(value as boolean))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? 'bg-brand' : 'bg-ink-6'
            }`}
            aria-pressed={!!value}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                value ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </FieldShell>
      )

    case 'enum':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <select
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-brand/20 outline-none"
            value={(value as string) ?? ''}
            onChange={e => onChange(e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {(meta.enumOptions ?? []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </FieldShell>
      )

    case 'url':
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <input
            type="url"
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            placeholder="https://"
            value={(value as string) ?? ''}
            onChange={e => onChange(e.target.value || null)}
          />
        </FieldShell>
      )

    case 'color':
      return <ColorField value={value} onChange={onChange} label={displayLabel} description={desc} />

    case 'asset':
      return <AssetField value={value} onChange={onChange} label={displayLabel} description={desc} />

    case 'object':
      return (
        <ObjectField
          shape={meta.objectShape ?? {}}
          value={(value as Record<string, unknown>) ?? {}}
          onChange={onChange}
          label={displayLabel}
          description={desc}
          fieldName={fieldName}
        />
      )

    case 'array':
      return (
        <ArrayField
          itemType={meta.arrayItemType!}
          value={(value as unknown[]) ?? []}
          onChange={onChange}
          label={displayLabel}
          description={desc}
          fieldName={fieldName}
        />
      )

    default:
      return (
        <FieldShell label={displayLabel} description={desc} optional={meta.optional} compact={compact}>
          <textarea
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs font-mono"
            value={JSON.stringify(value ?? null, null, 2)}
            onChange={e => {
              try { onChange(JSON.parse(e.target.value)) } catch { /* ignore parse errors mid-typing */ }
            }}
          />
        </FieldShell>
      )
  }
}

// ============================================================================
// Object field — renders nested form
// ============================================================================

function ObjectField({
  shape, value, onChange, label, description,
}: {
  shape: Record<string, ZodTypeAny>
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  label: string
  description?: string
  fieldName: string
}) {
  return (
    <div className="border border-ink-6 rounded-xl p-4 space-y-3 bg-bg-2/30">
      <div>
        <h4 className="text-sm font-semibold text-ink">{label}</h4>
        {description && <p className="text-xs text-ink-3 mt-0.5">{description}</p>}
      </div>
      <div className="space-y-3">
        {Object.entries(shape).map(([k, sub]) => (
          <FieldRenderer
            key={k}
            schema={sub}
            fieldName={k}
            value={value[k]}
            onChange={next => onChange({ ...value, [k]: next })}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Array field — repeatable list of items
// ============================================================================

function ArrayField({
  itemType, value, onChange, label, description, fieldName,
}: {
  itemType: ZodTypeAny
  value: unknown[]
  onChange: (next: unknown[]) => void
  label: string
  description?: string
  fieldName: string
}) {
  const itemMeta = introspect(itemType, fieldName + '[]')

  return (
    <div className="border border-ink-6 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-ink">{label}</h4>
          {description && <p className="text-xs text-ink-3 mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange([...value, emptyValueFor(itemType)])}
          className="text-xs font-medium text-brand hover:text-brand-dark inline-flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-ink-4 italic">No items yet.</p>
      ) : (
        <div className="space-y-2">
          {value.map((item, idx) => (
            <ArrayItem
              key={idx}
              index={idx}
              itemType={itemType}
              item={item}
              isObject={itemMeta.kind === 'object'}
              onChange={(next) => {
                const arr = [...value]
                arr[idx] = next
                onChange(arr)
              }}
              onRemove={() => onChange(value.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ArrayItem({
  index, itemType, item, isObject, onChange, onRemove,
}: {
  index: number
  itemType: ZodTypeAny
  item: unknown
  isObject: boolean
  onChange: (next: unknown) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)
  const itemLabel = (item as Record<string, unknown> | null)?.name as string | undefined
    ?? (item as Record<string, unknown> | null)?.title as string | undefined
    ?? (item as Record<string, unknown> | null)?.label as string | undefined
    ?? `Item ${index + 1}`

  if (!isObject) {
    return (
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <FieldRenderer
            schema={itemType}
            fieldName={`item-${index}`}
            value={item}
            onChange={onChange}
            label={`Item ${index + 1}`}
            compact
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-4 hover:text-red-600 mt-2 shrink-0"
          aria-label="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="border border-ink-6 rounded-lg bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-6">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-ink"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {itemLabel}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-4 hover:text-red-600"
          aria-label="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="p-3">
          <FieldRenderer
            schema={itemType}
            fieldName={`item-${index}`}
            value={item}
            onChange={onChange}
            label=""
            compact
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Color field
// ============================================================================

function ColorField({
  value, onChange, label, description,
}: {
  value: unknown
  onChange: (v: unknown) => void
  label: string
  description?: string
}) {
  const v = (value as string) ?? '#000000'
  return (
    <FieldShell label={label} description={description}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-14 border border-ink-6 rounded-lg cursor-pointer"
          value={v}
          onChange={e => onChange(e.target.value.toUpperCase())}
        />
        <input
          type="text"
          className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-sm font-mono"
          placeholder="#CC0A0A"
          value={v}
          onChange={e => onChange(e.target.value.toUpperCase())}
        />
      </div>
    </FieldShell>
  )
}

// ============================================================================
// Asset (image) field — URL with preview
// ============================================================================

function AssetField({
  value, onChange, label, description,
}: {
  value: unknown
  onChange: (v: unknown) => void
  label: string
  description?: string
}) {
  const v = (value as string | null) ?? ''
  const upload = useUploadAsset()
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleFile(f: File) {
    if (!upload) return
    setUploading(true)
    setUploadError(null)
    const res = await upload(f)
    setUploading(false)
    if ('error' in res) {
      setUploadError(res.error)
    } else {
      onChange(res.url)
    }
  }

  return (
    <FieldShell label={label} description={description}>
      <div className="flex items-start gap-3">
        <div className="relative w-20 h-20 rounded-lg border border-ink-6 bg-bg-2 overflow-hidden flex items-center justify-center shrink-0">
          {v ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/95 hover:bg-white flex items-center justify-center shadow-sm"
                aria-label="Clear"
                title="Clear"
              >
                <X className="w-3 h-3 text-ink" />
              </button>
            </>
          ) : (
            <span className="text-[10px] text-ink-4 text-center px-1 leading-tight">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-1.5">
          <input
            type="url"
            className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 outline-none"
            placeholder="https://… or upload below"
            value={v}
            onChange={e => onChange(e.target.value || null)}
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={!upload || uploading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-ink-3 hover:text-ink rounded border border-ink-6 hover:bg-bg-2 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {!upload && (
              <span className="text-[10px] text-ink-4 italic">Upload not configured</span>
            )}
            {uploadError && (
              <span className="text-[10px] text-red-600 truncate" title={uploadError}>{uploadError}</span>
            )}
          </div>
        </div>
      </div>
    </FieldShell>
  )
}

// ============================================================================
// Field shell — label + description wrapper
// ============================================================================

function FieldShell({
  children, label, description, optional, compact, inline,
}: {
  children: React.ReactNode
  label: string
  description?: string
  optional?: boolean
  compact?: boolean
  inline?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {label && (
        <div className={inline ? 'flex items-center justify-between gap-3' : ''}>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 block">
              {label} {optional && <span className="text-ink-5 normal-case font-normal">· optional</span>}
            </label>
            {description && <p className="text-xs text-ink-3 mt-0.5">{description}</p>}
          </div>
          {inline && children}
        </div>
      )}
      {!inline && children}
    </div>
  )
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length
  const over = len > max
  return (
    <p className={`text-[11px] mt-1 ${over ? 'text-red-600' : 'text-ink-4'}`}>
      {len} / {max}
    </p>
  )
}
