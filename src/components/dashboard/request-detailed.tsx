'use client'

import { useState, useRef } from 'react'
import { ChevronDown, Camera, Loader2, CheckCircle } from 'lucide-react'
import { submitContentRequest } from '@/lib/request-actions'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onBack: () => void
}

const CONTENT_TYPES = ['Graphic post', 'Carousel', 'Reel / video', 'Story', 'Other']
const MOODS = ['Bold', 'Clean', 'Warm', 'Professional', 'Playful', 'Luxury']
const PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn']
const URGENCIES = [
  { id: 'flexible', label: 'Flexible' },
  { id: 'this_week', label: 'This week' },
  { id: 'urgent', label: 'Urgent' },
]

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-ink-6 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-6/30 transition-colors"
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--ink, #111)' }}>{title}</span>
        <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}

export default function RequestDetailed({ onBack }: Props) {
  const [form, setForm] = useState({
    contentType: '',
    description: '',
    headline: '',
    captionDirection: '',
    mood: '',
    colorNotes: '',
    referenceUrl: '',
    photoUrl: '',
    photoName: '',
    platforms: [] as string[],
    urgency: 'flexible',
    deadline: '',
    avoidNotes: '',
    internalNotes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (field: string, value: string | string[]) => setForm(f => ({ ...f, [field]: value }))

  const togglePlatform = (p: string) => {
    const current = form.platforms
    update('platforms', current.includes(p) ? current.filter(x => x !== p) : [...current, p])
  }

  async function handlePhoto(file: File) {
    const supabase = createClient()
    const path = `requests/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('client-photos').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('client-photos').getPublicUrl(path)
      update('photoUrl', publicUrl)
      update('photoName', file.name)
    }
  }

  async function handleSubmit() {
    if (!form.description.trim()) return
    setSubmitting(true)
    const result = await submitContentRequest({
      mode: 'detailed',
      description: form.description,
      templateType: form.contentType || 'general',
      photoUrl: form.photoUrl || undefined,
      urgency: form.urgency,
      deadline: form.deadline || undefined,
      platforms: form.platforms.length > 0 ? form.platforms : undefined,
      detail: { ...form },
    })
    setSubmitting(false)
    if (result.success) setDone(true)
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#4abd98' }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink, #111)' }}>Got it!</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-3, #888)' }}>We're on it. You'll see a draft soon.</p>
        <button onClick={onBack} className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white" style={{ background: '#4abd98' }}>Done</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <button onClick={onBack} className="text-sm text-ink-3 hover:text-ink-2 mb-4">&larr; Back</button>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: 'var(--ink, #111)' }}>
          Tell us everything
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-3, #888)' }}>
          Fill in what you want. Skip anything you're not sure about.
        </p>
      </div>

      {/* What */}
      <Section title="What do you need?">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Type</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(t => (
              <button key={t} onClick={() => update('contentType', t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.contentType === t ? 'bg-brand-tint border-brand text-brand-dark' : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'}`}
              >{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Describe what you want</label>
          <textarea value={form.description} onChange={e => update('description', e.target.value)}
            placeholder="New brunch menu launching Saturday. Want to show the spread and drive reservations."
            rows={3} className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none" />
        </div>
      </Section>

      {/* Look & Feel */}
      <Section title="Look and feel" defaultOpen={false}>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Mood</label>
          <div className="flex flex-wrap gap-2">
            {MOODS.map(m => (
              <button key={m} onClick={() => update('mood', m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.mood === m ? 'bg-brand-tint border-brand text-brand-dark' : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'}`}
              >{m}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Color notes</label>
          <input type="text" value={form.colorNotes} onChange={e => update('colorNotes', e.target.value)}
            placeholder="Use our brand colors, or something warm and earthy"
            className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Reference link</label>
          <input type="url" value={form.referenceUrl} onChange={e => update('referenceUrl', e.target.value)}
            placeholder="Link to a post or style you like"
            className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
        </div>
        <div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-ink-6 hover:bg-ink-6/50 transition-colors" style={{ color: 'var(--ink-2, #555)' }}>
            <Camera className="w-4 h-4" />{form.photoName || 'Upload a photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f) }} />
        </div>
      </Section>

      {/* Copy */}
      <Section title="Words and copy" defaultOpen={false}>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Headline idea</label>
          <input type="text" value={form.headline} onChange={e => update('headline', e.target.value)}
            placeholder="Weekend Brunch is Here" className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Caption direction</label>
          <textarea value={form.captionDirection} onChange={e => update('captionDirection', e.target.value)}
            placeholder="Keep it short and fun. Mention the date and that reservations are open."
            rows={2} className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Things to avoid</label>
          <input type="text" value={form.avoidNotes} onChange={e => update('avoidNotes', e.target.value)}
            placeholder="Don't mention competitor names, no heavy discounting language"
            className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
        </div>
      </Section>

      {/* Timing */}
      <Section title="Timing and platforms" defaultOpen={false}>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => (
              <button key={p} onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.platforms.includes(p) ? 'bg-brand-tint border-brand text-brand-dark' : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'}`}
              >{p}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Urgency</label>
          <div className="flex gap-2">
            {URGENCIES.map(u => (
              <button key={u.id} onClick={() => update('urgency', u.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.urgency === u.id ? 'bg-brand-tint border-brand text-brand-dark' : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'}`}
              >{u.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Publish by (optional)</label>
          <input type="date" value={form.deadline} onChange={e => update('deadline', e.target.value)}
            className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>Notes for the team</label>
          <textarea value={form.internalNotes} onChange={e => update('internalNotes', e.target.value)}
            placeholder="Anything else we should know?" rows={2}
            className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none" />
        </div>
      </Section>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={!form.description.trim() || submitting}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40" style={{ background: '#4abd98' }}>
        {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending...</span> : 'Send request'}
      </button>
    </div>
  )
}
