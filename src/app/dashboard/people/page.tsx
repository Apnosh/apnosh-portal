'use client'
/**
 * /dashboard/people — "People you have worked with" (owner 2026-09-05). Delivered work still
 * waiting for a rating on top (stars save through /api/dashboard/work-rating), then favorites
 * (a heart; the next order starts with them), then everyone else. A one-star rating asks if
 * they would rather not work with that person again.
 */
import { useCallback, useEffect, useState } from 'react'
import { Heart, Star, Camera, Video, Image as ImageIcon, PenLine, Users, Loader2 } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'
import { useClient } from '@/lib/client-context'
import { gradOf, hueOf, type HueKey } from '@/components/mvp/hues'

interface Person { id: string; name: string; discipline: string; pieces: number; last: string }
interface ToRate { id: string; title: string; discipline: string; creatorId: string; creatorName: string; deliveredAt: string }

const DISC: Record<string, { hue: HueKey; Icon: typeof Camera; word: string }> = {
  photo: { hue: 'catering', Icon: Camera, word: 'Photos' }, photography: { hue: 'catering', Icon: Camera, word: 'Photos' },
  video: { hue: 'event', Icon: Video, word: 'Video' }, videography: { hue: 'event', Icon: Video, word: 'Video' },
  design: { hue: 'announce', Icon: ImageIcon, word: 'Design' }, graphic: { hue: 'announce', Icon: ImageIcon, word: 'Design' },
  copy: { hue: 'nights', Icon: PenLine, word: 'Words' }, writing: { hue: 'nights', Icon: PenLine, word: 'Words' },
}
const discOf = (d: string) => DISC[(d || '').toLowerCase()] ?? DISC[Object.keys(DISC).find((k) => (d || '').toLowerCase().includes(k)) ?? ''] ?? { hue: 'mint' as HueKey, Icon: Users, word: d || 'Team' }
const when = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
const H = (t: string, hue: HueKey, sub?: string) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '18px 4px 4px' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute }}><span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf(hue) }} />{t}</span>
    {sub && <span style={{ fontSize: 12, color: C.faint }}>{sub}</span>}
  </div>
)

export default function PeoplePage() {
  const { client } = useClient()
  const [people, setPeople] = useState<Person[] | null>(null)
  const [toRate, setToRate] = useState<ToRate[]>([])
  const [favs, setFavs] = useState<string[]>([])
  const [rating, setRating] = useState<{ id: string; stars: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) return
    const r = await fetch(`/api/dashboard/more?clientId=${client.id}`)
    if (!r.ok) { setPeople([]); return }
    const j = await r.json()
    setPeople(j.people ?? []); setToRate(j.toRate ?? []); setFavs(j.settings?.favorites ?? [])
  }, [client?.id])
  useEffect(() => { void load() }, [load])

  const toggleFav = async (id: string) => {
    if (!client?.id) return
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
    setFavs(next)
    await fetch('/api/dashboard/more', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, favorites: next }) }).catch(() => {})
  }
  const sendRating = async (o: ToRate, stars: number) => {
    if (!client?.id || busy) return
    setBusy(o.id); setNote(null)
    try {
      const r = await fetch('/api/dashboard/work-rating', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: o.id, clientId: client.id, stars }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'save failed') }
      setToRate((xs) => xs.filter((x) => x.id !== o.id)); setRating(null)
      setNote(stars === 1 ? `Thanks. We will not send ${o.creatorName.split(' ')[0]} your work again unless you ask.` : stars >= 4 ? `Thanks. Tap the heart to make ${o.creatorName.split(' ')[0]} a favorite.` : 'Thanks, saved.')
    } catch (e) { setNote(e instanceof Error && e.message ? `Could not save: ${e.message}` : 'Could not save. Try again.') }
    setBusy(null)
  }

  const favPeople = (people ?? []).filter((p) => favs.includes(p.id))
  const others = (people ?? []).filter((p) => !favs.includes(p.id))
  const row = (p: Person) => {
    const d = discOf(p.discipline); const fav = favs.includes(p.id)
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', minHeight: 50 }}>
        <span style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: hueOf(d.hue)[1], flexShrink: 0 }}><d.Icon size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>{d.word}{p.pieces ? ` · ${p.pieces} piece${p.pieces === 1 ? '' : 's'}` : ''}</span>
        </span>
        <button type="button" onClick={() => toggleFav(p.id)} aria-pressed={fav} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', color: fav ? '#c92d32' : C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Heart size={20} fill={fav ? '#c92d32' : 'none'} /></button>
      </div>
    )
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="People you have worked with" subtitle="Rate their work. Pick your favorites." />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '4px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {people === null ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 30 }}><Loader2 size={16} className="mvp-spin" /> Loading…</div>
        ) : (
          <>
            {toRate.length > 0 && (
              <>
                {H('Waiting for your rating', 'amber')}
                {toRate.map((o) => {
                  const d = discOf(o.discipline); const open = rating?.id === o.id
                  return (
                    <div key={o.id} style={{ padding: '8px 2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: hueOf(d.hue)[1], flexShrink: 0 }}><d.Icon size={18} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.creatorName.split(' ')[0]} · {o.title}</span>
                          <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1 }}>Delivered {when(o.deliveredAt)}</span>
                        </span>
                        {!open && <button type="button" onClick={() => setRating({ id: o.id, stars: 0 })} style={{ height: 30, padding: '0 12px', borderRadius: 15, border: 'none', background: '#f0f0f2', color: C.ink, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Rate</button>}
                      </div>
                      {open && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0 4px 48px' }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" disabled={busy === o.id} onClick={() => { setRating({ id: o.id, stars: n }); void sendRating(o, n) }} aria-label={`${n} star${n === 1 ? '' : 's'}`} style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', color: n <= (rating?.stars ?? 0) ? '#d99a1e' : C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={22} fill={n <= (rating?.stars ?? 0) ? '#d99a1e' : 'none'} /></button>
                          ))}
                          {busy === o.id && <Loader2 size={16} className="mvp-spin" color={C.faint} />}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
            {note && <div style={{ fontSize: 12.5, color: C.mute, padding: '6px 4px' }}>{note}</div>}

            {H('Favorites', 'catering', favPeople.length ? 'Your next order starts with them' : undefined)}
            {favPeople.length === 0
              ? <div style={{ fontSize: 13, color: C.mute, padding: '6px 4px 4px', lineHeight: 1.5 }}>Tap the heart on anyone below to make them a favorite.</div>
              : favPeople.map(row)}

            {others.length > 0 && (<>{H('Everyone else', 'grey')}{others.map(row)}</>)}

            {people.length === 0 && toRate.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 30px', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}>
                <span style={{ display: 'inline-flex', color: hueOf('catering')[1], marginBottom: 10 }}><Users size={28} /></span>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No one yet</div>
                People show up here after they make something for you.
              </div>
            )}
          </>
        )}
      </div>
    </MvpShell>
  )
}
