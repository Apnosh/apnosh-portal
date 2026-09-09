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
import { Check, Clock, Sparkles, Send, ImagePlus, X, Loader2, MapPin, AtSign, Users, MessageSquare, Image as ImageIcon } from 'lucide-react'
import MvpShell from './mvp-shell'
import { MvpGroup, MvpSaveBar, MvpEmpty, MvpMsg } from './mvp-detail'
import { BrandOrMark } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, tint, glow } from './hues'
import { CARD_SHADOW } from './kit'

interface Target { accountId: string; platform: string; name: string; pageId?: string | null }
interface Best { iso: string; label: string; posts: number }
interface Media { url: string; preview: string; isVideo: boolean }

/* Platforms that will not accept a post with no photo or video. This is their
   rule, not ours, and it is the reason a text-only composer was not a smaller
   version of this feature but a broken one. */
const NEEDS_MEDIA = new Set(['instagram', 'tiktok', 'youtube'])

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/* Waking hours only. Nobody schedules a restaurant post for 4am, and offering it
   is 24 buttons where 14 would do. */
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`
const addChip = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13,
  fontWeight: on ? 600 : 500, padding: '8px 13px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
  color: on ? C.greenDk : C.mute, background: on ? C.greenSoft : '#fff',
  border: `1px solid ${on ? C.green : C.line}`,
})

export default function MvpComposer({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [best, setBest] = useState<Best | null>(null)
  const [tz, setTz] = useState('America/Los_Angeles')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [when, setWhen] = useState<'now' | 'best' | 'pick'>('now')
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
  /* The extras. Each one is hidden until asked for: a composer that shows every
     option at once is a cockpit, and four owners asked for their content handled
     rather than to be handed more controls. */
  const [open, setOpen] = useState<Set<'tag' | 'collab' | 'first'>>(new Set())
  const [tagged, setTagged] = useState('')
  const [collabs, setCollabs] = useState('')
  const [firstComment, setFirstComment] = useState('')
  const [tagLocation, setTagLocation] = useState(false)
  const [tiktokDraft, setTiktokDraft] = useState(false)
  /* Scheduling as two taps instead of a keyboard: a day, then a time. */
  /* If the last slot of the day has already passed, today is not offerable, so
     open on tomorrow rather than on a grid where every button is dead. */
  const [day, setDay] = useState(() => (new Date().getHours() >= HOURS[HOURS.length - 1] ? 1 : 0))
  const [hour, setHour] = useState<number | null>(null)

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
      && (text.trim().length > 0 || !!media) && (when !== 'pick' || hour != null)
  }, [busy, uploading, mode, chosen, blocked, text, media, when, hour])

  /* The client's own Facebook page, which is the only thing Instagram accepts as
     a location and the only one obtainable without a place search. When they have
     none, the option is simply not offered. */
  const ownPageName = (targets ?? []).find((t) => t.pageId)?.name ?? null
  const taggedList = tagged.split(/[\s,]+/).map((x) => x.replace(/^@+/, '')).filter(Boolean)
  /* Where the recommended slot falls, so the time grid can mark it. */
  const bestAt = best ? new Date(best.iso) : null
  const bestHour = bestAt ? bestAt.getHours() : null
  const bestDayOffset = bestAt
    ? Math.round((new Date(bestAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
    : null

  const whenWords = mode === 'apnosh' ? 'A draft for your team'
    : when === 'now' ? 'Going out now'
    : when === 'best' && best ? best.label
    : hour != null ? `${day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : DAY_NAMES[(new Date().getDay() + day) % 7]} at ${hourLabel(hour)}`
    : 'Pick a day and a time'

  /* The chosen day and hour as an instant. Built from the owner's own clock, so
     "Thursday at 6" is six where they are. */
  const pickedAt = useMemo(() => {
    if (hour == null) return null
    const d = new Date()
    d.setDate(d.getDate() + day)
    d.setHours(hour, 0, 0, 0)
    return d
  }, [day, hour])

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
        : { kind: 'at', iso: (pickedAt ?? new Date()).toISOString(), timezone: tz }
      const r = await fetch('/api/dashboard/social-publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, content: text.trim(), accountIds: [...chosen],
          mediaUrls: media ? [media.url] : [], when: w, handoff: mode === 'apnosh',
          firstComment: firstComment.trim() || undefined,
          collaborators: collabs.split(/[\s,]+/).filter(Boolean),
          tagged: tagged.split(/[\s,]+/).filter(Boolean),
          tagLocation, tiktokDraft,
        }),
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
            {mode === 'apnosh' ? '' : when === 'best' && best ? ` · ${best.label}` : when === 'pick' && pickedAt ? ` · ${pickedAt.toLocaleString([], { weekday: 'long', hour: 'numeric' })}` : ''}
          </div>
          <button type="button" onClick={() => router.push(mode === 'apnosh' || when !== 'now' ? '/dashboard/scheduled' : '/dashboard/insights/posts')}
            style={{ marginTop: 22, font: 'inherit', fontSize: 14.5, fontWeight: 600, padding: '11px 22px', borderRadius: 99, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer' }}>
            {mode === 'apnosh' || when !== 'now' ? 'See what is coming up' : 'See your posts'}
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
        .cmp-in{width:100%;border:1px solid ${C.line};border-radius:13px;padding:11px 12px;font-size:15px;font-family:inherit;color:${C.ink};background:#fff;outline:none;box-sizing:border-box}
        .cmp-in:focus{border-color:${C.green}}
        .cmp-in::placeholder{color:${C.faint}}
        .cmp-x{transition:transform .12s ease}
        .cmp-x:active{transform:scale(.96)}
        .cmp-scroll{overflow-x:auto;scrollbar-width:none}
        .cmp-scroll::-webkit-scrollbar{display:none}
      `}</style>

      <div style={{ padding: '6px 16px 150px' }}>

        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 99, background: '#f0f1f0', marginBottom: 16 }}>
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

        {/* ── THE PREVIEW ──────────────────────────────────────────────────
            A mirror, not the editing surface. The last version blurred the two:
            it looked like a post but had a cursor and a placeholder in it, so it
            was neither a clear form nor an honest picture of the result. This
            only ever shows what the post will be. */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '0 2px 8px' }}>Preview</div>
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: gradOf('mint'), boxShadow: glow('mint', .28), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: '#fff' }}>{(targets?.[0]?.name ?? 'A').trim().charAt(0).toUpperCase()}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>
                {targets === null ? 'Loading…' : chosen.size === 0 ? 'Nowhere yet'
                  : chosen.size === 1 ? (targets.find((t) => chosen.has(t.accountId))?.name ?? 'One account') : `${chosen.size} accounts`}
              </span>
              {tagLocation && ownPageName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: C.greenDk, marginTop: 1 }}>
                  <MapPin size={11} />{ownPageName}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {(targets ?? []).filter((t) => chosen.has(t.accountId)).slice(0, 5).map((t, i) => (
                <span key={t.accountId} style={{ marginLeft: i ? -6 : 0, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BrandOrMark provider={t.platform} size={13} />
                </span>
              ))}
            </span>
          </div>

          {media ? (
            media.isVideo
              ? <video src={media.preview} muted playsInline style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'cover', background: '#000' }} />
              : <img src={media.preview} alt="" style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'cover', background: '#000' }} />
          ) : (
            <div style={{ minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13,
              background: `linear-gradient(160deg, ${tint('mint', .08)}, ${tint('brand', .08)})`, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
              <ImageIcon size={16} /> No photo yet
            </div>
          )}

          <div style={{ padding: '11px 14px 13px' }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: text.trim() ? C.ink : C.faint, whiteSpace: 'pre-wrap', maxHeight: 92, overflow: 'hidden' }}>
              {text.trim() || 'Your caption will show here.'}
            </div>
            {taggedList.length > 0 && (
              <div style={{ fontSize: 12.5, color: C.greenDk, marginTop: 6 }}>with {taggedList.map((h) => '@' + h).join(' ')}</div>
            )}
            {firstComment.trim() && (
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
                <b style={{ fontWeight: 600, color: C.ink }}>First comment</b> {firstComment.trim()}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 9 }}>{whenWords}</div>
          </div>
        </div>

        {/* ── CAPTION ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '24px 2px 7px' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.mute }}>Caption</span>
          {chosen.size > 1 && <span style={{ fontSize: 11.5, color: C.faint }}>Used on all {chosen.size}</span>}
        </div>
        <textarea
          className="cmp-in"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={2200}
          placeholder={mode === 'apnosh' ? 'What do you want this post to be about?' : 'Write it the way you would say it…'}
          style={{ lineHeight: 1.55, resize: 'vertical' }}
        />
        {text.length > 1800 && (
          <div style={{ fontSize: 11.5, color: text.length > 2100 ? C.coral : C.faint, marginTop: 5, textAlign: 'right' }}>{2200 - text.length} left</div>
        )}

        {/* ── PHOTO ────────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 8px' }}>Photo or video</div>
        {media ? (
          <button type="button" onClick={() => setMedia(null)} className="cmp-x"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 42, height: 42, borderRadius: 10, background: `center/cover url(${media.preview})`, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, color: C.ink }}>{media.isVideo ? 'Video attached' : 'Photo attached'}</span>
            <X size={16} color={C.mute} />
          </button>
        ) : (
          <label className="cmp-x" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, border: `1px dashed ${C.line}`, background: '#fff', cursor: uploading ? 'default' : 'pointer' }}>
            <span style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: uploading ? C.bg : gradOf('mint'), boxShadow: uploading ? 'none' : glow('mint', .26), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              {uploading ? <Loader2 size={18} className="mvp-spin" color={C.greenDk} /> : <ImagePlus size={18} />}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink }}>{uploading ? 'Uploading…' : 'Add a photo or video'}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 1 }}>{mode === 'apnosh' ? 'Optional, we can make one' : 'Instagram and TikTok need one'}</span>
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
        )}

        {/* ── ADD TO THIS POST ─────────────────────────────────────────────
            Revealed, not displayed. Every option visible at once is a cockpit,
            and the owners who asked for this wanted less to think about. */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 8px' }}>Add to this post</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ownPageName && (
            <button type="button" onClick={() => setTagLocation((v) => !v)} aria-pressed={tagLocation} className="cmp-x"
              style={addChip(tagLocation)}><MapPin size={14} />{ownPageName}</button>
          )}
          {([['tag', 'Tag people', <AtSign key="a" size={14} />], ['collab', 'Collaborator', <Users key="u" size={14} />], ['first', 'First comment', <MessageSquare key="m" size={14} />]] as [ 'tag'|'collab'|'first', string, React.ReactNode][]).map(([k, label, icon]) => {
            const on = open.has(k)
            return (
              <button key={k} type="button" className="cmp-x"
                onClick={() => setOpen((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n })}
                aria-pressed={on} style={addChip(on)}>{icon}{label}</button>
            )
          })}
        </div>
        {open.has('tag') && (
          <div style={{ marginTop: 9 }}>
            <input className="cmp-in" value={tagged} onChange={(e) => setTagged(e.target.value)} placeholder="@handles, separated by spaces" />
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>Tags the people in the picture. Instagram only.</div>
          </div>
        )}
        {open.has('collab') && (
          <div style={{ marginTop: 9 }}>
            <input className="cmp-in" value={collabs} onChange={(e) => setCollabs(e.target.value)} placeholder="@handle" />
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>Up to three. It appears on their feed too, once they accept.</div>
          </div>
        )}
        {open.has('first') && (
          <div style={{ marginTop: 9 }}>
            <textarea className="cmp-in" rows={2} value={firstComment} onChange={(e) => setFirstComment(e.target.value)} placeholder="#hashtags go here" style={{ resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>Posted underneath, so hashtags stay out of the caption.</div>
          </div>
        )}

        {/* ── WHERE ────────────────────────────────────────────────────────── */}
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
                <button key={t.accountId} type="button" onClick={() => toggle(t.accountId)} aria-pressed={on} className="cmp-x"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 500,
                    padding: '9px 14px', borderRadius: 99, cursor: 'pointer', lineHeight: 1, color: on ? C.ink : C.mute, background: '#fff',
                    border: `1px solid ${on ? C.green : C.line}`, boxShadow: on ? `0 2px 10px ${tint('mint', .22, 1)}` : 'none' }}>
                  <span style={{ opacity: on ? 1 : .45, display: 'flex' }}><BrandOrMark provider={t.platform} size={16} /></span>
                  {t.name}
                </button>
              )
            })}
          </div>
        )}
        {chosen.size > 0 && [...chosen].some((id) => targets?.find((t) => t.accountId === id)?.platform === 'tiktok') && mode === 'self' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={tiktokDraft} onChange={(e) => setTiktokDraft(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: C.greenDk }} />
            <span style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
              <b style={{ color: C.ink, fontWeight: 600 }}>Send TikTok to drafts instead.</b> It waits in your TikTok app so you can add a trending sound before posting, which the app will not let us do for you.
            </span>
          </label>
        )}

        {/* ── WHEN ─────────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '22px 2px 9px' }}>{mode === 'apnosh' ? 'When you would like it out' : 'When'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([
            ['now', mode === 'apnosh' ? 'As soon as you can' : 'Now', <Send key="s" size={14} />],
            ...(best ? [['best', best.label, <Sparkles key="b" size={14} />] as [string, string, React.ReactNode]] : []),
            ['pick', 'Choose', <Clock key="c" size={14} />],
          ] as [string, string, React.ReactNode][]).map(([k, label, icon]) => {
            const on = when === k
            const smart = k === 'best'
            return (
              <button key={k} type="button" onClick={() => setWhen(k as 'now' | 'best' | 'pick')} aria-pressed={on} className="cmp-x"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 500,
                  padding: '9px 15px', borderRadius: 99, cursor: 'pointer', lineHeight: 1, color: on ? '#fff' : C.mute,
                  background: on ? (smart ? gradOf('brand') : C.ink) : '#fff', border: `1px solid ${on ? 'transparent' : C.line}`,
                  boxShadow: on && smart ? glow('brand', .3) : 'none' }}>
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
          /* A day, then a time. The old control was a datetime-local: an OS
             keyboard on a phone, for a decision that is really "which evening". */
          <div style={{ marginTop: 12 }}>
            <div className="cmp-scroll" style={{ display: 'flex', gap: 7, paddingBottom: 4 }}>
              {Array.from({ length: 7 }, (_, i) => i).map((i) => {
                const d = new Date(); d.setDate(d.getDate() + i)
                const on = day === i
                const spent = i === 0 && new Date().getHours() >= HOURS[HOURS.length - 1]
                return (
                  <button key={i} type="button" disabled={spent} aria-pressed={on} className="cmp-x"
                    onClick={() => {
                      setDay(i)
                      /* An hour picked on a later day can be in the past on this one. */
                      if (i === 0 && hour != null && hour <= new Date().getHours()) setHour(null)
                    }}
                    style={{ flexShrink: 0, width: 58, padding: '9px 0', borderRadius: 14, cursor: spent ? 'default' : 'pointer', font: 'inherit',
                      border: `1px solid ${on ? 'transparent' : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.mute,
                      textAlign: 'center', opacity: spent ? .4 : 1 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 500, opacity: .8 }}>{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAY_NAMES[d.getDay()].slice(0, 3)}</span>
                    <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, marginTop: 1 }}>{d.getDate()}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginTop: 10 }}>
              {HOURS.map((h) => {
                const on = hour === h
                const past = day === 0 && h <= new Date().getHours()
                const isBest = bestHour != null && h === bestHour && day === bestDayOffset
                return (
                  <button key={h} type="button" disabled={past} onClick={() => setHour(h)} aria-pressed={on} className="cmp-x"
                    style={{ padding: '9px 0', borderRadius: 12, cursor: past ? 'default' : 'pointer', font: 'inherit', fontSize: 13,
                      fontWeight: on ? 700 : 500, border: `1px solid ${on ? 'transparent' : isBest ? C.green : C.line}`,
                      background: on ? C.ink : '#fff', color: past ? C.faint : on ? '#fff' : C.ink, opacity: past ? .45 : 1 }}>
                    {hourLabel(h)}{isBest && !on ? ' ★' : ''}
                  </button>
                )
              })}
            </div>
            {bestHour != null && (
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>★ is when your posts have done best.</div>
            )}
          </div>
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
