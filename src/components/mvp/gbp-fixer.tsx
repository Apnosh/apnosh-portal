'use client'

/**
 * /dashboard/google-profile — the owner's section-by-section Google profile
 * fixer, on top of the read-only diagnosis engine (src/lib/gbp-diagnose.ts via
 * GET /api/dashboard/gbp-diagnosis).
 *
 * Two experiences on one diagnosis:
 *  - diy (the checklist): progress "N of M done" + a thin bar, then the
 *    sections in engine order. Good sections collapse to a dim row with a
 *    green check; problem sections are white cards with a severity dot
 *    (missing = red, needs-work = amber, unknown = grey). ONE section is
 *    expanded at a time, each with a "Fix it on Google" link.
 *  - ai (Pro, "Apnosh AI"): a guided review, part by part. A small intro
 *    ("Let's review your profile, part by part."), then ONE part per screen
 *    (status chip, what is on Google now, why it matters, and the action:
 *    approve, draft (description only), fix on Google, or skip), then a
 *    summary of every outcome with a fresh "Check my profile again". Review
 *    progress resumes from localStorage (keyed by client id) so a refresh
 *    never restarts at part 1; a fresh all-good read clears the save.
 *
 * Honesty rules baked in:
 *  - Every string shown comes from the diagnosis `sections[]` payload, which
 *    the engine builds only from what it actually read on Google. The raw
 *    `notes[]` (which can carry error strings) are NEVER rendered.
 *  - Only the description section gets a "Draft it for me" button (the only
 *    AI draft that is actually built). No fake apply: the draft is copy-only,
 *    with a plain line saying one-tap apply is not built yet.
 *  - We never claim we changed Google. The owner makes every change there
 *    (or copies the draft over), then tells us with "I updated it".
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Loader2, Check, ChevronDown, ChevronLeft, Sparkles, Copy, ExternalLink, Plug } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { isProTier } from '@/lib/entitlements'

/* Wire types for GET /api/dashboard/gbp-diagnosis — mirrors GbpDiagnosis in
   src/lib/gbp-diagnose.ts (that module is server-only, so the shapes are
   restated here rather than imported into the client bundle). */
type GbpSectionStatus = 'good' | 'needs-work' | 'missing' | 'unknown'
interface GbpDiagnosisSection {
  key: string
  label: string
  status: GbpSectionStatus
  current: string
  why: string
  aiFixable: boolean
}
interface GbpDiagnosis {
  connected: boolean
  /** Connection exists but the read failed — show "try again", never "connect". */
  readFailed?: boolean
  score: number | null
  sections: GbpDiagnosisSection[]
  notes: string[] // never rendered — can carry raw error strings
  checkedAt: string
}

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2',
  line: '#e6e6ea', bg: '#f5f5f7',
  red: '#c0564f', redSoft: '#fdeeee', amber: '#e0a13a',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

const FIXER_CSS = `
.mvp-row{transition:background .12s ease}
.mvp-row:active{background:#f1f5f4}
@media (hover:hover){.mvp-row:hover{background:#f7faf9}}
.mvp-spin{animation:mvpspin .8s linear infinite}
@keyframes mvpspin{to{transform:rotate(360deg)}}
`

/** Severity dot + plain status word for the non-good states. */
const STATUS: Record<Exclude<GbpSectionStatus, 'good'>, { word: string; dot: string }> = {
  missing: { word: 'Missing', dot: C.red },
  'needs-work': { word: 'Needs work', dot: C.amber },
  unknown: { word: "Can't check", dot: C.faint },
}

const DRAFT_FAIL = 'Could not write a draft right now. Try again in a minute.'

/**
 * campaignId: when the walkthrough is a CAMPAIGN task (the gbp card's free self-serve
 * version), the campaign id rides in via ?campaignId=. On a fresh diagnosis where EVERY
 * section is 'good' (connected, no read failure), the task self-completes: one POST to
 * /api/campaigns/:id/gbp-fixed, where the SERVER re-runs the diagnosis and stamps
 * execution.gbpFixedAt only on its own all-good read (the client check here is just a
 * pre-filter so we never call on a failed or partial read). The stamp is first-write-wins
 * on the server, so a later visit can never overwrite when the task was finished.
 * Without campaignId nothing changes.
 *
 * mode: which walkthrough the owner runs. 'ai' = the section-by-section experience WITH the
 * "Draft it for me" AI drafting (Pro only). 'diy' = the plain checklist: same diagnosis, no
 * drafting — each problem section gets a "Fix it on Google" link + the honest self-check.
 * Defaults to 'ai' (legacy/standalone), but AI is ALSO gated on the LIVE client tier here, so a
 * non-Pro owner can never see a draft button (belt-and-suspenders with the server mode-resolution
 * on the /dashboard/google-profile page and the tier gate on the gbp-draft endpoint).
 */
export default function GbpFixer({ campaignId, mode = 'ai' }: { campaignId?: string; mode?: 'diy' | 'ai' }) {
  const { client, loading: clientLoading } = useClient()
  // The AI lane unlocks only when the resolved mode is 'ai' AND this client is still Pro; anything
  // else runs the checklist. A URL/prop alone can never unlock AI without the live Pro entitlement.
  const effectiveMode: 'diy' | 'ai' = mode === 'ai' && isProTier(client?.tier) ? 'ai' : 'diy'
  const [diag, setDiag] = useState<GbpDiagnosis | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [openKey, setOpenKey] = useState<string | null>(null)
  // The campaign task was marked done (the PATCH landed) — drives the plain success line.
  const [taskDone, setTaskDone] = useState(false)
  const markingRef = useRef(false)

  useEffect(() => {
    if (!campaignId || markingRef.current || taskDone) return
    // HONESTY GATE: only a fully successful read where every section is good may complete
    // the task. A load error, a disconnected profile, a failed read, or any section that
    // still needs work leaves the task open.
    if (!diag || loadError || !diag.connected || diag.readFailed) return
    const allGood = (diag.sections?.length ?? 0) > 0 && diag.sections.every((s) => s.status === 'good')
    if (!allGood) return
    markingRef.current = true
    // The server verifies for itself (fresh diagnosis) before stamping; already-done returns ok.
    fetch(`/api/campaigns/${campaignId}/gbp-fixed`, { method: 'POST' })
      .then((r) => { if (r.ok) setTaskDone(true); else markingRef.current = false })
      .catch(() => { markingRef.current = false })
  }, [campaignId, diag, loadError, taskDone])

  // Description draft (the only section with a built AI draft).
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Re-check from the AI review's summary screen: a fresh diagnosis WITHOUT
  // dropping the current one (the review stays on screen while it runs). A
  // fresh all-good read here is what flips the campaign task done, via the
  // same gbp-fixed effect above.
  const [rechecking, setRechecking] = useState(false)
  const [recheckFailed, setRecheckFailed] = useState(false)
  const recheck = useCallback(() => {
    if (!client?.id || rechecking) return
    setRechecking(true)
    setRecheckFailed(false)
    fetch(`/api/dashboard/gbp-diagnosis?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`recheck failed (${r.status})`)
        return r.json() as Promise<GbpDiagnosis>
      })
      .then((j) => setDiag(j))
      .catch(() => setRecheckFailed(true))
      .finally(() => setRechecking(false))
  }, [client?.id, rechecking])

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setLoadError(false)
    setDiag(null)
    fetch(`/api/dashboard/gbp-diagnosis?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`load failed (${r.status})`)
        return r.json() as Promise<GbpDiagnosis>
      })
      .then((j) => {
        if (!live) return
        setDiag(j)
        // Open the first section that needs attention (one open at a time).
        const first = (j.sections ?? []).find((s) => s.status !== 'good')
        setOpenKey(first ? first.key : null)
      })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [client?.id, reload])

  const requestDraft = useCallback(async () => {
    if (!client?.id || drafting) return
    setDrafting(true)
    setDraftError(null)
    try {
      const r = await fetch('/api/dashboard/gbp-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, section: 'description' }),
      })
      const j = await r.json().catch(() => ({})) as { draft?: unknown; error?: unknown }
      if (!r.ok || typeof j.draft !== 'string' || !j.draft.trim()) {
        // Only surface the server's message on our own 502s (those are written
        // in plain owner words); anything else gets the generic plain line.
        const msg = r.status === 502 && typeof j.error === 'string' && j.error ? j.error : DRAFT_FAIL
        throw new Error(msg)
      }
      setDraft(j.draft)
    } catch (e) {
      setDraftError(e instanceof Error && e.message ? e.message : DRAFT_FAIL)
    } finally {
      setDrafting(false)
    }
  }, [client?.id, drafting])

  const copyDraft = useCallback(async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setDraftError('Copy did not work. Press and hold the text to copy it yourself.')
    }
  }, [draft])

  const loading = clientLoading || (!diag && !loadError)

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{FIXER_CSS}</style>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 0', color: C.mute }}>
          <Loader2 size={22} className="mvp-spin" color={C.green} />
          <span style={{ fontSize: 13.5 }}>Checking your Google profile&hellip;</span>
        </div>
      )}

      {!loading && loadError && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '22px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>We could not check your profile right now</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>Something went wrong on our side. Give it a minute and try again.</div>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="mvp-row"
            style={{ marginTop: 14, padding: '10px 22px', borderRadius: 11, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && diag && !diag.connected && <NotConnected />}

      {!loading && !loadError && diag && diag.connected && diag.readFailed && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '26px 20px', textAlign: 'center' }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plug size={22} color={C.greenDk} />
          </span>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, marginTop: 12 }}>Google is connected</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 5, lineHeight: 1.5 }}>
            But we could not read your profile just now. Give it a minute and try again.
          </div>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="mvp-row"
            style={{ marginTop: 16, padding: '12px 24px', borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && diag && diag.connected && !diag.readFailed && (
        effectiveMode === 'ai' ? (
          <AiReview
            diag={diag}
            clientId={client?.id ?? ''}
            taskDone={taskDone}
            rechecking={rechecking}
            recheckFailed={recheckFailed}
            onRecheck={recheck}
            drafting={drafting}
            draft={draft}
            draftError={draftError}
            copied={copied}
            onDraft={() => { void requestDraft() }}
            onCopy={() => { void copyDraft() }}
          />
        ) : (
          <Walkthrough
            diag={diag}
            mode="diy"
            taskDone={taskDone}
            openKey={openKey}
            onToggle={(k) => setOpenKey((cur) => (cur === k ? null : k))}
            drafting={drafting}
            draft={draft}
            draftError={draftError}
            copied={copied}
            onDraft={() => { void requestDraft() }}
            onCopy={() => { void copyDraft() }}
          />
        )
      )}
    </div>
  )
}

/* ── Not connected ─────────────────────────────────────────────── */

function NotConnected() {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '26px 20px', textAlign: 'center' }}>
      <span style={{ width: 46, height: 46, borderRadius: 13, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plug size={22} color={C.greenDk} />
      </span>
      <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, marginTop: 12 }}>Connect Google first</div>
      <div style={{ fontSize: 13.5, color: C.mute, marginTop: 5, lineHeight: 1.5 }}>
        Your Google Business Profile is not connected yet. Connect it and we will check your listing, section by section.
      </div>
      <Link
        href="/dashboard/connected-accounts"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, height: 46, borderRadius: 13, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
      >
        Connect Google
      </Link>
    </div>
  )
}

/* ── The section walkthrough ───────────────────────────────────── */

function Walkthrough({ diag, mode, taskDone, openKey, onToggle, drafting, draft, draftError, copied, onDraft, onCopy }: {
  diag: GbpDiagnosis
  /** 'ai' = the "Draft it for me" experience; 'diy' = the plain checklist (Fix-it-on-Google links). */
  mode: 'diy' | 'ai'
  /** The campaign task tied to this walkthrough was just marked done (all-good + PATCH landed). */
  taskDone?: boolean
  openKey: string | null
  onToggle: (key: string) => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  copied: boolean
  onDraft: () => void
  onCopy: () => void
}) {
  const sections = diag.sections
  const done = sections.filter((s) => s.status === 'good').length
  const total = sections.length
  const allDone = total > 0 && done === total

  return (
    <>
      {/* Progress: N of M done + a thin bar. */}
      <div style={{ padding: '2px 2px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>{done} of {total} done</span>
          {!allDone && <span style={{ fontSize: 12.5, color: C.mute }}>Tap a section to see it</span>}
        </div>
        <div style={{ height: 5, borderRadius: 99, background: '#e9e9ee', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${total ? Math.round((done / total) * 100) : 0}%`, background: C.green, borderRadius: 99, transition: 'width .4s ease' }} />
        </div>
      </div>

      {allDone && (
        <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Every section looks good</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>Nothing needs fixing right now. Come back after big changes to check again.</div>
          {/* Only shown after the campaign PATCH actually landed — never claimed on a failed save. */}
          {taskDone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, fontWeight: 600, color: C.greenDk }}>
              <Check size={14} strokeWidth={3} /> All done. This campaign task is complete.
            </div>
          )}
        </div>
      )}

      {sections.map((s) => (
        s.status === 'good'
          ? <DoneRow key={s.key} section={s} />
          : (
            <ProblemCard
              key={s.key}
              section={s}
              mode={mode}
              open={openKey === s.key}
              onToggle={() => onToggle(s.key)}
              drafting={drafting}
              draft={draft}
              draftError={draftError}
              copied={copied}
              onDraft={onDraft}
              onCopy={onCopy}
            />
          )
      ))}

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '12px 0 2px' }}>
        Read from your live Google listing.
      </div>
    </>
  )
}

/** A good section: a dim row with a green check + its current text. */
function DoneRow({ section }: { section: GbpDiagnosisSection }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', marginBottom: 6, opacity: 0.72 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Check size={13} color={C.greenDk} strokeWidth={3} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{section.label}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, lineHeight: 1.35 }}>{section.current}</span>
      </span>
    </div>
  )
}

/** A missing / needs-work / unknown section: a card, one expanded at a time. */
function ProblemCard({ section, mode, open, onToggle, drafting, draft, draftError, copied, onDraft, onCopy }: {
  section: GbpDiagnosisSection
  mode: 'diy' | 'ai'
  open: boolean
  onToggle: () => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  copied: boolean
  onDraft: () => void
  onCopy: () => void
}) {
  const meta = STATUS[section.status as Exclude<GbpSectionStatus, 'good'>] ?? STATUS.unknown
  const wordColor = section.status === 'unknown' ? C.mute : meta.dot
  const actionable = section.status === 'needs-work' || section.status === 'missing'
  // "Draft it for me" exists ONLY in ai mode, ONLY for the description (the one AI draft that
  // is actually built). Other aiFixable sections get no button yet.
  const canDraft = mode === 'ai' && section.key === 'description' && actionable
  // Checklist (diy) mode: every problem section gets a "Fix it on Google" link + the honest
  // self-check line instead of an AI draft. AI mode's non-description sections stay as they were.
  const showFixOnGoogle = mode === 'diy' && actionable

  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="mvp-row"
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{section.label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: wordColor, flexShrink: 0 }}>{meta.word}</span>
        <ChevronDown size={16} color={C.faint} style={{ flexShrink: 0, transition: 'transform .18s ease', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{ padding: '0 14px 15px' }}>
          {section.status === 'unknown' ? (
            // Unknown sections show their reason (a safe, plain string the
            // engine wrote itself — never a raw error).
            <p style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, margin: 0 }}>{section.current}</p>
          ) : (
            <>
              <div style={{ background: C.bg, borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>Yours today</div>
                <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{section.current}</div>
              </div>
              <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: 0 }}>{section.why}</p>
              {canDraft && (
                <DraftBlock
                  drafting={drafting}
                  draft={draft}
                  draftError={draftError}
                  copied={copied}
                  onDraft={onDraft}
                  onCopy={onCopy}
                />
              )}
              {showFixOnGoogle && <FixOnGoogleBlock />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The description draft: button → white box with Copy + the honest apply line. */
function DraftBlock({ drafting, draft, draftError, copied, onDraft, onCopy }: {
  drafting: boolean
  draft: string | null
  draftError: string | null
  copied: boolean
  onDraft: () => void
  onCopy: () => void
}) {
  return (
    <div style={{ marginTop: 12 }}>
      {!draft && (
        <button
          type="button"
          onClick={onDraft}
          disabled={drafting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 44, borderRadius: 12, border: 'none', background: C.green, color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: drafting ? 'default' : 'pointer', opacity: drafting ? 0.8 : 1, font: 'inherit' }}
        >
          {drafting
            ? <><Loader2 size={16} className="mvp-spin" /> Writing your draft&hellip;</>
            : <><Sparkles size={16} /> Draft it for me</>}
        </button>
      )}

      {draft && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '12px 13px' }}>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{draft}</div>
          <button
            type="button"
            onClick={onCopy}
            style={{ marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 40, borderRadius: 11, border: 'none', background: copied ? C.greenDk : C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit', transition: 'background .15s ease' }}
          >
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
          </button>
          <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
            One-tap apply to Google is coming. For now, copy this into your Google profile.
          </p>
          <a
            href="https://business.google.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}
          >
            Open Google Business Profile <ExternalLink size={12} />
          </a>
        </div>
      )}

      {draftError && (
        <div style={{ marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
          {draftError}
        </div>
      )}
    </div>
  )
}

/** Checklist (diy) mode: no AI. A link to fix this section on Google + the honest self-check line
 *  (the walkthrough re-checks your live profile itself, so there is nothing to mark done by hand). */
function FixOnGoogleBlock() {
  return (
    <div style={{ marginTop: 12 }}>
      <a
        href="https://business.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}
      >
        Fix it on Google <ExternalLink size={15} />
      </a>
      <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
        Fix this in your Google profile, then come back. We check it for you when you refresh.
      </p>
    </div>
  )
}

/* ── Apnosh AI: the guided review, part by part ─────────────────── */

/** What the owner said about a part (or what the read said, for good/unknown). */
type PartOutcome = 'good' | 'updated' | 'skipped' | 'unknown'

type ReviewPhase = { name: 'intro' } | { name: 'part'; index: number } | { name: 'summary' }

/** Status chip for the part screens. Every word is plain and honest. */
const AI_CHIP: Record<GbpSectionStatus, { word: string; color: string; bg: string }> = {
  good: { word: 'Looks good', color: C.greenDk, bg: C.greenSoft },
  'needs-work': { word: 'Needs work', color: '#9a6b17', bg: '#faf1de' },
  missing: { word: 'Missing', color: C.red, bg: C.redSoft },
  unknown: { word: 'Could not check', color: C.mute, bg: '#f0f0f3' },
}

const reviewStorageKey = (clientId: string) => `mvp-gbp-review:${clientId}`

/** The summary word for a part. A fresh read always wins: a part that now
 *  reads good says "Looks good" no matter what the owner tapped earlier. */
function summaryOutcome(section: GbpDiagnosisSection, outcomes: Record<string, PartOutcome>): { word: string; color: string; good: boolean } {
  if (section.status === 'good') return { word: 'Looks good', color: C.greenDk, good: true }
  if (section.status === 'unknown') return { word: 'Could not check', color: C.faint, good: false }
  if (outcomes[section.key] === 'updated') return { word: 'You updated it', color: C.greenDk, good: false }
  return { word: 'Skipped', color: C.mute, good: false }
}

/**
 * The AI-mode review: intro → one part per screen → summary.
 *
 * Resume: { phase, index, outcomes } persists in localStorage keyed by client
 * id, restored in an effect (never on the server render, so hydration stays
 * clean). A fresh all-good diagnosis clears the save.
 *
 * The initial* props are a TEST SEAM for the render smoke only (they pick the
 * first screen without localStorage); the live page never passes them.
 */
export function AiReview({ diag, clientId, taskDone, rechecking, recheckFailed, onRecheck, drafting, draft, draftError, copied, onDraft, onCopy, initialPhase, initialIndex, initialOutcomes }: {
  diag: GbpDiagnosis
  clientId: string
  taskDone?: boolean
  rechecking?: boolean
  recheckFailed?: boolean
  onRecheck?: () => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  copied: boolean
  onDraft: () => void
  onCopy: () => void
  initialPhase?: 'intro' | 'part' | 'summary'
  initialIndex?: number
  initialOutcomes?: Record<string, PartOutcome>
}) {
  const sections = diag.sections ?? []
  const total = sections.length
  const allGood = total > 0 && sections.every((s) => s.status === 'good')

  const [phase, setPhase] = useState<ReviewPhase>(() => (
    initialPhase === 'summary' ? { name: 'summary' }
      : initialPhase === 'part' ? { name: 'part', index: Math.min(Math.max(initialIndex ?? 0, 0), Math.max(total - 1, 0)) }
        : { name: 'intro' }
  ))
  const [outcomes, setOutcomes] = useState<Record<string, PartOutcome>>(initialOutcomes ?? {})
  const restoredRef = useRef(false)
  const storageKey = reviewStorageKey(clientId)

  // Resume: a refresh mid-review lands back on the same part (or the summary).
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as { phase?: unknown; index?: unknown; outcomes?: unknown } | null
      if (!saved || typeof saved !== 'object') return
      const safe: Record<string, PartOutcome> = {}
      if (saved.outcomes && typeof saved.outcomes === 'object') {
        for (const [k, v] of Object.entries(saved.outcomes as Record<string, unknown>)) {
          if (v === 'good' || v === 'updated' || v === 'skipped' || v === 'unknown') safe[k] = v
        }
      }
      if (Object.keys(safe).length) setOutcomes((cur) => ({ ...safe, ...cur }))
      if (saved.phase === 'summary') setPhase({ name: 'summary' })
      else if (saved.phase === 'part' && typeof saved.index === 'number' && total > 0) {
        setPhase({ name: 'part', index: Math.min(Math.max(Math.floor(saved.index), 0), total - 1) })
      }
    } catch { /* a bad save never blocks the review */ }
  }, [storageKey, total])

  // Persist progress (only once a review has started; never after an all-good
  // read, which clears the save below instead).
  useEffect(() => {
    if (!restoredRef.current || allGood || phase.name === 'intro') return
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        phase: phase.name,
        index: phase.name === 'part' ? phase.index : Math.max(total - 1, 0),
        outcomes,
      }))
    } catch { /* storage being unavailable never blocks the review */ }
  }, [phase, outcomes, storageKey, allGood, total])

  // A fresh all-good read leaves nothing to resume.
  useEffect(() => {
    if (!allGood) return
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
  }, [allGood, storageKey])

  const finishPart = useCallback((sectionKey: string, outcome: PartOutcome, index: number) => {
    setOutcomes((cur) => ({ ...cur, [sectionKey]: outcome }))
    setPhase(index + 1 >= total ? { name: 'summary' } : { name: 'part', index: index + 1 })
  }, [total])

  if (total === 0) {
    // The engine always emits its sections; this is a pure safety net.
    return (
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '22px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>We could not read the parts of your profile</div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>Give it a minute and try again.</div>
      </div>
    )
  }

  return (
    <>
      {phase.name === 'intro' && (
        <AiIntro
          total={total}
          needsWork={sections.filter((s) => s.status === 'needs-work' || s.status === 'missing').length}
          onStart={() => setPhase({ name: 'part', index: 0 })}
        />
      )}

      {phase.name === 'part' && sections[phase.index] && (
        <AiPart
          section={sections[phase.index]}
          index={phase.index}
          total={total}
          onBack={() => setPhase(phase.index === 0 ? { name: 'intro' } : { name: 'part', index: phase.index - 1 })}
          onDone={(outcome) => finishPart(sections[phase.index].key, outcome, phase.index)}
          drafting={drafting}
          draft={draft}
          draftError={draftError}
          copied={copied}
          onDraft={onDraft}
          onCopy={onCopy}
        />
      )}

      {phase.name === 'summary' && (
        <AiSummary
          sections={sections}
          outcomes={outcomes}
          allGood={allGood}
          taskDone={taskDone}
          rechecking={rechecking}
          recheckFailed={recheckFailed}
          onRecheck={onRecheck}
          onBack={() => setPhase({ name: 'part', index: total - 1 })}
        />
      )}

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '14px 0 2px' }}>
        Read from your live Google listing.
      </div>
    </>
  )
}

/** The intro moment: what this is, how many parts, one Start button. */
function AiIntro({ total, needsWork, onStart }: { total: number; needsWork: number; onStart: () => void }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '26px 20px', textAlign: 'center' }}>
      <span style={{ width: 46, height: 46, borderRadius: 13, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={22} color={C.greenDk} />
      </span>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, marginTop: 12 }}>
        Let&rsquo;s review your profile, part by part.
      </div>
      <div style={{ fontSize: 13.5, color: C.mute, marginTop: 6, lineHeight: 1.55 }}>
        Your Google listing has {total} parts. We checked each one.{' '}
        {needsWork > 0
          ? `${needsWork} ${needsWork === 1 ? 'part could use' : 'parts could use'} some work.`
          : 'They all look good right now.'}{' '}
        You approve each part as we go.
      </div>
      <button
        type="button"
        onClick={onStart}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 18, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
      >
        Start the review
      </button>
    </div>
  )
}

/** One part per screen: progress, name + status chip, what Google shows now,
 *  why it matters, then the action for this part's status. */
function AiPart({ section, index, total, onBack, onDone, drafting, draft, draftError, copied, onDraft, onCopy }: {
  section: GbpDiagnosisSection
  index: number
  total: number
  onBack: () => void
  onDone: (outcome: PartOutcome) => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  copied: boolean
  onDraft: () => void
  onCopy: () => void
}) {
  const chip = AI_CHIP[section.status] ?? AI_CHIP.unknown
  const actionable = section.status === 'needs-work' || section.status === 'missing'
  // "Draft it for me" exists ONLY for the description (the one AI draft that is actually built).
  const canDraft = actionable && section.key === 'description'
  const current = section.current && section.current.trim() ? section.current : 'Nothing yet'

  return (
    <>
      <div style={{ padding: '2px 2px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: -6, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          >
            <ChevronLeft size={19} color={C.mute} />
          </button>
          <span style={{ fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>Part {index + 1} of {total}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: '#e9e9ee', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(((index + 1) / total) * 100)}%`, background: C.green, borderRadius: 99, transition: 'width .4s ease' }} />
        </div>
      </div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '17px 15px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.25 }}>{section.label}</span>
          <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: chip.color, background: chip.bg, borderRadius: 99, padding: '4px 10px' }}>{chip.word}</span>
        </div>

        {section.status === 'unknown' ? (
          <>
            <p style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, margin: 0 }}>We could not read this part.</p>
            {section.current && (
              <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: '6px 0 0' }}>{section.current}</p>
            )}
            <button
              type="button"
              onClick={() => onDone('unknown')}
              className="mvp-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 14, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
            >
              Skip for now
            </button>
          </>
        ) : (
          <>
            <div style={{ background: C.bg, borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>On Google now</div>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{current}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>Why it matters</div>
            <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: 0 }}>{section.why}</p>

            {section.status === 'good' ? (
              <button
                type="button"
                onClick={() => onDone('good')}
                className="mvp-row"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
              >
                Looks good, next
              </button>
            ) : (
              <>
                {canDraft ? (
                  <DraftBlock
                    drafting={drafting}
                    draft={draft}
                    draftError={draftError}
                    copied={copied}
                    onDraft={onDraft}
                    onCopy={onCopy}
                  />
                ) : (
                  <AiFixLink />
                )}
                <button
                  type="button"
                  onClick={() => onDone('updated')}
                  className="mvp-row"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, height: 46, borderRadius: 13, border: 'none', background: canDraft && !draft ? '#fff' : C.green, color: canDraft && !draft ? C.greenDk : '#fff', ...(canDraft && !draft ? { border: `0.5px solid ${C.line}` } : {}), fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
                >
                  <Check size={16} strokeWidth={3} /> I updated it
                </button>
                <button
                  type="button"
                  onClick={() => onDone('skipped')}
                  className="mvp-row"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 6, height: 42, borderRadius: 12, border: 'none', background: 'none', color: C.mute, fontSize: 14, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}
                >
                  Skip for now
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** AI review's fix-it link for parts without a built draft. Honest: the owner
 *  makes the change on Google, we never claim to. */
function AiFixLink() {
  return (
    <div style={{ marginTop: 12 }}>
      <a
        href="https://business.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}
      >
        Fix it on Google <ExternalLink size={15} />
      </a>
      <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
        Make the change on Google, then come back and tap I updated it.
      </p>
    </div>
  )
}

/** The summary: every part with its outcome, then a fresh re-check (which is
 *  what can complete the campaign task) and the honest delay note. */
function AiSummary({ sections, outcomes, allGood, taskDone, rechecking, recheckFailed, onRecheck, onBack }: {
  sections: GbpDiagnosisSection[]
  outcomes: Record<string, PartOutcome>
  allGood: boolean
  taskDone?: boolean
  rechecking?: boolean
  recheckFailed?: boolean
  onRecheck?: () => void
  onBack: () => void
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 14px' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mvp-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: -6, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ChevronLeft size={19} color={C.mute} />
        </button>
        <span style={{ fontFamily: DISPLAY, fontSize: 16.5, fontWeight: 600, color: C.ink }}>
          {allGood ? 'Every part looks good' : 'You went through every part'}
        </span>
      </div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '4px 0', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        {sections.map((s, i) => {
          const o = summaryOutcome(s, outcomes)
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
              {o.good
                ? (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={12} color={C.greenDk} strokeWidth={3} />
                  </span>
                )
                : <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color }} /></span>}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>{s.label}</span>
              <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: o.color }}>{o.word}</span>
            </div>
          )
        })}
      </div>

      {allGood ? (
        <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', marginTop: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Every section looks good</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>Nothing needs fixing right now. Come back after big changes to check again.</div>
          {/* Only shown after the campaign PATCH actually landed. Never claimed on a failed save. */}
          {taskDone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, fontWeight: 600, color: C.greenDk }}>
              <Check size={14} strokeWidth={3} /> All done. This campaign task is complete.
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onRecheck}
            disabled={!!rechecking}
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: rechecking ? 'default' : 'pointer', opacity: rechecking ? 0.8 : 1, font: 'inherit' }}
          >
            {rechecking
              ? <><Loader2 size={16} className="mvp-spin" /> Checking your profile&hellip;</>
              : 'Check my profile again'}
          </button>
          {recheckFailed && (
            <div style={{ marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
              We could not check right now. Try again in a minute.
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '10px 2px 0' }}>
            Changes you make on Google can take a few minutes to show up here.
          </p>
        </>
      )}
    </>
  )
}
