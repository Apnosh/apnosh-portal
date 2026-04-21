'use client'

/**
 * Click-to-edit text field. Displays the current value as regular text;
 * on click, swaps to an input (single-line) or textarea. Saves on blur
 * or Enter, cancels on Escape.
 *
 * Used throughout the client overview hero so admins can rename a client,
 * fix an address, or update a website URL without opening the edit
 * accordion.
 */

import { useEffect, useRef, useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

interface InlineEditTextProps {
  value: string | null
  placeholder?: string
  multiline?: boolean
  className?: string          // wrapper class (display mode)
  inputClassName?: string     // input-specific class
  displayClassName?: string   // class when showing value
  onSave: (newValue: string) => Promise<void>
  /** Optional formatter for display (e.g. stripping protocol from a URL). */
  formatDisplay?: (value: string) => string
  /** Don't allow empty. Default: true (saves empty string as null). */
  allowEmpty?: boolean
  /** Small pencil icon shown on hover. Default: true. */
  showEditIcon?: boolean
}

export default function InlineEditText({
  value, placeholder = '—', multiline = false,
  className = '', inputClassName = '', displayClassName = '',
  onSave, formatDisplay,
  allowEmpty = true,
  showEditIcon = true,
}: InlineEditTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus()
        if (inputRef.current instanceof HTMLInputElement) {
          inputRef.current.select()
        }
      }, 10)
    }
  }, [editing])

  async function commit() {
    if (saving) return
    const trimmed = draft.trim()
    const original = (value ?? '').trim()

    if (trimmed === original) {
      setEditing(false)
      return
    }
    if (!allowEmpty && !trimmed) {
      setError(true)
      return
    }

    setSaving(true); setError(false)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value ?? '')
    setEditing(false)
    setError(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void commit()
    }
  }

  if (editing) {
    const sharedProps = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDraft(e.target.value)
        setError(false)
      },
      onKeyDown,
      onBlur: () => void commit(),
      className: `w-full bg-white border ${error ? 'border-red-400' : 'border-brand'} rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/20 ${inputClassName}`,
      placeholder,
    }
    return (
      <div className={`relative ${className}`}>
        {multiline
          ? <textarea {...(sharedProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} rows={3} />
          : <input {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)} type="text" />}
        {saving && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-ink-4" />
        )}
      </div>
    )
  }

  const display = value
    ? (formatDisplay ? formatDisplay(value) : value)
    : placeholder

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group inline-flex items-center gap-1 text-left max-w-full ${className}`}
    >
      <span className={`${!value ? 'text-ink-4 italic' : ''} truncate ${displayClassName}`}>
        {display}
      </span>
      {showEditIcon && (
        <Pencil className="w-3 h-3 text-ink-4 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
      )}
    </button>
  )
}
