'use client'
/**
 * THE REQUEST SHEET (owner 2026-09-17, "build it anyway"): one shape for the six creative tiles.
 * ============================================================================================
 *   1 for     What is it for? If it is news, it hands to Announce, where the picture is one line
 *             of a bigger plan. Otherwise the answer fills the desk's first question.
 *   2 tell    The desk's own questions for the type, and the photos they have.
 *   3 level   The tier or the level, priced from the same sheets the desk charges, with the one
 *             we recommend and why: their usual, their brand file, their first order. The due
 *             date from the real turnaround.
 *   4 plan    Brief, first draft, you approve, delivered, then the send-off. Make it happen.
 * The order lands through the one function the desk uses. Website and branding are quotes.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, Loader2, X, Plus } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import type { AnnounceKind } from './announce-sheet'

export type RequestType = 'graphic' | 'video' | 'photos' | 'print' | 'logo' | 'website'
type Step = 'for' | 'tell' | 'level' | 'plan' | 'done'
interface Q { key: string; label: string; kind: 'text' | 'long' | 'choice'; multi?: boolean; options?: string[]; hint?: string; optional?: boolean }
interface Def { label: string; scene: Scene; hue: string; forQ: string; fors: { label: string; value?: string; announce?: AnnounceKind }[]; qs: Q[]; photos: boolean; turn: string }
interface Ctx { name: string; brandFile: boolean; brandFiles: number; usualTier: number | null; photosOnFile: number; hasSite: boolean; lastOrder: { id: string; status: string; at: string; cents: number | null } | null; turnaround: { min: number; max: number; shoot: boolean }; dueDefault: string; prices: Record<string, number | null | boolean> | null }
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: string; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

const DEST = ['Instagram post', 'Instagram Story', 'Facebook post', 'Google listing', 'Printed flyer', 'Menu board', 'Table tent', 'Poster', 'Banner']
const DEFS: Record<RequestType, Def> = {
  graphic: { label: 'A graphic', scene: 'graphic', hue: '#d99a1e', forQ: 'What is it for?', turn: 'graphic',
    fors: [{ label: 'A deal', announce: 'deal' }, { label: 'An event', announce: 'event' }, { label: 'A new dish', announce: 'dish' }, { label: 'Hours or news', announce: 'else' }, { label: 'A post', value: 'A post' }, { label: 'The menu', value: 'The menu' }, { label: 'Something else' }],
    qs: [{ key: 'what', label: 'What should it say or show?', kind: 'text', hint: 'Taco Tuesday, the new patio, our hours' }, { key: 'where', label: 'Where will it go?', kind: 'choice', multi: true, options: DEST }, { key: 'words', label: 'Words that must be on it', kind: 'long', optional: true, hint: 'The deal, the date, the phone number' }], photos: true },
  video: { label: 'A video', scene: 'reel', hue: '#0f97a8', forQ: 'What should it show?', turn: 'video-single',
    fors: [{ label: 'A dish', value: 'A dish' }, { label: 'The place', value: 'The place' }, { label: 'The team', value: 'The team' }, { label: 'An event', announce: 'event' }, { label: 'A new dish', announce: 'dish' }, { label: 'Something else' }],
    qs: [{ key: 'what', label: 'Tell us the shot', kind: 'text', hint: 'The cheese pull, the pour, the line out the door' }, { key: 'filming', label: 'How do we get the footage?', kind: 'choice', options: ['Come film at my place', 'Use clips and photos I have', 'Not sure'] }, { key: 'count', label: 'How many videos?', kind: 'choice', options: ['Just 1', '3 to 5', 'A monthly batch'] }, { key: 'featuring', label: 'Featuring, from your menu', kind: 'text', optional: true, hint: 'The dishes it should star' }], photos: true },
  photos: { label: 'Photos', scene: 'photos', hue: '#2e9a78', forQ: 'What should we shoot?', turn: 'photo-library',
    fors: [{ label: 'Food and dishes', value: 'Food and dishes' }, { label: 'The space', value: 'The space' }, { label: 'The team', value: 'The team' }],
    qs: [{ key: 'use', label: 'Where will the photos go?', kind: 'choice', multi: true, options: ['Google and Yelp', 'Social media', 'Website', 'Menus'] }, { key: 'dishes', label: 'Must-have shots', kind: 'long', optional: true, hint: 'The dishes or corners you want covered' }, { key: 'featuring', label: 'Featuring, from your menu', kind: 'text', optional: true }], photos: false },
  print: { label: 'Print', scene: 'print', hue: '#d99a1e', forQ: 'What do you need made?', turn: 'capture-kit',
    fors: [{ label: 'Table tents', value: 'Table tents' }, { label: 'A poster', value: 'A poster' }, { label: 'A window sign', value: 'A window sign' }, { label: 'Loyalty cards', value: 'Loyalty cards' }, { label: 'The menu', value: 'A printed menu' }, { label: 'A deal', announce: 'deal' }, { label: 'Something else' }],
    qs: [{ key: 'what', label: 'Tell us about it', kind: 'text', hint: 'Table tents for the wine list, a banner for the front' }, { key: 'printing', label: 'Should we handle the printing too?', kind: 'choice', options: ['Yes, print and deliver', 'Just the design file', 'Not sure'] }], photos: true },
  logo: { label: 'Branding', scene: 'brand', hue: '#0f97a8', forQ: 'What do you need?', turn: 'brand-kit',
    fors: [{ label: 'A brand new logo', value: 'Brand new logo' }, { label: 'Refresh my logo', value: 'Refresh my logo' }, { label: 'The full brand kit', value: 'Full brand kit' }],
    qs: [{ key: 'feel', label: 'What feel fits your place?', kind: 'choice', options: ['Warm and homey', 'Clean and modern', 'Bold and loud', 'Classic and fancy', 'Fun and playful'] }, { key: 'uses', label: 'Where will it be used most?', kind: 'long', optional: true, hint: 'Sign, menus, cups, social, uniforms' }], photos: true },
  website: { label: 'Website', scene: 'site', hue: '#0f97a8', forQ: 'What do you need?', turn: 'landing-page',
    fors: [{ label: 'A brand new website', value: 'Brand new website' }, { label: 'Redesign my website', value: 'Redesign my website' }, { label: 'Small changes', value: 'Small changes' }, { label: 'Not sure yet', value: 'Not sure yet' }],
    qs: [{ key: 'what', label: 'What should it do?', kind: 'choice', multi: true, options: ['Show the menu', 'Take orders online', 'Take reservations', 'Tell our story'] }, { key: 'current', label: 'Your current website, if you have one', kind: 'text', optional: true, hint: 'yourplace.com' }], photos: false },
}
/* where the first pick lands: a catalog answer where it IS the answer, else a prefix on what they type */
const FOR_KEY: Record<RequestType, string> = { graphic: 'for', video: 'for', photos: 'what', print: 'for', logo: 'scope', website: 'scope' }
const TIERS: { id: 1 | 2 | 3; label: string; small: string }[] = [{ id: 1, label: 'Simple', small: 'One concept, one round of changes' }, { id: 2, label: 'Standard', small: 'Two concepts, two rounds' }, { id: 3, label: 'The works', small: 'Three concepts, three rounds, the source file is yours' }]
const LEVELS: Record<string, { standard: string; works: string }> = {
  video: { standard: 'Shot or cut as picked, one to two revisions', works: 'A planned shoot with a shot list, a pro edit with titles and motion, a senior editor' },
  photos: { standard: 'One visit, edited photos in your library', works: 'A senior photographer, styled food with props, 40 photos plus social crops' },
  print: { standard: 'One piece, print ready, one revision', works: 'A senior designer, two concepts, an on-wall preview, two revisions' },
  logo: { standard: 'As picked', works: 'As picked' }, website: { standard: 'As picked', works: 'As picked' },
}
const dollars = (c: number | null | undefined | boolean) => (typeof c === 'number' ? `$${Math.round(c / 100).toLocaleString()}` : '')
const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const todayIso = () => new Date().toISOString().slice(0, 10)
const addBiz = (n: number) => { const d = new Date(); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1 } return d.toISOString().slice(0, 10) }

export default function RequestSheet({ clientId, type, onClose, onAnnounce }: { clientId: string; type: RequestType; onClose: () => void; onAnnounce: (kind: AnnounceKind) => void }) {
  const def = DEFS[type]
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => {
    const y = window.scrollY; const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }
    b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden'
    return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y) }
  }, [])
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    const v = window.visualViewport
    const read = () => setVv(v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null)
    read(); v?.addEventListener('resize', read); v?.addEventListener('scroll', read)
    return () => { v?.removeEventListener('resize', read); v?.removeEventListener('scroll', read) }
  }, [])

  const [step, setStep] = useState<Step>('for')
  const [a, setA] = useState<Record<string, string>>({})
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [media, setMedia] = useState<{ url: string; preview: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [tier, setTier] = useState<1 | 2 | 3>(2)
  const [level, setLevel] = useState<'standard' | 'works'>('standard')
  const [due, setDue] = useState('')
  const [dueTouched, setDueTouched] = useState(false)
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: Line[]; needsPayment: boolean; requestId: string; cost: number | null } | null>(null)

  const loadCtx = (answers: Record<string, string>) => {
    const qs = new URLSearchParams({ clientId, type })
    for (const [k, v] of Object.entries(answers)) if (v) qs.set(`a.${k}`, v)
    if (media.length) qs.set('a._photos', 'own')
    return fetch(`/api/dashboard/request-plan?${qs}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j: Ctx | null) => { if (j) { setCtx(j); if (!dueTouched) setDue(j.dueDefault); if (j.usualTier === 1 || j.usualTier === 2 || j.usualTier === 3) setTier(j.usualTier as 1 | 2 | 3) } }).catch(() => {})
  }
  useEffect(() => { loadCtx({}) }, [clientId, type]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 'level') loadCtx(outAnswers()) }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickFor = (f: Def['fors'][number]) => {
    if (f.announce) { onAnnounce(f.announce); return }
    setA((x) => { const n = { ...x }; if (f.value) n[FOR_KEY[type]] = f.value; else delete n[FOR_KEY[type]]; return n })
    setStep('tell')
  }
  const toggleMulti = (key: string, opt: string) => setA((x) => { const cur = (x[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean); const n = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]; return { ...x, [key]: n.join(', ') } })
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true); setErr(null)
    try {
      for (const file of Array.from(files).slice(0, 10 - media.length)) {
        const r = await fetch('/api/dashboard/social-publish/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, filename: file.name, contentType: file.type, size: file.size }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.uploadUrl) throw new Error(j.error || 'Could not add the file')
        const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('Could not add the file')
        setMedia((m) => [...m, { url: j.fileUrl, preview: URL.createObjectURL(file), name: file.name }])
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the file') }
    setUploading(false)
  }
  const required = def.qs.filter((q) => !q.optional && q.key !== FOR_KEY[type])
  const ready = required.every((q) => (a[q.key] ?? '').trim())
  /* the answers the desk validates: the category pick rides in front of what they typed */
  const outAnswers = (): Record<string, string> => { const { for: f, ...rest } = a; const out: Record<string, string> = { ...rest }; if (f && out.what) out.what = `${f}: ${out.what}`; else if (f && !out.what) out.what = f; return out }
  const isGraphic = type === 'graphic'
  const price = useMemo((): number | null => { const p = ctx?.prices; if (!p) return null; if (isGraphic) { const v = p[String(tier)]; return typeof v === 'number' ? v : null } const v = p[level]; return typeof v === 'number' ? v : null }, [ctx, tier, level, isGraphic])
  const startsAt = !!ctx?.prices?.startsAt
  const recWhy = (): string => {
    if (!ctx) return ''
    if (isGraphic) return ctx.usualTier ? `Your usual tier. ${ctx.brandFile ? 'Your brand file is on hand, so it matches the rest' : 'No brand file on hand yet, so send a photo of anything you have'}.` : `Standard is right for a first order: two concepts, two rounds. ${ctx.brandFile ? 'Your brand file is on hand' : 'No brand file yet, so send what you have'}.`
    if (type === 'photos') return ctx.photosOnFile < 10 ? `${ctx.photosOnFile} photos on file. The first shoot is the one that feeds every post for a year, so the works pays back` : `${ctx.photosOnFile} photos on file already. One focused visit fills the gaps`
    if (type === 'video') return a.filming === 'Use clips and photos I have' ? 'Cut from what you have, so Standard is the honest choice' : 'A filming visit makes the difference; the works plans the shots before we come'
    return ctx.lastOrder ? `Your last one was ${niceDate(ctx.lastOrder.at)}. Same level unless you want more` : 'Standard for a first one. The works when it has to last'
  }
  const dueWhy = ctx ? `${ctx.turnaround.min} to ${ctx.turnaround.max} business days is what this takes${ctx.turnaround.shoot ? ', after a shoot day we pick with you' : ''}. Earlier is a rush and costs more.` : ''
  const preview = useMemo((): Line[] => {
    if (!ctx) return []
    const L: Line[] = []
    const priced = type !== 'logo' && type !== 'website'
    const paysFirst = priced && !isGraphic
    const line = (key: string, label: string, detail: string, date: string | null, cost: number | null = null, status = 'later', why?: string) => L.push({ key, label, detail, date, cost, status, ref: null, why })
    line('brief', paysFirst ? 'The brief is in. Pay to start' : priced ? 'The brief is in, the work starts' : 'The brief is in, the team quotes it', paysFirst ? 'The team takes it the moment the card clears' : priced ? 'Your Apnosh creative team has it' : 'A number agreed in your thread within a business day', todayIso(), priced ? price : null, paysFirst ? 'needs_payment' : 'with_team', startsAt ? 'The price shown is the floor. The final number is agreed before work starts' : undefined)
    if (ctx.turnaround.shoot) line('shootday', 'The shoot day', 'We pick it with you in the thread. Five to ten days out is usual', null)
    line('draft', type === 'website' ? 'The first pages' : type === 'logo' ? 'The first concepts' : 'The first draft', isGraphic ? `${tier === 1 ? 'One concept' : tier === 3 ? 'Three concepts' : 'Two concepts'} to pick from` : level === 'works' ? 'The works: more concepts, a senior hand' : 'One direction, done well', ctx.turnaround.shoot ? null : addBiz(Math.max(1, ctx.turnaround.min - 1)))
    line('approve', 'You approve it', `${tier === 1 || (!isGraphic && level === 'standard') ? 'One round' : 'Two rounds'} of changes included`, null, null, 'later', 'Nothing ships until you say so')
    line('delivered', 'Delivered', type === 'photos' ? 'Every file in your Photos and files' : type === 'video' ? 'The cut, in your Photos and files' : type === 'website' ? 'Live on your address' : type === 'logo' ? 'The files, for print and web' : 'The files, ready to use', due || ctx.dueDefault, null, 'later', dueTouched ? undefined : dueWhy)
    if (isGraphic || type === 'video' || type === 'photos') line('sendoff', 'Then post it', 'Approve it and it goes out through the send-off, with the words written', due || ctx.dueDefault, null, 'later', 'A picture nobody sees did not happen')
    if (type === 'print') line('printing', 'Printing and shipping', a.printing === 'Just the design file' ? 'Not this time, you asked for the file' : 'The team quotes the run in the thread', null)
    return L
  }, [ctx, type, isGraphic, tier, level, price, startsAt, due, dueTouched, a.printing, dueWhy])

  const commit = async () => {
    if (posting) return
    setPosting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/request-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, type, answers: outAnswers(), level, tier, dueDate: due || undefined, attachments: media.map((m) => ({ url: m.url, name: m.name })), whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send it')
      setResult({ plan: Array.isArray(j.plan) ? j.plan : [], needsPayment: !!j.needsPayment, requestId: String(j.requestId), cost: typeof j.cost === 'number' ? j.cost : null })
      setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send it') }
    setPosting(false)
  }

  if (!mounted) return null
  const hue = def.hue
  const hv = { ['--c1' as string]: hue, ['--c2' as string]: hue } as React.CSSProperties
  const input: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, color: C.ink, background: '#fff', font: 'inherit', boxSizing: 'border-box', outline: 'none' }
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const cta: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const why: React.CSSProperties = { fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }
  const steps: Step[] = ['for', 'tell', 'level', 'plan']
  const back = () => { const i = steps.indexOf(step); if (i <= 0) onClose(); else setStep(steps[i - 1]) }
  const Line_ = ({ l }: { l: Line }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : 'Soon'}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}{l.ref?.href && l.status === 'needs_payment' && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Pay to start</a>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{startsAt && l.key === 'brief' ? 'from ' : ''}{dollars(l.cost)}</b>}
    </div>
  )
  const photoStrip = def.photos && (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Send what you have<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span></div>
      <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{ctx && ctx.photosOnFile > 0 ? `${ctx.photosOnFile} photos already on file with us. Add anything newer.` : 'Phone photos are fine. Your logo, a menu, the room.'}</div>
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,application/pdf" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 8 }}>
        {media.map((m, i) => <div key={i} style={{ position: 'relative', flex: 'none', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: `center/cover url(${m.preview})`, border: `0.5px solid ${C.line}` }}><button type="button" aria-label="Remove" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={11} /></button></div>)}
        <button type="button" onClick={() => fileRef.current?.click()} style={{ flex: 'none', width: 72, height: 72, borderRadius: 12, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{uploading ? <Loader2 size={16} className="mvp-spin" /> : <Plus size={18} />}</button>
      </div>
    </div>
  )

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label={def.label} style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} onFocusCapture={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250) }} style={{ ...hv, width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step !== 'for' && step !== 'done' ? <button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{step === 'done' ? 'Done' : def.label}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        {step !== 'done' && <div style={{ display: 'flex', gap: 4, margin: '0 0 14px' }}>{steps.map((s) => <i key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: steps.indexOf(s) <= steps.indexOf(step) ? C.ink : C.line }} />)}</div>}

        {step === 'for' && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 72, flex: 'none' }}><Drawing spec={{ scene: def.scene }} name="" rating="" t={(s) => s} /></span>
              <div style={h2}>{def.forQ}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{def.fors.map((f) => <button key={f.label} type="button" onClick={() => pickFor(f)} style={chip(!!f.value && a[FOR_KEY[type]] === f.value)}>{f.label}{f.announce ? ' →' : ''}</button>)}</div>
            <div style={{ fontSize: 12.5, color: C.mute, marginTop: 14, lineHeight: 1.5 }}>{def.fors.some((f) => f.announce) ? 'The arrows are news. They open Announce, where this becomes one line of a bigger plan: the words, the posts, the menus, the team.' : 'Pick one and we ask only what that needs.'}</div>
            {ctx && (ctx.brandFile || ctx.photosOnFile > 0 || ctx.lastOrder) && (
              <div style={{ ...why, marginTop: 14 }}>{[ctx.brandFile ? 'Your brand file is on hand' : '', ctx.photosOnFile > 0 ? `${ctx.photosOnFile} photos on file` : '', ctx.lastOrder ? `Last ${def.label.toLowerCase()} ${niceDate(ctx.lastOrder.at)}` : ''].filter(Boolean).join(' · ')}. We start from there.</div>
            )}
          </>
        )}

        {step === 'tell' && (
          <>
            <div style={h2}>Tell us about it</div>
            {a.for && <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 2 }}>{a.for}</div>}
            {def.qs.filter((q) => q.key !== FOR_KEY[type] || !a[q.key]).map((q) => (
              <div key={q.key} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{q.label}{q.optional && <span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span>}</div>
                {q.kind === 'choice' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{(q.options ?? []).map((o) => { const cur = (a[q.key] ?? '').split(',').map((s) => s.trim()); const on = q.multi ? cur.includes(o) : a[q.key] === o
                    return <button key={o} type="button" onClick={() => (q.multi ? toggleMulti(q.key, o) : setA((x) => ({ ...x, [q.key]: o })))} style={chip(on)}>{o}</button> })}</div>
                ) : q.kind === 'long' ? <textarea rows={3} value={a[q.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [q.key]: e.target.value }))} placeholder={q.hint} style={{ ...input, resize: 'none', lineHeight: 1.45 }} />
                  : <input type="text" value={a[q.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [q.key]: e.target.value }))} placeholder={q.hint} style={input} />}
              </div>
            ))}
            {photoStrip}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={() => setStep('level')} disabled={!ready} style={{ ...cta, opacity: ready ? 1 : .5 }}>Next</button>
          </>
        )}

        {step === 'level' && (
          <>
            <div style={h2}>How good, and by when</div>
            {isGraphic ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {TIERS.map((t) => { const on = tier === t.id; const p = ctx?.prices?.[String(t.id)]
                  return <button key={t.id} type="button" onClick={() => setTier(t.id)} style={{ border: `1.5px solid ${on ? C.ink : C.line}`, boxShadow: on ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 16, padding: '12px 8px', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'center' }}><b style={{ display: 'block', fontSize: 14 }}>{t.label}</b><span style={{ display: 'block', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{dollars(p) || '…'}</span><small style={{ display: 'block', color: C.mute, fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>{t.small}</small></button> })}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['standard', 'works'] as const).map((lv) => { const on = level === lv; const p = ctx?.prices?.[lv]
                  return <button key={lv} type="button" onClick={() => setLevel(lv)} style={{ border: `1.5px solid ${on ? C.ink : C.line}`, boxShadow: on ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 16, padding: '12px 10px', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'left' }}><b style={{ display: 'block', fontSize: 14 }}>{lv === 'standard' ? 'Standard' : 'The works'}</b><span style={{ display: 'block', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{startsAt ? 'from ' : ''}{dollars(p) || (type === 'logo' || type === 'website' ? 'Quoted' : '…')}</span><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 4, lineHeight: 1.35 }}>{LEVELS[type]?.[lv]}</small></button> })}
              </div>
            )}
            <div style={why}>{recWhy()}</div>
            <div style={h3}>By when</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Delivered by</span>
              <input type="date" min={todayIso()} value={due} onChange={(e) => { setDue(e.target.value); setDueTouched(true) }} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} />
            </div>
            {!dueTouched && <div style={why}>{dueWhy}</div>}
            {dueTouched && ctx && due && due < addBiz(ctx.turnaround.min) && <div style={{ fontSize: 12, color: '#8a5a0c', fontWeight: 600, marginTop: 8 }}>That is sooner than this usually takes. It becomes a rush, and rushes cost more; the team confirms in the thread.</div>}
            <button type="button" onClick={() => setStep('plan')} style={cta}>Next</button>
          </>
        )}

        {step === 'plan' && (
          <>
            <div style={h2}>Here is the plan</div>
            <div>{preview.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {price != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>Total</span><span>{startsAt ? 'from ' : ''}{dollars(price)}</span></div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={commit} disabled={posting} style={{ ...cta, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Sending' : type === 'logo' || type === 'website' ? 'Ask for the quote' : isGraphic ? 'Start it' : 'Order it'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>{isGraphic ? 'Billed by the team when it is done. Nothing ships until you approve it.' : type === 'logo' || type === 'website' ? 'No charge until a number is agreed in your thread.' : 'Paid before it starts. Nothing ships until you approve it.'}</div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
              <div style={{ ...h2, marginTop: 12 }}>{result.needsPayment ? 'Saved. Pay to start it' : 'It is with the team'}</div>
            </div>
            <div>{result.plan.map((l) => <Line_ key={l.key} l={l} />)}</div>
            {result.needsPayment && <a href={`/dashboard/requests/${result.requestId}`} style={{ ...cta, textDecoration: 'none' }}>Pay {dollars(result.cost)} and start</a>}
            <button type="button" onClick={onClose} style={{ ...cta, ...(result.needsPayment ? { background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` } : {}) }}>Done</button>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 10 }}>It is on Coming up, and in your thread.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
