'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Loader2, Check, ExternalLink, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

interface AssetImg { id: string; name: string; file_url: string }
const LIMIT = 1500

export default function PostsPage() {
  const supabase = createClient()
  const { client } = useClient()
  const [text, setText] = useState('')
  const [images, setImages] = useState<AssetImg[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null)

  useEffect(() => {
    if (!client?.id) return
    supabase.from('assets').select('id, name, file_url').eq('client_id', client.id).eq('type', 'image')
      .order('created_at', { ascending: false }).limit(40)
      .then(({ data }) => setImages((data ?? []).filter((a): a is AssetImg => !!a.file_url)))
  }, [client?.id, supabase])

  const pickedImg = images.find(i => i.id === picked) ?? null

  async function publish() {
    if (!text.trim()) return
    setPosting(true); setResult(null)
    try {
      const res = await fetch('/api/dashboard/listing/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), imageUrl: pickedImg?.file_url ?? null }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setResult({ ok: false, text: b.error || `Failed (HTTP ${res.status})` }); return }
      setResult({ ok: true, text: 'Posted to Google', url: b.searchUrl })
      setText(''); setPicked(null)
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
