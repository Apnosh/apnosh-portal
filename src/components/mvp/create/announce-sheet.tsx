'use client'
/**
 * ANNOUNCE SOMETHING (owner 2026-09-16): a popup, three screens.
 * ================================================================
 *   1. What is the news? Eight kinds, drawn, most common first.
 *   2. Two or three questions, only what that kind needs, plus where it goes and when.
 *   3. The words, written for each place, shown as the post will look. Change them, then post.
 *
 * Posting goes through the rails the composer already uses: social-publish for the social
 * accounts (now or scheduled), gbp-post for the Google post (now only, that rail has no
 * schedule). A photo is optional; Instagram needs one, so its chip says so until there is one.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import { BrandOrMark } from '../mvp-insights'

export type AnnounceKind = 'dish' | 'hours' | 'deal' | 'event' | 'hiring' | 'open' | 'holiday' | 'else'
interface Field { key: string; label: string; hint?: string; optional?: boolean; kind?: 'text' | 'date' | 'long' }
interface KindDef { id: AnnounceKind; label: string; scene: Scene; hue: string; fields: Field[]; photo?: boolean }

const KINDS: KindDef[] = [
  { id: 'dish', label: 'New dish', scene: 'dish', hue: '#2e9a78', photo: true, fields: [
    { key: 'what', label: 'What is it called?', hint: 'Pork belly bánh mì' },
    { key: 'line', label: 'One line about it', hint: 'Slow-roasted, on a house baguette', optional: true },
    { key: 'price', label: 'Price', hint: '$14', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
  ] },
  { id: 'hours', label: 'Hours changed', scene: 'hours', hue: '#3d8ed8', fields: [
    { key: 'what', label: 'What is changing?', hint: 'Closed Thanksgiving Day, or open till 10 on Fridays' },
    { key: 'line', label: 'Anything else?', hint: 'Back to normal on Saturday', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
  ] },
  { id: 'deal', label: 'A deal', scene: 'offer', hue: '#dd9a1c', photo: true, fields: [
    { key: 'what', label: 'What is the deal?', hint: 'Half-price boba with any sando' },
    { key: 'when', label: 'When does it run?', hint: 'Tuesdays, 4 to 6' },
    { key: 'line', label: 'Any fine print?', hint: 'Dine in only', optional: true },
  ] },
  { id: 'event', label: 'An event', scene: 'event', hue: '#dd9a1c', photo: true, fields: [
    { key: 'what', label: 'What is happening?', hint: 'Trivia night' },
    { key: 'when', label: 'What day?', kind: 'date' },
    { key: 'time', label: 'What time?', hint: '7 pm' },
    { key: 'line', label: 'One line about it', hint: 'Teams of four, winner eats free', optional: true },
  ] },
  { id: 'hiring', label: 'Now hiring', scene: 'hiring', hue: '#7a5fd6', fields: [
    { key: 'what', label: 'What role?', hint: 'Line cook, weekends' },
    { key: 'line', label: 'One line about it', hint: 'Full time, starts at $22', optional: true },
    { key: 'how', label: 'How do they apply?', hint: 'Come in and ask for Ana', optional: true },
  ] },
  { id: 'open', label: 'Now open', scene: 'open', hue: '#2e9a78', photo: true, fields: [
    { key: 'what', label: 'What is the news?', hint: 'Grand opening, back open, a new location, now on DoorDash' },
    { key: 'from', label: 'From when', kind: 'date' },
    { key: 'line', label: 'One line about it', hint: 'First 50 guests get a free drink', optional: true },
  ] },
  { id: 'holiday', label: 'Holiday', scene: 'holiday', hue: '#dd9a1c', photo: true, fields: [
    { key: 'what', label: 'Which holiday?', hint: 'Thanksgiving' },
    { key: 'line', label: 'What are you doing?', hint: 'Pre-orders for pies, open till 2 on the day' },
  ] },
  { id: 'else', label: 'Something else', scene: 'else', hue: '#6e6e73', photo: true, fields: [
    { key: 'what', label: 'What is the news?', kind: 'long', hint: 'We hit 100 reviews. Thank you.' },
  ] },
]

interface Target { accountId: string; platform: string; name: string }
type Step = 'kind' | 'ask' | 'words'

function hexa(h: string, a: number) { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})` }
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const niceDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
const PLAT: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }

export default function AnnounceSheet({ clientId, onClose, hasGoogle = true }: { clientId: string; onClose: () => void; /** whether the client has a Google listing to post to */ hasGoogle?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const [step, setStep] = useState<Step>('kind')
  const [kind, setKind] = useState<KindDef | null>(null)
  const [a, setA] = useState<Record<string, string>>({})
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [google, setGoogle] = useState(hasGoogle)
  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [when, setWhen] = useState<'now' | 'at'>('now')
  const [at, setAt] = useState('')
  const [writing, setWriting] = useState(false)
  const [social, setSocial] = useState('')
  const [gtext, setGtext] = useState('')
  const [posting, setPosting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  /* the accounts a post can go to, the same list the composer reads */
  useEffect(() => {
    let live = true
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    fetch(`/api/dashboard/social-publish?clientId=${clientId}&tz=${encodeURIComponent(tz)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { targets?: Target[] } | null) => {
        if (!live) return
        const t = (j?.targets ?? []).filter((x) => x && x.accountId && x.platform)
        setTargets(t)
        /* on by default: Instagram and Facebook, the two every restaurant means by "post it" */
        setChosen(new Set(t.filter((x) => x.platform === 'instagram' || x.platform === 'facebook').map((x) => x.accountId)))
      })
      .catch(() => { if (live) setTargets([]) })
    return () => { live = false }
  }, [clientId])

  const pick = (k: KindDef) => { setKind(k); setA(k.fields.some((f) => f.kind === 'date') ? { [k.fields.find((f) => f.kind === 'date')!.key]: todayIso() } : {}); setStep('ask') }
  const required = kind ? kind.fields.filter((f) => !f.optional) : []
  const ready = required.every((f) => (a[f.key] ?? '').trim())
  const igChosen = useMemo(() => (targets ?? []).some((t) => t.platform === 'instagram' && chosen.has(t.accountId)), [targets, chosen])
  const channels = useMemo(() => { const s: string[] = []; if (google) s.push('google'); for (const t of targets ?? []) if (chosen.has(t.accountId) && !s.includes(t.platform)) s.push(t.platform); return s }, [google, targets, chosen])

  const upload = async (file: File) => {
    setUploading(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/social-publish/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, filename: file.name, contentType: file.type, size: file.size }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.uploadUrl) throw new Error(j.error || 'Could not add the photo')
      const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) throw new Error('Could not add the photo')
      setPhoto({ url: j.fileUrl, preview: URL.createObjectURL(file) })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the photo') }
    setUploading(false)
  }

  const write = async () => {
    if (!kind) return
    setWriting(true); setErr(null)
    try {
      const facts: Record<string, string> = { ...a }
      for (const f of kind.fields) if (f.kind === 'date' && facts[f.key]) facts[f.key] = niceDate(facts[f.key])
      const r = await fetch('/api/dashboard/announce-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: kind.id, answers: facts, channels }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not write it')
      setSocial(String(j.social ?? '')); setGtext(String(j.google ?? ''))
      setStep('words')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not write it') }
    setWriting(false)
  }

  const post = async () => {
    if (posting) return
    setPosting(true); setErr(null)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    const w = when === 'now' || !at ? { kind: 'now' } : { kind: 'at', iso: new Date(at).toISOString(), timezone: tz }
    const went: string[] = []
    try {
      const ids = [...chosen]
      if (ids.length && social.trim()) {
        const r = await fetch('/api/dashboard/social-publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, content: social.trim(), accountIds: ids, mediaUrls: photo ? [photo.url] : [], when: w }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Could not post it')
        went.push(...channels.filter((c) => c !== 'google').map((c) => PLAT[c] ?? c))
      }
      if (google && gtext.trim() && w.kind === 'now') {
        const r = await fetch('/api/dashboard/gbp-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, text: gtext.trim() }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Google did not take the post')
        went.push('Google')
      }
      setDone(w.kind === 'now' ? `Posted to ${went.join(', ') || 'nowhere yet'}.` : `Scheduled for ${new Date(at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} on ${went.join(', ')}.${google && gtext.trim() ? ' Google posts go out right away, so that one waits for you to post now.' : ''}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not post it') }
    setPosting(false)
  }

  if (!mounted) return null
  const hue = kind?.hue ?? '#2e9a78'
  const hv = (h: string): React.CSSProperties => ({ ['--c1' as string]: h, ['--c2' as string]: h, ['--t1' as string]: hexa(h, 0.14) } as React.CSSProperties)
  const input: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, color: C.ink, font: 'inherit', background: '#fff', boxSizing: 'border-box', outline: 'none' }
  const chip = (on: boolean, disabled = false): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.mute, opacity: disabled ? .45 : 1, cursor: disabled ? 'default' : 'pointer', font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 })
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const title = step === 'kind' ? 'Announce something' : step === 'ask' ? kind?.label ?? '' : done ? 'Done' : 'Ready to go'

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Announce something" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(0,0,0,.2)', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step !== 'kind' && !done ? <button type="button" onClick={() => setStep(step === 'words' ? 'ask' : 'kind')} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><ArrowLeft size={17} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><X size={16} /></button>
        </div>

        {step === 'kind' && (
          <>
            <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 14px' }}>What is the news?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => pick(k)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, ...hv(k.hue) }}>
                  <span style={{ width: '100%', aspectRatio: '1.25', borderRadius: 22, background: hexa(k.hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, boxSizing: 'border-box' }}><span style={{ width: '72%' }}><Drawing spec={{ scene: k.scene }} name="" rating="" t={(s) => s} /></span></span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{k.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>Pick one. Two questions, then we write it and post it where you choose.</div>
          </>
        )}

        {step === 'ask' && kind && (
          <div style={hv(hue)}>
            {kind.photo && (
              <div style={{ margin: '4px 0 6px' }}>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 150, borderRadius: 20, border: 0, background: photo ? `center/cover url(${photo.preview})` : hexa(hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
                  {!photo && (uploading ? <Loader2 size={22} className="mvp-spin" color={hue} /> : <span style={{ width: 96 }}><Drawing spec={{ scene: 'photos' }} name="" rating="" t={(s) => s} /></span>)}
                </button>
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: hue, marginTop: 6 }}>{photo ? 'Change the photo' : 'Add a photo'}<span style={{ color: C.faint, fontWeight: 500 }}> · optional{igChosen && !photo ? ', Instagram needs one' : ''}</span></div>
              </div>
            )}
            {kind.fields.map((f) => (
              <label key={f.key} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginTop: 12 }}>
                {f.label}{f.optional && <span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span>}
                {f.kind === 'date' ? <input type="date" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} style={input} />
                  : f.kind === 'long' ? <textarea rows={3} value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={{ ...input, resize: 'none', lineHeight: 1.45 }} />
                  : <input type="text" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={input} />}
              </label>
            ))}
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 14 }}>Where should it go?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {hasGoogle && <button type="button" onClick={() => setGoogle((g) => !g)} style={chip(google)}><BrandOrMark provider="google" size={12} /> Google</button>}
              {(targets ?? []).map((t) => { const on = chosen.has(t.accountId); const needs = t.platform === 'instagram' && !photo
                return <button key={t.accountId} type="button" onClick={() => setChosen((c) => { const n = new Set(c); if (n.has(t.accountId)) n.delete(t.accountId); else n.add(t.accountId); return n })} style={chip(on)} title={needs ? 'Instagram needs a photo' : undefined}><BrandOrMark provider={t.platform} size={12} /> {PLAT[t.platform] ?? t.platform}</button> })}
              {targets && targets.length === 0 && !hasGoogle && <span style={{ fontSize: 12.5, color: C.mute }}>Connect Instagram, Facebook or Google to post.</span>}
            </div>
            {igChosen && !photo && <div style={{ fontSize: 12, color: '#8a5a0c', marginTop: 8 }}>Instagram needs a photo. Add one above, or it goes out everywhere else.</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={write} disabled={!ready || writing || channels.length === 0} style={{ ...cta, opacity: !ready || channels.length === 0 ? .5 : 1 }}>{writing ? <Loader2 size={16} className="mvp-spin" /> : null} {writing ? 'Writing' : 'Write it for me'}</button>
          </div>
        )}

        {step === 'words' && kind && (
          <div style={hv(hue)}>
            {done ? (
              <div style={{ padding: '22px 4px 8px', textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
                <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5, marginTop: 14 }}>{done}</div>
                <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>It is on Coming up.</div>
                <button type="button" onClick={onClose} style={cta}>Done</button>
              </div>
            ) : (
              <>
                {chosen.size > 0 && (
                  <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 12.5, fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex' }}>{channels.filter((c) => c !== 'google').map((p, i) => <span key={p} style={{ marginLeft: i ? -6 : 0, width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={p} size={12} /></span>)}</span>
                      {channels.filter((c) => c !== 'google').map((c) => PLAT[c] ?? c).join(', ')}
                    </div>
                    {photo ? <div style={{ height: 170, background: `center/cover url(${photo.preview})` }} /> : <div style={{ height: 110, background: hexa(hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 80 }}><Drawing spec={{ scene: kind.scene }} name="" rating="" t={(s) => s} /></span></div>}
                    <textarea value={social} onChange={(e) => setSocial(e.target.value)} rows={4} style={{ display: 'block', width: '100%', border: 0, outline: 0, resize: 'none', padding: '10px 12px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box' }} />
                  </div>
                )}
                {google && gtext && (
                  <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 12.5, fontWeight: 600 }}><BrandOrMark provider="google" size={16} /> Google post</div>
                    <textarea value={gtext} onChange={(e) => setGtext(e.target.value.slice(0, 300))} rows={3} style={{ display: 'block', width: '100%', border: 0, outline: 0, resize: 'none', padding: '0 12px 10px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  <button type="button" onClick={() => setWhen('now')} style={{ ...chip(when === 'now'), flex: 1, justifyContent: 'center' }}>Post now</button>
                  <button type="button" onClick={() => setWhen('at')} style={{ ...chip(when === 'at'), flex: 1, justifyContent: 'center' }}>Pick a time</button>
                </div>
                {when === 'at' && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={input} />}
                {when === 'at' && google && gtext && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Google posts cannot be scheduled yet. Post now to include Google.</div>}
                {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
                <button type="button" onClick={post} disabled={posting || (chosen.size === 0 && !(google && gtext)) || (when === 'at' && !at)} style={{ ...cta, opacity: posting || (when === 'at' && !at) ? .6 : 1 }}>
                  {posting ? <Loader2 size={16} className="mvp-spin" /> : null} {when === 'now' ? `Post to ${channels.map((c) => c === 'google' ? 'Google' : PLAT[c] ?? c).join(', ')}` : 'Schedule it'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
