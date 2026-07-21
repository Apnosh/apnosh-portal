'use client'

/**
 * ListingsFix — the owner-run walkthrough for "Get listed everywhere".
 *
 * Same look and sequence as the Google profile, order-button and review walkthroughs, on the
 * shared walkthrough-kit. One thing is deliberately different and it is the point of the card:
 *
 *   THE OTHER CARDS INSPECT SOMETHING. THIS ONE DOES NOT.
 *
 * No API sits behind Yelp, Apple Maps or the rest for us, so nothing here reports on the state
 * of a listing. An earlier version auto-checked Yelp and the result was five rows reading "not
 * checked" beside one reading "matches", which tells an owner almost nothing while sounding
 * like a report. Pulled out on purpose.
 *
 * What is left is the part that was always the hard bit: the exact right text in one place with
 * copy buttons, the directories worth doing in the order worth doing them, and a direct link to
 * the page that edits each. Whether it is now right is the owner's word, and the screen says so.
 *
 *   1 look   your details, and the list
 *   2 fix    one directory at a time, with the text ready to paste
 *   3 done   what they got through
 */

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import {
  C, Panel, Progress, H, Fine, Section, Note, Bad, Loading, Next, Nav,
} from './walkthrough-kit'
import type { CitationPlan } from '@/lib/citations/directories'
import { correctValues, joinWords } from '@/lib/citations/directories'

const STEPS = ['Look', 'Fix', 'Done'] as const

export default function ListingsFix({ campaignId, initialFixed = [] }: { campaignId?: string; initialFixed?: string[] }) {
  const [plan, setPlan] = useState<CitationPlan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [i, setI] = useState(0)

  /** Directories the owner says they have handled. Seeded from the campaign so a pass survives
   *  closing the tab. Their claim, kept on the campaign, never written into citation_audits:
   *  that table holds what a person verified, and a claim in it would corrupt the evidence. */
  const [fixed, setFixed] = useState<string[]>(initialFixed)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/citations?fixed=${encodeURIComponent(initialFixed.join(','))}`)
      const body = await res.json()
      if (!res.ok) { setLoadError(body?.error ?? 'Could not read your Google details.'); return }
      setPlan(body as CitationPlan)
    } catch { setLoadError('Could not read your Google details.') }
  }, [initialFixed])
  useEffect(() => { void load() }, [load])

  const save = useCallback(async (keys: string[], done: boolean) => {
    if (!campaignId) return
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution: { citationsFixed: keys, ...(done ? { citationsSelfDoneAt: new Date().toISOString() } : {}) } }),
      })
    } catch { /* the record is not the work */ }
  }, [campaignId])

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!plan) return <Panel><Loading>Getting your details…</Loading></Panel>

  const worklist = plan.directories.filter((d) => !fixed.includes(d.key))
  const current = worklist[i] ?? null

  function handled(key: string) {
    const next = [...fixed, key]
    setFixed(next)
    const remaining = worklist.filter((d) => d.key !== key)
    if (remaining.length === 0) { setStep(2); void save(next, true) }
    else { setI(Math.min(i, remaining.length - 1)); void save(next, false) }
  }

  return (
    <Panel>
      <Progress steps={STEPS} step={step} />

      {/* 1 ── the right answer, and where it needs to go. */}
      {step === 0 && (
        <>
          <H>{plan.headline}</H>

          {/* Everything downstream is copied from Google. An incomplete source would get
              copied faithfully into six more places. */}
          {!plan.sourceReady && (
            <Note>
              Your Google listing has no {joinWords(plan.sourceMissing)}. Fix that first, or the other
              sites have nothing correct to copy.{' '}
              <a href="/dashboard/google-profile" style={{ color: C.greenDk, fontWeight: 650 }}>Open your Google profile</a>
            </Note>
          )}

          {plan.sourceReady && (
            <Section title="What every listing should say">
              {correctValues(plan.source).map((r) => <CopyRow key={r.label} label={r.label} value={r.value} />)}
              <Fine style={{ marginTop: 8 }}>Word for word, the same everywhere. Small differences are what confuse search.</Fine>
            </Section>
          )}

          <Section title="Where to put it">
            {plan.directories.map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: fixed.includes(d.key) ? C.green : C.line, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, flex: 1 }}>{d.label}</span>
                {fixed.includes(d.key) && <span style={{ fontSize: 12.5, color: C.greenDk }}>you sorted it</span>}
              </div>
            ))}
          </Section>

          {/* The sentence this card must never leave out. */}
          <Fine>
            We cannot see inside these sites, so nothing here is a report on what they say today.
            This is the correct text and where to put it.
          </Fine>

          {worklist.length > 0
            ? <Next onClick={() => { setI(0); setStep(1) }} disabled={!plan.sourceReady}>
                {fixed.length > 0 ? 'Carry on' : 'Start with Yelp'}
              </Next>
            : <Fine style={{ textAlign: 'center', marginTop: 8 }}>You have been through all of them.</Fine>}
        </>
      )}

      {/* 2 ── one directory, with the answer in hand. */}
      {step === 1 && current && (
        <>
          <Fine style={{ marginBottom: 6 }}>{i + 1} of {worklist.length}</Fine>
          <H>{current.label}</H>
          <Fine>{current.why}</Fine>

          <Section title="Make it say exactly this">
            {correctValues(plan.source).map((r) => <CopyRow key={r.label} label={r.label} value={r.value} />)}
          </Section>

          {/* The one thing that trips people up on this particular site. This is what the
              walk-through lane is actually worth over a bare list of links. */}
          <Note>{current.tip}</Note>

          <a href={current.actionUrl} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 15px', fontSize: 13.5, fontWeight: 650, color: C.ink, textDecoration: 'none', marginBottom: 12 }}>
            {current.actionLabel} <ExternalLink size={13} />
          </a>

          <Nav onBack={() => (i === 0 ? setStep(0) : setI(i - 1))}>
            <Next onClick={() => handled(current.key)}>I sorted this one</Next>
          </Nav>
          <button type="button" onClick={() => (i + 1 >= worklist.length ? setStep(2) : setI(i + 1))}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600, color: C.mute, marginTop: 10 }}>
            Leave this one for now
          </button>
        </>
      )}

      {/* 3 ── what they got through, said as a claim, because that is what it is. */}
      {step === 2 && (
        <>
          <H>{fixed.length > 0 ? `${fixed.length} sorted` : 'Nothing changed'}</H>
          <div style={{ background: fixed.length ? C.greenSoft : C.amberSoft, borderRadius: 13, padding: 13, marginBottom: 14 }}>
            {plan.directories.filter((d) => fixed.includes(d.key)).map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.ink, padding: '3px 0' }}>
                <Check size={13} color={C.greenDk} /> {d.label}
              </div>
            ))}
            {fixed.length === 0 && <div style={{ fontSize: 13.5, color: C.ink }}>You can come back to these any time.</div>}
          </div>
          {fixed.length < plan.total && <Fine>The rest are still on the list whenever you want them.</Fine>}
          <Section title="Worth knowing">
            <Fine>Listings drift. Hours change, an old entry gets auto-created, a former phone number resurfaces. Worth a pass every few months.</Fine>
          </Section>
        </>
      )}
    </Panel>
  )
}

/** A value with a copy button, because retyping an address into six sites is how they end up
 *  different in the first place. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.faint, minWidth: 58 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.ink, flex: 1, wordBreak: 'break-word' }}>{value}</span>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 650, color: copied ? C.greenDk : C.mute, flexShrink: 0 }}>
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
    </div>
  )
}
