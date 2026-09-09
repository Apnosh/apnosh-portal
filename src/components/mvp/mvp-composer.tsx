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
import { Check, Clock, Sparkles, Send, ImagePlus, X, Loader2, MapPin, AtSign, Users, MessageSquare, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import MvpShell from './mvp-shell'
import { MvpGroup, MvpButton, MvpActions, MvpEmpty, MvpMsg } from './mvp-detail'
import { BrandOrMark, brandTone } from './mvp-insights'
import { C, DISPLAY } from './tokens'
import { gradOf, tint, glow, alpha, hueOf, type HueKey } from './hues'
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/* How far ahead a post may be parked. The vendor holds it and sends it at the
   time, so no platform's own scheduling window applies; this is a horizon that
   keeps the calendar finite, not a platform rule. */
const DAYS_AHEAD = 90
/* A short bar, not a tile and not a dot. Icon tiles beside section names were
   called tacky on Insights and they were; a dot, tried first, just read as a
   speck of dirt at 5px. The bar echoes the rail across the top of the preview
   card, so the page has one coloured device rather than two. */
function Head({ hue, children, note }: { hue: HueKey; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '26px 2px 9px' }}>
      <span style={{ width: 3, height: 13, borderRadius: 99, background: gradOf(hue, 180), flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.mute }}>{children}</span>
      {note != null && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.mute }}>{note}</span>}
    </div>
  )
}

const platformName = (p: string) => (p === 'tiktok' ? 'TikTok' : p === 'linkedin' ? 'LinkedIn' : p === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1))
const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
/* One colour per thing, which is the kit's own law and was being ignored here:
   four different additions all lit up the same mint, so the row read as one
   switch with four positions rather than four separate things. */
const addChip = (on: boolean, hue: HueKey = 'mint'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13,
  fontWeight: on ? 600 : 500, padding: '8px 13px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
  color: on ? hueOf(hue)[1] : C.mute, background: on ? tint(hue, 0.1) : '#fff',
  border: `1px solid ${on ? hueOf(hue)[0] : C.line}`,
  boxShadow: on ? `0 3px 12px ${tint(hue, 0.2, 1)}` : 'none',
})

export default function MvpComposer({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [bests, setBests] = useState<Best[]>([])
  const [bestIdx, setBestIdx] = useState(0)
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
  /* Set when the post went to the team instead of out, so the finished screen
     can say which of the two happened. */
  const [handed, setHanded] = useState<{ messaged: boolean } | null>(null)
  const [handing, setHanding] = useState(false)
  /* The extras. Each one is hidden until asked for: a composer that shows every
     option at once is a cockpit, and four owners asked for their content handled
     rather than to be handed more controls. */
  const [open, setOpen] = useState<Set<'tag' | 'collab' | 'first'>>(new Set())
  const [tagged, setTagged] = useState('')
  const [collabs, setCollabs] = useState('')
  const [firstComment, setFirstComment] = useState('')
  const [tagLocation, setTagLocation] = useState(false)
  const [tiktokDraft, setTiktokDraft] = useState(false)
  /* platform -> its own caption. Absent means "use the one above". */
  const [perPlatform, setPerPlatform] = useState<Record<string, string>>({})
  const [openCaption, setOpenCaption] = useState<string | null>(null)
  /* What each platform will actually accept, from the vendor rather than from
     memory: Instagram stops at 2,200, LinkedIn at 3,000, X at 280. */
  const [limits, setLimits] = useState<Record<string, number>>({})
  /* Scheduling as two taps instead of a keyboard: a day, then a time. */
  /* A real date, not an offset from today: an owner booking a holiday post in
     six weeks should not have to count days. If the last slot of today has
     already passed, open on tomorrow rather than on a grid of dead buttons. */
  const [dayAt, setDayAt] = useState<Date>(() => {
    const d = midnight(new Date())
    if (new Date().getHours() >= HOURS[HOURS.length - 1]) d.setDate(d.getDate() + 1)
    return d
  })
  const [monthAt, setMonthAt] = useState<Date>(() => {
    const d = midnight(new Date())
    if (new Date().getHours() >= HOURS[HOURS.length - 1]) d.setDate(d.getDate() + 1)
    d.setDate(1)
    return d
  })
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
        setBests((j.bests ?? (j.best ? [j.best] : [])) as Best[])
        setLimits((j.limits ?? {}) as Record<string, number>)
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
    if (media || !targets) return [] as string[]
    return targets.filter((t) => chosen.has(t.accountId) && NEEDS_MEDIA.has(t.platform))
      .map((t) => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
  }, [media, targets, chosen])
  /* One entry per PLATFORM in play, not per account: two Instagram accounts get
     one caption between them, because the difference that matters is Instagram
     against LinkedIn, not one handle against another. */
  const platformsInPlay = useMemo(() => {
    const seen: string[] = []
    for (const t of targets ?? []) if (chosen.has(t.accountId) && !seen.includes(t.platform)) seen.push(t.platform)
    return seen
  }, [targets, chosen])
  /* The tightest limit among the platforms still on the shared caption. Naming
     the platform matters more than the number: "1,900 over for X" tells the owner
     which one to give its own. */
  const sharedOn = useMemo(() => platformsInPlay.filter((pl) => !perPlatform[pl]?.trim()), [platformsInPlay, perPlatform])
  const sharedLimit = useMemo(() => {
    const on = sharedOn.map((pl) => ({ pl, n: limits[pl] })).filter((x) => x.n > 0)
    return on.length ? on.reduce((a, b) => (b.n < a.n ? b : a)) : null
  }, [sharedOn, limits])


  /* Any platform whose caption -- shared or its own -- is past what it accepts.
     Named, so the fix is obvious. */
  const tooLong = useMemo(() => {
    if (!targets) return null as null | { platform: string; over: number; limit: number }
    for (const pl of platformsInPlay) {
      const n = limits[pl]
      if (!n) continue
      const body = (perPlatform[pl] ?? text).trim()
      if (body.length > n) return { platform: pl, over: body.length - n, limit: n }
    }
    return null
  }, [targets, platformsInPlay, limits, perPlatform, text])

  const canSend = useMemo(() => {
    if (busy || uploading || handing) return false
    if (tooLong) return false
    return chosen.size > 0 && blocked.length === 0
      && (text.trim().length > 0 || !!media) && (when !== 'pick' || hour != null)
  }, [busy, uploading, handing, chosen, blocked, text, media, when, hour, tooLong])

  /* The client's own Facebook page, which is the only thing Instagram accepts as
     a location and the only one obtainable without a place search. When they have
     none, the option is simply not offered. */
  const ownPageName = (targets ?? []).find((t) => t.pageId)?.name ?? null
  const taggedList = tagged.split(/[\s,]+/).map((x) => x.replace(/^@+/, '')).filter(Boolean)
  /* The preview mirrors whichever caption is in front of the owner: opening the
     LinkedIn box and still seeing the Instagram caption below it is the exact
     confusion a preview exists to remove. */
  const shownText = openCaption ? (perPlatform[openCaption] ?? text) : text

  const pickedBest = bests[bestIdx] ?? null
  /* Where the recommended slots fall, so the calendar and the time grid can mark
     them: a dot on the day, a star on the hour. */
  const bestDates = useMemo(() => bests.map((b) => new Date(b.iso)), [bests])
  const bestHoursOnDay = useMemo(
    () => new Set(bestDates.filter((d) => sameDay(d, dayAt)).map((d) => d.getHours())),
    [bestDates, dayAt],
  )

  const today = midnight(new Date())
  const dayWords = sameDay(dayAt, today) ? 'Today'
    : dayAt.getTime() - today.getTime() === 86400000 ? 'Tomorrow'
    : `${DAY_NAMES[dayAt.getDay()]} the ${dayAt.getDate()}`

  const whenWords = when === 'now' ? 'Going out now'
    : when === 'best' && pickedBest ? pickedBest.label
    : hour != null ? `${dayWords} at ${hourLabel(hour)}`
    : 'Pick a day and a time'

  /* The chosen day and hour as an instant. Built from the owner's own clock, so
     "Thursday at 6" is six where they are. */
  const pickedAt = useMemo(() => {
    if (hour == null) return null
    const d = new Date(dayAt)
    d.setHours(hour, 0, 0, 0)
    return d
  }, [dayAt, hour])

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

  /* Sending it OUT and sending it TO SOMEONE are the same payload with one flag
     between them, so they are one function. What differs is what has to be true
     first: publishing needs an account and a photo where the platform demands
     one; handing it over needs neither, because the person receiving it can
     shoot the photo and pick the account. */
  async function send(handoff = false) {
    if (handoff ? !canHand : !canSend) return
    if (handoff) setHanding(true); else setBusy(true)
    setErr(null)
    try {
      const w = when === 'now' ? { kind: 'now' }
        : when === 'best' && pickedBest ? { kind: 'at', iso: pickedBest.iso, timezone: tz }
        : { kind: 'at', iso: (pickedAt ?? new Date()).toISOString(), timezone: tz }
      const r = await fetch('/api/dashboard/social-publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, content: text.trim(), accountIds: [...chosen],
          mediaUrls: media ? [media.url] : [], when: w, handoff,
          firstComment: firstComment.trim() || undefined,
          collaborators: collabs.split(/[\s,]+/).filter(Boolean),
          tagged: tagged.split(/[\s,]+/).filter(Boolean),
          tagLocation, tiktokDraft, perPlatform,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || (handoff ? 'Could not send it over' : 'Could not publish'))
      if (handoff) setHanded({ messaged: j.messaged === true })
      setDone((j.posted ?? []) as string[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : handoff ? 'Could not send it over' : 'Could not publish')
    } finally { setBusy(false); setHanding(false) }
  }

  /* Enough to be worth a person's time: something written, or a photo. Not
     gated on accounts, a photo, or a length limit -- every one of those is
     something the team can sort out, and refusing to pass on a half-formed idea
     is refusing the whole point of the button. */
  const canHand = !busy && !handing && !uploading && (text.trim().length > 0 || !!media)

  /* ── Sent ──────────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <MvpShell active="home" back="/dashboard" title={when === 'now' ? 'Posted' : 'Scheduled'}>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Check size={28} color={C.greenDk} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 7 }}>
            {handed ? 'Sent to your team' : when === 'now' ? 'It is live' : 'It is scheduled'}
          </div>
          <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
            {handed
              ? `${handed.messaged ? 'It is in your messages and in their queue. ' : 'It is in their queue. '}Nothing goes out until you have said yes.`
              : done.length ? done.join(', ') : 'Your accounts'}
            {handed ? '' : when === 'best' && pickedBest ? ` · ${pickedBest.label}` : when === 'pick' && pickedAt ? ` · ${pickedAt.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric' })}` : ''}
          </div>
          <div style={{ marginTop: 22 }}>
            <MvpButton
              onClick={() => router.push(handed ? '/dashboard/messages' : when !== 'now' ? '/dashboard/scheduled' : '/dashboard/insights/posts')}
              label={handed ? 'See the message' : when !== 'now' ? 'See what is coming up' : 'See your posts'} />
          </div>
        </div>
      </MvpShell>
    )
  }

  /* The networks this post is actually going to, in the order they appear, as a
     rail and as the glow under the card. One stop is a solid bar rather than a
     gradient to nowhere. */
  const railTones = (openCaption ? [openCaption] : platformsInPlay).map((pl) => brandTone(pl)?.solid).filter(Boolean) as string[]
  const previewRail = railTones.length === 0 ? C.line
    : railTones.length === 1 ? (brandTone(openCaption ?? platformsInPlay[0])?.grad ?? railTones[0])
    : `linear-gradient(90deg, ${railTones.map((c, i) => `${c} ${Math.round((i / railTones.length) * 100)}%, ${c} ${Math.round(((i + 1) / railTones.length) * 100)}%`).join(', ')})`
  const previewGlow = railTones.length ? alpha(railTones[0], 0.2) : null
  const previewAvatar = railTones.length === 1 ? (brandTone(openCaption ?? platformsInPlay[0])?.grad ?? gradOf('mint')) : gradOf('mint')

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

      <div style={{ padding: '6px 16px 34px' }}>

        {/* ── THE PREVIEW ──────────────────────────────────────────────────
            A mirror, not the editing surface. The last version blurred the two:
            it looked like a post but had a cursor and a placeholder in it, so it
            was neither a clear form nor an honest picture of the result. This
            only ever shows what the post will be. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 2px 9px' }}>
          <span style={{ width: 3, height: 13, borderRadius: 99, background: previewRail, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.mute }}>Preview</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden',
          /* The card is lit from underneath by the networks it is going to, so
             the whole screen changes colour as they toggle accounts on and off.
             Falls back to the card shadow when it is going nowhere yet. */
          boxShadow: previewGlow ? `${CARD_SHADOW}, 0 10px 30px ${previewGlow}` : CARD_SHADOW }}>
          {/* A rail of exactly the networks it is going to, in their order and
              their own colours: where this post lands, before a word is read. */}
          <div style={{ height: 4, background: previewRail }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: previewAvatar, boxShadow: `0 6px 14px ${previewGlow ?? tint('mint', .28, 1)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: '#fff' }}>{(targets?.[0]?.name ?? 'A').trim().charAt(0).toUpperCase()}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>
                {targets === null ? 'Loading…' : chosen.size === 0 ? 'Nowhere yet'
                  : openCaption ? `On ${platformName(openCaption)}`
                  : chosen.size === 1 ? (targets.find((t) => chosen.has(t.accountId))?.name ?? 'One account') : `${chosen.size} accounts`}
              </span>
              {tagLocation && ownPageName && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: C.greenDk, marginTop: 1 }}>
                  <MapPin size={11} />{ownPageName}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {(targets ?? []).filter((t) => chosen.has(t.accountId) && (!openCaption || t.platform === openCaption)).slice(0, 5).map((t, i) => (
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
            <div style={{ fontSize: 14, lineHeight: 1.5, color: shownText.trim() ? C.ink : C.faint, whiteSpace: 'pre-wrap', maxHeight: 92, overflow: 'hidden' }}>
              {shownText.trim() || 'Your caption will show here.'}
            </div>
            {taggedList.length > 0 && (
              <div style={{ fontSize: 12.5, color: C.greenDk, marginTop: 6 }}>with {taggedList.map((h) => '@' + h).join(' ')}</div>
            )}
            {firstComment.trim() && (
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
                <b style={{ fontWeight: 600, color: C.ink }}>First comment</b> {firstComment.trim()}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 9 }}>{whenWords}</div>
          </div>
        </div>

        {/* ── PHOTO ────────────────────────────────────────────────────────── */}
        <Head hue="announce">Photo or video</Head>
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
              <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 1 }}>Instagram and TikTok need one</span>
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
        )}

        {/* ── CAPTION ──────────────────────────────────────────────────────── */}
        <Head hue="brand" note={sharedOn.length > 1 ? `Used on ${sharedOn.map(platformName).join(', ')}` : null}>Caption</Head>
        <textarea
          className="cmp-in"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Write it the way you would say it…"
          style={{ lineHeight: 1.55, resize: 'vertical' }}
        />
        {sharedLimit && text.length > sharedLimit.n * 0.8 && (
          <div style={{ fontSize: 11.5, marginTop: 5, textAlign: 'right', color: text.length > sharedLimit.n ? C.coral : C.mute }}>
            {text.length > sharedLimit.n
              ? `${(text.length - sharedLimit.n).toLocaleString()} over what ${platformName(sharedLimit.pl)} takes`
              : `${(sharedLimit.n - text.length).toLocaleString()} left on ${platformName(sharedLimit.pl)}`}
          </div>
        )}

        {/* ── A DIFFERENT CAPTION WHERE IT READS DIFFERENTLY ────────────────
            LinkedIn is paragraphs and no hashtag wall; Instagram is one line and
            then the tags; TikTok is shorter than both. One caption everywhere is
            the right default and the wrong ceiling, so each platform can be given
            its own without leaving the screen. */}
        {platformsInPlay.length > 1 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
              {platformsInPlay.map((pl) => {
                const own = !!perPlatform[pl]?.trim()
                const isOpen = openCaption === pl
                const lit = own || isOpen
                const c = brandTone(pl)?.solid ?? C.green
                return (
                  <button key={pl} type="button" className="cmp-x" aria-pressed={isOpen}
                    onClick={() => {
                      setOpenCaption(isOpen ? null : pl)
                      /* Opening one starts it from the shared caption: the owner is
                         tailoring what they wrote, not starting over. */
                      if (!isOpen && perPlatform[pl] === undefined) setPerPlatform((cur) => ({ ...cur, [pl]: text }))
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 12.5,
                      fontWeight: lit ? 600 : 500, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', lineHeight: 1,
                      color: lit ? C.ink : C.mute, background: lit ? alpha(c, 0.09) : '#fff',
                      border: `1px solid ${lit ? c : C.line}` }}>
                    <span style={{ opacity: lit ? 1 : .45, display: 'flex' }}><BrandOrMark provider={pl} size={13} /></span>
                    {own ? `${platformName(pl)} has its own` : `Different for ${platformName(pl)}`}
                  </button>
                )
              })}
            </div>
            {openCaption && (() => {
              const pl = openCaption
              const val = perPlatform[pl] ?? ''
              const lim = limits[pl] ?? 0
              const tone = brandTone(pl)
              const c = tone?.solid ?? C.green
              return (
                <div style={{ marginTop: 10, borderRadius: 15, background: alpha(c, 0.05), border: `1px solid ${alpha(c, 0.35)}`, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: tone?.grad ?? gradOf('mint') }} />
                  <div style={{ padding: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.ink }}>
                      <BrandOrMark provider={pl} size={13} />On {platformName(pl)}
                    </span>
                    <button type="button" className="cmp-x"
                      onClick={() => { setPerPlatform((c) => { const n = { ...c }; delete n[pl]; return n }); setOpenCaption(null) }}
                      style={{ font: 'inherit', fontSize: 11.5, fontWeight: 600, color: c, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Use the same one
                    </button>
                  </div>
                  <textarea className="cmp-in" rows={5} value={val}
                    onChange={(e) => setPerPlatform((c) => ({ ...c, [pl]: e.target.value }))}
                    placeholder={`How it should read on ${platformName(pl)}…`}
                    style={{ lineHeight: 1.55, resize: 'vertical' }} />
                  {lim > 0 && val.length > lim * 0.8 && (
                    <div style={{ fontSize: 11.5, marginTop: 5, textAlign: 'right', color: val.length > lim ? C.coral : C.mute }}>
                      {val.length > lim ? `${(val.length - lim).toLocaleString()} over` : `${(lim - val.length).toLocaleString()} left`}
                    </div>
                  )}
                  </div>
                </div>
              )
            })()}
          </>
        )}


        {/* ── ADD TO THIS POST ─────────────────────────────────────────────
            Revealed, not displayed. Every option visible at once is a cockpit,
            and the owners who asked for this wanted less to think about. */}
        <Head hue="newfaces">Add to this post</Head>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ownPageName && (
            <button type="button" onClick={() => setTagLocation((v) => !v)} aria-pressed={tagLocation} className="cmp-x"
              style={addChip(tagLocation, 'mint')}><MapPin size={14} />{ownPageName}</button>
          )}
          {([
            ['tag', 'Tag people', <AtSign key="a" size={14} />, 'newfaces'],
            ['collab', 'Collaborator', <Users key="u" size={14} />, 'reviews'],
            ['first', 'First comment', <MessageSquare key="m" size={14} />, 'nights'],
          ] as ['tag' | 'collab' | 'first', string, React.ReactNode, HueKey][]).map(([k, label, icon, hue]) => {
            const on = open.has(k)
            return (
              <button key={k} type="button" className="cmp-x"
                onClick={() => setOpen((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n })}
                aria-pressed={on} style={addChip(on, hue)}>{icon}{label}</button>
            )
          })}
        </div>
        {open.has('tag') && (
          <div style={{ marginTop: 9 }}>
            <input className="cmp-in" value={tagged} onChange={(e) => setTagged(e.target.value)} placeholder="@handles, separated by spaces" />
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 5 }}>Tags the people in the picture. Instagram only.</div>
          </div>
        )}
        {open.has('collab') && (
          <div style={{ marginTop: 9 }}>
            <input className="cmp-in" value={collabs} onChange={(e) => setCollabs(e.target.value)} placeholder="@handle" />
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 5 }}>Up to three. It appears on their feed too, once they accept.</div>
          </div>
        )}
        {open.has('first') && (
          <div style={{ marginTop: 9 }}>
            <textarea className="cmp-in" rows={2} value={firstComment} onChange={(e) => setFirstComment(e.target.value)} placeholder="#hashtags go here" style={{ resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 5 }}>Posted underneath, so hashtags stay out of the caption.</div>
          </div>
        )}

        {/* ── WHERE ────────────────────────────────────────────────────────── */}
        <Head hue="event" note={chosen.size ? `${chosen.size} on` : null}>Where it goes</Head>
        {targets === null ? (
          <div style={{ fontSize: 13.5, color: C.mute, padding: '2px' }}>Loading your accounts…</div>
        ) : targets.length === 0 ? (
          <MvpEmpty text="No accounts are connected yet, so there is nowhere to post. Connect one under More, then come back." />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* EACH ONE IN ITS OWN NETWORK'S COLOUR. The app has always known
                what colour Instagram is -- it is in the 22px brand tile on every
                row -- but every chip on this screen was the same mint, so five
                accounts read as one undifferentiated block. The colour is not
                decoration here: it is the fastest way to see where this post is
                actually going. */}
            {targets.map((t) => {
              const on = chosen.has(t.accountId)
              const tone = brandTone(t.platform)
              const c = tone?.solid ?? C.green
              return (
                <button key={t.accountId} type="button" onClick={() => toggle(t.accountId)} aria-pressed={on} className="cmp-x"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 500,
                    fontFamily: DISPLAY, padding: '9px 14px', borderRadius: 99, cursor: 'pointer', lineHeight: 1, color: on ? C.ink : C.mute,
                    background: on ? alpha(c, 0.09) : '#fff',
                    border: `1px solid ${on ? c : C.line}`, boxShadow: on ? `0 3px 12px ${alpha(c, 0.22)}` : 'none' }}>
                  <span style={{ opacity: on ? 1 : .4, display: 'flex' }}><BrandOrMark provider={t.platform} size={16} /></span>
                  {t.name}
                </button>
              )
            })}
          </div>
        )}
        {chosen.size > 0 && [...chosen].some((id) => targets?.find((t) => t.accountId === id)?.platform === 'tiktok') && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={tiktokDraft} onChange={(e) => setTiktokDraft(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: C.greenDk }} />
            <span style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
              <b style={{ color: C.ink, fontWeight: 600 }}>Send TikTok to drafts instead.</b> It waits in your TikTok app so you can add a trending sound before posting, which the app will not let us do for you.
            </span>
          </label>
        )}

        {/* ── WHEN ─────────────────────────────────────────────────────────── */}
        <Head hue="regulars" note={whenWords}>When</Head>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(() => {
            const chipStyle = (on: boolean, smart: boolean): React.CSSProperties => ({
              display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 500,
              padding: '9px 15px', borderRadius: 99, cursor: 'pointer', lineHeight: 1, color: on ? '#fff' : C.mute,
              background: on ? (smart ? gradOf('brand') : C.ink) : '#fff', border: `1px solid ${on ? 'transparent' : C.line}`,
              boxShadow: on && smart ? glow('brand', .3) : 'none',
            })
            return (
              <>
                <button type="button" onClick={() => setWhen('now')} aria-pressed={when === 'now'} className="cmp-x" style={chipStyle(when === 'now', false)}>
                  <Send size={14} />Now
                </button>
                {/* ONE chip, and the slots underneath it. Three recommendations
                    on this row put five chips over two ragged lines and made the
                    strongest one no easier to see than the weakest. */}
                {bests.length > 0 && (
                  <button type="button" className="cmp-x" aria-pressed={when === 'best'} style={chipStyle(when === 'best', true)}
                    onClick={() => setWhen('best')}>
                    <Sparkles size={14} />{bests.length === 1 ? bests[0].label : 'Best time'}
                  </button>
                )}
                <button type="button" onClick={() => setWhen('pick')} aria-pressed={when === 'pick'} className="cmp-x" style={chipStyle(when === 'pick', false)}>
                  <Clock size={14} />Choose
                </button>
              </>
            )
          })()}
        </div>
        {when === 'best' && bests.length === 1 && (
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 10, lineHeight: 1.45, padding: '0 2px' }}>
            Your posts have done best then, across {bests[0].posts} of them.
          </div>
        )}
        {/* More than one, because a single "best time" is take it or leave it and
            the runner-up is usually nearly as strong on a day that suits them
            better. Each says what it rests on: a slot built on four posts and one
            built on forty are not the same recommendation. */}
        {when === 'best' && bests.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {bests.map((b, i) => {
              const on = bestIdx === i
              return (
                <button key={b.iso} type="button" className="cmp-x" aria-pressed={on} onClick={() => setBestIdx(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit',
                    padding: '10px 12px', borderRadius: 13, cursor: 'pointer',
                    background: on ? tint('brand', .07) : '#fff', border: `1px solid ${on ? C.green : C.line}` }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${on ? 'transparent' : C.line}`, background: on ? gradOf('brand') : '#fff' }}>
                    {on && <Check size={10} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: on ? 600 : 500, color: C.ink }}>{b.label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 1 }}>
                      {i === 0 ? 'Your strongest, ' : ''}across {b.posts} post{b.posts === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {when === 'pick' && (() => {
          /* A day, then a time. The old control was a datetime-local: an OS
             keyboard on a phone, for a decision that is really "which evening".
             A month rather than a week, because holidays, closures and menu
             changes are booked further out than seven days. */
          const first = new Date(monthAt)
          const lead = first.getDay()
          const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
          const horizon = midnight(new Date()); horizon.setDate(horizon.getDate() + DAYS_AHEAD)
          const prevMonth = new Date(first.getFullYear(), first.getMonth() - 1, 1)
          const nextMonth = new Date(first.getFullYear(), first.getMonth() + 1, 1)
          const canPrev = nextMonth.getTime() > today.getTime()
          const canNext = nextMonth.getTime() <= horizon.getTime()
          const spentToday = new Date().getHours() >= HOURS[HOURS.length - 1]
          const arrow: React.CSSProperties = {
            width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff', border: `1px solid ${C.line}`, cursor: 'pointer', font: 'inherit', color: C.mute,
          }
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <button type="button" className="cmp-x" disabled={!canPrev} aria-label="Previous month"
                  onClick={() => setMonthAt(prevMonth)} style={{ ...arrow, opacity: canPrev ? 1 : .35 }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600 }}>
                  {MONTHS[first.getMonth()]} {first.getFullYear()}
                </span>
                <button type="button" className="cmp-x" disabled={!canNext} aria-label="Next month"
                  onClick={() => setMonthAt(nextMonth)} style={{ ...arrow, opacity: canNext ? 1 : .35 }}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 5 }}>
                {DAY_NAMES.map((d) => (
                  <span key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: C.faint, letterSpacing: '.03em' }}>
                    {d.slice(0, 1)}
                  </span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = new Date(first.getFullYear(), first.getMonth(), i + 1)
                  const on = sameDay(d, dayAt)
                  /* Gone, past the horizon, or today with no waking hour left. */
                  const shut = d.getTime() < today.getTime() || d.getTime() > horizon.getTime()
                    || (sameDay(d, today) && spentToday)
                  const starred = bestDates.some((b) => sameDay(b, d))
                  return (
                    <button key={i} type="button" className="cmp-x" disabled={shut} aria-pressed={on}
                      onClick={() => {
                        setDayAt(d)
                        /* An hour picked on a later day can be in the past on this one. */
                        if (sameDay(d, today) && hour != null && hour <= new Date().getHours()) setHour(null)
                      }}
                      style={{ position: 'relative', aspectRatio: '1', borderRadius: 11, cursor: shut ? 'default' : 'pointer',
                        font: 'inherit', fontFamily: DISPLAY, fontSize: 14, fontWeight: on ? 700 : 500,
                        border: `1px solid ${on ? 'transparent' : C.line}`, background: on ? C.ink : '#fff',
                        color: shut ? C.faint : on ? '#fff' : C.ink, opacity: shut ? .35 : 1 }}>
                      {i + 1}
                      {starred && !shut && (
                        <span style={{ position: 'absolute', left: '50%', bottom: 5, transform: 'translateX(-50%)',
                          width: 4, height: 4, borderRadius: '50%', background: on ? '#fff' : C.green }} />
                      )}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '18px 2px 8px' }}>{dayWords}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                {HOURS.map((h) => {
                  const on = hour === h
                  const past = sameDay(dayAt, today) && h <= new Date().getHours()
                  const isBest = bestHoursOnDay.has(h)
                  return (
                    <button key={h} type="button" disabled={past} onClick={() => setHour(h)} aria-pressed={on} className="cmp-x"
                      style={{ padding: '9px 0', borderRadius: 12, cursor: past ? 'default' : 'pointer', font: 'inherit', fontFamily: DISPLAY, fontSize: 13,
                        fontWeight: on ? 700 : 500, border: `1px solid ${on ? 'transparent' : isBest ? C.green : C.line}`,
                        background: on ? C.ink : '#fff', color: past ? C.faint : on ? '#fff' : C.ink, opacity: past ? .45 : 1 }}>
                      {hourLabel(h)}{isBest && !on ? ' ★' : ''}
                    </button>
                  )
                })}
              </div>
              {bests.length > 0 && (
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>
                  A dot, and a ★, mark when your posts have done best.
                </div>
              )}
            </div>
          )
        })()}

        {tooLong && (
          <div style={{ marginTop: 16 }}>
            <MvpMsg ok={false} text={`That caption is ${tooLong.over.toLocaleString()} characters too long for ${platformName(tooLong.platform)}, which stops at ${tooLong.limit.toLocaleString()}. Shorten it, or give ${platformName(tooLong.platform)} its own.`} />
          </div>
        )}
        {blocked.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <MvpMsg ok={false} text={`${blocked.join(' and ')} ${blocked.length === 1 ? 'needs' : 'need'} a photo or video. Add one, or switch ${blocked.length === 1 ? 'it' : 'them'} off above.`} />
          </div>
        )}
        {err && <div style={{ marginTop: 12 }}><MvpMsg ok={false} text={err} /></div>}

        {/* AT THE END OF THE PAGE, not floating over it. The sticky bar put a
            second white plane above the bottom nav, so the screen finished with
            two stacked strips of chrome and the thing being written was clipped
            behind them. A composer is not a settings form: it is finished when
            you reach the bottom. */}
        <MvpActions
          /* The decision, restated in words before they commit to it. A button
             that says Post is not the same as being told what is about to happen. */
          hint={chosen.size === 0 ? 'Pick where it goes.'
            : `${when === 'now' ? 'Posting' : 'Scheduled'} to ${chosen.size} account${chosen.size === 1 ? '' : 's'}${when === 'best' && pickedBest ? `, ${pickedBest.label}` : ''}. Public, as your business.`}
        >
          <MvpButton full busy={busy} disabled={!canSend} onClick={() => void send(false)}
            label={when === 'now' ? `Post to ${chosen.size || 'no'} account${chosen.size === 1 ? '' : 's'}` : 'Schedule it'} />
          {/* THE WAY OUT, and deliberately quiet. This was a tab at the top of
              the screen, which made a choice out of an escape hatch and made
              every owner answer it before writing a word. */}
          <MvpButton full variant="quiet" busy={handing} disabled={!canHand}
            onClick={() => void send(true)} label="Send it to your team instead" />
        </MvpActions>
      </div>

    </MvpShell>
  )
}
