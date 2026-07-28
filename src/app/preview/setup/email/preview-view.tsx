'use client'

/**
 * The walkthrough's own screens, driven by a report the server already fetched.
 *
 * EmailFix fetches on mount from an authenticated route, which a logged-out preview cannot do. So
 * this renders the same three steps from a report handed in as a prop. The steps, the copy and the
 * kit are the component's; only the source of the data differs, which is the same split the gbp
 * preview uses.
 */

import { useState } from 'react'
import { C, Panel, Progress, H, Fine, Section, Note, Bad, Next, Nav } from '@/components/mvp/walkthrough-kit'
import { registrarGuide, REGISTRAR_KEYS, fixFor, type DeliverabilityReport, type RegistrarKey } from '@/lib/email/deliverability'
import { EmailFindingRow } from '@/components/mvp/email-fix'

const STEPS = ['Look', 'Fix', 'Done'] as const

export default function PreviewEmailView({ report }: { report: DeliverabilityReport }) {
  const [step, setStep] = useState(0)
  const [i, setI] = useState(0)
  const [registrar, setRegistrar] = useState<RegistrarKey>('other')

  const todo = report.findings.filter((f) => f.state === 'missing' || f.state === 'weak')

  if (step === 0) {
    return (
      <Panel>
        <Progress steps={STEPS} step={0} />
        <H>{report.headline}</H>
        <Fine>
          We asked the internet what <b>{report.domain}</b> says about who may send email as you. This is
          the same thing Gmail checks before it decides whether your email lands or goes to spam.
        </Fine>
        {!report.domainResolves && <Bad>We could not find that domain at all, so there is nothing to read yet.</Bad>}
        <Section title="What your domain says today">
          {report.findings.map((f) => <EmailFindingRow key={f.key} f={f} />)}
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
                <button key={k} onClick={() => setRegistrar(k)}
                  style={{ border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff',
                    color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '5px 11px',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
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
            <Row label="Type" value={fix.type} />
            <Row label="Name" value={fix.name} />
            {fix.value
              ? <Row label="Value" value={fix.value} />
              : <Fine>This is the one value nobody but your email provider can give you.</Fine>}
            <Fine style={{ marginTop: 8 }}>{fix.because}</Fine>
          </Section>
        )}
        <Next onClick={() => (i + 1 < todo.length ? setI(i + 1) : setStep(2))}>
          {i + 1 < todo.length ? 'Next one' : 'I have added these'}
        </Next>
      </Panel>
    )
  }

  return (
    <Panel>
      <Progress steps={STEPS} step={2} />
      <H>Let us look again</H>
      <Fine>
        DNS changes can take a few minutes to spread, and sometimes up to a day. Nothing is broken if it
        is not there yet. We check for real, so this will only turn green when it truly is.
      </Fine>
      <Section title="What your domain says now">
        {report.findings.map((f) => <EmailFindingRow key={f.key} f={f} />)}
      </Section>
      <Fine>In the real card this button looks the records up again. Here the read happened when the page loaded.</Fine>
      <Next onClick={() => setStep(0)}>Start over</Next>
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>{label}</div>
      <div style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 11, padding: '9px 11px', fontSize: 12.5, color: C.ink, wordBreak: 'break-all', lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}
