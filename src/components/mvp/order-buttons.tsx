'use client'

/**
 * OrderButtons — the owner-facing screen for the Order and Reserve buttons on their
 * Google listing.
 *
 * The shape is deliberately: what is true now, what we can change, what we cannot,
 * then the two fields. Everything on screen comes from a live read (the listing and
 * their own website). Nothing is filled from the business record, which for this
 * question is empty or wrong.
 *
 * Applying is two steps on purpose. Preview runs the server's dry run and shows the
 * exact per-button plan; only then does Apply appear. This writes to a listing real
 * customers use, so the owner sees the change before it happens, not after.
 */

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Lock, Check, AlertCircle, Loader2, ArrowRight, Sparkles } from 'lucide-react'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2',
  line: '#e6e6ea', bg: '#f5f5f7',
  red: '#c0564f', redSoft: '#fdeeee', amber: '#e0a13a', amberSoft: '#fdf6e9',
}

interface Link { type: string; label: string; uri: string; goesTo: string | null }
interface Proposal { type: string; label: string; proposed: string | null; provider: string | null; because: string | null }
interface Read {
  headline: string
  ours: Link[]
  locked: Link[]
  emptySlots: { type: string; label: string }[]
  needsOwnerCheck: Link[]
  fixableCount: number
  proposals: Proposal[]
  site: { url: string | null; error: string | null; foundOwnOrdering: boolean; foundOwnBooking: boolean }
  needs: { blocked: boolean; reason: string | null; nextService: string | null }
}
interface PlanRow { button: string; action: 'add' | 'change' | 'keep'; from: string | null; to: string }
interface AdvicePath { title: string; body: string; cost: string; action: string }
interface Advice { situation: string; paths: AdvicePath[]; startHere: string; avoid: string | null }

/** Show a link the way a person reads one: the site, not the tracking soup. */
function pretty(uri: string | null): string {
  if (!uri) return 'nothing set'
  try {
    const u = new URL(uri)
    const path = u.pathname === '/' ? '' : u.pathname
    return u.hostname.replace(/^www\./, '') + (path.length > 22 ? path.slice(0, 22) + '…' : path)
  } catch { return uri.slice(0, 40) }
}

export default function OrderButtons({ campaignId }: { campaignId?: string }) {
  const [read, setRead] = useState<Read | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ordering, setOrdering] = useState('')
  const [booking, setBooking] = useState('')
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  // Advice is a separate, optional layer. It loads after the read, and a failure or a
  // non-Pro tier just leaves the deterministic screen standing on its own.
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [adviceState, setAdviceState] = useState<'idle' | 'loading' | 'locked' | 'none'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ verified: boolean; checks: { button: string; ok: boolean }[] } | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/dashboard/listing/order-links', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) { setLoadError(body?.error ?? 'Could not read your listing.'); return }
      setRead(body as Read)
      // Pre-fill from what we found on their own site. Never from the business record.
      const p = (body as Read).proposals ?? []
      const o = p.find((x) => x.type === 'FOOD_ORDERING')?.proposed
      const b = p.find((x) => x.type === 'DINING_RESERVATION')?.proposed
      if (o) setOrdering(o)
      if (b) setBooking(b)
    } catch { setLoadError('Could not read your listing.') }
  }, [])

  useEffect(() => { void load() }, [load])

  // Ask for advice once the read has landed. Deliberately after: the advice is grounded
  // in the same live facts, and showing it before the situation would put the answer
  // above the question.
  useEffect(() => {
    if (!read || adviceState !== 'idle') return
    setAdviceState('loading')
    void (async () => {
      try {
        const res = await fetch('/api/dashboard/listing/order-links/advice', { method: 'POST' })
        const body = await res.json()
        if (body?.locked) { setAdviceState('locked'); return }
        if (body?.advice) { setAdvice(body.advice as Advice); setAdviceState('idle'); return }
        setAdviceState('none')
      } catch { setAdviceState('none') }
    })()
  }, [read, adviceState])

  async function call(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'apply'); setErr(null)
    try {
      const res = await fetch('/api/dashboard/listing/order-links/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderingLink: ordering, bookingLink: booking, dryRun, campaignId }),
      })
      const body = await res.json()
      if (!res.ok) { setErr(body?.error ?? 'That did not work.'); return }
      if (dryRun) { setPlan(body.plan ?? []); setPlanNote(body.note ?? null) }
      else {
        setDone({ verified: !!body.verified, checks: body.checks ?? [] })
        setPlan(null)
        await load() // show the listing as it is NOW, not as we hoped
      }
    } catch { setErr('That did not work.') } finally { setBusy(null) }
  }

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!read) return <Panel><div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mute, fontSize: 14 }}><Loader2 size={15} className="mvp-spin" /> Reading your Google listing…</div></Panel>

  const changes = (plan ?? []).filter((p) => p.action !== 'keep')

  return (
    <Panel>
      {/* what is true right now */}
      <div style={{ fontSize: 17, fontWeight: 650, color: C.ink, lineHeight: 1.35, marginBottom: 14 }}>{read.headline}</div>

      {read.ours.length > 0 && (
        <Section title="Yours to change">
          {read.ours.map((l) => (
            <Row key={l.type} label={l.label} value={pretty(l.uri)} tone={l.goesTo ? 'warn' : 'ok'}
              hint={l.goesTo ? `goes to ${l.goesTo}` : undefined} />
          ))}
        </Section>
      )}

      {read.emptySlots.length > 0 && (
        <Section title="Empty, free to claim">
          {read.emptySlots.map((s) => <Row key={s.type} label={s.label} value="nothing set" tone="empty" />)}
        </Section>
      )}

      {read.locked.length > 0 && (
        <Section title={`Locked by Google (${read.locked.length})`}>
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginBottom: 8 }}>
            Google adds these itself. We cannot remove them, so your own links sit alongside.
          </div>
          {read.locked.slice(0, 4).map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.faint, padding: '3px 0' }}>
              <Lock size={11} /> {pretty(l.uri)}
            </div>
          ))}
        </Section>
      )}

      {read.needsOwnerCheck.length > 0 && (
        <Note tone="amber">
          {read.needsOwnerCheck.length} of these are DoorDash Storefront links. That is a page
          you can pay DoorDash to run for you, so it may already be yours. Worth a check.
        </Note>
      )}

      {/* what your options actually are. the AI lane's real job: an owner who has no
          ordering page cannot act on "add your link", because they do not know what
          the alternatives are or which fits them. */}
      {adviceState === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.mute, margin: '16px 0' }}>
          <Loader2 size={13} className="mvp-spin" /> Working out your options…
        </div>
      )}

      {advice && (
        <div style={{ background: C.greenSoft, borderRadius: 14, padding: '14px 15px', margin: '18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 8 }}>
            <Sparkles size={12} /> Your options
          </div>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginBottom: 12 }}>{advice.situation}</div>

          {advice.paths.map((p, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 11, padding: '11px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.faint, minWidth: 12 }}>{i + 1}</span>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: C.ink }}>{p.title}</span>
              </div>
              <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 6, paddingLeft: 19 }}>{p.body}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 19 }}>
                <Chip>{p.cost}</Chip>
                <Chip tone="ink">{p.action}</Chip>
              </div>
            </div>
          ))}

          {advice.startHere && (
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginTop: 10, fontWeight: 600 }}>
              Start here: <span style={{ fontWeight: 400 }}>{advice.startHere}</span>
            </div>
          )}
          {advice.avoid && (
            <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginTop: 6 }}>{advice.avoid}</div>
          )}
        </div>
      )}

      {adviceState === 'locked' && (
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 13, padding: '12px 13px', margin: '18px 0', fontSize: 13, color: C.mute, lineHeight: 1.5 }}>
          <strong style={{ color: C.ink }}>Not sure which way to go?</strong> On the Pro plan, Apnosh AI reads
          your listing and lays out your real options, with what each one costs and what to do first.
        </div>
      )}

      {/* the fields */}
      <div style={{ height: 1, background: C.line, margin: '18px 0' }} />

      {read.needs.blocked && !read.site.foundOwnOrdering ? (
        <Note tone="amber">
          <strong>{read.needs.reason}</strong>
          <div style={{ marginTop: 5 }}>
            We looked at {read.site.url ? pretty(read.site.url) : 'your website'} and did not find an
            ordering page. If you have one, add it below. If you do not, that is a different job
            and we can set one up for you first.
          </div>
        </Note>
      ) : null}

      <Field label="Your online ordering link"
        help="This goes on the Order button. Toast, Square, Chowbus or your own page all work."
        value={ordering} onChange={setOrdering}
        found={read.proposals.find((p) => p.type === 'FOOD_ORDERING')?.because ?? null} />

      <Field label="Your reservations link"
        help="This goes on the Reserve button. OpenTable, Resy or Yelp all work. Leave blank if you do not take bookings."
        value={booking} onChange={setBooking}
        found={read.proposals.find((p) => p.type === 'DINING_RESERVATION')?.because ?? null} />

      {err && <Bad>{err}</Bad>}

      {/* preview, then apply. never one click. */}
      {!plan && !done && (
        <button onClick={() => void call(true)} disabled={busy !== null || (!ordering && !booking)}
          style={btn(busy === null && (!!ordering || !!booking))}>
          {busy === 'preview' ? <><Loader2 size={14} className="mvp-spin" /> Checking…</> : <>See what changes <ArrowRight size={14} /></>}
        </button>
      )}

      {plan && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 13, padding: 13, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: C.ink, marginBottom: 9 }}>
            {changes.length ? `${changes.length} button${changes.length > 1 ? 's' : ''} will change` : 'Nothing will change'}
          </div>
          {changes.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: C.ink, minWidth: 96 }}>{p.button}</span>
              <span style={{ color: C.faint, textDecoration: p.from ? 'line-through' : 'none' }}>{pretty(p.from)}</span>
              <ArrowRight size={11} color={C.faint} />
              <span style={{ color: C.greenDk, fontWeight: 600 }}>{pretty(p.to)}</span>
            </div>
          ))}
          {planNote && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 9, lineHeight: 1.5 }}>{planNote}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => void call(false)} disabled={busy !== null || !changes.length} style={{ ...btn(busy === null && changes.length > 0), marginTop: 0, flex: 1 }}>
              {busy === 'apply' ? <><Loader2 size={14} className="mvp-spin" /> Saving…</> : 'Put these on Google'}
            </button>
            <button onClick={() => { setPlan(null); setPlanNote(null) }} disabled={busy !== null}
              style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 11, padding: '11px 14px', fontSize: 13.5, color: C.mute, cursor: 'pointer', font: 'inherit' }}>
              Back
            </button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ background: done.verified ? C.greenSoft : C.amberSoft, borderRadius: 13, padding: 13, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 650, color: done.verified ? C.greenDk : C.amber, marginBottom: 7 }}>
            {done.verified ? <Check size={15} /> : <AlertCircle size={15} />}
            {done.verified ? 'Live on Google' : 'Saved, but not everything took'}
          </div>
          {done.checks.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.ink, padding: '2px 0' }}>
              {c.ok ? <Check size={12} color={C.greenDk} /> : <AlertCircle size={12} color={C.amber} />} {c.button}
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>
            We read your listing back to check. Google can take a little while to show the change to everyone.
          </div>
        </div>
      )}

      {read.site.url && (
        <a href={read.site.url} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute, textDecoration: 'none', marginTop: 14 }}>
          Open your website <ExternalLink size={11} />
        </a>
      )}
    </Panel>
  )
}

/* ── small pieces ─────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '4px 16px 40px', maxWidth: 620, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, tone, hint }: { label: string; value: string; tone: 'ok' | 'warn' | 'empty'; hint?: string }) {
  const dot = tone === 'warn' ? C.amber : tone === 'empty' ? C.faint : C.green
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, minWidth: 92 }}>{label}</span>
      <span style={{ fontSize: 13, color: tone === 'empty' ? C.faint : C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}{hint ? ` · ${hint}` : ''}
      </span>
    </div>
  )
}

function Field({ label, help, value, onChange, found }: { label: string; help: string; value: string; onChange: (v: string) => void; found: string | null }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: C.ink, marginBottom: 4 }}>{label}</label>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 6 }}>{help}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://"
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `1px solid ${C.line}`, padding: '11px 12px', fontSize: 14, color: C.ink, font: 'inherit' }} />
      {found && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.greenDk, marginTop: 5 }}>
          <Check size={11} /> {found}
        </div>
      )}
    </div>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'ink' }) {
  return (
    <span style={{
      display: 'inline-block', borderRadius: 8, padding: '3px 8px', fontSize: 11.5, lineHeight: 1.4,
      background: tone === 'ink' ? '#f2f2f4' : C.greenSoft,
      color: tone === 'ink' ? C.ink : C.greenDk, fontWeight: 600,
    }}>{children}</span>
  )
}

function Note({ tone, children }: { tone: 'amber'; children: React.ReactNode }) {
  return <div style={{ background: C.amberSoft, borderRadius: 12, padding: '11px 13px', fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>{children}</div>
}

function Bad({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.redSoft, borderRadius: 12, padding: '11px 13px', fontSize: 13, color: C.red, lineHeight: 1.5, margin: '12px 0' }}>{children}</div>
}

function btn(on: boolean): React.CSSProperties {
  return {
    width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    border: 'none', borderRadius: 12, padding: '13px 16px', fontSize: 14.5, fontWeight: 650,
    background: on ? C.green : C.line, color: on ? '#fff' : C.faint, cursor: on ? 'pointer' : 'default', font: 'inherit',
  }
}
