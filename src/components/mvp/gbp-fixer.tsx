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
 *    (status chip, the REAL content on Google now via the engine's `detail`
 *    payload — the 7-day hours table, the category chips, the full
 *    description, the photo grid, the menu items, the website + phone —
 *    with the summary string as the fallback when detail is absent; why it
 *    matters; and the action: EDIT it right here for the kinds the save
 *    rail supports (description / hours / website+phone, via
 *    POST /api/dashboard/gbp-apply), or an "Edit this on Google" link for
 *    the kinds it does not (categories / menu / photos); then "Next"
 *    ("Finish" on the last part) moves on. A summary of every outcome ends
 *    the review with a fresh "Check my profile again" and a What's-next
 *    pointer to the reviews inbox. Review progress resumes from
 *    localStorage (keyed by client id) so a refresh never restarts at
 *    part 1; a fresh all-good read clears the save.
 *
 * The STANDALONE door (no campaignId) opens on a small hub first ("Your
 * Google helper"): one card into this review, one card out to the reviews
 * inbox (/dashboard/inbox?tab=reviews). The campaign door skips the hub.
 *
 * Honesty rules baked in:
 *  - Every string shown comes from the diagnosis `sections[]` payload, which
 *    the engine builds only from what it actually read on Google. The raw
 *    `notes[]` (which can carry error strings) are NEVER rendered.
 *  - Saves are never optimistic: "Saved to Google." appears ONLY when the
 *    rail returned live:true (read-back proof). ok-without-proof reads as
 *    "Sent to Google. It can take a few minutes to show." Failures show the
 *    server's plain 400/403 words, the 429 per-minute line, or a generic
 *    could-not-save line (raw 5xx strings are never rendered).
 *  - After any accepted save the diagnosis silently re-fetches once, so the
 *    content and statuses on screen stay what Google actually shows.
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import { Loader2, Check, ChevronDown, ChevronLeft, ChevronRight, Sparkles, Copy, ExternalLink, Plug, Pencil, Star } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { isProTier } from '@/lib/entitlements'

/* Wire types for GET /api/dashboard/gbp-diagnosis — mirrors GbpDiagnosis in
   src/lib/gbp-diagnose.ts (that module is server-only, so the shapes are
   restated here rather than imported into the client bundle). */
type GbpSectionStatus = 'good' | 'needs-work' | 'missing' | 'unknown'
/** Per-section content detail (mirrors GbpSectionDetail in gbp-diagnose.ts).
 *  Every value was read from Google on this diagnosis; when a read failed the
 *  engine omits `detail` and the UI falls back to the `current` summary. */
type GbpSectionDetail =
  | { kind: 'hours'; days: Array<{ day: string; hours: string }>; specialCount?: number }
  | { kind: 'categories'; primary: string | null; additional: string[] }
  | { kind: 'description'; text: string | null }
  | { kind: 'photos'; count: number; newestLabel?: string; items: Array<{ url: string }> }
  | { kind: 'menu'; itemCount: number; items: Array<{ name: string; price?: string }>; menuLink?: string | null }
  | { kind: 'links'; website: string | null; phone: string | null }
interface GbpDiagnosisSection {
  key: string
  label: string
  status: GbpSectionStatus
  current: string
  why: string
  aiFixable: boolean
  detail?: GbpSectionDetail
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
  // The STANDALONE door opens on the helper hub (review card + reviews card).
  // A campaign task skips the hub and lands straight in the walkthrough.
  const standalone = !campaignId
  const [door, setDoor] = useState<'hub' | 'review'>(standalone ? 'hub' : 'review')
  // A saved mid-review state flips the hub card to "Continue your review".
  // Read in an effect only (localStorage), so hydration stays clean.
  const [hasResume, setHasResume] = useState(false)
  useEffect(() => {
    if (!client?.id) return
    try { setHasResume(!!localStorage.getItem(reviewStorageKey(client.id))) } catch { /* ignore */ }
  }, [client?.id, door])
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

      {standalone && door === 'hub' && (
        <GbpHelperHub continueReview={hasResume} onReview={() => setDoor('review')} />
      )}

      {(!standalone || door === 'review') && (<>

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
            onDraft={() => { void requestDraft() }}
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

      </>)}
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

/* ── The helper hub (standalone door only) ─────────────────────── */

/** Where the owner reads and answers reviews: the Inbox's Reviews tab
 *  (each row deep-links to /dashboard/reviews/[id] with the AI reply). */
const REVIEWS_HREF = '/dashboard/inbox?tab=reviews'

const hubCardStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '15px 14px',
  marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,.04)', textDecoration: 'none',
  cursor: 'pointer', font: 'inherit',
}

/**
 * The standalone door's front screen: two cards. One enters the part-by-part
 * review (says "Continue your review" when a saved mid-review state exists);
 * one goes to the reviews inbox. Exported for the render smoke.
 */
export function GbpHelperHub({ continueReview, onReview, reviewsHref = REVIEWS_HREF }: {
  continueReview: boolean
  onReview: () => void
  reviewsHref?: string
}) {
  return (
    <div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink, padding: '4px 2px 2px' }}>
        Your Google helper
      </div>
      <div style={{ fontSize: 13, color: C.mute, padding: '0 2px 14px', lineHeight: 1.5 }}>
        Keep your Google listing sharp and answer your reviews.
      </div>

      <button type="button" onClick={onReview} className="mvp-row" style={hubCardStyle}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles size={19} color={C.greenDk} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
            {continueReview ? 'Continue your review' : 'Review your profile'}
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>
            6 parts. See what Google shows and fix it.
          </span>
        </span>
        <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
      </button>

      <Link href={reviewsHref} className="mvp-row" style={hubCardStyle}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Star size={19} color={C.greenDk} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>Your reviews</span>
          <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>
            Read new reviews and reply with AI help.
          </span>
        </span>
        <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
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
 * first screen without localStorage, open a part's editor, or inject a save
 * note); the live page never passes them.
 */
export function AiReview({ diag, clientId, taskDone, rechecking, recheckFailed, onRecheck, drafting, draft, draftError, onDraft, initialPhase, initialIndex, initialOutcomes, initialEditing, initialSaveNote }: {
  diag: GbpDiagnosis
  clientId: string
  taskDone?: boolean
  rechecking?: boolean
  recheckFailed?: boolean
  onRecheck?: () => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  onDraft: () => void
  initialPhase?: 'intro' | 'part' | 'summary'
  initialIndex?: number
  initialOutcomes?: Record<string, PartOutcome>
  initialEditing?: boolean
  initialSaveNote?: SaveNote
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

  // A save that Google accepted marks the part updated RIGHT AWAY (so a
  // refresh mid-review never forgets it), without leaving the part.
  const markUpdated = useCallback((sectionKey: string) => {
    setOutcomes((cur) => ({ ...cur, [sectionKey]: 'updated' }))
  }, [])

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
          key={sections[phase.index].key}
          section={sections[phase.index]}
          index={phase.index}
          total={total}
          clientId={clientId}
          onBack={() => setPhase(phase.index === 0 ? { name: 'intro' } : { name: 'part', index: phase.index - 1 })}
          onDone={(outcome) => finishPart(sections[phase.index].key, outcome, phase.index)}
          onSaved={markUpdated}
          onSilentRefresh={onRecheck}
          drafting={drafting}
          draft={draft}
          draftError={draftError}
          onDraft={onDraft}
          initialEditing={initialEditing}
          initialSaveNote={initialSaveNote}
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
        Your Google listing has {total} parts. We pulled what Google shows today.{' '}
        {needsWork > 0
          ? `${needsWork} ${needsWork === 1 ? 'part could use' : 'parts could use'} some work.`
          : 'They all look good right now.'}{' '}
        Check each part is right as we go.
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

/* ── Save to Google: the gbp-apply rail plumbing ─────────────────── */

/** The field kinds POST /api/dashboard/gbp-apply accepts. */
type ApplyKind = 'description' | 'hours' | 'website' | 'phone'

export type SaveTone = 'ok' | 'pending' | 'error'
export interface SaveNote { tone: SaveTone; text: string }

// Google's description rules, mirrored from src/lib/gbp-apply/validate.ts.
const DESC_MIN = 250
const DESC_MAX = 750

const SAVE_FAIL = 'We could not save this to Google right now. Try again in a minute.'

/**
 * Map one gbp-apply response to the honest owner line. Never optimistic:
 * "Saved to Google." appears ONLY on live:true (the rail's read-back proof);
 * ok without proof reads as sent-not-showing-yet; 429 is Google's own
 * per-minute cap in plain words; 400/403 bodies are the server's plain owner
 * words; anything else (5xx can carry raw upstream strings) gets the generic
 * could-not-save line. Exported for the render smoke.
 */
export function applyResultNote(status: number, body: { ok?: boolean; live?: boolean; error?: string } | null): SaveNote {
  if (status === 200 && body?.ok) {
    return body.live === true
      ? { tone: 'ok', text: 'Saved to Google.' }
      : { tone: 'pending', text: 'Sent to Google. It can take a few minutes to show.' }
  }
  if (status === 429) return { tone: 'error', text: 'Google only allows a few edits per minute. Try again in a minute.' }
  if ((status === 400 || status === 403) && typeof body?.error === 'string' && body.error.trim()) {
    return { tone: 'error', text: body.error }
  }
  return { tone: 'error', text: SAVE_FAIL }
}

async function postApply(clientId: string, kind: ApplyKind, value: unknown): Promise<{ note: SaveNote; accepted: boolean; live: boolean }> {
  try {
    const r = await fetch('/api/dashboard/gbp-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, kind, value }),
    })
    const j = await r.json().catch(() => null) as { ok?: boolean; live?: boolean; error?: string } | null
    return { note: applyResultNote(r.status, j), accepted: r.status === 200 && j?.ok === true, live: j?.live === true }
  } catch {
    return { note: { tone: 'error', text: SAVE_FAIL }, accepted: false, live: false }
  }
}

/** One save outcome, worded by the rail response. Green check only on proof. */
function SaveNoteLine({ note }: { note: SaveNote }) {
  const tone = note.tone === 'ok'
    ? { background: C.greenSoft, color: C.greenDk }
    : note.tone === 'pending'
      ? { background: '#faf1de', color: '#9a6b17' }
      : { background: C.redSoft, color: C.red }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-line', ...tone }}>
      {note.tone === 'ok' && <Check size={14} strokeWidth={3} style={{ flexShrink: 0, marginTop: 2 }} />}
      <span>{note.text}</span>
    </div>
  )
}

const errLineStyle: CSSProperties = { marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }

/** Green Save-to-Google + Cancel pair shared by the three editors. */
function SaveCancelRow({ saving, disabled, onSave, onCancel }: { saving: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 12, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving || disabled ? 'default' : 'pointer', opacity: saving || disabled ? 0.7 : 1, font: 'inherit' }}
      >
        {saving ? <><Loader2 size={16} className="mvp-spin" /> Saving to Google&hellip;</> : 'Save to Google'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 6, height: 40, borderRadius: 12, border: 'none', background: 'none', color: C.mute, fontSize: 14, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}
      >
        Cancel
      </button>
    </>
  )
}

/* ── Hours editor helpers ───────────────────────────────────────── */

const GBP_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

interface HoursRowDraft {
  day: (typeof GBP_DAYS)[number]
  label: string
  closed: boolean
  open: string  // 'HH:MM' 24h; '' when unknown (owner must fill before saving)
  close: string // 'HH:MM' 24h; '00:00' means closes at midnight
  /** Google shows more than one range this day; the editor holds only the first. */
  multi: boolean
}

/** '8:00 AM' → '08:00'; '12:00 AM' → '00:00'. Null when it is not a time. */
function parse12h(t: string): string | null {
  const m = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(t.trim())
  if (!m) return null
  let h = Number(m[1])
  if (h < 1 || h > 12) return null
  h = h % 12
  if (/^pm$/i.test(m[3])) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** '08:00' → '8:00 AM'; '00:00' → '12:00 AM' (for the read-back-proven table). */
function fmt12hClient(t: string): string {
  const h = Number(t.slice(0, 2)) % 24
  const mm = t.slice(3, 5)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Prefill the 7 editor rows from the diagnosis detail (the display strings the
 * engine formatted straight off Google, e.g. "8:00 AM to 9:00 PM" / "Closed").
 * Multi-range days prefill their FIRST range and set `multi` for the honest
 * replace note. A day we cannot parse comes back open with empty times, so the
 * owner must set it before saving — never silently marked closed (a closed day
 * in this save ERASES that day's hours on Google).
 */
function hoursRowsFromDetail(days?: Array<{ day: string; hours: string }>): HoursRowDraft[] {
  return GBP_DAYS.map((day, i) => {
    const label = day.charAt(0) + day.slice(1).toLowerCase()
    const text = (days?.[i]?.hours ?? '').trim()
    if (text === 'Closed') return { day, label, closed: true, open: '', close: '', multi: false }
    const parts = text.split(', ')
    const m = /^(.+?) to (.+)$/.exec(parts[0] ?? '')
    const open = m ? parse12h(m[1]) : null
    const close = m ? parse12h(m[2]) : null
    return { day, label, closed: false, open: open ?? '', close: close ?? '', multi: parts.length > 1 }
  })
}

/** Plain-words pre-check (mirrors the server rules) so 400s stay rare. Null = good to send. */
function hoursRowsError(rows: HoursRowDraft[]): string | null {
  let openDays = 0
  for (const r of rows) {
    if (r.closed) continue
    openDays++
    if (!r.open || !r.close) return `${r.label} needs an open time and a close time, or mark it closed.`
    if (r.close !== '00:00' && r.close <= r.open) {
      return `${r.label} closes at or before it opens. For hours past midnight, set the close to 12:00 AM or edit that day on Google.`
    }
  }
  if (openDays === 0) return 'Every day is marked closed. Saving that would remove all your hours from Google. To close for a while, set that on Google instead.'
  return null
}

/** The exact wire shape POST gbp-apply expects for kind "hours" (all 7 days, one range each). */
function hoursWireValue(rows: HoursRowDraft[]): Array<{ day: string; closed: boolean; open?: string; close?: string }> {
  return rows.map((r) => (r.closed ? { day: r.day, closed: true } : { day: r.day, closed: false, open: r.open, close: r.close }))
}

/** The 7-day table for a read-back-proven save, shown until the silent re-fetch lands. */
function hoursDisplayFromRows(rows: HoursRowDraft[]): Array<{ day: string; hours: string }> {
  return rows.map((r) => ({ day: r.label, hours: r.closed ? 'Closed' : `${fmt12hClient(r.open)} to ${fmt12hClient(r.close)}` }))
}

/* ── The part screen ────────────────────────────────────────────── */

/** business.google.com edit surfaces for the kinds the save rail cannot write.
 *  Google's own signed-in editor pages — with one listing they land on the
 *  right business. Never a fake in-app editor for these. */
const GOOGLE_EDIT_HREF: Record<string, string> = {
  categories: 'https://business.google.com/info',
  menu: 'https://business.google.com/menu',
  photos: 'https://business.google.com/photos',
}

const smallEditBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 2, color: C.greenDk, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit' }
const smallEditLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, color: C.greenDk, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }
const fieldLabelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 5 }
const textInputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, color: C.ink, font: 'inherit' }
const timeInputStyle: CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', borderRadius: 9, border: `0.5px solid ${C.line}`, background: C.bg, padding: '7px 9px', fontSize: 13, color: C.ink, font: 'inherit' }

/**
 * One part per screen: progress, name + status chip, what Google shows now,
 * why it matters, then the fix path. Description / hours / website+phone get
 * a real Edit → Save to Google editor (the gbp-apply rail); categories /
 * menu / photos get Google's own editor link. "Next" ("Finish" on the last
 * part) moves on; a part the owner did not fix records as skipped, a part
 * Google accepted a save for records as updated.
 */
function AiPart({ section, index, total, clientId, onBack, onDone, onSaved, onSilentRefresh, drafting, draft, draftError, onDraft, initialEditing, initialSaveNote }: {
  section: GbpDiagnosisSection
  index: number
  total: number
  clientId: string
  onBack: () => void
  onDone: (outcome: PartOutcome) => void
  onSaved: (sectionKey: string) => void
  onSilentRefresh?: () => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  onDraft: () => void
  /** TEST SEAM (render smoke only): open this part's editor on first render. */
  initialEditing?: boolean
  /** TEST SEAM (render smoke only): start with a save note on screen. */
  initialSaveNote?: SaveNote
}) {
  const chip = AI_CHIP[section.status] ?? AI_CHIP.unknown
  const actionable = section.status === 'needs-work' || section.status === 'missing'
  const editableKind: 'description' | 'hours' | 'links' | null =
    section.key === 'description' ? 'description' : section.key === 'hours' ? 'hours' : section.key === 'links' ? 'links' : null
  const googleEditHref = GOOGLE_EDIT_HREF[section.key]
  const current = section.current && section.current.trim() ? section.current : 'Nothing yet'
  const editCta = section.key === 'description'
    ? (section.status === 'missing' ? 'Add a description' : 'Edit your description')
    : section.key === 'hours'
      ? 'Edit your hours'
      : 'Edit website and phone'

  const [editing, setEditing] = useState(!!initialEditing && !!editableKind && section.status !== 'unknown')
  const [editSession, setEditSession] = useState(0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<SaveNote | null>(initialSaveNote ?? null)
  const [savedThisPart, setSavedThisPart] = useState(false)

  // Read-back-PROVEN values only (live:true): shown in place of the now-stale
  // diagnosis content until the silent re-fetch catches up. A pending save
  // never touches the block — it keeps showing what Google actually shows.
  const [provenDesc, setProvenDesc] = useState<string | null>(null)
  const [provenLinks, setProvenLinks] = useState<{ website?: string; phone?: string }>({})
  const [provenHours, setProvenHours] = useState<Array<{ day: string; hours: string }> | null>(null)

  let detail = section.detail
  if (section.key === 'description' && provenDesc != null) detail = { kind: 'description', text: provenDesc }
  if (detail?.kind === 'links' && (provenLinks.website || provenLinks.phone)) {
    detail = { ...detail, website: provenLinks.website ?? detail.website, phone: provenLinks.phone ?? detail.phone }
  }
  if (detail?.kind === 'hours' && provenHours) detail = { ...detail, days: provenHours }

  const openEditor = () => { setNote(null); setEditing(true); setEditSession((n) => n + 1) }

  const afterAccepted = (n: SaveNote) => {
    setNote(n)
    setSavedThisPart(true)
    setEditing(false)
    onSaved(section.key)
    // One silent re-fetch so statuses + content track what Google shows now.
    onSilentRefresh?.()
  }

  const saveDescription = async (text: string) => {
    if (saving) return
    setSaving(true)
    const res = await postApply(clientId, 'description', text)
    setSaving(false)
    if (!res.accepted) { setNote(res.note); return }
    if (res.live) setProvenDesc(text)
    afterAccepted(res.note)
  }

  const saveHours = async (rows: HoursRowDraft[]) => {
    if (saving) return
    setSaving(true)
    const res = await postApply(clientId, 'hours', hoursWireValue(rows))
    setSaving(false)
    if (!res.accepted) { setNote(res.note); return }
    if (res.live) setProvenHours(hoursDisplayFromRows(rows))
    afterAccepted(res.note)
  }

  /** Website and phone are separate rail kinds: each CHANGED field saves on
   *  its own call, in order, and each is reported honestly by name — if one
   *  fails, the note says which. */
  const saveLinks = async (changes: { website?: string; phone?: string }) => {
    if (saving) return
    setSaving(true)
    const lines: string[] = []
    let accepted = false
    let worst: SaveTone = 'ok'
    const one = async (kind: 'website' | 'phone', label: string, value: string) => {
      const res = await postApply(clientId, kind, value)
      lines.push(`${label}: ${res.note.text}`)
      if (res.accepted) {
        accepted = true
        if (res.live) setProvenLinks((cur) => ({ ...cur, [kind]: value }))
      }
      if (res.note.tone === 'error') worst = 'error'
      else if (res.note.tone === 'pending' && worst === 'ok') worst = 'pending'
    }
    if (changes.website !== undefined) await one('website', 'Website', changes.website)
    if (changes.phone !== undefined) await one('phone', 'Phone number', changes.phone)
    setSaving(false)
    const combined: SaveNote = { tone: worst, text: lines.join('\n') }
    if (!accepted) { setNote(combined); return }
    afterAccepted(combined)
  }

  const isLast = index + 1 >= total
  const nextOutcome: PartOutcome = savedThisPart ? 'updated' : section.status === 'good' ? 'good' : 'skipped'
  const nextIsPrimary = section.status === 'good' || savedThisPart

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
        ) : editing && editableKind ? (
          <>
            {editableKind === 'description' && (
              <DescriptionEditor
                key={editSession}
                initialText={detail?.kind === 'description' && detail.text ? detail.text : ''}
                saving={saving}
                serverNote={note?.tone === 'error' ? note : null}
                drafting={drafting}
                draft={draft}
                draftError={draftError}
                onDraft={onDraft}
                onCancel={() => setEditing(false)}
                onSave={(t) => { void saveDescription(t) }}
              />
            )}
            {editableKind === 'hours' && (
              <HoursEditor
                key={editSession}
                initialRows={hoursRowsFromDetail(detail?.kind === 'hours' ? detail.days : undefined)}
                saving={saving}
                serverNote={note?.tone === 'error' ? note : null}
                onCancel={() => setEditing(false)}
                onSave={(rows) => { void saveHours(rows) }}
              />
            )}
            {editableKind === 'links' && (
              <LinksEditor
                key={editSession}
                initialWebsite={detail?.kind === 'links' ? detail.website ?? '' : ''}
                initialPhone={detail?.kind === 'links' ? detail.phone ?? '' : ''}
                saving={saving}
                serverNote={note?.tone === 'error' ? note : null}
                onCancel={() => setEditing(false)}
                onSave={(c) => { void saveLinks(c) }}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ background: C.bg, borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint }}>On Google now</span>
                {!actionable && editableKind && (
                  <button type="button" onClick={openEditor} style={smallEditBtnStyle}>
                    <Pencil size={12} /> Edit
                  </button>
                )}
                {!actionable && !editableKind && googleEditHref && (
                  <a href={googleEditHref} target="_blank" rel="noopener noreferrer" style={smallEditLinkStyle}>
                    Edit on Google <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {detail
                ? <PartDetail detail={detail} summary={current} />
                : <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{current}</div>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>Why it matters</div>
            <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: 0 }}>{section.why}</p>

            {actionable && editableKind && (
              <button
                type="button"
                onClick={openEditor}
                className="mvp-row"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
              >
                <Pencil size={15} /> {editCta}
              </button>
            )}
            {actionable && !editableKind && googleEditHref && <GoogleEditBlock href={googleEditHref} />}

            {note && <SaveNoteLine note={note} />}

            <button
              type="button"
              onClick={() => onDone(nextOutcome)}
              className="mvp-row"
              style={nextIsPrimary
                ? { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }
                : { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 10, height: 46, borderRadius: 13, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </>
        )}
      </div>
    </>
  )
}

/** Edit → Save for the description: a textarea prefilled with what Google
 *  shows, a live count against Google's 250 to 750 rule, and "Draft it for
 *  me" (the existing AI draft) that FILLS the textarea for the owner to tweak. */
function DescriptionEditor({ initialText, saving, serverNote, drafting, draft, draftError, onDraft, onCancel, onSave }: {
  initialText: string
  saving: boolean
  serverNote: SaveNote | null
  drafting: boolean
  draft: string | null
  draftError: string | null
  onDraft: () => void
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initialText)
  const [localError, setLocalError] = useState<string | null>(null)
  // Only a draft that arrives WHILE this editor is open fills the box; a
  // draft left over from earlier never clobbers the prefill.
  const appliedDraftRef = useRef(draft)
  useEffect(() => {
    if (draft && draft !== appliedDraftRef.current) {
      appliedDraftRef.current = draft
      setText(draft)
      setLocalError(null)
    }
  }, [draft])

  const len = text.trim().length
  const countBad = len > DESC_MAX || (len > 0 && len < DESC_MIN)

  const submit = () => {
    const v = text.trim()
    if (v.length < DESC_MIN) { setLocalError(`Your description needs at least ${DESC_MIN} characters. It has ${v.length}.`); return }
    if (v.length > DESC_MAX) { setLocalError(`Google allows up to ${DESC_MAX} characters. This has ${v.length}.`); return }
    setLocalError(null)
    onSave(v)
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setLocalError(null) }}
        rows={7}
        placeholder="Tell people what makes your place worth the trip."
        aria-label="Your description"
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, color: C.ink, font: 'inherit', resize: 'vertical' }}
      />
      <div style={{ fontSize: 12, color: countBad ? C.red : C.mute, margin: '6px 2px 0' }}>
        {len} of {DESC_MAX} characters. Aim for {DESC_MIN} to {DESC_MAX}.
      </div>
      <button
        type="button"
        onClick={onDraft}
        disabled={drafting || saving}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, cursor: drafting ? 'default' : 'pointer', opacity: drafting ? 0.8 : 1, font: 'inherit' }}
      >
        {drafting
          ? <><Loader2 size={15} className="mvp-spin" /> Writing your draft&hellip;</>
          : <><Sparkles size={15} /> Draft it for me</>}
      </button>
      {draftError && <div style={errLineStyle}>{draftError}</div>}
      {localError && <div style={errLineStyle}>{localError}</div>}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <SaveCancelRow saving={saving} onSave={submit} onCancel={onCancel} />
    </div>
  )
}

/** Edit → Save for hours: one row per day (Closed toggle + open/close time
 *  inputs) prefilled from what Google shows. The save replaces the whole
 *  week, so all 7 days always travel together. */
function HoursEditor({ initialRows, saving, serverNote, onCancel, onSave }: {
  initialRows: HoursRowDraft[]
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSave: (rows: HoursRowDraft[]) => void
}) {
  const [rows, setRows] = useState(initialRows)
  const [localError, setLocalError] = useState<string | null>(null)
  const patch = (i: number, p: Partial<HoursRowDraft>) => {
    setLocalError(null)
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)))
  }
  const submit = () => {
    const err = hoursRowsError(rows)
    if (err) { setLocalError(err); return }
    setLocalError(null)
    onSave(rows)
  }
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.day} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{r.label}</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute, cursor: 'pointer' }}>
              <input type="checkbox" checked={r.closed} onChange={(e) => patch(i, { closed: e.target.checked })} />
              Closed
            </label>
          </div>
          {!r.closed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <input type="time" value={r.open} onChange={(e) => patch(i, { open: e.target.value })} aria-label={`${r.label} opens`} style={timeInputStyle} />
              <span style={{ fontSize: 12.5, color: C.mute, flexShrink: 0 }}>to</span>
              <input type="time" value={r.close} onChange={(e) => patch(i, { close: e.target.value })} aria-label={`${r.label} closes`} style={timeInputStyle} />
            </div>
          )}
          {r.multi && (
            <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '6px 0 0' }}>
              This day has more than one time range on Google. Saving replaces it with one range.
            </p>
          )}
        </div>
      ))}
      <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '8px 0 0' }}>
        To close at midnight, set the close time to 12:00 AM.
      </p>
      {localError && <div style={errLineStyle}>{localError}</div>}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <SaveCancelRow saving={saving} onSave={submit} onCancel={onCancel} />
    </div>
  )
}

/** Edit → Save for website + phone: two labeled inputs. Each field is its own
 *  rail kind, so only changed fields are sent (one call each, in order). */
function LinksEditor({ initialWebsite, initialPhone, saving, serverNote, onCancel, onSave }: {
  initialWebsite: string
  initialPhone: string
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSave: (changes: { website?: string; phone?: string }) => void
}) {
  const [website, setWebsite] = useState(initialWebsite)
  const [phone, setPhone] = useState(initialPhone)
  const [localError, setLocalError] = useState<string | null>(null)
  const websiteChanged = website.trim() !== initialWebsite.trim() && website.trim() !== ''
  const phoneChanged = phone.trim() !== initialPhone.trim() && phone.trim() !== ''
  const nothingToSave = !websiteChanged && !phoneChanged
  const submit = () => {
    if (nothingToSave) return
    if (websiteChanged && !/^https:\/\//i.test(website.trim())) {
      setLocalError('The website address must start with https:// so Google shows a secure link.')
      return
    }
    if (phoneChanged) {
      const digits = phone.replace(/\D/g, '').length
      if (digits < 10 || digits > 15) { setLocalError('A phone number needs 10 to 15 digits.'); return }
    }
    setLocalError(null)
    onSave({ ...(websiteChanged ? { website: website.trim() } : {}), ...(phoneChanged ? { phone: phone.trim() } : {}) })
  }
  return (
    <div>
      <label style={fieldLabelStyle} htmlFor="gbp-edit-website">Website</label>
      <input
        id="gbp-edit-website"
        type="url"
        inputMode="url"
        value={website}
        onChange={(e) => { setWebsite(e.target.value); setLocalError(null) }}
        placeholder="https://yourplace.com"
        style={textInputStyle}
      />
      <label style={{ ...fieldLabelStyle, marginTop: 12 }} htmlFor="gbp-edit-phone">Phone</label>
      <input
        id="gbp-edit-phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => { setPhone(e.target.value); setLocalError(null) }}
        placeholder="(555) 123-4567"
        style={textInputStyle}
      />
      {nothingToSave && (
        <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
          Change the website or the phone number, then save.
        </p>
      )}
      {localError && <div style={errLineStyle}>{localError}</div>}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <SaveCancelRow saving={saving} disabled={nothingToSave} onSave={submit} onCancel={onCancel} />
    </div>
  )
}

/** The fix path for the kinds the save rail cannot write (categories, menu,
 *  photos): a real link to Google's own editor, never a fake in-app one. */
function GoogleEditBlock({ href }: { href: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}
      >
        Edit this on Google <ExternalLink size={15} />
      </a>
      <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
        Edit this on Google, then come back. We will re-check.
      </p>
    </div>
  )
}

/** "example.com/menu" → a safe absolute href. Google returns full URLs, but a
 *  bare host would otherwise resolve as a relative path. */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/** A label/value row for the tabular details (hours, menu items, links). */
const detailRowStyle = (first: boolean): CSSProperties => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
  padding: '4.5px 0', borderTop: first ? 'none' : `0.5px solid ${C.line}`,
})

/**
 * The real content on Google for one part, rendered per detail kind so the
 * owner can actually CHECK it (see the hours, read the description, look at
 * the photos) instead of trusting a one-line summary. Every value came off
 * Google on this diagnosis; when a kind has nothing to show, it falls back
 * to the honest summary string, never a blank box.
 */
function PartDetail({ detail, summary }: { detail: GbpSectionDetail; summary: string }) {
  const summaryLine = <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{summary}</div>

  if (detail.kind === 'hours') {
    return (
      <div>
        {detail.days.map((d, i) => (
          <div key={d.day} style={detailRowStyle(i === 0)}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{d.day}</span>
            <span style={{ fontSize: 13, color: d.hours === 'Closed' ? C.mute : C.ink, textAlign: 'right' }}>{d.hours}</span>
          </div>
        ))}
        {(detail.specialCount ?? 0) > 0 && (
          <div style={{ fontSize: 12, color: C.mute, marginTop: 7, lineHeight: 1.45 }}>
            You also set special hours for {detail.specialCount} {detail.specialCount === 1 ? 'date' : 'dates'}.
          </div>
        )}
      </div>
    )
  }

  if (detail.kind === 'categories') {
    if (!detail.primary && detail.additional.length === 0) return summaryLine
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {detail.primary && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '5px 11px' }}>
            Main: {detail.primary}
          </span>
        )}
        {detail.additional.map((c) => (
          <span key={c} style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 99, padding: '5px 11px' }}>
            {c}
          </span>
        ))}
      </div>
    )
  }

  if (detail.kind === 'description') {
    if (!detail.text) return summaryLine
    return (
      <div style={{ maxHeight: 190, overflowY: 'auto', fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {detail.text}
      </div>
    )
  }

  if (detail.kind === 'photos') {
    return (
      <div>
        {summaryLine}
        {detail.items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 9 }}>
            {detail.items.map((it, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${it.url}-${i}`}
                src={it.url}
                alt=""
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 9, display: 'block', background: '#e9e9ee' }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (detail.kind === 'menu') {
    if (detail.items.length === 0 && !detail.menuLink) return summaryLine
    const more = detail.itemCount - detail.items.length
    return (
      <div>
        {detail.items.map((it, i) => (
          <div key={`${it.name}-${i}`} style={detailRowStyle(i === 0)}>
            <span style={{ fontSize: 13, color: C.ink, minWidth: 0 }}>{it.name}</span>
            {it.price && <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{it.price}</span>}
          </div>
        ))}
        {more > 0 && <div style={{ fontSize: 12, color: C.mute, marginTop: 7 }}>and {more} more</div>}
        {detail.menuLink && (
          <div style={{ marginTop: detail.items.length > 0 ? 8 : 0 }}>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 2 }}>Your menu link</div>
            <a
              href={safeHref(detail.menuLink)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none', wordBreak: 'break-all' }}
            >
              {detail.menuLink} <ExternalLink size={12} style={{ flexShrink: 0 }} />
            </a>
          </div>
        )}
      </div>
    )
  }

  /* links */
  return (
    <div>
      <div style={detailRowStyle(true)}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>Website</span>
        {detail.website
          ? (
            <a
              href={safeHref(detail.website)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: C.greenDk, textDecoration: 'none', textAlign: 'right', wordBreak: 'break-all', minWidth: 0 }}
            >
              {detail.website}
            </a>
          )
          : <span style={{ fontSize: 13, color: C.mute }}>Not set</span>}
      </div>
      <div style={detailRowStyle(false)}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>Phone</span>
        {detail.phone
          ? <span style={{ fontSize: 13, color: C.ink, textAlign: 'right' }}>{detail.phone}</span>
          : <span style={{ fontSize: 13, color: C.mute }}>Not set</span>}
      </div>
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

      {/* What's next: the other half of the Google helper. */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, margin: '0 2px 8px' }}>
          What&rsquo;s next
        </div>
        <Link href={REVIEWS_HREF} className="mvp-row" style={hubCardStyle}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Star size={19} color={C.greenDk} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>Your reviews</span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>
              Read new reviews and reply with AI help.
            </span>
          </span>
          <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
        </Link>
      </div>
    </>
  )
}
