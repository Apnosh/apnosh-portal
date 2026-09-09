'use client'

/**
 * THE COMPOSER — write it, choose where, choose when, send.
 * =========================================================
 * Four owners in the study wanted their content HANDLED rather than measured,
 * and the product could only watch. This is the smallest honest version of
 * handling it.
 *
 * IN THE KIT, NOT BESIDE IT. The first cut of this screen declared its own
 * palette and its own fixed-inset chrome, which is exactly the drift tokens.ts
 * was written to stop: two honest copy-pastes and suddenly there are two
 * versions of "the look". It now draws from the one palette, sits in MvpShell
 * like every other screen the owner clicks into, and uses the same group titles,
 * rows and save bar as the rest of the app.
 *
 * Every remaining decision is about removing a choice the owner has no basis for
 * making. Every connected account is ON, because the common case is everywhere.
 * WHEN is three chips rather than a date picker. And the best-time chip is only
 * offered when it rests on enough posts to be real.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Sparkles, Send, ImagePlus, X, Loader2 } from 'lucide-react'
import MvpShell from './mvp-shell'
import { MvpGroup, MvpSaveBar, MvpEmpty, MvpMsg } from './mvp-detail'
import { BrandOrMark } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, tint, glow } from './hues'
import { CARD_SHADOW } from './kit'

interface Target { accountId: string; platform: string; name: string }
interface Best { iso: string; label: string; posts: number }
interface Media { url: string; preview: string; isVideo: boolean }

/* Platforms that will not accept a post with no photo or video. This is their
   rule, not ours, and it is the reason a text-only composer was not a smaller
   version of this feature but a broken one. */
const NEEDS_MEDIA = new Set(['instagram', 'tiktok', 'youtube'])

export default function MvpComposer({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [best, setBest] = useState<Best | null>(null)
  const [tz, setTz] = useState('America/Los_Angeles')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [when, setWhen] = useState<'now' | 'best' | 'pick'>('now')
  const [pickAt, setPickAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string[] | null>(null)
  const [media, setMedia] = useState<Media | null>(null)
  const [uploading, setUploading] = useState(false)
  /* THE SERVICE MODEL, made a control. The owner can do this themselves or pay to
     have it done, and the same post moves between them, so this is the first
     decision on the screen rather than a link at the bottom. It changes what the
     screen asks for: a handoff is a BRIEF, not a post, so media stops being
     required (staff will shoot or source it) and the accounts become a
     preference rather than an address. */
  const [mode, setMode] = useState<'self' | 'apnosh'>('self')

  useEffect(() => {
    const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles' } catch { return 'America/Los_Angeles' } })()
    setTz(zone)
    let live = true
    fetch(`/api/dashboard/social-publish?clientId=${clientId}&tz=${encodeURIComponent(zone)}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'Could not load your accounts'); return j }))
      .then((j) => {
        if (!live) return
        const t = (j.targets ?? []) as Target[]
        setTargets(t)
        setChosen(new Set(t.map((x) => x.accountId)))
        setBest(j.best ?? null)
      })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : 'Could not load your accounts'); setTargets([]) } })
    return () => { live = false }
  }, [clientId])

  const toggle = useCallback((id: string) => {
    setChosen((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  /* Which of the chosen accounts will refuse this post as it stands. Named, not
     counted: "Instagram needs a photo" is something an owner can act on, and a
     disabled button with no reason is the thing everyone hates. */
  const blocked = useMemo(() => {
    if (mode === 'apnosh' || media || !targets) return [] as string[]
    return targets.filter((t) => chosen.has(t.accountId) && NEEDS_MEDIA.has(t.platform))
      .map((t) => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
  }, [mode, media, targets, chosen])

  const canSend = useMemo(() => {
    if (busy || uploading) return false
    if (mode === 'apnosh') return text.trim().length > 0
    return chosen.size > 0 && blocked.length === 0
      && (text.trim().length > 0 || !!media) && (when !== 'pick' || !!pickAt)
  }, [busy, uploading, mode, chosen, blocked, text, media, when, pickAt])

  async function pickFile(file: File) {
    setErr(null); setUploading(true)
    try {
      const r = await fetch('/api/dashboard/social-publish/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, filename: file.name, contentType: file.type, size: file.size }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not prepare the upload')
      /* Straight from the browser to the signed URL. The file never touches our
         server, so a large video does not have to survive a request there. */
      const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) throw new Error('The upload did not finish. Try again.')
      setMedia({ url: j.fileUrl, preview: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not upload that file')
    } finally { setUploading(false) }
  }

  async function send() {
    if (!canSend) return
    setBusy(true); setErr(null)
    try {
      const w = when === 'now' ? { kind: 'now' }
        : when === 'best' && best ? { kind: 'at', iso: best.iso, timezone: tz }
        : { kind: 'at', iso: new Date(pickAt).toISOString(), timezone: tz }
      const r = await fetch('/api/dashboard/social-publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, content: text.trim(), accountIds: [...chosen], mediaUrls: media ? [media.url] : [], when: w, handoff: mode === 'apnosh' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not publish')
      setDone((j.posted ?? []) as string[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not publish')
    } finally { setBusy(false) }
  }

  /* ── Sent ──────────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <MvpShell active="home" back="/dashboard" title={when === 'now' ? 'Posted' : 'Scheduled'}>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Check size={28} color={C.greenDk} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 7 }}>
            {mode === 'apnosh' ? 'We have got it' : when === 'now' ? 'It is live' : 'It is scheduled'}
          </div>
          <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
            {mode === 'apnosh'
              ? 'Your team will write it up and send it back for your OK before anything goes out.'
              : done.length ? done.join(', ') : 'Your accounts'}
            {mode === 'apnosh' ? '' : when === 'best' && best ? ` · ${best.label}` : when === 'pick' && pickAt ? ` · ${new Date(pickAt).toLocaleString()}` : ''}
          </div>
          <button type="button" onClick={() => router.push('/dashboard/insights/posts')}
            style={{ marginTop: 22, font: 'inherit', fontSize: 14.5, fontWeight: 600, padding: '11px 22px', borderRadius: 99, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer' }}>
            See your posts
          </button>
        </div>
      </MvpShell>
    )
  }

  const chipBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13.5,
    padding: '9px 14px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
  }

  return (
    <MvpShell active="home" back="/dashboard" title="New post">
      <style>{`
        @keyframes cmpspin{to{transform:rotate(360deg)}}
        .mvp-spin{animation:cmpspin .8s linear infinite}
        .cmp-cap{width:100%;border:none;outline:none;resize:none;background:transparent;font-family:inherit}
        .cmp-cap::placeholder{color:${C.faint}}
        .cmp-drop{transition:background .18s ease, border-color .18s ease}
        .cmp-chip{transition:background .16s ease, border-color .16s ease, color .16s ease, transform .12s ease}
        .cmp-chip:active{transform:scale(.97)}
      `}</style>

      <div style={{ padding: '6px 16px 140px' }}>

        {/* Hands-on or hands-off, before anything else, because it changes what
            the rest of the screen is asking for. */}
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 99, background: '#f0f1f0', marginBottom: 14 }}>
          {([['self', 'I will post it'], ['apnosh', 'Apnosh does it']] as [typeof mode, string][]).map(([k, label]) => {
            const on = mode === k
            return (
              <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={on}
                style={{ flex: 1, font: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 500, padding: '9px 0', borderRadius: 99, border: 'none', cursor: 'pointer',
                  color: on ? C.ink : C.mute, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,.10)' : 'none' }}>
                {label}
              </button>
            )
          })}
        </div>
        {mode === 'apnosh' && (
          <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: '0 2px 14px' }}>
            Tell us the idea. Your team writes it, makes the picture if it needs one, and sends it back for your OK before anything goes out. Managed posting is charged on your plan.
          </div>
        )}

        {/* ── THE POST ITSELF ──────────────────────────────────────────────
            Not a form with a preview beside it: the thing on screen IS the post.
            The owner is looking at what they are making, which is the difference
            between filling in fields and writing something. */}
        <div style={{ background: '#fff', borderRadius: 22, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>

          {/* who it goes out as */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 11px' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: gradOf('mint'), boxShadow: glow('mint', .3), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {(targets?.[0]?.name ?? 'A').trim().charAt(0).toUpperCase()}
              </span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>
                {targets === null ? 'Loading…' : chosen.size === 0 ? 'Nowhere yet'
                  : chosen.size === 1 ? (targets.find((t) => chosen.has(t.accountId))?.name ?? 'One account')
                  : `${chosen.size} accounts`}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 1 }}>
                {when === 'now' ? 'Posting now' : when === 'best' && best ? best.label : pickAt ? new Date(pickAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Scheduled'}
              </span>
            </span>
            {/* the marks of everywhere it lands, on the post itself */}
            <span style={{ display: 'flex', alignItems: 'center', gap: -4, flexShrink: 0 }}>
              {(targets ?? []).filter((t) => chosen.has(t.accountId)).slice(0, 5).map((t, i) => (
                <span key={t.accountId} style={{ marginLeft: i ? -6 : 0, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BrandOrMark provider={t.platform} size={14} />
                </span>
              ))}
            </span>
          </div>

          {/* the picture */}
          {media ? (
            <div style={{ position: 'relative', background: '#0d0d0f' }}>
              {media.isVideo
                ? <video src={media.preview} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 400, objectFit: 'contain' }} />
                : <img src={media.preview} alt="" style={{ display: 'block', width: '100%', maxHeight: 400, objectFit: 'contain' }} />}
              <button type="button" onClick={() => setMedia(null)} aria-label="Remove photo"
                style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="cmp-drop" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9,
              minHeight: 178, cursor: uploading ? 'default' : 'pointer',
              background: `linear-gradient(160deg, ${tint('mint', .10)}, ${tint('brand', .10)})`,
              borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
            }}>
              <span style={{ width: 46, height: 46, borderRadius: '50%', background: uploading ? 'transparent' : gradOf('mint'), boxShadow: uploading ? 'none' : glow('mint', .32), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                {uploading ? <Loader2 size={22} className="mvp-spin" color={C.greenDk} /> : <ImagePlus size={21} />}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                {uploading ? 'Uploading…' : mode === 'apnosh' ? 'Add a photo, or leave it to us' : 'Add a photo or video'}
              </span>
              {!uploading && <span style={{ fontSize: 11.5, color: C.mute }}>{mode === 'apnosh' ? 'Optional' : 'Instagram and TikTok need one'}</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = '' }}
                style={{ display: 'none' }} />
            </label>
          )}

          {/* the words, written straight onto the post */}
          <div style={{ padding: '13px 15px 15px' }}>
            <textarea
              className="cmp-cap"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={media ? 3 : 5}
              maxLength={2200}
              placeholder={mode === 'apnosh' ? 'What do you want this post to be about?' : 'Write it the way you would say it…'}
              style={{ fontSize: 15.5, lineHeight: 1.55, color: C.ink, minHeight: 62 }}
            />
            {text.length > 1800 && (
              <div style={{ fontSize: 11.5, color: text.length > 2100 ? C.coral : C.faint, textAlign: 'right' }}>
                {2200 - text.length} left
              </div>
            )}
          </div>
        </div>

        {/* ── WHERE ───────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 9px' }}>{mode === 'apnosh' ? 'Where you would like it' : 'Where it goes'}</div>
        {targets === null ? (
          <div style={{ fontSize: 13.5, color: C.faint, padding: '2px' }}>Loading your accounts…</div>
        ) : targets.length === 0 ? (
          <MvpEmpty text="No accounts are connected yet, so there is nowhere to post. Connect one under More, then come back." />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {targets.map((t) => {
              const on = chosen.has(t.accountId)
              return (
                <button key={t.accountId} type="button" onClick={() => toggle(t.accountId)} aria-pressed={on} className="cmp-chip"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 13.5,
                    fontWeight: on ? 600 : 500, padding: '9px 14px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
                    color: on ? C.ink : C.mute, background: on ? '#fff' : '#fff',
                    border: `1px solid ${on ? C.green : C.line}`,
                    boxShadow: on ? `0 2px 10px ${tint('mint', .22, 1)}` : 'none',
                  }}>
                  <span style={{ opacity: on ? 1 : .45, display: 'flex' }}><BrandOrMark provider={t.platform} size={16} /></span>
                  {t.name}
                </button>
              )
            })}
          </div>
        )}

        {/* ── WHEN ────────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 9px' }}>{mode === 'apnosh' ? 'When you would like it out' : 'When'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([
            ['now', 'Now', <Send key="s" size={14} />],
            ...(best ? [['best', best.label, <Sparkles key="b" size={14} />] as [string, string, React.ReactNode]] : []),
            ['pick', 'Pick a time', <Clock key="c" size={14} />],
          ] as [string, string, React.ReactNode][]).map(([k, label, icon]) => {
            const on = when === k
            /* The best time is the recommendation, so it wears the brand gradient
               when chosen. The other two are plain choices and stay plain. */
            const smart = k === 'best'
            return (
              <button key={k} type="button" onClick={() => setWhen(k as 'now' | 'best' | 'pick')} aria-pressed={on} className="cmp-chip"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13.5,
                  fontWeight: on ? 600 : 500, padding: '9px 15px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
                  color: on ? '#fff' : C.mute,
                  background: on ? (smart ? gradOf('brand') : C.ink) : '#fff',
                  border: `1px solid ${on ? 'transparent' : C.line}`,
                  boxShadow: on && smart ? glow('brand', .3) : 'none',
                }}>
                {icon}{label}
              </button>
            )
          })}
        </div>
        {when === 'best' && best && (
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 10, lineHeight: 1.45, padding: '0 2px' }}>
            Your posts have done best then, across {best.posts} of them.
          </div>
        )}
        {when === 'pick' && (
          <input type="datetime-local" value={pickAt} onChange={(e) => setPickAt(e.target.value)}
            min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
            style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 14.5, fontFamily: 'inherit', color: C.ink, background: '#fff' }} />
        )}

        {blocked.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <MvpMsg ok={false} text={`${blocked.join(' and ')} ${blocked.length === 1 ? 'needs' : 'need'} a photo or video. Add one, or switch ${blocked.length === 1 ? 'it' : 'them'} off above.`} />
          </div>
        )}
        {err && <div style={{ marginTop: 12 }}><MvpMsg ok={false} text={err} /></div>}
      </div>

      <MvpSaveBar
        onClick={() => void send()}
        disabled={!canSend}
        saving={busy}
        label={mode === 'apnosh' ? 'Send it to Apnosh'
          : when === 'now' ? `Post to ${chosen.size || 'no'} account${chosen.size === 1 ? '' : 's'}` : 'Schedule it'}
        /* The decision, restated in words before they commit to it. A button
           that says Post is not the same as being told what is about to happen. */
        hint={
          mode === 'apnosh' ? 'Nothing goes out until you have seen it.'
            : chosen.size === 0 ? 'Pick where it goes.'
            : `${when === 'now' ? 'Posting' : 'Scheduled'} to ${chosen.size} account${chosen.size === 1 ? '' : 's'}${when === 'best' && best ? `, ${best.label}` : ''}. Public, as your business.`
        }
      />
    </MvpShell>
  )
}
