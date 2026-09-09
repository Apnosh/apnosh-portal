'use client'

/**
 * THE COMPOSER — write it, choose where, choose when, send.
 * =========================================================
 * Four owners in the study wanted their content HANDLED rather than measured.
 * The product could only watch. This is the smallest honest version of handling
 * it, and every decision below is about removing a choice the owner has no basis
 * for making.
 *
 *   · Every connected account is ON by default. The common case is "everywhere",
 *     and an owner should be turning things off, not hunting for them.
 *   · WHEN is three buttons, not a date picker. "Now", the time their posts have
 *     actually done best, named in their own words and their own timezone, or a
 *     specific time if they insist.
 *   · The best time is only offered when it rests on enough posts to be real.
 *     Silence beats a confident recommendation built on two posts.
 *   · Nothing is called a draft, a queue or a channel. It is a post, and it goes
 *     places, now or later.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check } from 'lucide-react'
import { BrandOrMark } from './mvp-insights'

const C = {
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea',
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf6f1', coral: '#c0564f', bg: '#fbfbfa',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

interface Target { accountId: string; platform: string; name: string }
interface Best { iso: string; label: string; posts: number }

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
        /* Everything on by default. Posting to one place is the exception. */
        setChosen(new Set(t.map((x) => x.accountId)))
        setBest(j.best ?? null)
      })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : 'Could not load your accounts'); setTargets([]) } })
    return () => { live = false }
  }, [clientId])

  const toggle = useCallback((id: string) => {
    setChosen((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const canSend = useMemo(() =>
    !busy && chosen.size > 0 && text.trim().length > 0 && (when !== 'pick' || !!pickAt),
    [busy, chosen, text, when, pickAt])

  async function send() {
    if (!canSend) return
    setBusy(true); setErr(null)
    try {
      const w = when === 'now' ? { kind: 'now' }
        : when === 'best' && best ? { kind: 'at', iso: best.iso, timezone: tz }
        : { kind: 'at', iso: new Date(pickAt).toISOString(), timezone: tz }
      const r = await fetch('/api/dashboard/social-publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, content: text.trim(), accountIds: [...chosen], when: w }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not publish')
      setDone((j.posted ?? []) as string[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not publish')
    } finally { setBusy(false) }
  }

  const shell: React.CSSProperties = { position: 'fixed', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }

  if (done) {
    return (
      <div style={{ ...shell, alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Check size={26} color={C.greenDk} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, marginBottom: 6 }}>
          {when === 'now' ? 'Posted' : 'Scheduled'}
        </div>
        <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, maxWidth: 320 }}>
          {when === 'now' ? 'It is live on ' : 'It will go out on '}
          {done.length ? done.join(', ') : 'your accounts'}
          {when === 'best' && best ? ` ${best.label.toLowerCase()}.` : when === 'pick' && pickAt ? ` on ${new Date(pickAt).toLocaleString()}.` : '.'}
        </div>
        <button type="button" onClick={() => router.push('/dashboard/insights/posts')}
          style={{ marginTop: 20, font: 'inherit', fontSize: 14, fontWeight: 600, padding: '10px 20px', borderRadius: 99, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer' }}>
          See your posts
        </button>
      </div>
    )
  }

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <button type="button" onClick={() => router.back()} aria-label="Back"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={22} color={C.mute} />
        </button>
        <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600 }}>New post</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 24px' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={2200}
          placeholder="What do you want to say?"
          autoFocus
          style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 14, padding: 13, fontSize: 16, lineHeight: 1.5, fontFamily: 'inherit', color: C.ink, resize: 'vertical' }}
        />
        {/* Only shown near the edge. A counter on an empty box is noise. */}
        {text.length > 1800 && (
          <div style={{ fontSize: 12, color: text.length > 2100 ? C.coral : C.faint, marginTop: 5, textAlign: 'right' }}>
            {2200 - text.length} left
          </div>
        )}

        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '20px 0 8px' }}>Where it goes</div>
        {targets === null ? (
          <div style={{ fontSize: 13.5, color: C.faint }}>Loading your accounts…</div>
        ) : targets.length === 0 ? (
          <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5 }}>
            No accounts are connected yet, so there is nowhere to post.{' '}
            <a href="/dashboard/connected-accounts" style={{ color: C.greenDk }}>Connect one</a>.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {targets.map((t) => {
              const on = chosen.has(t.accountId)
              return (
                <button key={t.accountId} type="button" onClick={() => toggle(t.accountId)} aria-pressed={on}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, padding: '8px 13px', borderRadius: 99, cursor: 'pointer', color: on ? C.ink : C.mute, background: on ? C.greenSoft : '#fff', border: `1px solid ${on ? C.green : C.line}` }}>
                  <BrandOrMark provider={t.platform} size={15} />
                  {t.name}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, margin: '20px 0 8px' }}>When</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([['now', 'Now'], ...(best ? [['best', best.label] as [string, string]] : []), ['pick', 'Pick a time']] as [string, string][]).map(([k, label]) => {
            const on = when === k
            return (
              <button key={k} type="button" onClick={() => setWhen(k as 'now' | 'best' | 'pick')} aria-pressed={on}
                style={{ font: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, padding: '8px 14px', borderRadius: 99, cursor: 'pointer', color: on ? '#fff' : C.mute, background: on ? C.ink : '#fff', border: `1px solid ${on ? C.ink : C.line}` }}>
                {label}
              </button>
            )
          })}
        </div>
        {when === 'best' && best && (
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>
            Your posts have done best then, across {best.posts} of them.
          </div>
        )}
        {when === 'pick' && (
          <input type="datetime-local" value={pickAt} onChange={(e) => setPickAt(e.target.value)}
            min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
            style={{ marginTop: 9, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', color: C.ink }} />
        )}

        {err && <div style={{ marginTop: 16, fontSize: 13, color: C.coral, lineHeight: 1.45 }}>{err}</div>}
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', flexShrink: 0, background: '#fff' }}>
        <button type="button" disabled={!canSend} onClick={() => void send()}
          style={{ width: '100%', font: 'inherit', fontSize: 15, fontWeight: 600, padding: '13px 0', borderRadius: 14, border: 'none', cursor: canSend ? 'pointer' : 'default', background: canSend ? C.ink : C.line, color: canSend ? '#fff' : C.faint }}>
          {busy ? 'Sending…' : when === 'now' ? `Post to ${chosen.size || 'no'} account${chosen.size === 1 ? '' : 's'}` : 'Schedule it'}
        </button>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7, textAlign: 'center' }}>
          Goes out publicly as your business.
        </div>
      </div>
    </div>
  )
}
