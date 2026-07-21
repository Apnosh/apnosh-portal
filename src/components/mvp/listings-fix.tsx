'use client'

/**
 * ListingsFix — the owner-run walkthrough for "Get listed everywhere".
 *
 * Same look and sequence as the Google profile, order-button and review walkthroughs, on the
 * shared walkthrough-kit. One thing is deliberately different, and it is the honest core of
 * this card:
 *
 *   THE OTHER CARDS END IN A PROOF. THIS ONE ENDS IN A CLAIM.
 *
 * We can read Yelp through its API and nothing else, and we can write to none of them. So
 * there is no read-back here and no server-verified stamp, because inventing one would mean
 * asserting something we did not see. What the owner gets instead is the part that is
 * genuinely hard: the exact right values in one place, which directories we know are wrong,
 * and a direct link to the page that edits each one.
 *
 *   1 look   what Google says, and which directories disagree
 *   2 fix    one directory at a time, with the correct text to copy
 *   3 done   what they handled, and what is still unknown
 */

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import {
  C, Panel, Progress, H, Fine, Section, Note, Bad, Loading, Next, Nav, Chip,
} from './walkthrough-kit'
import type { CitationPlan, PlannedDirectory, DirectoryStatus } from '@/lib/citations/directories'
import { correctValues, joinWords } from '@/lib/citations/directories'

const STEPS = ['Look', 'Fix', 'Done'] as const

type Plan = CitationPlan & { canCheckYelp: boolean }

const STATUS_WORD: Record<DirectoryStatus, string> = {
  differs: 'does not match', missing: 'no listing found', unchecked: 'not checked', match: 'matches',
}
const STATUS_TONE: Record<DirectoryStatus, string> = {
  differs: C.red, missing: C.amber, unchecked: C.faint, match: C.green,
}

export default function ListingsFix({ campaignId, initialFixed = [] }: { campaignId?: string; initialFixed?: string[] }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [i, setI] = useState(0)
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /** Directories the owner says they have handled. Seeded from the campaign so a pass survives
   *  closing the tab. Owner-claimed, never written to citation_audits: that table holds what
   *  WE verified, and mixing a claim into it would quietly corrupt the evidence. */
  const [fixed, setFixed] = useState<string[]>(initialFixed)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/citations')
      const body = await res.json()
      if (!res.ok) { setLoadError(body?.error ?? 'Could not read your listings.'); return }
      setPlan(body as Plan)
    } catch { setLoadError('Could not read your listings.') }
  }, [])
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

  async function checkYelp() {
    setChecking(true); setErr(null)
    try {
      const res = await fetch('/api/dashboard/citations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'yelp' }),
      })
      const body = await res.json()
      if (!res.ok) { setErr(body?.error ?? 'That check did not work.'); return }
      setPlan(body as Plan)
    } catch { setErr('That check did not work.') } finally { setChecking(false) }
  }

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!plan) return <Panel><Loading>Reading your listings…</Loading></Panel>

  // Only walk what there is something to do about. A directory that already matches does not
  // need the owner's ten minutes, and one they have handled this pass does not either.
  const worklist = plan.directories.filter((d) => d.status !== 'match' && !fixed.includes(d.key))
  const current = worklist[i] ?? null

  function handled(key: string) {
    const next = [...fixed, key]
    setFixed(next)
    const remaining = worklist.filter((d) => d.key !== key)
    if (remaining.length === 0) { setStep(2); void save(next, true) } else { setI(Math.min(i, remaining.length - 1)); void save(next, false) }
  }

  return (
    <Panel>
      <Progress steps={STEPS} step={step} />

      {/* 1 ── what Google says, and who disagrees. */}
      {step === 0 && (
        <>
          <H>{plan.headline}</H>

          {/* Everything downstream is copied from Google. If Google itself is incomplete,
              fixing the others would spread the gap rather than close it. */}
          {!plan.sourceReady && (
            <Note>
              Your Google listing has no {joinWords(plan.sourceMissing)}. Fix that first, or the other
              directories have nothing correct to copy.{' '}
              <a href="/dashboard/google-profile" style={{ color: C.greenDk, fontWeight: 650 }}>Open your Google profile</a>
            </Note>
          )}

          {plan.sourceReady && (
            <Section title="What every listing should say">
              {correctValues(plan.source).map((r) => <CopyRow key={r.label} label={r.label} value={r.value} />)}
            </Section>
          )}

          <Section title="Where you are listed">
            {plan.directories.map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: fixed.includes(d.key) ? C.green : STATUS_TONE[d.status], flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, flex: 1 }}>{d.label}</span>
                <span style={{ fontSize: 12.5, color: C.mute }}>
                  {fixed.includes(d.key) ? 'you handled it' : STATUS_WORD[d.status]}
                  {d.status === 'differs' && d.differs.length > 0 ? ` (${joinWords(d.differs)})` : ''}
                </span>
              </div>
            ))}
          </Section>

          {/* Said out loud, because a quiet "not checked" reads as "fine" and it is not. */}
          {plan.counts.unchecked > 0 && (
            <Fine>
              We can only read Yelp automatically. The rest say not checked because nobody has opened
              them yet, which is not the same as being right.
            </Fine>
          )}

          {plan.canCheckYelp && plan.directories.some((d) => d.key === 'yelp' && d.status === 'unchecked') && (
            <button type="button" onClick={() => void checkYelp()} disabled={checking}
              style={{ display: 'block', width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 650, color: C.ink, cursor: 'pointer', font: 'inherit', marginBottom: 10 }}>
              {checking ? 'Checking Yelp…' : 'Check Yelp for me'}
            </button>
          )}
          {err && <Bad>{err}</Bad>}

          {worklist.length > 0
            ? <Next onClick={() => { setI(0); setStep(1) }} disabled={!plan.sourceReady}>
                {plan.counts.differs > 0 ? 'Start with what is wrong' : 'Go through them'}
              </Next>
            : <Fine style={{ textAlign: 'center', marginTop: 8 }}>Nothing left to work through.</Fine>}
        </>
      )}

      {/* 2 ── one directory, with the right answer in hand. */}
      {step === 1 && current && (
        <>
          <Fine style={{ marginBottom: 6 }}>{i + 1} of {worklist.length}</Fine>
          <H>{current.label}</H>
          <Fine>{current.why}</Fine>

          <div style={{ border: `1px solid ${C.line}`, borderRadius: 13, padding: 13, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: current.found ? 9 : 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_TONE[current.status] }} />
              <span style={{ fontSize: 13.5, fontWeight: 650, color: C.ink }}>{STATUS_WORD[current.status]}</span>
              {current.checkedAt && <Chip tone="ink">checked {new Date(current.checkedAt).toLocaleDateString()}</Chip>}
            </div>
            {current.found && (
              <>
                <Fine style={{ marginBottom: 4 }}>What is on there now:</Fine>
                {current.found.name && <Wrong ok={!current.differs.includes('name')} value={current.found.name} />}
                {current.found.address && <Wrong ok={!current.differs.includes('address')} value={current.found.address} />}
                {current.found.phone && <Wrong ok={!current.differs.includes('phone')} value={current.found.phone} />}
              </>
            )}
            {current.status === 'unchecked' && <Fine style={{ margin: 0 }}>Open it and compare against the three lines below.</Fine>}
            {current.status === 'missing' && <Fine style={{ margin: 0 }}>We looked and found nothing, so this one probably needs claiming from scratch.</Fine>}
            {current.notes && <Fine style={{ margin: '6px 0 0' }}>{current.notes}</Fine>}
          </div>

          <Section title="Make it say exactly this">
            {correctValues(plan.source).map((r) => <CopyRow key={r.label} label={r.label} value={r.value} />)}
          </Section>

          <a href={current.listingUrl || current.actionUrl} target="_blank" rel="noreferrer"
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

      {/* 3 ── what they did, said as a claim, because that is what it is. */}
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
          {/* The one sentence this card must never leave out. */}
          <Fine>
            We cannot see inside these directories, so this list is what you told us, not something
            we checked. Yelp is the exception and we re-read that one whenever you ask.
          </Fine>
          <Section title="Worth knowing">
            <Fine>Directories drift. Hours change, a listing gets auto-created, an old phone number resurfaces. Worth a pass every few months.</Fine>
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

function Wrong({ ok, value }: { ok: boolean; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0', color: ok ? C.mute : C.red }}>
      {ok ? <Check size={12} color={C.green} /> : <AlertCircle size={12} color={C.red} />}
      <span style={{ wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
