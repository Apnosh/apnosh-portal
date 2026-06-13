'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Loader2, Check, ExternalLink, ImagePlus, X, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

interface AssetImg { id: string; name: string; file_url: string }
const LIMIT = 1500

const CTAS: { value: string; label: string; needsUrl: boolean }[] = [
  { value: '', label: 'No button', needsUrl: false },
  { value: 'CALL', label: 'Call', needsUrl: false },
  { value: 'ORDER', label: 'Order online', needsUrl: true },
  { value: 'BOOK', label: 'Book a table', needsUrl: true },
  { value: 'LEARN_MORE', label: 'Learn more', needsUrl: true },
]

export default function PostsPage() {
  const supabase = createClient()
  const { client } = useClient()
  const [text, setText] = useState('')
  const [images, setImages] = useState<AssetImg[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null)
  const [topic, setTopic] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [ctaType, setCtaType] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')

  const ctaMeta = CTAS.find(c => c.value === ctaType)

  async function aiDraft() {
    setDrafting(true); setResult(null)
    try {
      const res = await fetch('/api/dashboard/listing/post/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) setResult({ ok: false, text: b.error || `Couldn’t draft (${res.status})` })
      else setText((b.text || '').slice(0, LIMIT))
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    if (!client?.id) return
    supabase.from('assets').select('id, name, file_url').eq('client_id', client.id).eq('type', 'image')
      .order('created_at', { ascending: false }).limit(40)
      .then(({ data }) => setImages((data ?? []).filter((a): a is AssetImg => !!a.file_url)))
  }, [client?.id, supabase])

  const pickedImg = images.find(i => i.id === picked) ?? null

  async function publish() {
    if (!text.trim()) return
    if (ctaMeta?.needsUrl && !ctaUrl.trim()) { setResult({ ok: false, text: 'Add a link for your button' }); return }
    setPosting(true); setResult(null)
    try {
      const cta = ctaType ? { actionType: ctaType, url: ctaMeta?.needsUrl ? ctaUrl.trim() : undefined } : null
      const res = await fetch('/api/dashboard/listing/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), imageUrl: pickedImg?.file_url ?? null, cta }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setResult({ ok: false, text: b.error || `Failed (HTTP ${res.status})` }); return }
      setResult({ ok: true, text: 'Posted to Google', url: b.searchUrl })
      setText(''); setPicked(null); setCtaType(''); setCtaUrl('')
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="max-w-[680px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-brand" />
          Post to Google
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Share a special, event, or update. It shows on your Google listing and keeps you active, which helps you rank.
        </p>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 space-y-3">
        {/* AI draft */}
        <div className="flex items-center gap-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="What's it about? (optional) e.g. weekend special"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            onClick={aiDraft}
            disabled={drafting}
            className="text-xs font-medium text-brand-dark bg-brand-tint hover:bg-brand/10 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
          >
            {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {drafting ? 'Writing…' : 'AI draft'}
          </button>
        </div>
        <textarea
          value={text}
          maxLength={LIMIT}
          onChange={e => { setText(e.target.value); setResult(null) }}
          placeholder="e.g. This weekend only — buy one banh mi, get a free Vietnamese iced coffee. Dine in or takeout!"
          rows={5}
          className="w-full text-sm p-3 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
        />
        <div className="flex items-center justify-between text-xs text-ink-4">
          <span>{text.length}/{LIMIT}</span>
        </div>

        {/* Photo */}
        {pickedImg ? (
          <div className="relative inline-block">
            <img src={pickedImg.file_url} alt="" className="h-24 w-24 object-cover rounded-lg border border-ink-6" />
            <button onClick={() => setPicked(null)}
              className="absolute -top-2 -right-2 bg-white border border-ink-6 rounded-full p-1 shadow-sm">
              <X className="w-3 h-3 text-ink-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowPicker(s => !s)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 border border-ink-6 rounded-lg px-3 py-2 hover:border-brand/40 transition-colors">
            <ImagePlus className="w-3.5 h-3.5" /> Add a photo {images.length > 0 ? `(${images.length})` : ''}
          </button>
        )}
        {showPicker && !pickedImg && (
          images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map(img => (
                <button key={img.id} onClick={() => { setPicked(img.id); setShowPicker(false) }}
                  className="flex-shrink-0 h-20 w-20 rounded-lg overflow-hidden border border-ink-6 hover:border-brand">
                  <img src={img.file_url} alt={img.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-4">No photos in your asset library yet. You can post text only, or upload photos under Brand &amp; Assets.</p>
          )
        )}

        {/* Button (call to action) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-ink-4">Button:</span>
          <select
            value={ctaType}
            onChange={e => { setCtaType(e.target.value); setResult(null) }}
            className="text-sm border border-ink-6 rounded-lg px-2 py-1.5 bg-white"
          >
            {CTAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {ctaMeta?.needsUrl && (
            <input
              value={ctaUrl}
              onChange={e => setCtaUrl(e.target.value)}
              placeholder="https://link-for-the-button.com"
              className="flex-1 min-w-[180px] text-sm px-3 py-1.5 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          )}
        </div>

        {result && (
          <p className={'text-sm flex items-center gap-1.5 ' + (result.ok ? 'text-green-600' : 'text-red-500')}>
            {result.ok && <Check className="w-4 h-4" />}{result.text}
            {result.ok && result.url && (
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-dark hover:underline">
                view <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-ink-4">Goes live on your Google listing. Google can take a little while to show it.</span>
          <button
            onClick={publish}
            disabled={posting || !text.trim()}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {posting ? 'Posting…' : 'Post to Google'}
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-4 leading-relaxed">
        Tip: posts with a clear offer and a photo get the most clicks. Keep it short, lead with the deal, and add an end date.
      </p>
    </div>
  )
}
