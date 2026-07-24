'use client'

/**
 * The creator's case studies (/creator/account/portfolio) — a gallery of past work that shows on
 * their public page as "Selected work". They add a photo with a short caption, mark a few as
 * featured (the store card hero uses those), and remove any. Photos downscale before upload and go
 * to the same vendor-portfolio the public page reads, so what they add here shows up there.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, ImagePlus, Loader2, Star, Trash2, Check } from 'lucide-react'
import { addMyPortfolioItem, updateMyPortfolioItem, deleteMyPortfolioItem, type MyPortfolioItem } from '@/lib/marketplace/creator-store-actions'
import { fileToDownscaledDataUrl, PHOTO_PREP } from '@/lib/marketplace/creator-image'

const GREEN = '#4abd98', GREEN_DK = '#0f6e56', INK = '#1d1d1f', MUTE = '#6e6e73', FAINT = '#aeaeb2', LINE = '#e6e6ea', AMBER = '#d9962a', FONT = 'DM Sans, sans-serif'

export default function CaseStudies({ initial }: { initial: MyPortfolioItem[] }) {
  const [items, setItems] = useState<MyPortfolioItem[]>(initial)
  const [draft, setDraft] = useState<{ dataUrl: string; caption: string; featured: boolean } | null>(null)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, PHOTO_PREP)
      setDraft({ dataUrl, caption: '', featured: false })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not read that photo.')
    }
  }

  async function addDraft() {
    if (!draft) return
    setAdding(true); setErr('')
    const res = await addMyPortfolioItem({ dataUrl: draft.dataUrl, caption: draft.caption, featured: draft.featured })
    setAdding(false)
    if (!res.ok) { setErr(res.error); return }
    setItems((prev) => [res.item, ...prev]); setDraft(null)
  }

  async function toggleFeatured(item: MyPortfolioItem) {
    setBusyId(item.id)
    const next = !item.featured
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, featured: next } : x)))
    const res = await updateMyPortfolioItem({ id: item.id, featured: next })
    setBusyId(null)
    if (!res.ok) { setErr(res.error ?? 'Could not save.'); setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, featured: !next } : x))) }
  }

  async function remove(item: MyPortfolioItem) {
    setBusyId(item.id)
    const res = await deleteMyPortfolioItem(item.id)
    setBusyId(null)
    if (!res.ok) { setErr(res.error ?? 'Could not delete.'); return }
    setItems((prev) => prev.filter((x) => x.id !== item.id))
  }

  return (
    <div style={{ background: '#fafafa', minHeight: '100%', paddingBottom: 40, fontFamily: FONT }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px' }}>
        <div style={{ paddingTop: 14, paddingBottom: 6 }}>
          <Link href="/creator/account" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GREEN_DK, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            <ArrowLeft size={17} /> Account
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 6 }}>Case studies</h1>
        <p style={{ fontSize: 14, color: MUTE, marginTop: 2, marginBottom: 16, lineHeight: 1.5 }}>Photos of your past work. These show on your public page. The starred ones lead your shop.</p>

        <input ref={input} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />

        {err && <div style={{ marginBottom: 12, fontSize: 13, color: '#b3403a', background: '#fdeeee', border: '1px solid #f3c9c6', borderRadius: 10, padding: '8px 11px' }}>{err}</div>}

        {/* draft composer */}
        {draft && (
          <div style={{ marginBottom: 16, border: `1px solid ${LINE}`, borderRadius: 16, padding: 12, background: '#fff', display: 'flex', gap: 12 }}>
            <div style={{ width: 96, height: 96, borderRadius: 12, flexShrink: 0, background: `center/cover no-repeat url("${draft.dataUrl}")` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="Caption (optional), like: Dish shoot for Kai's"
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${LINE}`, padding: '9px 11px', fontSize: 14, color: INK, fontFamily: FONT, outline: 'none' }} />
              <button type="button" onClick={() => setDraft({ ...draft, featured: !draft.featured })}
                style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: draft.featured ? AMBER : MUTE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Star size={14} fill={draft.featured ? AMBER : 'none'} color={draft.featured ? AMBER : MUTE} /> Feature on my shop
              </button>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={addDraft} disabled={adding}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: GREEN, color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}>
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Add
                </button>
                <button type="button" onClick={() => setDraft(null)} disabled={adding}
                  style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', fontSize: 13.5, fontWeight: 600, color: MUTE, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* gallery */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden', background: `center/cover no-repeat url("${item.url}")`, border: `1px solid ${LINE}` }}>
              <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 5 }}>
                <button type="button" onClick={() => toggleFeatured(item)} disabled={busyId === item.id} title={item.featured ? 'Featured' : 'Feature'}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', background: item.featured ? AMBER : 'rgba(255,255,255,0.85)' }}>
                  <Star size={14} fill={item.featured ? '#fff' : 'none'} color={item.featured ? '#fff' : MUTE} />
                </button>
                <button type="button" onClick={() => remove(item)} disabled={busyId === item.id} title="Remove"
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.85)' }}>
                  {busyId === item.id ? <Loader2 size={13} className="animate-spin" color={MUTE} /> : <Trash2 size={13} color="#c0564f" />}
                </button>
              </div>
              {item.caption && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 7px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', color: '#fff', fontSize: 11.5, lineHeight: 1.3 }}>{item.caption}</div>
              )}
            </div>
          ))}

          {/* add tile */}
          <button type="button" onClick={() => input.current?.click()}
            style={{ aspectRatio: '1 / 1', borderRadius: 14, border: `1.5px dashed ${LINE}`, background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <div style={{ textAlign: 'center' }}>
              <Camera size={22} color={MUTE} />
              <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4, fontWeight: 600 }}>Add work</div>
            </div>
          </button>
        </div>

        {items.length === 0 && !draft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: MUTE }}>
            <ImagePlus size={16} color={FAINT} /> Add a few shots of your best work so restaurants trust you.
          </div>
        )}
      </div>
    </div>
  )
}
