'use client'

/**
 * OrderButtons — the owner's walkthrough for the Order and Reserve buttons on their
 * Google listing.
 *
 * REBUILT as steps (2026-07-21). The first version put everything on one screen: the
 * diagnosis, the locked links, the AI advice, both fields, the preview and the apply
 * button. Every fact was true and the whole thing was unreadable, because the owner had
 * to work out for themselves what to do first. The owner's word for it was "confusing",
 * and they were right.
 *
 * This follows the Google-profile fixer instead: one decision per screen, the AI's advice
 * attached to the step it belongs to rather than banked at the top, and nothing shown
 * until it is that thing's turn. Same data, same endpoints, same honesty rules.
 *
 * The steps are the owner's real sequence:
 *   1 look    what your buttons do today, and what that costs you
 *   2 order   your ordering link, with advice on where to get one
 *   3 book    your booking link, genuinely optional
 *   4 check   exactly what will change, before anything moves
 *   5 done    what went live, read back from Google
 */

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Lock, Check, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { C, SaysLabel, Panel, Progress, H, Fine, Says, Section, Row, Field, Note, Bad, Loading, Next, Nav, ActionCard, pretty } from './walkthrough-kit'


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

const STEPS = ['Look', 'Ordering', 'Booking', 'Check', 'Done'] as const

/** The model call can fail: no credits, a timeout, a response we cannot parse. When it did,
 *  this screen showed an empty field and nothing else, which reads as a broken product and
 *  is the worst thing a paid lane can do. These paths come from the same listing read the
 *  model gets, so they are always true. Less tailored, never absent. */
function fallbackPaths(read: Read): AdvicePath[] {
  const out: AdvicePath[] = []
  if (read.needsOwnerCheck.length > 0) {
    out.push({
      title: 'Check the Storefront link',
      action: 'Log into DoorDash and look for Storefront',
      cost: 'Free to check',
      body: `${read.needsOwnerCheck.length} of the links on your listing are DoorDash Storefront pages. That is a direct ordering page in your own name, but Google adds those on its own too, so we cannot tell from the link alone whether you pay for it. If it is yours, your Order button can point straight at it.`,
    })
  }
  out.push({
    title: 'Ask your register company',
    action: 'Ask whoever runs your registers to switch on online ordering',
    cost: 'Usually a monthly fee instead of a cut of each order',
    body: 'Most register and point of sale companies include a direct ordering page. Orders land with you instead of going through a delivery app, so you keep more of each one.',
  })
  return out
}


export default function OrderButtons({ campaignId }: { campaignId?: string }) {
  const [step, setStep] = useState(0)
  const [read, setRead] = useState<Read | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ordering, setOrdering] = useState('')
  const [booking, setBooking] = useState('')
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
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
      const p = (body as Read).proposals ?? []
      const o = p.find((x) => x.type === 'FOOD_ORDERING')?.proposed
      const b = p.find((x) => x.type === 'DINING_RESERVATION')?.proposed
      if (o) setOrdering(o)
      if (b) setBooking(b)
    } catch { setLoadError('Could not read your listing.') }
  }, [])

  useEffect(() => { void load() }, [load])

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
      if (dryRun) { setPlan(body.plan ?? []); setPlanNote(body.note ?? null); setStep(3) }
      else { setDone({ verified: !!body.verified, checks: body.checks ?? [] }); setPlan(null); setStep(4); await load() }
    } catch { setErr('That did not work.') } finally { setBusy(null) }
  }

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!read) return <Panel><Loading>Reading your Google listing…</Loading></Panel>

  const changes = (plan ?? []).filter((p) => p.action !== 'keep')
  const shownPaths = advice?.paths?.length ? advice.paths : fallbackPaths(read)

  return (
    <Panel>
      <Progress steps={STEPS} step={step} />

      {/* 1 ── what is true today. Read-only on purpose: the owner should understand the
              situation before being asked to do anything about it. */}
      {step === 0 && (
        <>
          <H>{read.headline}</H>
          {advice?.situation && <Says>{advice.situation}</Says>}

          {read.ours.length > 0 && (
            <Section title="Yours to change">
              {read.ours.map((l) => (
                <Row key={l.type} label={l.label} value={pretty(l.uri)} tone={l.goesTo ? 'warn' : 'ok'} hint={l.goesTo ? `goes to ${l.goesTo}` : undefined} />
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
              <Fine>Google adds these itself. We cannot remove them, so your own links sit alongside.</Fine>
              {read.locked.slice(0, 4).map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.faint, padding: '3px 0' }}>
                  <Lock size={11} /> {pretty(l.uri)}
                </div>
              ))}
            </Section>
          )}
          {read.needsOwnerCheck.length > 0 && (
            <Note>
              {read.needsOwnerCheck.length} of these are DoorDash Storefront links, which may already be yours. Worth a check.
            </Note>
          )}
          <Next onClick={() => setStep(1)}>
            {read.fixableCount > 0 ? `Fix ${read.fixableCount} button${read.fixableCount > 1 ? 's' : ''}` : 'Continue'}
          </Next>
        </>
      )}

      {/* 2 ── one decision: the ordering link. The AI's paths belong HERE, where the owner
              is actually stuck, not banked on a summary screen they already scrolled past. */}
      {step === 1 && (
        <>
          <H>Where should your Order button send people?</H>
          <Fine>This is the page a guest lands on when they tap Order on your Google listing.</Fine>

          <Field label="Your online ordering link" value={ordering} onChange={setOrdering}
            found={read.proposals.find((p) => p.type === 'FOOD_ORDERING')?.because ?? null} />

          {adviceState === 'loading' && <Loading>Working out your options…</Loading>}
          {adviceState !== 'loading' && adviceState !== 'locked' && shownPaths.length > 0 && (
            <div style={{ background: C.greenSoft, borderRadius: 14, padding: '13px 14px', marginTop: 4 }}>
              <SaysLabel generic={!advice} />
              <Fine style={{ marginBottom: 10 }}>
                {advice?.startHere
                  || (ordering ? 'Not sure that is the best link? Here are your options.' : 'Do not have one? Here is where owners like you usually get one.')}
              </Fine>
              {shownPaths.map((p, i) => <ActionCard key={i} action={p.action} cost={p.cost} why={p.body} />)}
            </div>
          )}
          {adviceState === 'locked' && (
            <Note>On the Pro plan, Apnosh AI reads your listing and lays out your real options here, with what each one costs.</Note>
          )}

          <Nav onBack={() => setStep(0)}>
            <Next onClick={() => setStep(2)} disabled={!ordering.trim()}>Next</Next>
          </Nav>
          {!ordering.trim() && <Fine style={{ textAlign: 'center', marginTop: 8 }}>You need an ordering link to point the button at. Come back once you have one.</Fine>}
        </>
      )}

      {/* 3 ── booking, and genuinely optional. Plenty of places take no reservations, and
              telling them so is better than an empty field they think they failed. */}
      {step === 2 && (
        <>
          <H>Do you take reservations?</H>
          <Fine>Your Reserve button can send people straight to your booking page.</Fine>
          <Field label="Your reservations link" value={booking} onChange={setBooking}
            help="OpenTable, Resy, Yelp and your own booking page all work."
            found={read.proposals.find((p) => p.type === 'DINING_RESERVATION')?.because ?? null} />
          {err && <Bad>{err}</Bad>}
          <Nav onBack={() => setStep(1)}>
            <Next onClick={() => void call(true)} disabled={busy !== null}>
              {busy === 'preview' ? <><Loader2 size={14} className="mvp-spin" /> Checking…</> : <>See what changes <ArrowRight size={14} /></>}
            </Next>
          </Nav>
          <button onClick={() => { setBooking(''); void call(true) }} disabled={busy !== null}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600, color: C.mute, marginTop: 10 }}>
            We do not take reservations
          </button>
        </>
      )}

      {/* 4 ── the change, before it happens. */}
      {step === 3 && plan && (
        <>
          <H>{changes.length ? `${changes.length} button${changes.length > 1 ? 's' : ''} will change` : 'Nothing will change'}</H>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 13, padding: 13, marginBottom: 12 }}>
            {changes.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, padding: '5px 0', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: C.ink, minWidth: 92 }}>{p.button}</span>
                <span style={{ color: C.faint, textDecoration: p.from ? 'line-through' : 'none' }}>{pretty(p.from)}</span>
                <ArrowRight size={11} color={C.faint} />
                <span style={{ color: C.greenDk, fontWeight: 600 }}>{pretty(p.to)}</span>
              </div>
            ))}
            {planNote && <Fine style={{ marginTop: 9 }}>{planNote}</Fine>}
          </div>
          {err && <Bad>{err}</Bad>}
          <Nav onBack={() => { setPlan(null); setStep(2) }}>
            <Next onClick={() => void call(false)} disabled={busy !== null || !changes.length}>
              {busy === 'apply' ? <><Loader2 size={14} className="mvp-spin" /> Saving…</> : 'Put these on Google'}
            </Next>
          </Nav>
        </>
      )}

      {/* 5 ── what actually happened, read back from Google. */}
      {step === 4 && done && (
        <>
          <H>{done.verified ? 'Live on Google' : 'Saved, but not everything took'}</H>
          <div style={{ background: done.verified ? C.greenSoft : C.amberSoft, borderRadius: 13, padding: 13 }}>
            {done.checks.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.ink, padding: '3px 0' }}>
                {c.ok ? <Check size={13} color={C.greenDk} /> : <AlertCircle size={13} color={C.amber} />} {c.button}
              </div>
            ))}
            <Fine style={{ marginTop: 9 }}>We read your listing back to check. Google can take a little while to show the change to everyone.</Fine>
          </div>
          <Section title="Still on your listing">
            <Fine>The delivery app links Google adds itself stay. We cannot remove those.</Fine>
          </Section>
        </>
      )}

      {read.site.url && step === 0 && (
        <a href={read.site.url} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute, textDecoration: 'none', marginTop: 14 }}>
          Open your website <ExternalLink size={11} />
        </a>
      )}
    </Panel>
  )
}

/* ── pieces ───────────────────────────────────────────────────── */


/** Where you are, and how much is left. The wall version had no sense of progress at all. */













