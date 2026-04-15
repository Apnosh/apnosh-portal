'use client'

import { useState, useRef } from 'react'
import { Camera, Loader2, CheckCircle } from 'lucide-react'
import { submitContentRequest } from '@/lib/request-actions'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onBack: () => void
}

export default function RequestQuick({ onBack }: Props) {
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState('this_week')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePhoto(file: File) {
    const supabase = createClient()
    const path = `requests/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('client-photos').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('client-photos').getPublicUrl(path)
      setPhotoUrl(publicUrl)
      setPhotoName(file.name)
    }
  }

  async function handleSubmit() {
    if (!description.trim()) return
    setSubmitting(true)
    const result = await submitContentRequest({
      mode: 'quick',
      description: description.trim(),
      photoUrl: photoUrl || undefined,
      urgency,
    })
    setSubmitting(false)
    if (result.success) setDone(true)
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#4abd98' }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink, #111)' }}>Got it!</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-3, #888)' }}>
          We're on it. You'll see a draft soon.
        </p>
        <button
          onClick={onBack}
          className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white"
          style={{ background: '#4abd98' }}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="text-sm text-ink-3 hover:text-ink-2 mb-4">&larr; Back</button>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: 'var(--ink, #111)' }}>
          What do you want to post about?
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-3, #888)' }}>
          Tell us in your own words. We'll handle the rest.
        </p>
      </div>

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Our new brunch menu starts this Saturday..."
        rows={4}
        className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
        autoFocus
      />

      {/* Photo upload */}
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-ink-6 hover:bg-ink-6/50 transition-colors"
          style={{ color: 'var(--ink-2, #555)' }}
        >
          <Camera className="w-4 h-4" />
          {photoName || 'Add a photo (optional)'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePhoto(file)
          }}
        />
      </div>

      {/* Urgency */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--ink-3, #888)' }}>
          When do you need it?
        </p>
        <div className="flex gap-2">
          {[
            { id: 'this_week', label: 'This week' },
            { id: 'next_week', label: 'Next week' },
            { id: 'no_rush', label: 'No rush' },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setUrgency(opt.id)}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all border ${
                urgency === opt.id
                  ? 'bg-brand-tint border-brand text-brand-dark'
                  : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!description.trim() || submitting}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: '#4abd98' }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Sending...
          </span>
        ) : (
          'Send request'
        )}
      </button>
    </div>
  )
}
