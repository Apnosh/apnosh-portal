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
    if (media || !targets) return [] as string[]
    return targets.filter((t) => chosen.has(t.accountId) && NEEDS_MEDIA.has(t.platform))
      .map((t) => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
  }, [media, targets, chosen])

  const canSend = useMemo(() =>
    !busy && !uploading && chosen.size > 0 && blocked.length === 0
    && (text.trim().length > 0 || !!media) && (when !== 'pick' || !!pickAt),
    [busy, uploading, chosen, blocked, text, media, when, pickAt])

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
        body: JSON.stringify({ clientId, content: text.trim(), accountIds: [...chosen], mediaUrls: media ? [media.url] : [], when: w }),
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
            {when === 'now' ? 'It is live' : 'It is scheduled'}
          </div>
          <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
            {done.length ? done.join(', ') : 'Your accounts'}
            {when === 'best' && best ? ` · ${best.label.toLowerCase()}` : when === 'pick' && pickAt ? ` · ${new Date(pickAt).toLocaleString()}` : ''}
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
      {/* mvp-spin lives inside another component's own style block, so it is
          declared here rather than borrowed and silently not animating. */}
      <style>{`@keyframes cmpspin{to{transform:rotate(360deg)}}.mvp-spin{animation:cmpspin .8s linear infinite}`}</style>
      <div style={{ padding: '10px 18px 132px' }}>

        <MvpGroup title="Photo or video">
          {media ? (
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.line}`, background: '#000' }}>
              {media.isVideo
                ? <video src={media.preview} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain' }} />
                : <img src={media.preview} alt="" style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain' }} />}
              <button type="button" onClick={() => setMedia(null)} aria-label="Remove"
                style={{ position: 'absolute', top: 9, right: 9, width: 30, height: 30, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 96, borderRadius: 16, border: `1px dashed ${C.line}`, background: '#fff', color: C.mute, fontSize: 14, cursor: uploading ? 'default' : 'pointer' }}>
              {uploading ? <><Loader2 size={17} className="mvp-spin" /> Uploading…</> : <><ImagePlus size={18} /> Add a photo or video</>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = '' }}
                style={{ display: 'none' }} />
            </label>
          )}
        </MvpGroup>

        <MvpGroup title="Caption">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={2200}
            placeholder="Write it the way you would say it."
            autoFocus
            style={{
              width: '100%', border: `1px solid ${C.line}`, borderRadius: 16, padding: 14,
              fontSize: 16, lineHeight: 1.55, fontFamily: 'inherit', color: C.ink,
              background: '#fff', resize: 'vertical', outline: 'none',
            }}
          />
          {/* A counter on an empty box is noise. It appears near the edge. */}
          {text.length > 1800 && (
            <div style={{ fontSize: 12, color: text.length > 2100 ? C.coral : C.faint, marginTop: 6, textAlign: 'right' }}>
              {2200 - text.length} left
            </div>
          )}
        </MvpGroup>

        <MvpGroup title="Where it goes">
          {targets === null ? (
            <div style={{ fontSize: 13.5, color: C.faint, padding: '4px 2px' }}>Loading your accounts…</div>
          ) : targets.length === 0 ? (
            <MvpEmpty text="No accounts are connected yet, so there is nowhere to post. Connect one under More, then come back." />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {targets.map((t) => {
                const on = chosen.has(t.accountId)
                return (
                  <button key={t.accountId} type="button" onClick={() => toggle(t.accountId)} aria-pressed={on}
                    style={{ ...chipBase, fontWeight: on ? 600 : 500, color: on ? C.ink : C.mute, background: on ? C.greenSoft : '#fff', border: `1px solid ${on ? C.green : C.line}` }}>
                    <BrandOrMark provider={t.platform} size={15} />
                    {t.name}
                    {on && <Check size={13} color={C.greenDk} />}
                  </button>
                )
              })}
            </div>
          )}
        </MvpGroup>

        <MvpGroup title="When">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {([
              ['now', 'Now', <Send key="s" size={13} />],
              ...(best ? [['best', best.label, <Sparkles key="b" size={13} />] as [string, string, React.ReactNode]] : []),
              ['pick', 'Pick a time', <Clock key="c" size={13} />],
            ] as [string, string, React.ReactNode][]).map(([k, label, icon]) => {
              const on = when === k
              return (
                <button key={k} type="button" onClick={() => setWhen(k as 'now' | 'best' | 'pick')} aria-pressed={on}
                  style={{ ...chipBase, fontWeight: on ? 600 : 500, color: on ? '#fff' : C.mute, background: on ? C.ink : '#fff', border: `1px solid ${on ? C.ink : C.line}` }}>
                  {icon}{label}
                </button>
              )
            })}
          </div>
          {when === 'best' && best && (
            <div style={{ fontSize: 12.5, color: C.mute, marginTop: 9, lineHeight: 1.45, padding: '0 2px' }}>
              Your posts have done best then, across {best.posts} of them.
            </div>
          )}
          {when === 'pick' && (
            <input type="datetime-local" value={pickAt} onChange={(e) => setPickAt(e.target.value)}
              min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
              style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 14.5, fontFamily: 'inherit', color: C.ink, background: '#fff' }} />
          )}
        </MvpGroup>

        {blocked.length > 0 && (
          <MvpMsg ok={false} text={`${blocked.join(' and ')} ${blocked.length === 1 ? 'needs' : 'need'} a photo or video. Add one, or switch ${blocked.length === 1 ? 'it' : 'them'} off above.`} />
        )}
        {err && <MvpMsg ok={false} text={err} />}
      </div>

      <MvpSaveBar
        onClick={() => void send()}
        disabled={!canSend}
        saving={busy}
        label={when === 'now' ? `Post to ${chosen.size || 'no'} account${chosen.size === 1 ? '' : 's'}` : 'Schedule it'}
        hint="Goes out publicly as your business."
      />
    </MvpShell>
  )
}
