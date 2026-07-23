'use client'

/**
 * MeasureSetup — the owner-run walkthrough for "Get measurable": Search Console and Analytics.
 *
 * Same look and sequence as the other setup walkthroughs, on the shared walkthrough-kit. What
 * sets it apart is the honest one: DONE HERE IS PROVEN, not claimed. The listings card ends in
 * the owner's word because we cannot see inside Yelp. This card reads real connection status,
 * which the health cron proves daily by reading the actual data path, so when it says a tool is
 * connected, data is genuinely flowing. There is no self-attested completion stamp because none
 * is needed: the connection IS the proof.
 *
 *   1 look   which of the two tools is live, which is missing
 *   2 set up  one tool at a time, with the exact steps for their host
 *   3 done   what is measurable now, read straight from the live connection
 */

import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, AlertCircle, Copy, Search, BarChart3 } from 'lucide-react'
import {
  C, Panel, Progress, H, Fine, Section, Note, Bad, Loading, Next, Nav,
} from './walkthrough-kit'
import type { MeasurePlan, MeasureTool, ToolStatus, MeasureToolKey } from '@/lib/measure/setup'
import { stepsFor, hostGuide } from '@/lib/measure/setup'

const STEPS = ['Look', 'Set up', 'Done'] as const

const STATUS_WORD: Record<ToolStatus, string> = {
  connected: 'sending data', attention: 'stopped sending', missing: 'not set up',
}
const STATUS_TONE: Record<ToolStatus, string> = {
  connected: C.green, attention: C.amber, missing: C.faint,
}
const ICON: Record<MeasureToolKey, typeof Search> = { search_console: Search, analytics: BarChart3 }

export default function MeasureSetup({ campaignId }: { campaignId?: string }) {
  void campaignId // reserved: post-ship task resumability; the back link is owned by the page
  const [plan, setPlan] = useState<MeasurePlan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [i, setI] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/measure')
      const body = await res.json()
      if (!res.ok) { setLoadError(body?.error ?? 'Could not read your setup.'); return }
      setPlan(body as MeasurePlan)
    } catch { setLoadError('Could not read your setup.') }
  }, [])
  useEffect(() => { void load() }, [load])

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!plan) return <Panel><Loading>Checking what you can measure…</Loading></Panel>

  const current = plan.todo[i] ?? null

  return (
    <Panel>
      <Progress steps={STEPS} step={step} />

      {/* 1 ── the two tools, and which is real. Read live, so it is true. */}
      {step === 0 && (
        <>
          <H>{plan.headline}</H>

          <Section title="Your two measuring tools">
            {plan.tools.map((t) => <ToolRow key={t.key} tool={t} />)}
          </Section>

          {plan.measured ? (
            <Note>
              Both are live. Every other campaign you run can now show whether it actually moved
              anything, instead of you taking our word for it.
            </Note>
          ) : (
            <Fine>
              These start collecting the day you turn them on, and never backfill. Even if you will
              not look for a month, set them up now so there is history when you do.
            </Fine>
          )}

          {plan.host.key !== 'other' && !plan.measured && (
            <Note>Your site is on {plan.host.label}, so the steps below are the {plan.host.label} way, not a generic one.</Note>
          )}

          {plan.todo.length > 0
            ? <Next onClick={() => { setI(0); setStep(1) }}>
                {plan.todo.some((t) => t.status === 'attention') ? 'Fix what stopped' : 'Set the first one up'}
              </Next>
            : <Fine style={{ textAlign: 'center', marginTop: 8 }}>Nothing to set up. You are fully measurable.</Fine>}
        </>
      )}

      {/* 2 ── one tool, the steps for their host, and the address to grant us. */}
      {step === 1 && current && (
        <SetUpStep
          tool={current} plan={plan} index={i} total={plan.todo.length}
          onBack={() => (i === 0 ? setStep(0) : setI(i - 1))}
          onNext={() => (i + 1 >= plan.todo.length ? (setStep(2), void load()) : setI(i + 1))}
        />
      )}

      {/* 3 ── what is measurable now, re-read from the live connection. */}
      {step === 2 && (
        <>
          <H>{plan.measured ? 'You can measure everything now' : 'Some of it is measurable'}</H>
          <div style={{ background: plan.measured ? C.greenSoft : C.amberSoft, borderRadius: 13, padding: 13, marginBottom: 14 }}>
            {plan.tools.map((t) => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.ink, padding: '3px 0' }}>
                {t.status === 'connected'
                  ? <Check size={13} color={C.greenDk} />
                  : <AlertCircle size={13} color={C.amber} />}
                {t.label}: {STATUS_WORD[t.status]}
              </div>
            ))}
          </div>
          {/* The honest note: a just-granted connection can take a little while to show as live,
              and that is different from it having failed. */}
          {!plan.measured && (
            <Fine>
              If you just finished the steps, a new connection can take a little while to show as
              live here. Check back in a bit. If it still says not set up, the steps did not finish.
            </Fine>
          )}
          <Section title="Worth knowing">
            <Fine>Once these are on, they run themselves. You will only hear from us if one stops sending data, and then we tell you exactly what to re-grant.</Fine>
          </Section>
        </>
      )}
    </Panel>
  )
}

function SetUpStep({ tool, plan, index, total, onBack, onNext }: {
  tool: MeasureTool; plan: MeasurePlan; index: number; total: number; onBack: () => void; onNext: () => void
}) {
  const steps = stepsFor(tool.key, hostGuide(plan.host.key), plan.serviceAccountEmail)
  const Icon = ICON[tool.key]
  return (
    <>
      <Fine style={{ marginBottom: 6 }}>{index + 1} of {total}</Fine>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={18} color={C.ink} />
        <H>{tool.label}</H>
      </div>
      <Fine>{tool.answers}.</Fine>

      {tool.status === 'attention' && tool.attentionReason && (
        <Note>{tool.attentionReason}</Note>
      )}

      <Section title={tool.status === 'attention' ? 'Turn it back on' : 'Set it up'}>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {steps.map((s, n) => (
            <li key={n} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, marginBottom: 8 }}>
              {plan.serviceAccountEmail && s.includes(plan.serviceAccountEmail)
                ? <GrantLine text={s} email={plan.serviceAccountEmail} />
                : s}
            </li>
          ))}
        </ol>
      </Section>

      {plan.host.verifyGotcha && tool.key === 'search_console' && (
        <Note>{plan.host.verifyGotcha}</Note>
      )}

      <a href={tool.key === 'search_console' ? 'https://search.google.com/search-console' : 'https://analytics.google.com/'}
        target="_blank" rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 15px', fontSize: 13.5, fontWeight: 650, color: C.ink, textDecoration: 'none', marginBottom: 12 }}>
        Open {tool.label} <ExternalLink size={13} />
      </a>

      <Nav onBack={onBack}>
        <Next onClick={onNext}>{index + 1 >= total ? 'Done for now' : 'Next tool'}</Next>
      </Nav>
    </>
  )
}

/** The grant step carries an email the owner must paste exactly. Make it copyable, since a
 *  typo here is the single most common reason the connection silently never lands. */
function GrantLine({ text, email }: { text: string; email: string }) {
  const [copied, setCopied] = useState(false)
  const [before, after] = text.split(email)
  return (
    <>
      {before}
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.greenSoft, border: 'none', borderRadius: 7, padding: '1px 7px', font: 'inherit', fontSize: 13, fontWeight: 650, color: C.greenDk, cursor: 'pointer' }}>
        {email} {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
      {after}
    </>
  )
}

function ToolRow({ tool }: { tool: MeasureTool }) {
  const Icon = ICON[tool.key]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
      <Icon size={17} color={C.mute} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, color: C.ink }}>{tool.label}</div>
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.4 }}>{tool.answers}</div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_TONE[tool.status] }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: tool.status === 'connected' ? C.greenDk : tool.status === 'attention' ? C.amber : C.faint }}>
          {STATUS_WORD[tool.status]}
        </span>
      </span>
    </div>
  )
}
