'use client'

/**
 * /dashboard/google-profile — the owner's section-by-section Google profile
 * fixer, on top of the read-only diagnosis engine (src/lib/gbp-diagnose.ts via
 * GET /api/dashboard/gbp-diagnosis).
 *
 * Design (owner-approved mock): progress "N of M done" + a thin bar, then the
 * sections in engine order. Good sections collapse to a dim row with a green
 * check; problem sections are white cards with a severity dot (missing = red,
 * needs-work = amber, unknown = grey). ONE section is expanded at a time.
 *
 * Honesty rules baked in:
 *  - Every string shown comes from the diagnosis `sections[]` payload, which
 *    the engine builds only from what it actually read on Google. The raw
 *    `notes[]` (which can carry error strings) are NEVER rendered.
 *  - Only the description section gets a "Draft it for me" button (the only
 *    AI draft that is actually built). No fake apply: the draft is copy-only,
 *    with a plain line saying one-tap apply is not built yet.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Check, ChevronDown, Sparkles, Copy, ExternalLink, Plug } from 'lucide-react'
import { useClient } from '@/lib/client-context'

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

export default function GbpFixer() {
  const { client, loading: clientLoading } = useClient()
  const [diag, setDiag] = useState<GbpDiagnosis | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Description draft (the only section with a built AI draft).
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
        <Walkthrough
          diag={diag}
          openKey={openKey}
          onToggle={(k) => setOpenKey((cur) => (cur === k ? null : k))}
          drafting={drafting}
          draft={draft}
          draftError={draftError}
          copied={copied}
          onDraft={() => { void requestDraft() }}
          onCopy={() => { void copyDraft() }}
        />
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

function Walkthrough({ diag, openKey, onToggle, drafting, draft, draftError, copied, onDraft, onCopy }: {
  diag: GbpDiagnosis
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
        </div>
      )}

      {sections.map((s) => (
        s.status === 'good'
          ? <DoneRow key={s.key} section={s} />
          : (
            <ProblemCard
              key={s.key}
              section={s}
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
function ProblemCard({ section, open, onToggle, drafting, draft, draftError, copied, onDraft, onCopy }: {
  section: GbpDiagnosisSection
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
  // "Draft it for me" exists ONLY for the description (the one AI draft that
  // is actually built). Other aiFixable sections get no button yet.
  const canDraft = section.key === 'description' && (section.status === 'needs-work' || section.status === 'missing')

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
