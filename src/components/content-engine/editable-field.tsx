'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditableFieldProps {
  value: string
  onSave: (newValue: string) => Promise<void> | void
  type?: 'text' | 'textarea' | 'date' | 'time' | 'select'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  label?: string
  className?: string
  displayClassName?: string
  inputClassName?: string
  maxLength?: number
  disabled?: boolean
  rows?: number
}

export default function EditableField({
  value,
  onSave,
  type = 'text',
  options,
  placeholder,
  label,
  className,
  displayClassName,
  inputClassName,
  maxLength,
  disabled,
  rows = 2,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  // Sync external value when not editing
  useEffect(() => {
    if (!editing) setLocalValue(value)
  }, [value, editing])

  // Focus on edit start
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if ('select' in inputRef.current && type !== 'select') {
        (inputRef.current as HTMLInputElement).select()
      }
    }
  }, [editing, type])

  const handleSave = async () => {
    if (localValue === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(localValue)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 800)
    } catch {
      setLocalValue(value)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 1200)
    }
    setSaving(false)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLocalValue(value)
      setEditing(false)
    }
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault()
      handleSave()
    }
  }

  if (disabled) {
    return <span className={cn('text-ink-3', displayClassName)}>{value || placeholder || '—'}</span>
  }

  // Display mode
  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={cn(
          'group inline-flex items-center gap-1 cursor-text rounded-md px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors hover:bg-bg-2',
          displayClassName,
          className
        )}
        title="Click to edit"
      >
        <span className={cn(!value && 'text-ink-4 italic')}>
          {type === 'select' && options
            ? options.find((o) => o.value === value)?.label ?? value
            : value || placeholder || '—'}
        </span>
        {saving ? (
          <Loader2 className="w-3 h-3 text-ink-4 animate-spin flex-shrink-0" />
        ) : status === 'success' ? (
          <Check className="w-3 h-3 text-brand flex-shrink-0" />
        ) : (
          <Pencil className="w-3 h-3 text-ink-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        )}
      </span>
    )
  }

  // Edit mode
  const inputStyles = cn(
    'text-sm text-ink rounded-md border border-ink-5 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white w-full',
    status === 'error' && 'border-red-400 ring-red-200',
    inputClassName
  )

  if (type === 'textarea') {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(inputStyles, 'resize-none', className)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          // Auto-save on select change
          setTimeout(() => {
            setSaving(true)
            Promise.resolve(onSave(e.target.value))
              .then(() => { setStatus('success'); setTimeout(() => setStatus('idle'), 800) })
              .catch(() => { setLocalValue(value); setStatus('error'); setTimeout(() => setStatus('idle'), 1200) })
              .finally(() => { setSaving(false); setEditing(false) })
          }, 0)
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={handleKeyDown}
        className={cn(inputStyles, 'cursor-pointer', className)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className={cn(inputStyles, className)}
      maxLength={maxLength}
      placeholder={placeholder}
    />
  )
}
