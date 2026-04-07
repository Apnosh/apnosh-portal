'use client'

import { useState, useRef, useEffect } from 'react'
import { X, CheckCircle2, Loader2, Send, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  businessId: string
  guidelineId: string
}

export default function RevisionRequestModal({ isOpen, onClose, businessId, guidelineId }: Props) {
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'normal' | 'rush'>('normal')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDescription('')
      setPriority('normal')
      setFile(null)
      setSuccess(false)
      setError(null)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Please describe what you would like changed.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      // Upload reference file if provided
      let fileUrl: string | undefined
      if (file) {
        const ext = file.name.split('.').pop() || 'pdf'
        const path = `brand-assets/${businessId}/revision-refs/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('brand-assets')
          .upload(path, file)
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(path)
          fileUrl = urlData.publicUrl
        }
      }

      const notes = [
        `Priority: ${priority}`,
        `Guideline ID: ${guidelineId}`,
        description.trim(),
        fileUrl ? `Reference file: ${fileUrl}` : '',
      ].filter(Boolean).join('\n')

      const { error: orderErr } = await supabase.from('orders').insert({
        business_id: businessId,
        type: 'a_la_carte',
        service_name: 'Brand Guidelines Revision',
        unit_price: 0,
        total_price: 0,
        quantity: 1,
        status: 'pending',
        notes,
      })

      if (orderErr) throw new Error(orderErr.message)
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-white rounded-xl border border-ink-6 shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-6">
          <h2 className="text-sm font-semibold text-ink">Request Revision</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {success ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-1">Revision Requested</h3>
              <p className="text-xs text-ink-3">Our team will review and get back to you.</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 text-xs font-medium text-brand-dark border border-brand/30 rounded-lg hover:bg-brand-tint/30 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                  What would you like changed?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the changes you'd like..."
                  className="mt-1 w-full text-sm text-ink border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                  Reference Material (optional)
                </label>
                <div className="mt-1">
                  {file ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-ink-6 rounded-lg">
                      <Paperclip className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                      <span className="text-xs text-ink truncate flex-1">{file.name}</span>
                      <button
                        onClick={() => setFile(null)}
                        className="text-ink-4 hover:text-ink flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-ink-3 border border-dashed border-ink-5 rounded-lg hover:bg-bg-2 transition-colors"
                    >
                      <Paperclip className="w-3 h-3" /> Attach a file
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-2 block">
                  Priority
                </label>
                <div className="flex gap-3">
                  {(['normal', 'rush'] as const).map((p) => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="priority"
                        value={p}
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                        className="accent-brand-dark"
                      />
                      <span className="text-sm text-ink capitalize">{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-ink-3 border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !description.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-brand-dark rounded-lg hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="w-3 h-3" /> Submit Request</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
