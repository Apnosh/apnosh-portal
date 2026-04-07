'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl border border-ink-6 shadow-xl shadow-black/10 w-full max-w-sm p-6">
        {destructive && (
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
        )}
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="text-sm text-ink-3 mt-1.5 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors min-h-[44px]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors min-h-[44px] ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-brand hover:bg-brand-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
