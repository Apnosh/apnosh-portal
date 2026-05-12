/**
 * Two-step onboarding flow:
 *   1. Basics form + discovery notes → "Generate foundation" → AI proposal
 *   2. Review the proposal (voice, facts, opening theme), edit if needed,
 *      then "Provision client" → creates rows in clients/brands/facts/
 *      editorial_themes and shows the new client URL.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  UserPlus, Sparkles, Loader2, AlertCircle, CheckCircle2, Trash2, Plus, ArrowLeft, ExternalLink,
} from 'lucide-react'

interface Basics {
  name: string
  location: string
  cuisine: string
  ownerName: string
  socialHandle: string
  email: string
  phone: string
  serviceTier: 'starter' | 'growth' | 'scale'
  discoveryNotes: string
}

interface Proposal {
  voice_summary: string
  voice_traits: string[]
  pet_peeves: string[]
  facts: Array<{ category: string; value: string; rationale: string }>
  opening_theme: { theme_name: string; theme_blurb: string; pillars: string[] }
  why: string
}

interface CommitResult {
  ok: boolean
  clientId: string
  slug: string
  name: string
  factsInserted: number
  brandCreated: boolean
  themeCreated: boolean
  warnings?: string[]
}

const DEFAULT_BASICS: Basics = {
  name: '', location: '', cuisine: '', ownerName: '', socialHandle: '',
  email: '', phone: '', serviceTier: 'starter', discoveryNotes: '',
}

export default function OnboardingView() {
  const [step, setStep] = useState<'basics' | 'review' | 'done'>('basics')
  const [basics, setBasics] = useState<Basics>(DEFAULT_BASICS)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [committed, setCommitted] = useState<CommitResult | null>(null)
  const [busy, setBusy] = useState<null | 'bootstrap' | 'commit'>(null)
  const [error, setError] = useState<string | null>(null)

  const bootstrap = useCallback(async () => {
    if (!basics.name || !basics.location || !basics.cuisine || !basics.ownerName) {
      setError('Name, location, cuisine, owner are required.')
      return
    }
    setBusy('bootstrap'); setError(null)
    try {
      const res = await fetch('/api/work/onboarding/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(basics),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setProposal(j.proposal as Proposal)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [basics])

  const commit = useCallback(async () => {
    if (!proposal) return
    setBusy('commit'); setError(null)
    try {
      const res = await fetch('/api/work/onboarding/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ basics, proposal }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json() as CommitResult
      setCommitted(j)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [basics, proposal])

  const startOver = useCallback(() => {
    setStep('basics')
    setBasics(DEFAULT_BASICS)
    setProposal(null)
    setCommitted(null)
    setError(null)
  }, [])

  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
            <UserPlus className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Onboarding
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          New client intake
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          {step === 'basics' && '5 minutes of discovery, then AI proposes the full starter foundation.'}
          {step === 'review' && 'Review the AI-proposed voice, facts, and opening theme. Edit anything before committing.'}
          {step === 'done' && 'Client provisioned. The rest of the team can pick it up.'}
        </p>
      </header>

      {step === 'basics' && (
        <BasicsStep basics={basics} setBasics={setBasics} onNext={bootstrap} busy={busy === 'bootstrap'} error={error} />
      )}

      {step === 'review' && proposal && (
        <ReviewStep
          proposal={proposal}
          setProposal={setProposal}
          onBack={() => setStep('basics')}
          onCommit={commit}
          busy={busy === 'commit'}
          error={error}
        />
      )}

      {step === 'done' && committed && (
        <DoneStep committed={committed} onStartOver={startOver} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Step 1: Basics
// ─────────────────────────────────────────────────────────────

function BasicsStep({
  basics, setBasics, onNext, busy, error,
}: {
  basics: Basics
  setBasics: (b: Basics) => void
  onNext: () => void
  busy: boolean
  error: string | null
}) {
  const update = (patch: Partial<Basics>) => setBasics({ ...basics, ...patch })
  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Restaurant name *">
          <input value={basics.name} onChange={e => update({ name: e.target.value })}
            placeholder="Vinason Pho" className={INPUT_CLS} />
        </Field>
        <Field label="Cuisine *">
          <input value={basics.cuisine} onChange={e => update({ cuisine: e.target.value })}
            placeholder="Vietnamese / Pho" className={INPUT_CLS} />
        </Field>
        <Field label="Location *">
          <input value={basics.location} onChange={e => update({ location: e.target.value })}
            placeholder="Greenwood, Seattle" className={INPUT_CLS} />
        </Field>
        <Field label="Owner name *">
          <input value={basics.ownerName} onChange={e => update({ ownerName: e.target.value })}
            placeholder="Lucas Tran" className={INPUT_CLS} />
        </Field>
        <Field label="Instagram">
          <input value={basics.socialHandle} onChange={e => update({ socialHandle: e.target.value })}
            placeholder="@vinasonpho" className={INPUT_CLS} />
        </Field>
        <Field label="Service tier">
          <select value={basics.serviceTier} onChange={e => update({ serviceTier: e.target.value as Basics['serviceTier'] })}
            className={INPUT_CLS + ' bg-white'}>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="scale">Scale</option>
          </select>
        </Field>
        <Field label="Email">
          <input value={basics.email} onChange={e => update({ email: e.target.value })}
            placeholder="lucas@vinasonpho.com" className={INPUT_CLS} />
        </Field>
        <Field label="Phone">
          <input value={basics.phone} onChange={e => update({ phone: e.target.value })}
            placeholder="(206) 555-0100" className={INPUT_CLS} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Discovery notes — paste anything from the intake call">
          <textarea
            value={basics.discoveryNotes}
            onChange={e => update({ discoveryNotes: e.target.value })}
            rows={6}
            placeholder="Owner runs the lunch shift personally. Hates the word 'authentic'. Pho takes 12hrs to make. Locals from 11:30-1pm dominate. Has expanded to 5 locations but Greenwood is the original. Wants to drive weekday lunch and family pickup orders. Already tried boosts on Yelp — didn't move the needle."
            className={INPUT_CLS + ' resize-y leading-relaxed'}
          />
        </Field>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onNext} disabled={busy}
          className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate foundation
        </button>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Step 2: Review
// ─────────────────────────────────────────────────────────────

function ReviewStep({
  proposal, setProposal, onBack, onCommit, busy, error,
}: {
  proposal: Proposal
  setProposal: (p: Proposal) => void
  onBack: () => void
  onCommit: () => void
  busy: boolean
  error: string | null
}) {
  const updateFact = (i: number, patch: Partial<Proposal['facts'][number]>) => {
    const facts = [...proposal.facts]
    facts[i] = { ...facts[i], ...patch }
    setProposal({ ...proposal, facts })
  }
  const removeFact = (i: number) => {
    setProposal({ ...proposal, facts: proposal.facts.filter((_, j) => j !== i) })
  }
  const addFact = () => {
    setProposal({ ...proposal, facts: [...proposal.facts, { category: 'differentiator', value: '', rationale: '' }] })
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to basics
      </button>

      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[14px] font-bold text-ink mb-3 inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-600" /> Brand voice
        </h2>
        <Field label="Voice summary">
          <textarea value={proposal.voice_summary} rows={3}
            onChange={e => setProposal({ ...proposal, voice_summary: e.target.value })}
            className={INPUT_CLS + ' resize-y leading-relaxed'} />
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="Traits (one per line)">
            <textarea
              value={proposal.voice_traits.join('\n')} rows={4}
              onChange={e => setProposal({ ...proposal, voice_traits: e.target.value.split('\n').filter(s => s.trim()) })}
              className={INPUT_CLS + ' resize-y'} />
          </Field>
          <Field label="Pet peeves (one per line)">
            <textarea
              value={proposal.pet_peeves.join('\n')} rows={4}
              onChange={e => setProposal({ ...proposal, pet_peeves: e.target.value.split('\n').filter(s => s.trim()) })}
              className={INPUT_CLS + ' resize-y'} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-bold text-ink">Knowledge facts <span className="text-ink-4 text-[12px] font-normal">({proposal.facts.length})</span></h2>
          <button onClick={addFact} className="text-[12px] font-medium px-2 py-1 rounded-md ring-1 ring-ink-6 text-ink-3 hover:bg-ink-7 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add fact
          </button>
        </div>
        <ul className="space-y-2">
          {proposal.facts.map((f, i) => (
            <li key={i} className="rounded-lg ring-1 ring-ink-6/60 p-3">
              <div className="flex items-start gap-2">
                <select value={f.category} onChange={e => updateFact(i, { category: e.target.value })}
                  className="text-[11px] font-medium text-ink-2 px-2 py-1 rounded ring-1 ring-ink-6 bg-white flex-shrink-0">
                  {FACT_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
                <button onClick={() => removeFact(i)} className="text-ink-4 hover:text-red-600 ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input value={f.value} onChange={e => updateFact(i, { value: e.target.value })}
                placeholder="The fact"
                className={INPUT_CLS + ' mt-2 text-[12px]'} />
              <input value={f.rationale} onChange={e => updateFact(i, { rationale: e.target.value })}
                placeholder="Why it matters for content"
                className={INPUT_CLS + ' mt-1 text-[11px] text-ink-3'} />
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
        <h2 className="text-[14px] font-bold text-ink mb-3">Opening theme — month 1</h2>
        <Field label="Theme name">
          <input value={proposal.opening_theme.theme_name}
            onChange={e => setProposal({ ...proposal, opening_theme: { ...proposal.opening_theme, theme_name: e.target.value } })}
            className={INPUT_CLS} />
        </Field>
        <div className="mt-2">
          <Field label="Blurb">
            <textarea value={proposal.opening_theme.theme_blurb} rows={2}
              onChange={e => setProposal({ ...proposal, opening_theme: { ...proposal.opening_theme, theme_blurb: e.target.value } })}
              className={INPUT_CLS + ' resize-y'} />
          </Field>
        </div>
        <div className="mt-2">
          <Field label="Pillars (one per line)">
            <textarea value={proposal.opening_theme.pillars.join('\n')} rows={4}
              onChange={e => setProposal({ ...proposal, opening_theme: { ...proposal.opening_theme, pillars: e.target.value.split('\n').filter(s => s.trim()) } })}
              className={INPUT_CLS + ' resize-y'} />
          </Field>
        </div>
      </section>

      {proposal.why && (
        <p className="text-[11px] text-ink-4 italic px-2">{proposal.why}</p>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[12px] text-red-700 px-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onCommit} disabled={busy}
          className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Provision client
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Step 3: Done
// ─────────────────────────────────────────────────────────────

function DoneStep({ committed, onStartOver }: { committed: CommitResult; onStartOver: () => void }) {
  return (
    <article className="bg-white rounded-2xl ring-1 ring-emerald-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-ink leading-tight">{committed.name} is onboarded</h2>
          <p className="text-[13px] text-ink-2 mt-1 leading-relaxed">
            Brand voice, {committed.factsInserted} knowledge fact{committed.factsInserted === 1 ? '' : 's'},
            and the opening theme are live. The rest of the team can pick it up.
          </p>
        </div>
      </div>

      {committed.warnings && committed.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-100 p-3 mb-4">
          <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider mb-1">Partial warnings</p>
          <ul className="text-[12px] text-amber-900 list-disc list-inside">
            {committed.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <a href={`/work/clients?clientId=${committed.clientId}`}
          className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-ink text-white hover:bg-ink-2 inline-flex items-center gap-1.5">
          Open in Clients <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={onStartOver}
          className="text-[12px] font-medium px-3 py-2 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 inline-flex items-center gap-1.5">
          Onboard another
        </button>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────
// Bits
// ─────────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full text-[13px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-cyan-500 focus:outline-none'

const FACT_CATEGORIES = [
  'menu_signature', 'menu_dietary', 'hours_window', 'location_detail',
  'team_owner', 'team_member', 'origin_story', 'community_tie',
  'differentiator', 'pet_peeve', 'voice_note',
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}
