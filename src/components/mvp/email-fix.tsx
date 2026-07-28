'use client'

/**
 * EmailFix — the owner-run walkthrough for "Land in the inbox".
 *
 * Same three beats as every other setup lane, on the shared kit: read what is true, decide one
 * thing at a time, prove it took.
 *
 *   1 look   what your domain says today, read live from public DNS
 *   2 fix    one record at a time, with the exact text to paste and where it goes on YOUR registrar
 *   3 done   we look again and tell you what changed
 *
 * WHAT MAKES THIS ONE DIFFERENT, and it is the best property of any card we sell: the check needs
 * nothing from the owner. No login, no connection, no permission. So "done" is never taken on
 * trust here, and the owner can watch it flip from wrong to right in the same sitting.
 *
 * The one thing this screen must never do is report DKIM as missing. It is the only record whose
 * absence we cannot establish, and the copy carries that distinction rather than rounding it away.
 */

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, AlertCircle, HelpCircle } from 'lucide-react'
import { C, Panel, Progress, H, Fine, Section, Note, Bad, Loading, Next, Nav } from './walkthrough-kit'
import {
  registrarGuide, REGISTRAR_KEYS, fixFor,
  type DeliverabilityReport, type RecordFinding, type RecordState, type RegistrarKey,
} from '@/lib/email/deliverability'

const STEPS = ['Look', 'Fix', 'Done'] as const

const STATE_WORD: Record<RecordState, string> = {
  good: 'looks right',
  weak: 'needs a change',
  missing: 'not set up',
  unknown: 'we could not check',
}
const STATE_TONE: Record<RecordState, string> = {
  good: C.green, weak: C.amber, missing: C.coral, unknown: C.faint,
}

export default function EmailFix({ campaignId }: { campaignId?: string }) {
  const [report, setReport] = useState<DeliverabilityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [step, setStep] = useState(0)
  const [i, setI] = useState(0)
  const [registrar, setRegistrar] = useState<RegistrarKey>('other')
  const [domainDraft, setDomainDraft] = useState('')
  const [stamped, setStamped] = useState(false)

  const load = useCallback(async (domain?: string) => {
    setBusy(true)
    setError(null)
    try {
      const qs = domain ? `?domain=${encodeURIComponent(domain)}` : ''
      const res = await fetch(`/api/dashboard/email-health${qs}`)
      const body = await res.json()
      if (!res.ok) { setError(body?.error ?? 'We could not read your records.'); setReport(null) }
      else {
        const r = body as DeliverabilityReport
        setReport(r)
        /* The client's read does NOT close the task. When it looks clean we ask the server to
         * check for itself and stamp; it runs the same lookups again and refuses if they do not
         * pass. So a doctored response here buys nothing. */
        if (r.clean && campaignId && !stamped) {
          void fetch(`/api/campaigns/${campaignId}/email-verified`, { method: 'POST' })
            .then((v) => { if (v.ok) setStamped(true) })
            .catch(() => {})
        }
      }
    } catch {
      setError('We could not read your records.')
    } finally {
      setBusy(false)
    }
  }, [campaignId, stamped])

  useEffect(() => { void load() }, [load])

  if (busy && !report) {
    return <Panel><Loading>Reading what your domain says right now</Loading></Panel>
  }

  if (error && !report) {
    return (
      <Panel>
        <H>We need your website address</H>
        <Bad>{error}</Bad>
        <Fine>Type it in and we will look it up. Anything works: your website, or an email address at your domain.</Fine>
        <input
          value={domainDraft}
          onChange={(e) => setDomainDraft(e.target.value)}
          placeholder="yourplace.com"
          style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `1px solid ${C.line}`, padding: '11px 12px', fontSize: 14, color: C.ink, fontFamily: 'inherit' }}
        />
        <div style={{ height: 12 }} />
        <Next onClick={() => void load(domainDraft)} disabled={domainDraft.trim().length < 3}>Check it</Next>
      </Panel>
    )
  }

  if (!report) return <Panel><Loading>Reading your records</Loading></Panel>

  /* Only the records that actually need doing become steps. A card that walks an owner through
   * fixing something already correct is the fastest way to make them stop believing the screen. */
  const todo = report.findings.filter((f) => f.state === 'missing' || f.state === 'weak')

  /* ── 1. look ──────────────────────────────────────────────────────────────────────────────── */
  if (step === 0) {
    return (
      <Panel>
        <Progress steps={STEPS} step={0} />
        <H>{report.headline}</H>
        <Fine>
          We asked the internet what <b>{report.domain}</b> says about who may send email as you. This is
          the same thing Gmail checks before it decides whether your email lands or goes to spam.
        </Fine>

        {!report.domainResolves && (
          <Bad>We could not find that domain at all, so there is nothing to read yet.</Bad>
        )}

        <Section title="What your domain says today">
          {report.findings.map((f) => <FindingRow key={f.key} f={f} />)}
        </Section>

        {report.findings.some((f) => f.state === 'unknown') && (
          <Note>
            One of these we genuinely cannot check from the outside. Your signature sits under a name only
            your email provider knows, so we will not tell you it is missing when it might be there.
          </Note>
        )}

        {todo.length > 0
          ? <Next onClick={() => setStep(1)}>Fix {todo.length === 1 ? 'it' : `these ${todo.length}`}</Next>
          : <Fine style={{ color: C.greenDk, fontWeight: 600 }}>Nothing to fix. Your email is set up to land.</Fine>}
      </Panel>
    )
  }

  /* ── 2. fix, one at a time ────────────────────────────────────────────────────────────────── */
  if (step === 1) {
    const f = todo[i]
    if (!f) { setStep(2); return null }
    const fix = fixFor(f, report.domain)
    const guide = registrarGuide(registrar)

    return (
      <Panel>
        <Progress steps={STEPS} step={1} />
        <Nav onBack={() => (i > 0 ? setI(i - 1) : setStep(0))}>{i + 1} of {todo.length}</Nav>

        <H>{f.label}</H>
        <Fine>{f.problem}</Fine>

        <Section title="Where this goes">
          <Fine>Records live where you bought the domain, which is often not where your website is.</Fine>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {REGISTRAR_KEYS.map((k) => {
              const on = k === registrar
              return (
                <button
                  key={k}
                  onClick={() => setRegistrar(k)}
                  style={{
                    border: `1px solid ${on ? C.green : C.line}`,
                    background: on ? C.greenSoft : '#fff',
                    color: on ? C.greenDk : C.mute,
                    borderRadius: 999, padding: '5px 11px',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {registrarGuide(k).label}
                </button>
              )
            })}
          </div>
          <Fine style={{ marginBottom: 4 }}>{guide.where}</Fine>
          {guide.gotcha && <Note>{guide.gotcha}</Note>}
        </Section>

        {fix && (
          <Section title="What to add">
            <PasteRow label="Type" value={fix.type} />
            <PasteRow label="Name" value={fix.name} />
            {fix.value
              ? <PasteRow label="Value" value={fix.value} big />
              : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 0' }}>
                  <HelpCircle size={14} color={C.faint} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>
                    This is the one value nobody but your email provider can give you.
                  </div>
                </div>
              )}
            <Fine style={{ marginTop: 8 }}>{fix.because}</Fine>
          </Section>
        )}

        <Next onClick={() => (i + 1 < todo.length ? setI(i + 1) : setStep(2))}>
          {i + 1 < todo.length ? 'Next one' : 'I have added these'}
        </Next>
      </Panel>
    )
  }

  /* ── 3. done, which we check rather than take their word for ──────────────────────────────── */
  return (
    <Panel>
      <Progress steps={STEPS} step={2} />
      <H>Let us look again</H>
      <Fine>
        DNS changes can take a few minutes to spread, and sometimes up to a day. Nothing is broken if it
        is not there yet. We check for real, so this will only turn green when it truly is.
      </Fine>

      <Section title="What your domain says now">
        {report.findings.map((f) => <FindingRow key={f.key} f={f} />)}
      </Section>

      {busy && <Loading>Looking again</Loading>}
      <Next onClick={() => void load(report.domain)} disabled={busy}>Check again</Next>
      <div style={{ height: 8 }} />
      <Fine>
        {report.clean
          ? `Everything we can check is right. Your email has the best chance of landing.${stamped ? ' This task is marked done on your campaign.' : ''}`
          : `${report.problems} still to go. Come back after a coffee and press check again.`}
      </Fine>
    </Panel>
  )
}

function FindingRow({ f }: { f: RecordFinding }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '8px 0', borderBottom: `1px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: STATE_TONE[f.state], flexShrink: 0, marginTop: 6 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{f.label}</span>
          <span style={{ fontSize: 12, color: STATE_TONE[f.state] }}>{STATE_WORD[f.state]}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 2 }}>
          {f.problem ?? f.answers}
        </div>
      </div>
    </div>
  )
}

/** A value the owner has to get exactly right, so it is one tap to copy rather than a retype. */
function PasteRow({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>{label}</div>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
          border: `1px solid ${C.line}`, background: '#fff', borderRadius: 11, padding: '9px 11px',
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: big ? 12.5 : 13.5, color: C.ink, wordBreak: 'break-all', lineHeight: 1.4 }}>{value}</span>
        {copied
          ? <Check size={13} color={C.greenDk} style={{ flexShrink: 0 }} />
          : <Copy size={13} color={C.faint} style={{ flexShrink: 0 }} />}
      </button>
    </div>
  )
}

/** Kept exported so the preview route can render the same rows without an API call. */
export { FindingRow as EmailFindingRow }

/** Not used by the walkthrough; here so a future summary card can borrow the tone map. */
export const EMAIL_STATE_TONE = STATE_TONE
export const EMAIL_ALERT_ICON = AlertCircle
