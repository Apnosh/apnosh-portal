'use client'

/**
 * /dashboard/google-profile — the owner's section-by-section Google profile
 * fixer, on top of the read-only diagnosis engine (src/lib/gbp-diagnose.ts via
 * GET /api/dashboard/gbp-diagnosis).
 *
 * Three experiences on one diagnosis:
 *  - view (the standalone More door): ONE scrollable page of what Google
 *    shows customers today. The 9 parts sit under their 3 chapter headers,
 *    each with a label, an honest status chip, and the real content on
 *    Google now. Pro owners get a small Edit affordance on the sections the
 *    save rail can write (description / hours / website+phone / the yes-no
 *    attribute groups): the SAME editors the builder uses, inline in that
 *    section's card, with the same honest save handling and the silent
 *    re-diagnose — minus "Draft it for me" (AI drafting stays on the
 *    campaign AI lane). Categories / menu / photos keep their Edit-on-Google
 *    links for everyone. Non-Pro keeps the read-only page with Edit-on-Google
 *    links plus one quiet Pro line at the top. No advice blocks and no
 *    guided flow here on any tier.
 *  - diy (the checklist): progress "N of M done" + a thin bar, then the
 *    sections in engine order. Good sections collapse to a dim row with a
 *    green check; problem sections are white cards with a severity dot
 *    (missing = red, needs-work = amber, unknown = grey). ONE section is
 *    expanded at a time, each with a "Fix it on Google" link.
 *  - ai (Pro, "Apnosh AI"): ONE dynamic profile builder, chaptered by the
 *    customer journey. The 9 diagnosed parts are reordered into 3 chapters:
 *    "Be found" (categories, description, links), "Look worth the trip"
 *    (photos, menu), "Easy to visit" (hours, getting, seating, service).
 *    An intro lists the chapters with per-part status chips, then ONE part
 *    per screen (chapter eyebrow + Part N of 9, status chip, the REAL
 *    content on Google now via the engine's `detail` payload, the engine's
 *    deterministic `advice` as the "Apnosh AI says" block, why it matters,
 *    and the action: EDIT it right here for the kinds the save rail
 *    supports (description / hours / website+phone / the yes-no attribute
 *    groups, via POST /api/dashboard/gbp-apply), or an "Edit this on
 *    Google" link for the kinds it does not (categories / menu / photos)).
 *    Weak parts say "Fix it now"; good parts offer "Edit anyway". "Next"
 *    ("Finish" on the last part) moves on. The summary groups every outcome
 *    under its chapter, shows the honest profile score when one exists, and
 *    ends with the "Keep it strong" cards: the reviews inbox, Post an
 *    update, and Questions and answers. Review progress resumes from
 *    localStorage (versioned key by client id) so a refresh never restarts
 *    at part 1; a fresh all-good read clears the save.
 *
 * The STANDALONE door (no campaignId) renders the read-only viewer; the
 * builder runs ONLY for the campaign AI lane. Questions and answers (Google shut the Q&A
 * API down for apps, so that door says so plainly, links out to
 * business.google.com, and keeps the part that still works: paste a
 * question, get an AI-drafted answer via POST /api/dashboard/gbp-answer-draft,
 * copy it, post it on Google) and Post an update (compose a What's New post
 * with an AI draft via POST /api/dashboard/gbp-post-draft and publish it
 * live via POST /api/dashboard/gbp-post — text + one button only) are
 * reached from the summary's Keep-it-strong cards; their back button
 * returns to the builder.
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
import { useRouter } from 'next/navigation'
import { Loader2, Check, ChevronDown, ChevronLeft, ChevronRight, Sparkles, Copy, ExternalLink, Plug, Pencil, Star, MessageCircle, Megaphone, X, Search, ImagePlus, Lock, ArrowRight } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { isProTier } from '@/lib/entitlements'
import { gbpFinishReadiness, GBP_FINISH_MIN_SCORE } from '@/lib/gbp-finish'

/* Wire types for GET /api/dashboard/gbp-diagnosis — mirrors GbpDiagnosis in
   src/lib/gbp-diagnose.ts (that module is server-only, so the shapes are
   restated here rather than imported into the client bundle). */
type GbpSectionStatus = 'good' | 'needs-work' | 'missing' | 'unknown'
/** Per-section content detail (mirrors GbpSectionDetail in gbp-diagnose.ts).
 *  Every value was read from Google on this diagnosis; when a read failed the
 *  engine omits `detail` and the UI falls back to the `current` summary. */
type GbpSectionDetail =
  | { kind: 'hours'; days: Array<{ day: string; hours: string }>; specialCount?: number }
  | { kind: 'categories'; primary: string | null; additional: string[]; primaryName?: string | null; additionalNames?: string[] }
  | { kind: 'description'; text: string | null }
  | { kind: 'photos'; count: number; newestLabel?: string; items: Array<{ url: string }> }
  | { kind: 'menu'; itemCount: number; items: Array<{ name: string; price?: string }>; menuLink?: string | null }
  | { kind: 'links'; website: string | null; phone: string | null }
  | { kind: 'attrs'; items: Array<{ id: string; label: string; value: boolean | null }> }
interface GbpDiagnosisSection {
  key: string
  label: string
  status: GbpSectionStatus
  current: string
  why: string
  aiFixable: boolean
  /** One deterministic plain recommendation, computed by the engine from the
   *  real read data only. Rendered as the "Apnosh AI says" block; hidden when absent. */
  advice?: string
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
  /** Public Google Maps URL of the listing (where reviews and Q&A live). */
  mapsUri?: string
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
 * mode: which experience the owner gets. 'view' = the standalone viewer (every owner can see
 * their own listing; Pro also edits the save-rail sections inline, and the save endpoint is
 * Pro-gated on the server regardless). 'ai' = the section-by-section builder WITH
 * the "Apnosh AI says" advice and in-app editors (campaign lane, Pro only). 'diy' = the plain
 * checklist: same diagnosis, no drafting — each problem section gets a "Fix it on Google"
 * link + the honest self-check. Defaults to 'view' (the standalone door). AI is ALSO gated on
 * the LIVE client tier here, so a non-Pro owner can never see a draft button (belt-and-suspenders
 * with the server mode-resolution on the /dashboard/google-profile page and the tier gate on the
 * gbp-draft endpoint).
 */
export default function GbpFixer({ campaignId, mode = 'view' }: { campaignId?: string; mode?: 'diy' | 'ai' | 'view' }) {
  const { client, loading: clientLoading } = useClient()
  const router = useRouter()
  // The viewer is read-only and tier-free. The AI lane unlocks only when the resolved mode is
  // 'ai' AND this client is still Pro; anything else runs the checklist. A URL/prop alone can
  // never unlock AI without the live Pro entitlement.
  const effectiveMode: 'diy' | 'ai' | 'view' = mode === 'view' ? 'view' : mode === 'ai' && isProTier(client?.tier) ? 'ai' : 'diy'
  // Every door lands straight in the builder. Questions and answers + Post an
  // update open from the summary's Keep-it-strong cards; back returns here.
  const [door, setDoor] = useState<'review' | 'qanda' | 'post'>('review')
  const [diag, setDiag] = useState<GbpDiagnosis | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [openKey, setOpenKey] = useState<string | null>(null)
  // The campaign task was marked done (the PATCH landed) — drives the plain success line.
  const [taskDone, setTaskDone] = useState(false)
  const markingRef = useRef(false)

  // Apnosh AI advice, keyed by section. The deterministic `section.advice` shows
  // instantly in every lane; this richer, tailored advice swaps in once it loads
  // (best-effort, Pro-gated). Grounded strictly in the sections we read + the
  // business facts on file — the route invents nothing, and a failure just leaves
  // the deterministic line. Shared by the view lane and the AI walkthrough.
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({})
  // True while the AI advice is still loading. The UI shows a brief "reading your
  // profile" line during this window instead of the deterministic sentence, so the
  // owner never sees an old line flash and then swap — only the accurate AI advice
  // (or, if the AI call fails, the deterministic line stands in once loading ends).
  const [adviceLoading, setAdviceLoading] = useState(false)
  const isPro = isProTier(client?.tier)
  useEffect(() => {
    setAiAdvice({})
    setAdviceLoading(false)
    if (!isPro || !client?.id || !diag || !diag.connected || diag.readFailed) return
    const readable = (diag.sections ?? [])
      .filter((s) => s.status !== 'unknown' && (s.current ?? '').trim())
      .map((s) => ({ key: s.key, label: s.label, status: s.status, current: s.current, why: s.why }))
    if (readable.length === 0) return
    let alive = true
    const ctrl = new AbortController()
    setAdviceLoading(true)
    fetch('/api/dashboard/gbp-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, sections: readable }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { advice?: Record<string, string> } | null) => {
        if (alive && j?.advice && typeof j.advice === 'object') setAiAdvice(j.advice)
      })
      .catch(() => {})
      .finally(() => { if (alive) setAdviceLoading(false) })
    return () => { alive = false; ctrl.abort() }
    // Refetch only when the underlying listing changes (checkedAt moves on a re-diagnose).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, isPro, diag?.checkedAt])

  // Was this task already finished on an earlier visit? A READ only — it never stamps,
  // so revisiting the builder shows "complete" instead of offering Finish again.
  useEffect(() => {
    if (!campaignId) return
    let alive = true
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { execution?: { gbpFixedAt?: string } } | null) => {
        if (alive && j?.execution?.gbpFixedAt) { markingRef.current = true; setTaskDone(true) }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [campaignId])

  // Finishing is now an explicit act, not a silent auto-stamp: the owner taps Finish and
  // the SERVER re-runs the diagnosis before it stamps. The honesty gate is unchanged — a
  // profile that isn't all good is refused, and the refusal names the parts still open.
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const finishTask = useCallback(async (anyway = false) => {
    if (!campaignId || finishing || taskDone) return
    setFinishing(true)
    setFinishError(null)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/gbp-fixed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anyway }),
      })
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (r.ok && j.ok) {
        markingRef.current = true
        setTaskDone(true)
        // Finishing ENDS the walkthrough: go straight back to the campaign, which now
        // shows it complete. Leaving the owner parked on a "you are done" card made them
        // hunt for the way out. refresh() so the campaign re-reads the fresh stamp.
        router.replace(`/dashboard/campaigns/${campaignId}`)
        router.refresh()
        return
      }
      setFinishError(j.error || 'We could not finish it just now. Try again in a minute.')
    } catch {
      setFinishError('We could not finish it just now. Try again in a minute.')
    } finally {
      setFinishing(false)
    }
  }, [campaignId, finishing, taskDone, router])

  // The parts still keeping the campaign's Google-profile task OPEN. Finishing the
  // walkthrough is not the same as the profile being complete: the task only completes
  // when a fresh read comes back with every part good. Naming the stragglers here means
  // the owner is told WHY it stayed open instead of being left to guess.
  const taskBlocking = (!campaignId || taskDone || !diag || loadError || !diag.connected || diag.readFailed)
    ? []
    : (diag.sections ?? []).filter((s) => s.status !== 'good').map((s) => ({ key: s.key, label: s.label }))

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

      {door === 'qanda' && (
        <GbpQandaView
          clientId={client?.id ?? ''}
          isPro={isProTier(client?.tier)}
          mapsUri={diag?.mapsUri ?? null}
          onBack={() => setDoor('review')}
        />
      )}

      {door === 'post' && (
        <GbpPostView
          clientId={client?.id ?? ''}
          isPro={isProTier(client?.tier)}
          onBack={() => setDoor('review')}
        />
      )}

      {door === 'review' && (<>

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
        effectiveMode === 'view' ? (
          // The viewer: no advice, no guided flow, no resume state. Pro
          // owners can edit the save-rail sections inline; everyone else
          // keeps the Edit-on-Google links.
          <ProfileViewer
            diag={diag}
            clientId={client?.id ?? ''}
            isPro={isPro}
            aiAdvice={aiAdvice}
            adviceLoading={adviceLoading}
            onSilentRefresh={recheck}
          />
        ) : effectiveMode === 'ai' ? (
          <AiReview
            diag={diag}
            clientId={client?.id ?? ''}
            aiAdvice={aiAdvice}
            adviceLoading={adviceLoading}
            taskDone={taskDone}
            taskBlocking={taskBlocking}
            hasCampaignTask={!!campaignId}
            onFinish={(anyway) => { void finishTask(anyway) }}
            finishing={finishing}
            finishError={finishError}
            rechecking={rechecking}
            recheckFailed={recheckFailed}
            onRecheck={recheck}
            drafting={drafting}
            draft={draft}
            draftError={draftError}
            onDraft={() => { void requestDraft() }}
            onOpenQanda={() => setDoor('qanda')}
            onOpenPost={() => setDoor('post')}
          />
        ) : (
          <Walkthrough
            diag={diag}
            mode="diy"
            taskDone={taskDone}
            hasCampaignTask={!!campaignId}
            aiLaneLocked={mode === 'ai' && !isPro}
            onFinish={(anyway) => { void finishTask(anyway) }}
            finishing={finishing}
            finishError={finishError}
            rechecking={rechecking}
            onRecheck={recheck}
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
      {/* The claim-or-create escape: an owner with NO listing (or no login) is not stuck here.
          The team playbook covers claiming or creating the listing — say so, with a real door. */}
      <div style={{ fontSize: 12.5, color: C.mute, marginTop: 14, lineHeight: 1.5 }}>
        No listing yet, or you cannot get in? That is fine.{' '}
        <Link href="/dashboard/messages?to=strategist" style={{ color: C.greenDk, fontWeight: 700, textDecoration: 'none' }}>Tell your team</Link>
        {' '}and they claim or create it for you.
      </div>
    </div>
  )
}

/* ── Shared card style (the summary's Keep-it-strong cards) ─────── */

/** Where the owner reads and answers reviews: the Inbox's Reviews tab
 *  (each row deep-links to /dashboard/reviews/[id] with the AI reply). */
const REVIEWS_HREF = '/dashboard/inbox?tab=reviews'

const hubCardStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '15px 14px',
  marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,.04)', textDecoration: 'none',
  cursor: 'pointer', font: 'inherit',
}

/* ── The section walkthrough ───────────────────────────────────── */

function Walkthrough({ diag, mode, taskDone, hasCampaignTask = false, aiLaneLocked = false, onFinish, finishing = false, finishError = null, rechecking = false, onRecheck, openKey, onToggle, drafting, draft, draftError, copied, onDraft, onCopy }: {
  diag: GbpDiagnosis
  /** 'ai' = the "Draft it for me" experience; 'diy' = the plain checklist (Fix-it-on-Google links). */
  mode: 'diy' | 'ai'
  /** The campaign task tied to this walkthrough was just marked done (all-good + PATCH landed). */
  taskDone?: boolean
  hasCampaignTask?: boolean
  /** True when this campaign asked for the AI builder but the plan does not include it. */
  aiLaneLocked?: boolean
  onFinish?: (anyway: boolean) => void
  finishing?: boolean
  finishError?: string | null
  rechecking?: boolean
  onRecheck?: () => void
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
      {/* The plan boundary, said out loud. Quietly handing someone the checklist when
          their campaign asked for the AI builder leaves them wondering where it went. */}
      {aiLaneLocked && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Lock size={15} color={C.mute} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Writing it for you is part of the AI plan</div>
            <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, lineHeight: 1.5 }}>
              You can still fix everything yourself below. Each part links straight to the right page on Google.
            </div>
            <Link href="/dashboard/billing" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none' }}>
              See the AI plan <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}

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

      {mode === 'diy' && hasCampaignTask && !taskDone && onFinish && (
        <SelfServeFinish
          allDone={allDone}
          onFinish={onFinish}
          finishing={finishing}
          finishError={finishError}
          rechecking={rechecking}
          onRecheck={onRecheck}
        />
      )}

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '12px 0 2px' }}>
        Read from your live Google listing.
      </div>
    </>
  )
}

/**
 * Finishing the free, do-it-yourself lane.
 *
 * This lane is a person editing their own Google profile in another tab, so it has to
 * close on THEIR say-so. There is no team to sign it off and no AI in this lane at all.
 *
 * It still offers to check first, because a re-check is free and being told "we looked
 * and it all reads good" is worth more than ticking your own box. But the check is an
 * offer, not a gate: if the owner says they are done, the task closes. The server
 * records what was still open at that moment, so a self-marked finish is never written
 * down as a clean bill of health.
 */
function SelfServeFinish({ allDone, onFinish, finishing, finishError, rechecking, onRecheck }: {
  allDone: boolean
  onFinish: (anyway: boolean) => void
  finishing: boolean
  finishError: string | null
  rechecking: boolean
  onRecheck?: () => void
}) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '16px 16px 15px', marginTop: 14 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink }}>
        {allDone ? 'Everything checks out' : 'Finished editing on Google?'}
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>
        {allDone
          ? 'We read your live listing and every part looks good. Mark this done to close it out.'
          : 'Make your changes in Google, then mark this done. You can always come back and check again later.'}
      </div>

      <button
        type="button"
        onClick={() => onFinish(true)}
        disabled={finishing}
        style={{ marginTop: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: finishing ? 'default' : 'pointer', opacity: finishing ? 0.8 : 1, font: 'inherit' }}
      >
        {finishing ? <><Loader2 size={16} className="mvp-spin" /> Marking it done&hellip;</> : <><Check size={17} strokeWidth={3} /> Mark this done</>}
      </button>

      {!allDone && onRecheck && (
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="mvp-row"
          style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 42, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14, fontWeight: 700, cursor: rechecking ? 'default' : 'pointer', font: 'inherit' }}
        >
          {rechecking ? <><Loader2 size={15} className="mvp-spin" /> Checking&hellip;</> : 'Check my profile again first'}
        </button>
      )}

      {finishError && (
        <div style={{ marginTop: 9, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
          {finishError}
        </div>
      )}
    </div>
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
              {showFixOnGoogle && <FixOnGoogleBlock sectionKey={section.key} />}
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

/** Checklist (diy) mode: no AI, ever. A link straight to the Google page that holds this
 *  section, then the owner comes back and marks the whole task done. */
function FixOnGoogleBlock({ sectionKey }: { sectionKey: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <a
        href={googleEditHrefFor(sectionKey)}
        target="_blank"
        rel="noopener noreferrer"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}
      >
        Edit this on Google <ExternalLink size={15} />
      </a>
      <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
        Opens Google in a new tab. Change it there, come back, then mark this done at the bottom.
      </p>
    </div>
  )
}

/* ── Apnosh AI: the profile builder, chaptered by the customer journey ── */

/**
 * The 3 chapters over the 9 diagnosed parts, in the order a customer meets
 * the listing: first Google has to FIND you, then the listing has to look
 * worth the trip, then the visit has to hold no surprises. The builder
 * reorders the engine's sections into this sequence; a section key the
 * chapters do not know (never expected) falls to the end, un-chaptered.
 */
const CHAPTERS: Array<{ name: string; sub: string; keys: string[] }> = [
  { name: 'Be found', sub: 'How Google matches you to searches.', keys: ['categories', 'description', 'links'] },
  { name: 'Look worth the trip', sub: 'What makes people pick you.', keys: ['photos', 'menu'] },
  { name: 'Easy to visit', sub: 'No surprises when they come.', keys: ['hours', 'getting', 'seating', 'service'] },
]
const CHAPTER_ORDER: string[] = CHAPTERS.flatMap((c) => c.keys)

/** Engine order → chapter order. Unknown keys keep their relative order at the end. */
function orderSections(sections: GbpDiagnosisSection[]): GbpDiagnosisSection[] {
  const rank = (s: GbpDiagnosisSection) => {
    const i = CHAPTER_ORDER.indexOf(s.key)
    return i === -1 ? CHAPTER_ORDER.length : i
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

/** The chapter a part belongs to (for the eyebrow + summary grouping). */
const chapterOf = (key: string): string | null => CHAPTERS.find((c) => c.keys.includes(key))?.name ?? null

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

/** Intro chip: softer words for the chapter list (weak parts read the same). */
const INTRO_CHIP: Record<GbpSectionStatus, { word: string; color: string; bg: string }> = {
  good: AI_CHIP.good,
  'needs-work': { word: 'Could be better', color: '#9a6b17', bg: '#faf1de' },
  missing: { word: 'Could be better', color: '#9a6b17', bg: '#faf1de' },
  unknown: AI_CHIP.unknown,
}

// v2: the review grew from 6 parts to 9 chaptered parts, so old saved indexes
// would resume into the wrong part. The bumped key simply ignores v1 saves.
const reviewStorageKey = (clientId: string) => `mvp-gbp-review:v2:${clientId}`

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
export function AiReview({ diag, clientId, aiAdvice = {}, adviceLoading = false, taskDone, taskBlocking = [], hasCampaignTask = false, onFinish, finishing, finishError, rechecking, recheckFailed, onRecheck, drafting, draft, draftError, onDraft, onOpenQanda, onOpenPost, initialPhase, initialIndex, initialOutcomes, initialEditing, initialSaveNote }: {
  diag: GbpDiagnosis
  clientId: string
  /** Apnosh AI advice keyed by section (loaded by the parent GbpFixer). */
  aiAdvice?: Record<string, string>
  /** True while that advice is still loading (drives the "reading" placeholder). */
  adviceLoading?: boolean
  taskDone?: boolean
  /** Parts still keeping the campaign's Google-profile task open (empty when done). */
  taskBlocking?: Array<{ key: string; label: string }>
  /** True when this run is attached to a campaign that carries the profile task. */
  hasCampaignTask?: boolean
  /** Explicitly finish the campaign task (the server re-verifies before it stamps).
   *  `anyway` is the owner's deliberate override of the readiness bar. */
  onFinish?: (anyway?: boolean) => void
  finishing?: boolean
  finishError?: string | null
  rechecking?: boolean
  recheckFailed?: boolean
  onRecheck?: () => void
  drafting: boolean
  draft: string | null
  draftError: string | null
  onDraft: () => void
  /** Open the Questions-and-answers door (a summary Keep-it-strong card). */
  onOpenQanda?: () => void
  /** Open the Post-an-update door (a summary Keep-it-strong card). */
  onOpenPost?: () => void
  initialPhase?: 'intro' | 'part' | 'summary'
  initialIndex?: number
  initialOutcomes?: Record<string, PartOutcome>
  initialEditing?: boolean
  initialSaveNote?: SaveNote
}) {
  // The builder walks the parts in CHAPTER order, not engine order.
  const sections = orderSections(diag.sections ?? [])
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
          sections={sections}
          needsWork={sections.filter((s) => s.status === 'needs-work' || s.status === 'missing').length}
          onStart={() => setPhase({ name: 'part', index: 0 })}
        />
      )}

      {phase.name === 'part' && sections[phase.index] && (
        <AiPart
          key={sections[phase.index].key}
          section={sections[phase.index]}
          aiAdvice={aiAdvice[sections[phase.index].key]}
          adviceLoading={adviceLoading}
          chapter={chapterOf(sections[phase.index].key)}
          index={phase.index}
          total={total}
          clientId={clientId}
          onBack={() => setPhase(phase.index === 0 ? { name: 'intro' } : { name: 'part', index: phase.index - 1 })}
          onSkipToEnd={() => setPhase({ name: 'summary' })}
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
          score={diag.score}
          taskDone={taskDone}
          taskBlocking={taskBlocking}
          hasCampaignTask={hasCampaignTask}
          onOpenPart={(key) => {
            const i = sections.findIndex((sec) => sec.key === key)
            if (i >= 0) setPhase({ name: 'part', index: i })
          }}
          onFinish={onFinish}
          finishing={finishing}
          finishError={finishError}
          rechecking={rechecking}
          recheckFailed={recheckFailed}
          onRecheck={onRecheck}
          onOpenQanda={onOpenQanda}
          onOpenPost={onOpenPost}
          onBack={() => setPhase({ name: 'part', index: total - 1 })}
        />
      )}

      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '14px 0 2px' }}>
        Read from your live Google listing.
      </div>
    </>
  )
}

/** The intro moment: the promise, the three chapters with their parts and
 *  honest status chips, one Start button. */
function AiIntro({ sections, needsWork, onStart }: { sections: GbpDiagnosisSection[]; needsWork: number; onStart: () => void }) {
  const total = sections.length
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '24px 18px' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ width: 46, height: 46, borderRadius: 13, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={22} color={C.greenDk} />
        </span>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, marginTop: 12 }}>
          Let&rsquo;s build your best profile.
        </div>
        <div style={{ fontSize: 13.5, color: C.mute, marginTop: 6, lineHeight: 1.55 }}>
          We read your Google listing top to bottom and checked {total} parts, from hours to parking.{' '}
          {needsWork > 0
            ? `${needsWork} could be better.`
            : 'They all look good right now.'}{' '}
          You get a recommendation on every part, and you can fix most of it right here.
        </div>
      </div>

      {CHAPTERS.map((ch) => {
        const parts = sections.filter((s) => ch.keys.includes(s.key))
        if (parts.length === 0) return null
        return (
          <div key={ch.name} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: DISPLAY }}>{ch.name}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 1, lineHeight: 1.45 }}>{ch.sub}</div>
            <div style={{ marginTop: 7, border: `0.5px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
              {parts.map((s, i) => {
                const chip = INTRO_CHIP[s.status] ?? INTRO_CHIP.unknown
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{s.label}</span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: chip.color, background: chip.bg, borderRadius: 99, padding: '3px 9px' }}>{chip.word}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={onStart}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 18, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
      >
        Start
      </button>
    </div>
  )
}

/* ── Save to Google: the gbp-apply rail plumbing ─────────────────── */

/** The field kinds POST /api/dashboard/gbp-apply accepts. */
type ApplyKind = 'description' | 'hours' | 'website' | 'phone' | 'attributes' | 'categories'

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

const PHOTO_FAIL = 'We could not add the photo to Google right now. Try again in a minute.'

/**
 * Map one gbp-photo response to the honest owner line. A photo CREATE has no
 * prior value to read back, so a returned media resource IS the proof:
 * "Added to Google." only on live:true; ok without proof reads as
 * sent-not-showing-yet; 400/403 bodies are the server's plain owner words;
 * anything else gets the generic could-not-add line. Exported for the render smoke.
 */
export function photoResultNote(status: number, body: { ok?: boolean; live?: boolean; error?: string } | null): SaveNote {
  if (status === 200 && body?.ok) {
    return body.live === true
      ? { tone: 'ok', text: 'Added to Google.' }
      : { tone: 'pending', text: 'Sent to Google. It can take a few minutes to show.' }
  }
  if ((status === 400 || status === 403) && typeof body?.error === 'string' && body.error.trim()) {
    return { tone: 'error', text: body.error }
  }
  return { tone: 'error', text: PHOTO_FAIL }
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

/* ── Shared save plumbing: ONE hook for the builder and the viewer ── */

/** Which in-app editor a section gets (null = Google-link only). The
 *  attribute groups and categories are editable only when the read gave us the
 *  real rows/resource-names to start from (no detail = nothing honest to
 *  prefill). Menu stays Google-link only for now. */
type EditableKind = 'description' | 'hours' | 'links' | 'attrs' | 'categories' | 'photos'
function sectionEditableKind(section: GbpDiagnosisSection): EditableKind | null {
  return section.key === 'description' ? 'description'
    : section.key === 'hours' ? 'hours'
      : section.key === 'links' ? 'links'
        // Categories need the resource names off the live read to re-send them
        // on save; an older cache without `additionalNames` falls back to the
        // Google link.
        : section.detail?.kind === 'categories' && section.detail.additionalNames !== undefined ? 'categories'
          : section.key === 'photos' && section.detail?.kind === 'photos' ? 'photos'
            : section.detail?.kind === 'attrs' ? 'attrs'
              : null
}

/**
 * The gbp-apply save plumbing, shared by the builder's part screens (AiPart)
 * and the viewer's inline editors (ViewerSection) so the two can never
 * drift: the saving flag, the honest result note, the per-kind save calls,
 * and the read-back-PROVEN values (live:true only) overlaid on the diagnosis
 * detail until the silent re-fetch catches up. A pending save never touches
 * the shown content — it keeps showing what Google actually shows.
 * `onAccepted` runs after any save Google accepted (ok:true), with the
 * honest note already on state.
 */
function useGbpSectionSave({ clientId, section, initialNote, onAccepted }: {
  clientId: string
  section: GbpDiagnosisSection
  /** TEST SEAM (render smoke only): start with a save note on screen. */
  initialNote?: SaveNote | null
  onAccepted: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<SaveNote | null>(initialNote ?? null)

  // Read-back-PROVEN values only (live:true): shown in place of the now-stale
  // diagnosis content until the silent re-fetch catches up.
  const [provenDesc, setProvenDesc] = useState<string | null>(null)
  const [provenLinks, setProvenLinks] = useState<{ website?: string; phone?: string }>({})
  const [provenHours, setProvenHours] = useState<Array<{ day: string; hours: string }> | null>(null)
  const [provenAttrs, setProvenAttrs] = useState<Record<string, boolean>>({})
  const [provenCats, setProvenCats] = useState<{ primary: string | null; additional: string[]; primaryName: string | null; additionalNames: string[] } | null>(null)

  let detail = section.detail
  if (section.key === 'description' && provenDesc != null) detail = { kind: 'description', text: provenDesc }
  if (detail?.kind === 'links' && (provenLinks.website || provenLinks.phone)) {
    detail = { ...detail, website: provenLinks.website ?? detail.website, phone: provenLinks.phone ?? detail.phone }
  }
  if (detail?.kind === 'hours' && provenHours) detail = { ...detail, days: provenHours }
  if (detail?.kind === 'attrs' && Object.keys(provenAttrs).length > 0) {
    detail = { ...detail, items: detail.items.map((it) => (it.id in provenAttrs ? { ...it, value: provenAttrs[it.id] } : it)) }
  }
  if (detail?.kind === 'categories' && provenCats) {
    detail = { ...detail, primary: provenCats.primary, additional: provenCats.additional, primaryName: provenCats.primaryName, additionalNames: provenCats.additionalNames }
  }

  const afterAccepted = (n: SaveNote) => {
    setNote(n)
    onAccepted()
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

  /** The yes-no attribute rows: ONLY the rows the owner actually set or
   *  changed travel, as one attributeMask-scoped gbp-apply call. */
  const saveAttrs = async (items: Array<{ id: string; value: boolean }>) => {
    if (saving) return
    setSaving(true)
    const res = await postApply(clientId, 'attributes', items)
    setSaving(false)
    if (!res.accepted) { setNote(res.note); return }
    if (res.live) {
      setProvenAttrs((cur) => {
        const next = { ...cur }
        for (const it of items) next[it.id] = it.value
        return next
      })
    }
    afterAccepted(res.note)
  }

  /** Categories: the whole set (primary + additional resource names) travels as
   *  one gbp-apply call. `display` carries the picked display names so a proven
   *  save can show the right chips until the silent re-fetch catches up. */
  const saveCategories = async (
    value: { primary: string; additional: string[] },
    display: { primary: string; additional: string[] },
  ) => {
    if (saving) return
    setSaving(true)
    const res = await postApply(clientId, 'categories', value)
    setSaving(false)
    if (!res.accepted) { setNote(res.note); return }
    if (res.live) {
      setProvenCats({ primary: display.primary, additional: display.additional, primaryName: value.primary, additionalNames: value.additional })
    }
    afterAccepted(res.note)
  }

  /** Photos: upload the owner's file to the existing bucket, then hand the
   *  public URL to Google's media create. A create IS its own proof, so the
   *  silent re-fetch brings the new photo into the grid. */
  const savePhoto = async (file: File) => {
    if (saving) return
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const up = await fetch(`/api/dashboard/upload-asset?clientId=${encodeURIComponent(clientId)}`, { method: 'POST', body: form })
      const upBody = await up.json().catch(() => null) as { url?: unknown; error?: unknown } | null
      if (!up.ok || typeof upBody?.url !== 'string' || !upBody.url) {
        setSaving(false)
        setNote({ tone: 'error', text: PHOTO_FAIL })
        return
      }
      const r = await fetch('/api/dashboard/gbp-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sourceUrl: upBody.url }),
      })
      const j = await r.json().catch(() => null) as { ok?: boolean; live?: boolean; error?: string } | null
      setSaving(false)
      const n = photoResultNote(r.status, j)
      if (r.status === 200 && j?.ok === true) { afterAccepted(n) } else { setNote(n) }
    } catch {
      setSaving(false)
      setNote({ tone: 'error', text: PHOTO_FAIL })
    }
  }

  return { detail, saving, note, setNote, saveDescription, saveHours, saveLinks, saveAttrs, saveCategories, savePhoto }
}

/* ── The part screen ────────────────────────────────────────────── */

/** business.google.com edit surfaces for the kinds the save rail cannot write.
 *  Google's own signed-in editor pages — with one listing they land on the
 *  right business. Never a fake in-app editor for these. */
const GOOGLE_EDIT_HREF: Record<string, string> = {
  // /info is Google's business-information editor: it holds the name, categories,
  // hours, description and website in one page, so every text-ish section lands there.
  categories: 'https://business.google.com/info',
  hours: 'https://business.google.com/info',
  description: 'https://business.google.com/info',
  links: 'https://business.google.com/info',
  menu: 'https://business.google.com/menu',
  photos: 'https://business.google.com/photos',
}

/**
 * Where to send someone to fix this section themselves.
 *
 * The self-serve lane is the whole product for a free owner, so "go fix it" has to
 * land on the page that actually holds the thing. It used to drop everyone on the
 * Google Business home screen and leave them to find it, which is the difference
 * between a task and a chore. The root is kept only as a fallback for a section we
 * do not have a specific page for.
 */
function googleEditHrefFor(key: string): string {
  return GOOGLE_EDIT_HREF[key] ?? 'https://business.google.com'
}

const smallEditBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 2, color: C.greenDk, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit' }
const smallEditLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, color: C.greenDk, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }
const fieldLabelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 5 }
const textInputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, color: C.ink, font: 'inherit' }
const timeInputStyle: CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', borderRadius: 9, border: `0.5px solid ${C.line}`, background: C.bg, padding: '7px 9px', fontSize: 13, color: C.ink, font: 'inherit' }

/** The "Apnosh AI says" block, shared by both lanes. Shows the AI-written advice
 *  when it has loaded; while it is still loading it shows a brief neutral line
 *  (NOT the deterministic sentence) so the owner never sees an old line flash and
 *  then swap. Renders nothing when there is neither advice nor a load in flight. */
function ApnoshAdvice({ text, loading, style }: { text?: string; loading?: boolean; style?: CSSProperties }) {
  if (!text && !loading) return null
  return (
    <div style={{ background: C.greenSoft, borderRadius: 11, padding: '10px 12px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 3 }}>
        <Sparkles size={12} /> Apnosh AI says
      </div>
      {text
        ? <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{text}</div>
        : <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>Reading your profile…</div>}
    </div>
  )
}

/** The portal's real menu editor — the ONE place a menu is kept (it also feeds
 *  the website and the AI advice). We edit here and push to Google, rather than
 *  keep a second menu in the Google builder. */
const PORTAL_MENU_HREF = '/dashboard/business-info/menu'

/** The menu affordances for the GBP builder/viewer. Google put the food menu on a
 *  retired API and the portal already owns the real menu editor, so instead of a
 *  second editor here we: (1) let the owner open THAT editor ("Edit my menu"), and
 *  (2) push the saved menu to Google in one tap ("Put my menu on Google"), with an
 *  honest server-side read-back. The push button only appears once we confirm there
 *  are saved items; the editor link always shows (labelled Add vs Edit). Shared by
 *  the viewer and the campaign AI builder — it fully replaces the old Google link. */
function PublishMenuButton({ clientId, onPublished }: { clientId: string; onPublished?: () => void }) {
  const [count, setCount] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error' | 'pending'; text: string } | null>(null)
  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/gbp-menu-publish?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { portalItems?: number } | null) => { if (alive && typeof j?.portalItems === 'number') setCount(j.portalItems) })
      .catch(() => {})
    return () => { alive = false }
  }, [clientId])
  const has = (count ?? 0) > 0
  const publish = async () => {
    if (publishing) return
    setPublishing(true); setNote(null)
    try {
      const r = await fetch('/api/dashboard/gbp-menu-publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }),
      })
      const j = await r.json().catch(() => ({})) as { ok?: boolean; itemCount?: number; error?: string }
      if (r.ok && j.ok) {
        setNote({ tone: 'ok', text: `Added ${j.itemCount} ${j.itemCount === 1 ? 'item' : 'items'} to your Google menu.` })
        onPublished?.()
      } else if (r.status === 202) {
        setNote({ tone: 'pending', text: j.error || 'Google took the menu but has not shown it back yet. Check again in a few minutes.' })
      } else {
        setNote({ tone: 'error', text: j.error || 'The menu did not save. Try again in a minute.' })
      }
    } catch {
      setNote({ tone: 'error', text: 'The menu did not save. Try again in a minute.' })
    } finally {
      setPublishing(false)
    }
  }
  return (
    <div style={{ marginTop: 14 }}>
      {has && (
        <button
          type="button"
          onClick={() => { void publish() }}
          disabled={publishing}
          className="mvp-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.7 : 1, font: 'inherit' }}
        >
          {publishing
            ? <><Loader2 size={16} className="mvp-spin" /> Putting it on Google&hellip;</>
            : <><Sparkles size={16} /> Put my menu on Google ({count})</>}
        </button>
      )}
      {note && (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 8, color: note.tone === 'error' ? C.red : note.tone === 'ok' ? C.greenDk : C.mute }}>
          {note.text}
        </div>
      )}
      {/* Always offer the real editor: add a menu if there is none, edit it if there is. */}
      <Link href={PORTAL_MENU_HREF} style={{ ...smallEditLinkStyle, marginTop: has || note ? 12 : 0 }}>
        {has ? 'Edit my menu' : 'Add my menu'} <ChevronRight size={13} />
      </Link>
    </div>
  )
}

/**
 * One part per screen: the chapter eyebrow + progress, name + status chip,
 * what Google shows now, the engine's "Apnosh AI says" recommendation, why
 * it matters, then the fix path. Description / hours / website+phone / the
 * yes-no attribute groups get a real Edit → Save to Google editor (the
 * gbp-apply rail); categories / menu / photos get Google's own editor link.
 * Weak parts say "Fix it now", good parts offer "Edit anyway". "Next"
 * ("Finish" on the last part) moves on; a part the owner did not fix records
 * as skipped, a part Google accepted a save for records as updated.
 */
function AiPart({ section, aiAdvice, adviceLoading, chapter, index, total, clientId, onBack, onSkipToEnd, onDone, onSaved, onSilentRefresh, drafting, draft, draftError, onDraft, initialEditing, initialSaveNote }: {
  section: GbpDiagnosisSection
  /** Apnosh AI's tailored advice for this part, once it loads (falls back to
   *  the deterministic `section.advice` only after loading ends). */
  aiAdvice?: string
  /** True while advice is still loading (shows the "reading" placeholder). */
  adviceLoading?: boolean
  /** The chapter this part belongs to (the uppercase eyebrow). */
  chapter: string | null
  index: number
  total: number
  clientId: string
  onBack: () => void
  /** Jump straight to the Overview instead of walking every remaining part. */
  onSkipToEnd?: () => void
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
  const editableKind = sectionEditableKind(section)
  const googleEditHref = GOOGLE_EDIT_HREF[section.key]
  const current = section.current && section.current.trim() ? section.current : 'Nothing yet'

  const [editing, setEditing] = useState(!!initialEditing && !!editableKind && section.status !== 'unknown')
  const [editSession, setEditSession] = useState(0)
  const [savedThisPart, setSavedThisPart] = useState(false)

  // The save plumbing + read-back-proven content, shared with the viewer.
  const { detail, saving, note, setNote, saveDescription, saveHours, saveLinks, saveAttrs, saveCategories, savePhoto } = useGbpSectionSave({
    clientId,
    section,
    initialNote: initialSaveNote,
    onAccepted: () => {
      setSavedThisPart(true)
      setEditing(false)
      onSaved(section.key)
      // One silent re-fetch so statuses + content track what Google shows now.
      onSilentRefresh?.()
    },
  })

  const openEditor = () => { setNote(null); setEditing(true); setEditSession((n) => n + 1) }

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
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {chapter && (
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.greenDk, lineHeight: 1.3 }}>{chapter}</span>
            )}
            <span style={{ fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: C.ink }}>Part {index + 1} of {total}</span>
          </span>
          {/* Jump straight to the Overview. Walking all 9 parts to reach the end (or to
              finish) was the only way through; this is the shortcut, and nothing is lost —
              every part is still listed on the Overview and can be reopened from there. */}
          {onSkipToEnd && !isLast && (
            <button
              type="button"
              onClick={onSkipToEnd}
              className="mvp-row"
              style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, height: 30, padding: '0 9px', borderRadius: 99, border: 'none', background: 'none', color: C.greenDk, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
            >
              Skip to the end <ChevronRight size={14} />
            </button>
          )}
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
          <SectionEditor
            key={editSession}
            kind={editableKind}
            detail={detail}
            clientId={clientId}
            saving={saving}
            serverNote={note?.tone === 'error' ? note : null}
            onCancel={() => setEditing(false)}
            onSaveDescription={(t) => { void saveDescription(t) }}
            onSaveHours={(rows) => { void saveHours(rows) }}
            onSaveLinks={(c) => { void saveLinks(c) }}
            onSaveAttrs={(items) => { void saveAttrs(items) }}
            onSaveCategories={(v, d) => { void saveCategories(v, d) }}
            onSavePhoto={(f) => { void savePhoto(f) }}
            descDraft={{ drafting, draft, draftError, onDraft }}
          />
        ) : (
          <>
            <div style={{ background: C.bg, borderRadius: 11, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint }}>On Google now</span>
                {!actionable && editableKind && (
                  <button type="button" onClick={openEditor} style={smallEditBtnStyle}>
                    <Pencil size={12} /> Edit anyway
                  </button>
                )}
                {/* Menu routes to the portal editor via PublishMenuButton below, not to Google. */}
                {!actionable && !editableKind && googleEditHref && section.key !== 'menu' && (
                  <a href={googleEditHref} target="_blank" rel="noopener noreferrer" style={smallEditLinkStyle}>
                    Edit on Google <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {detail
                ? <PartDetail detail={detail} summary={current} />
                : <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{current}</div>}
            </div>

            {/* Apnosh AI's recommendation for this part. While the AI advice loads
                the block shows a brief "reading your profile" line, then the AI
                advice; only if the AI call ends without advice does the
                deterministic sentence stand in. Grounded in the real read. */}
            <ApnoshAdvice
              text={aiAdvice ?? (adviceLoading ? undefined : section.advice)}
              loading={!aiAdvice && !!adviceLoading}
              style={{ marginBottom: 10 }}
            />

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 3 }}>Why it matters</div>
            <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: 0 }}>{section.why}</p>

            {/* Menu is the one part the save rail can't write, so the builder used
                to offer only an Edit-on-Google link. For Pro owners with a saved
                menu, put it on Google in one tap right here (the AI lane is
                Pro-gated). The button hides itself when there is nothing to publish. */}
            {section.key === 'menu' && <PublishMenuButton clientId={clientId} onPublished={onSilentRefresh} />}

            {actionable && editableKind && (
              <button
                type="button"
                onClick={openEditor}
                className="mvp-row"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
              >
                <Pencil size={15} /> Fix it now
              </button>
            )}
            {actionable && !editableKind && googleEditHref && section.key !== 'menu' && <GoogleEditBlock href={googleEditHref} />}

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

/** The builder's "Draft it for me" wiring for the description editor. The
 *  viewer never passes it (AI drafting stays on the campaign AI lane). */
interface DraftTool {
  drafting: boolean
  draft: string | null
  draftError: string | null
  onDraft: () => void
}

/** Edit → Save for the description: a textarea prefilled with what Google
 *  shows and a live count against Google's 250 to 750 rule. With `draftTool`
 *  (the builder), "Draft it for me" (the existing AI draft) FILLS the
 *  textarea for the owner to tweak; without it (the viewer) there is no
 *  draft button — textarea + count + save only. */
function DescriptionEditor({ initialText, saving, serverNote, draftTool, onCancel, onSave }: {
  initialText: string
  saving: boolean
  serverNote: SaveNote | null
  draftTool?: DraftTool
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initialText)
  const [localError, setLocalError] = useState<string | null>(null)
  const draft = draftTool?.draft ?? null
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
      {draftTool && (
        <button
          type="button"
          onClick={draftTool.onDraft}
          disabled={draftTool.drafting || saving}
          className="mvp-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, cursor: draftTool.drafting ? 'default' : 'pointer', opacity: draftTool.drafting ? 0.8 : 1, font: 'inherit' }}
        >
          {draftTool.drafting
            ? <><Loader2 size={15} className="mvp-spin" /> Writing your draft&hellip;</>
            : <><Sparkles size={15} /> Draft it for me</>}
        </button>
      )}
      {draftTool?.draftError && <div style={errLineStyle}>{draftTool.draftError}</div>}
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

/** One Yes/No segmented pair for an attribute row. */
const attrToggleStyle = (active: boolean): CSSProperties => ({
  padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit',
  border: `0.5px solid ${active ? C.green : C.line}`,
  background: active ? C.greenSoft : '#fff',
  color: active ? C.greenDk : C.mute,
})

/**
 * Edit → Save for a yes-no attribute group (Getting here / Seating and
 * space / Service and payments): one row per option with a Yes/No segmented
 * toggle, prefilled from what Google shows (a never-answered option starts
 * unselected). Save sends ONLY the rows the owner actually set or changed —
 * untouched rows never travel, so nothing on Google moves by accident.
 */
function AttrsEditor({ initialItems, saving, serverNote, onCancel, onSave }: {
  initialItems: Array<{ id: string; label: string; value: boolean | null }>
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSave: (items: Array<{ id: string; value: boolean }>) => void
}) {
  const [values, setValues] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(initialItems.map((it) => [it.id, it.value])),
  )
  const changed = initialItems.filter((it) => {
    const v = values[it.id]
    return typeof v === 'boolean' && v !== it.value
  })
  const nothingToSave = changed.length === 0
  const submit = () => {
    if (nothingToSave) return
    onSave(changed.map((it) => ({ id: it.id, value: values[it.id] as boolean })))
  }
  return (
    <div>
      {initialItems.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{it.label}</span>
          <span style={{ display: 'inline-flex', flexShrink: 0, borderRadius: 10, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setValues((cur) => ({ ...cur, [it.id]: true }))}
              aria-pressed={values[it.id] === true}
              style={{ ...attrToggleStyle(values[it.id] === true), borderRadius: '10px 0 0 10px' }}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setValues((cur) => ({ ...cur, [it.id]: false }))}
              aria-pressed={values[it.id] === false}
              style={{ ...attrToggleStyle(values[it.id] === false), borderRadius: '0 10px 10px 0', marginLeft: -0.5 }}
            >
              No
            </button>
          </span>
        </div>
      ))}
      {nothingToSave && (
        <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
          Set or change an answer, then save. Only what you set is sent.
        </p>
      )}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <SaveCancelRow saving={saving} disabled={nothingToSave} onSave={submit} onCancel={onCancel} />
    </div>
  )
}

/* ── Categories editor ──────────────────────────────────────────── */

type CatChip = { name: string; displayName: string }

const catChipStyle = (isMain: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: isMain ? 700 : 600,
  color: isMain ? C.greenDk : C.ink, background: isMain ? C.greenSoft : '#fff',
  border: `0.5px solid ${isMain ? C.green : C.line}`, borderRadius: 99, padding: '5px 10px',
})

/**
 * Edit → Save for categories: the current main (labeled "Main") + the extra
 * categories as removable chips, a search box that calls gbp-categories to add
 * more, and a "Make main" action to promote an extra. Google requires a main
 * category and allows up to 9 extras. The whole set is re-sent on save (the
 * PATCH replaces categories), which is why the current ones carry their
 * resource names. Save goes through the gbp-apply rail (kind 'categories').
 */
function CategoriesEditor({ clientId, initialPrimary, initialAdditional, saving, serverNote, onCancel, onSave }: {
  clientId: string
  initialPrimary: CatChip | null
  initialAdditional: CatChip[]
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSave: (value: { primary: string; additional: string[] }, display: { primary: string; additional: string[] }) => void
}) {
  const [primary, setPrimary] = useState<CatChip | null>(initialPrimary)
  const [additional, setAdditional] = useState<CatChip[]>(initialAdditional)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatChip[]>([])
  const [searching, setSearching] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Debounced taxonomy search. A too-short query clears the list.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    let live = true
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/dashboard/gbp-categories?clientId=${encodeURIComponent(clientId)}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search failed'))))
        .then((j: { categories?: CatChip[] }) => { if (live) setResults(Array.isArray(j.categories) ? j.categories : []) })
        .catch(() => { if (live) setResults([]) })
        .finally(() => { if (live) setSearching(false) })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [query, clientId])

  const has = (name: string) => primary?.name === name || additional.some((a) => a.name === name)
  const add = (c: CatChip) => {
    setLocalError(null)
    if (has(c.name)) return
    if (!primary) { setPrimary(c); setQuery(''); setResults([]); return }
    if (additional.length >= 9) { setLocalError('You already have the most extra categories Google allows.'); return }
    setAdditional((cur) => [...cur, c])
    setQuery('')
    setResults([])
  }
  const removeAdditional = (name: string) => setAdditional((cur) => cur.filter((a) => a.name !== name))
  const makeMain = (c: CatChip) => {
    setAdditional((cur) => {
      const without = cur.filter((a) => a.name !== c.name)
      return primary ? [...without, primary] : without
    })
    setPrimary(c)
  }

  const submit = () => {
    if (!primary) { setLocalError('Pick a main category first.'); return }
    setLocalError(null)
    onSave(
      { primary: primary.name, additional: additional.map((a) => a.name) },
      { primary: primary.displayName, additional: additional.map((a) => a.displayName) },
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Your categories</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {primary
          ? <span style={catChipStyle(true)}>Main: {primary.displayName}</span>
          : <span style={{ fontSize: 12.5, color: C.mute }}>No main category yet. Add one below.</span>}
        {additional.map((c) => (
          <span key={c.name} style={catChipStyle(false)}>
            {c.displayName}
            <button type="button" onClick={() => makeMain(c)} aria-label={`Make ${c.displayName} the main category`} style={{ border: 'none', background: 'none', padding: 0, color: C.greenDk, fontSize: 11, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>
              Make main
            </button>
            <button type="button" onClick={() => removeAdditional(c.name)} aria-label={`Remove ${c.displayName}`} style={{ border: 'none', background: 'none', padding: 0, color: C.mute, cursor: 'pointer', display: 'inline-flex' }}>
              <X size={13} />
            </button>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={fieldLabelStyle} htmlFor="gbp-cat-search">Add a category</label>
        <div style={{ position: 'relative' }}>
          <Search size={14} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            id="gbp-cat-search"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLocalError(null) }}
            placeholder="Search, like taco or coffee"
            style={{ ...textInputStyle, paddingLeft: 32 }}
          />
        </div>
        {searching && <div style={{ fontSize: 12, color: C.mute, margin: '6px 2px 0' }}>Searching&hellip;</div>}
        {results.length > 0 && (
          <div style={{ marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 11, overflow: 'hidden' }}>
            {results.map((c, i) => (
              <button
                key={c.name}
                type="button"
                onClick={() => add(c)}
                disabled={has(c.name)}
                className="mvp-row"
                style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: '9px 11px', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}`, background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: has(c.name) ? 'default' : 'pointer', color: has(c.name) ? C.faint : C.ink }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{c.displayName}</span>
                {has(c.name) ? <Check size={14} color={C.greenDk} /> : <span style={{ fontSize: 12.5, fontWeight: 700, color: C.greenDk }}>Add</span>}
              </button>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '8px 0 0' }}>
          Pick the one that fits best as your main. Add up to 9 more.
        </p>
      </div>

      {localError && <div style={errLineStyle}>{localError}</div>}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <SaveCancelRow saving={saving} disabled={!primary} onSave={submit} onCancel={onCancel} />
    </div>
  )
}

/* ── Photos editor ──────────────────────────────────────────────── */

/**
 * Edit → Save for photos: pick one image, see a preview, then "Add to Google".
 * The file uploads to the existing bucket and Google fetches it (v4 media
 * create). One photo at a time keeps it simple. A create IS its own proof, so
 * the honest "Added to Google" line shows on success and the new photo appears
 * after the silent re-fetch.
 */
function PhotosEditor({ saving, serverNote, onCancel, onSave, initialFileName }: {
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSave: (file: File) => void
  /** TEST SEAM (render smoke only): show the preview + Add button without a real File. */
  initialFileName?: string
}) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const pick = (f: File | null) => {
    setLocalError(null)
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const submit = () => {
    if (!file) { setLocalError('Pick a photo first.'); return }
    setLocalError(null)
    onSave(file)
  }
  const hasPick = !!file || !!initialFileName

  return (
    <div>
      <label style={fieldLabelStyle} htmlFor="gbp-photo-file">Add a photo</label>
      <input
        id="gbp-photo-file"
        type="file"
        accept="image/*"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        style={{ fontSize: 13, color: C.ink, font: 'inherit' }}
      />
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Your photo" style={{ display: 'block', marginTop: 10, width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 11, background: '#e9e9ee' }} />
      )}
      {initialFileName && !previewUrl && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.mute }}>{initialFileName}</div>
      )}
      <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '8px 0 0' }}>
        Use a clear JPG or PNG. It shows on your listing as the business.
      </p>
      {localError && <div style={errLineStyle}>{localError}</div>}
      {serverNote && <SaveNoteLine note={serverNote} />}
      <button
        type="button"
        onClick={submit}
        disabled={saving || !hasPick}
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 12, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving || !hasPick ? 'default' : 'pointer', opacity: saving || !hasPick ? 0.7 : 1, font: 'inherit' }}
      >
        {saving ? <><Loader2 size={16} className="mvp-spin" /> Adding to Google&hellip;</> : <><ImagePlus size={16} /> Add to Google</>}
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
    </div>
  )
}

/** Build the categories editor's initial chips from the diagnosis detail (which
 *  carries display names + aligned resource names). */
function catChipsFromDetail(detail: GbpSectionDetail | undefined): { primary: CatChip | null; additional: CatChip[] } {
  if (detail?.kind !== 'categories') return { primary: null, additional: [] }
  const primary = detail.primaryName && detail.primary
    ? { name: detail.primaryName, displayName: detail.primary }
    : null
  const names = detail.additionalNames ?? []
  const additional = names.map((name, i) => ({ name, displayName: detail.additional[i] ?? name }))
  return { primary, additional }
}

/**
 * The right in-app editor for one editable kind, prefilled from the shown
 * detail: ONE switch that both the builder's part screens (AiPart) and the
 * viewer's cards (ViewerSection) render, so the editors can never drift.
 * `descDraft` wires the builder's "Draft it for me" into the description
 * editor; the viewer leaves it out (AI drafting stays on the campaign AI
 * lane), so there the description editor is textarea + count + save only.
 */
function SectionEditor({ kind, detail, clientId, saving, serverNote, onCancel, onSaveDescription, onSaveHours, onSaveLinks, onSaveAttrs, onSaveCategories, onSavePhoto, descDraft, initialPhotoFileName }: {
  kind: EditableKind
  detail: GbpSectionDetail | undefined
  clientId: string
  saving: boolean
  serverNote: SaveNote | null
  onCancel: () => void
  onSaveDescription: (text: string) => void
  onSaveHours: (rows: HoursRowDraft[]) => void
  onSaveLinks: (changes: { website?: string; phone?: string }) => void
  onSaveAttrs: (items: Array<{ id: string; value: boolean }>) => void
  onSaveCategories: (value: { primary: string; additional: string[] }, display: { primary: string; additional: string[] }) => void
  onSavePhoto: (file: File) => void
  descDraft?: DraftTool
  /** TEST SEAM (render smoke only): render the photo preview + Add button. */
  initialPhotoFileName?: string
}) {
  if (kind === 'categories') {
    const chips = catChipsFromDetail(detail)
    return (
      <CategoriesEditor
        clientId={clientId}
        initialPrimary={chips.primary}
        initialAdditional={chips.additional}
        saving={saving}
        serverNote={serverNote}
        onCancel={onCancel}
        onSave={onSaveCategories}
      />
    )
  }
  if (kind === 'photos') {
    return (
      <PhotosEditor
        saving={saving}
        serverNote={serverNote}
        onCancel={onCancel}
        onSave={onSavePhoto}
        initialFileName={initialPhotoFileName}
      />
    )
  }
  if (kind === 'description') {
    return (
      <DescriptionEditor
        initialText={detail?.kind === 'description' && detail.text ? detail.text : ''}
        saving={saving}
        serverNote={serverNote}
        draftTool={descDraft}
        onCancel={onCancel}
        onSave={onSaveDescription}
      />
    )
  }
  if (kind === 'hours') {
    return (
      <HoursEditor
        initialRows={hoursRowsFromDetail(detail?.kind === 'hours' ? detail.days : undefined)}
        saving={saving}
        serverNote={serverNote}
        onCancel={onCancel}
        onSave={onSaveHours}
      />
    )
  }
  if (kind === 'links') {
    return (
      <LinksEditor
        initialWebsite={detail?.kind === 'links' ? detail.website ?? '' : ''}
        initialPhone={detail?.kind === 'links' ? detail.phone ?? '' : ''}
        saving={saving}
        serverNote={serverNote}
        onCancel={onCancel}
        onSave={onSaveLinks}
      />
    )
  }
  return (
    <AttrsEditor
      initialItems={detail?.kind === 'attrs' ? detail.items : []}
      saving={saving}
      serverNote={serverNote}
      onCancel={onCancel}
      onSave={onSaveAttrs}
    />
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

  if (detail.kind === 'attrs') {
    if (detail.items.length === 0) return summaryLine
    return (
      <div>
        {detail.items.map((it, i) => (
          <div key={it.id} style={detailRowStyle(i === 0)}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, minWidth: 0 }}>{it.label}</span>
            {it.value === null
              ? <span style={{ fontSize: 13, fontWeight: 600, color: C.amber, flexShrink: 0 }}>Not set</span>
              : <span style={{ fontSize: 13, color: C.ink, flexShrink: 0 }}>{it.value ? 'Yes' : 'No'}</span>}
          </div>
        ))}
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

/* ── The read-only profile viewer (the standalone More door) ────── */

/** Google's generic signed-in editor home, for the parts without their own
 *  edit surface (hours, description, links, the attribute groups). */
const GOOGLE_EDIT_GENERIC = 'https://business.google.com'

/**
 * The standalone door: ONE scrollable page of what Google shows customers
 * today. The 9 parts sit under their 3 chapter headers in chapter order,
 * each with its label, an honest status chip, and the real content on
 * Google now (the same PartDetail renderers the builder uses). The fix path
 * is tier-aware: Pro owners get a small Edit affordance on the sections the
 * save rail can write (the SAME editors and honest save handling the
 * builder uses, no AI drafting); categories / menu / photos keep their
 * Edit-on-Google links for everyone, and non-Pro keeps every link plus one
 * quiet Pro line at the top. No "Apnosh AI says" advice and no guided flow
 * here on any tier; the builder with all of that runs only on the campaign
 * AI lane. Exported for the render smoke.
 */
export function ProfileViewer({ diag, clientId = '', isPro = false, aiAdvice = {}, adviceLoading = false, onSilentRefresh, initialEditKey }: {
  diag: GbpDiagnosis
  clientId?: string
  /** Pro unlocks the inline editors on the save-rail sections. */
  isPro?: boolean
  /** Apnosh AI advice keyed by section (loaded by the parent). Falls back to the
   *  deterministic `section.advice` only after loading ends. */
  aiAdvice?: Record<string, string>
  /** True while that advice is still loading (drives the "reading" placeholder). */
  adviceLoading?: boolean
  /** One silent diagnosis re-fetch after a save Google accepted. */
  onSilentRefresh?: () => void
  /** TEST SEAM (render smoke only): open this section's editor on first render. */
  initialEditKey?: string
}) {
  const sections = orderSections(diag.sections ?? [])
  const groups: Array<{ name: string; sub: string; parts: GbpDiagnosisSection[] }> = CHAPTERS
    .map((ch) => ({ name: ch.name, sub: ch.sub, parts: sections.filter((s) => ch.keys.includes(s.key)) }))
    .filter((g) => g.parts.length > 0)
  const stray = sections.filter((s) => !CHAPTER_ORDER.includes(s.key))
  if (stray.length > 0) groups.push({ name: 'More', sub: '', parts: stray })

  if (sections.length === 0) {
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
      {/* One quiet line for non-Pro: the app's inline editing is a Pro tool.
          No upsell button — the Edit-on-Google links below still work. */}
      {!isPro && (
        <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '0 2px 12px' }}>
          Editing from the app is on the Pro plan.
        </div>
      )}
      {groups.map((g) => (
        <div key={g.name} style={{ marginBottom: 16 }}>
          <div style={{ margin: '0 2px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: DISPLAY }}>{g.name}</div>
            {g.sub && <div style={{ fontSize: 12, color: C.mute, marginTop: 1, lineHeight: 1.45 }}>{g.sub}</div>}
          </div>
          {g.parts.map((s) => (
            <ViewerSection
              key={s.key}
              section={s}
              clientId={clientId}
              isPro={isPro}
              aiAdvice={aiAdvice[s.key]}
              adviceLoading={adviceLoading}
              onSilentRefresh={onSilentRefresh}
              initialEditing={initialEditKey === s.key}
            />
          ))}
        </div>
      ))}
      <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, padding: '4px 0 2px' }}>
        Read from your live Google listing.
      </div>
    </>
  )
}

/** One viewer section: label + status chip and the real content on Google
 *  now. The fix path is tier-aware. Pro owners get a small Edit affordance
 *  on the sections the save rail can write: the SAME editors the builder
 *  uses (via SectionEditor + useGbpSectionSave), inline in this card, with
 *  Save to Google + Cancel, the same honest result lines, and one silent
 *  re-diagnose after an accepted save — but never "Draft it for me" (AI
 *  drafting stays on the campaign AI lane). Every other section, and every
 *  section for non-Pro, keeps the Edit-on-Google link (the part's own
 *  editor page when Google has one; the generic business.google.com home
 *  when it does not). */
function ViewerSection({ section, clientId, isPro, aiAdvice, adviceLoading, onSilentRefresh, initialEditing }: {
  section: GbpDiagnosisSection
  clientId: string
  isPro: boolean
  /** Apnosh AI's tailored advice for this section, once it loads. Falls back to
   *  the deterministic `section.advice` only after loading ends. */
  aiAdvice?: string
  /** True while advice is still loading (shows the "reading" placeholder). */
  adviceLoading?: boolean
  onSilentRefresh?: () => void
  /** TEST SEAM (render smoke only): open this section's editor on first render. */
  initialEditing?: boolean
}) {
  const chip = INTRO_CHIP[section.status] ?? INTRO_CHIP.unknown
  const editHref = GOOGLE_EDIT_HREF[section.key] ?? GOOGLE_EDIT_GENERIC
  const current = section.current && section.current.trim() ? section.current : 'Nothing yet'
  const editableKind = sectionEditableKind(section)
  // In-app editing is Pro only, only for the kinds the save rail can write,
  // and never on a part we could not read (nothing honest to prefill).
  const canEditHere = isPro && !!editableKind && section.status !== 'unknown'

  const [editing, setEditing] = useState(!!initialEditing && canEditHere)
  const [editSession, setEditSession] = useState(0)

  // The save plumbing + read-back-proven content, shared with the builder.
  const { detail, saving, note, setNote, saveDescription, saveHours, saveLinks, saveAttrs, saveCategories, savePhoto } = useGbpSectionSave({
    clientId,
    section,
    onAccepted: () => {
      setEditing(false)
      // One silent re-fetch so the content and chips stay what Google shows.
      onSilentRefresh?.()
    },
  })

  const openEditor = () => { setNote(null); setEditing(true); setEditSession((n) => n + 1) }

  // Menu: Google's food menu is the one part the save rail can't write, but we
  // already hold the owner's menu (menu_items). For Pro owners the shared
  // PublishMenuButton offers a one-tap "put my menu on Google".
  const isMenu = section.key === 'menu'

  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '15px 14px', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.3 }}>{section.label}</span>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: chip.color, background: chip.bg, borderRadius: 99, padding: '3px 9px' }}>{chip.word}</span>
      </div>
      {editing && canEditHere && editableKind ? (
        <SectionEditor
          key={editSession}
          kind={editableKind}
          detail={detail}
          clientId={clientId}
          saving={saving}
          serverNote={note?.tone === 'error' ? note : null}
          onCancel={() => setEditing(false)}
          onSaveDescription={(t) => { void saveDescription(t) }}
          onSaveHours={(rows) => { void saveHours(rows) }}
          onSaveLinks={(c) => { void saveLinks(c) }}
          onSaveAttrs={(items) => { void saveAttrs(items) }}
          onSaveCategories={(v, d) => { void saveCategories(v, d) }}
          onSavePhoto={(f) => { void savePhoto(f) }}
        />
      ) : (
        <>
          <div style={{ background: C.bg, borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>On Google now</div>
            {section.status === 'unknown' || !detail
              // Unknown parts show the engine's own safe reason; a detail-less
              // part falls back to the honest summary string, never a blank box.
              ? <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{current}</div>
              : <PartDetail detail={detail} summary={current} />}
          </div>
          {/* Apnosh AI advice: what to do next and why, tailored to this part.
              While it loads, a brief "reading" line shows (never the old sentence);
              then the AI advice, or the deterministic line only if the AI returns
              nothing. Hidden on parts we could not read. */}
          {section.status !== 'unknown' && (
            <ApnoshAdvice
              text={aiAdvice ?? (adviceLoading ? undefined : section.advice)}
              loading={!aiAdvice && !!adviceLoading}
              style={{ marginTop: 10 }}
            />
          )}
          {/* The honest save outcome (Saved on proof, the pending line, or an
              error) stays on screen after the editor closes. */}
          {note && <SaveNoteLine note={note} />}
          {/* Menu: the owner edits it in the portal (single source of truth) and
              pushes it to Google — both live inside PublishMenuButton, which fully
              replaces the Google link for this section. */}
          {isMenu ? (
            isPro
              ? <PublishMenuButton clientId={clientId} onPublished={onSilentRefresh} />
              : (
                <Link href={PORTAL_MENU_HREF} style={{ ...smallEditLinkStyle, marginTop: 10 }}>
                  Edit my menu <ChevronRight size={13} />
                </Link>
              )
          ) : canEditHere ? (
            <button type="button" onClick={openEditor} style={{ ...smallEditBtnStyle, marginTop: 10 }}>
              <Pencil size={12} /> Edit
            </button>
          ) : (
            <a
              href={editHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...smallEditLinkStyle, marginTop: 10 }}
            >
              Edit on Google <ExternalLink size={11} />
            </a>
          )}
        </>
      )}
    </div>
  )
}

/** The summary: the honest profile score when one exists, every part with
 *  its outcome grouped under its chapter, a fresh re-check (which is what
 *  can complete the campaign task), the honest delay note, and the
 *  Keep-it-strong cards (reviews / post / Q and A). */
function AiSummary({ sections, outcomes, allGood, score, taskDone, taskBlocking = [], hasCampaignTask = false, onOpenPart, onFinish, finishing, finishError, rechecking, recheckFailed, onRecheck, onOpenQanda, onOpenPost, onBack }: {
  sections: GbpDiagnosisSection[]
  outcomes: Record<string, PartOutcome>
  allGood: boolean
  /** The diagnosis's existing listing-health score; null = could not score honestly. */
  score: number | null
  taskDone?: boolean
  /** Parts still keeping the campaign's profile task open. */
  taskBlocking?: Array<{ key: string; label: string }>
  /** True when this run is attached to a campaign that carries the profile task. */
  hasCampaignTask?: boolean
  /** Reopen a part from the Overview, so any section can be revisited directly. */
  onOpenPart?: (key: string) => void
  /** Explicitly finish the campaign task (the server re-verifies before it stamps).
   *  `anyway` is the owner's deliberate override of the readiness bar. */
  onFinish?: (anyway?: boolean) => void
  finishing?: boolean
  finishError?: string | null
  rechecking?: boolean
  recheckFailed?: boolean
  onRecheck?: () => void
  onOpenQanda?: () => void
  onOpenPost?: () => void
  onBack: () => void
}) {
  // Chapter groups (a key no chapter knows falls into a last, unnamed group).
  const groups = CHAPTERS
    .map((ch) => ({ name: ch.name, parts: sections.filter((s) => ch.keys.includes(s.key)) }))
    .filter((g) => g.parts.length > 0)
  const stray = sections.filter((s) => !CHAPTER_ORDER.includes(s.key))
  if (stray.length > 0) groups.push({ name: 'More', parts: stray })

  // The SAME readiness rule the server enforces, so the button we offer and the answer
  // we get back can never disagree: absent/unverified parts block, improvable ones don't.
  const readiness = gbpFinishReadiness(sections, score)

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
          Overview
        </span>
      </div>

      {/* The honest score: the diagnosis's existing listing-health number,
          shown plainly. No before/after is ever invented. */}
      {score != null && (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '13px 16px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, fontFamily: DISPLAY }}>Profile score: {score} of 100</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>From what Google shows on your listing right now.</div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.name} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, margin: '0 2px 6px' }}>{g.name}</div>
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '4px 0', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            {g.parts.map((s, i) => {
              const o = summaryOutcome(s, outcomes)
              // Every row reopens its part, so any section can be revisited straight from
              // the Overview instead of walking back through the ones in front of it.
              const rowInner = (
                <>
                  {o.good
                    ? (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={12} color={C.greenDk} strokeWidth={3} />
                      </span>
                    )
                    : <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color }} /></span>}
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 14, fontWeight: 600, color: C.ink }}>{s.label}</span>
                  <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: o.color }}>{o.word}</span>
                  {onOpenPart && <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0, marginLeft: 2 }} />}
                </>
              )
              const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` } as const
              return onOpenPart ? (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onOpenPart(s.key)}
                  aria-label={`Open ${s.label}`}
                  className="mvp-row"
                  style={{ ...rowStyle, width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }}
                >
                  {rowInner}
                </button>
              ) : (
                <div key={s.key} style={rowStyle}>{rowInner}</div>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── Finish ─────────────────────────────────────────────────────────
          The one place the campaign task closes, and the one place that says
          why it can't yet. Three honest states:
            done     → it is complete, with the date-free plain confirmation
            ready    → every part is good; an explicit Finish button stamps it
                       (the SERVER re-reads the profile before it agrees)
            blocked  → name the parts still open, and offer a re-check
          Finishing is deliberate now, not a silent auto-stamp, so "finished"
          is always something the owner chose and the server verified. */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, margin: '0 2px 8px' }}>
          Finish
        </div>

        {taskDone ? (
          <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 600, color: C.ink }}>
              <Check size={16} color={C.greenDk} strokeWidth={3} /> This campaign task is complete
            </div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>
              Your profile checked out. Come back after big changes to check it again.
            </div>
          </div>
        ) : readiness.ready ? (
          <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
              {allGood ? 'Every part looks good' : 'Your profile is in good shape'}
            </div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>
              {readiness.polish.length > 0
                ? <>Nothing is missing{score != null ? `, and you are at ${score} of 100` : ''}. {readiness.polish.length === 1 ? 'One part' : `${readiness.polish.length} parts`} could still be sharper, but that is polish you can do any time.</>
                : hasCampaignTask ? 'Finish it and this campaign task is done.' : 'Nothing needs fixing right now.'}
            </div>
            {hasCampaignTask && (
              <>
                <button
                  type="button"
                  onClick={() => onFinish?.(false)}
                  disabled={!!finishing}
                  className="mvp-row"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 12, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: finishing ? 'default' : 'pointer', opacity: finishing ? 0.8 : 1, font: 'inherit' }}
                >
                  {finishing
                    ? <><Loader2 size={16} className="mvp-spin" /> Finishing&hellip;</>
                    : <><Check size={16} strokeWidth={3} /> Finish this campaign</>}
                </button>
                {finishError && (
                  <div style={{ marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
                    {finishError}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
              {hasCampaignTask ? 'Not ready to finish yet' : 'A few parts still need work'}
            </div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>
              {readiness.scoreShort
                ? <>Nothing is missing, but your profile scores {score ?? 0} of 100 and {GBP_FINISH_MIN_SCORE} is the bar.</>
                : readiness.blockers.length > 0
                  ? <>{readiness.blockers.length === 1 ? 'One part is' : `${readiness.blockers.length} parts are`} still missing{hasCampaignTask ? ', so the campaign task stays open' : ''}:</>
                  : <>Go back and fix the parts marked above, then check again.</>}
            </div>
            {readiness.blockers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                {readiness.blockers.map((b) => (
                  <span key={b.key} style={{ fontSize: 12, fontWeight: 700, color: C.ink, background: C.bg, border: `0.5px solid ${C.line}`, borderRadius: 99, padding: '4px 10px' }}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onRecheck}
              disabled={!!rechecking}
              className="mvp-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 12, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: rechecking ? 'default' : 'pointer', opacity: rechecking ? 0.8 : 1, font: 'inherit' }}
            >
              {rechecking
                ? <><Loader2 size={16} className="mvp-spin" /> Checking your profile&hellip;</>
                : 'Check my profile again'}
            </button>
            {/* The deliberate override. It never claims the profile is clean — finishing this
                way records the parts that were still open, so the record stays true. */}
            {hasCampaignTask && (
              <>
                <button
                  type="button"
                  onClick={() => onFinish?.(true)}
                  disabled={!!finishing}
                  className="mvp-row"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 8, height: 44, borderRadius: 13, border: `0.5px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: finishing ? 'default' : 'pointer', opacity: finishing ? 0.8 : 1, font: 'inherit' }}
                >
                  {finishing ? <><Loader2 size={15} className="mvp-spin" /> Finishing&hellip;</> : 'Finish anyway'}
                </button>
                <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.45, margin: '7px 0 0' }}>
                  Closes the task and notes what was still open, so the record stays honest.
                </p>
                {finishError && (
                  <div style={{ marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
                    {finishError}
                  </div>
                )}
              </>
            )}
            {recheckFailed && (
              <div style={{ marginTop: 8, background: C.redSoft, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: C.red, lineHeight: 1.45 }}>
                We could not check right now. Try again in a minute.
              </div>
            )}
            <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '10px 0 0' }}>
              Changes you make on Google can take a few minutes to show up here.
            </p>
          </div>
        )}
      </div>

      {/* Keep it strong: the other Google tools, now homed on the summary. */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, margin: '0 2px 8px' }}>
          Keep it strong
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
        <button type="button" onClick={onOpenPost} className="mvp-row" style={hubCardStyle}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Megaphone size={19} color={C.greenDk} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>Post an update</span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>
              Share news on your Google listing.
            </span>
          </span>
          <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
        </button>
        <button type="button" onClick={onOpenQanda} className="mvp-row" style={hubCardStyle}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={19} color={C.greenDk} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>Questions and answers</span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>
              Answer what people ask, with AI help.
            </span>
          </span>
          <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
        </button>
      </div>
    </>
  )
}

/* ── Questions and answers (the hub's third card) ───────────────── */

/* Google shut the My Business Q&A API down for every app (verified
   2026-07-11: the questions list returns 501 UNIMPLEMENTED, reason
   API_UNSUPPORTED, "My Business Q&A API is no longer supported"). No app can
   read or answer listing questions anymore, so this door says that plainly,
   hands off to business.google.com, and keeps the part that still works:
   paste a question, get an AI-drafted answer (POST
   /api/dashboard/gbp-answer-draft reads only our own facts plus the model,
   never the dead Q&A API), copy it, post it on Google. */

/**
 * The Q&A door: the plain explanation, the "Answer on Google" link out, and
 * the paste-a-question AI drafter with a copyable result. Drafting is Pro,
 * hinted in the UI and enforced on the server.
 *
 * The initial* props are a TEST SEAM for the render smoke only (they prefill
 * the question box or show the finished draft without a fetch); the live
 * page never passes them.
 */
export function GbpQandaView({ clientId, isPro, mapsUri, onBack, initialQuestionText, initialDraft }: {
  clientId: string
  isPro: boolean
  /** The listing's public Google Maps URL (its Q&A section lives there). Falls back to business.google.com. */
  mapsUri?: string | null
  onBack: () => void
  initialQuestionText?: string
  initialDraft?: string
}) {
  // Deep-link straight to THEIR listing when we have it from the live read;
  // only https URLs from Google's own metadata field are trusted.
  const answerHref = mapsUri && /^https:\/\//.test(mapsUri) ? mapsUri : 'https://business.google.com/'
  const [question, setQuestion] = useState(initialQuestionText ?? '')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<string | null>(initialDraft ?? null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const requestDraft = async () => {
    if (drafting) return
    const q = question.trim()
    if (!q) { setDraftError('Paste the question first.'); return }
    setDrafting(true)
    setDraftError(null)
    try {
      const r = await fetch('/api/dashboard/gbp-answer-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, questionText: q }),
      })
      const j = await r.json().catch(() => ({})) as { draft?: unknown; error?: unknown }
      if (!r.ok || typeof j.draft !== 'string' || !j.draft.trim()) {
        // Only surface the server's message on our own 502s (plain owner
        // words); anything else gets the generic plain line.
        const msg = r.status === 502 && typeof j.error === 'string' && j.error ? j.error : DRAFT_FAIL
        throw new Error(msg)
      }
      setDraft(j.draft)
      setCopied(false)
    } catch (e) {
      setDraftError(e instanceof Error && e.message ? e.message : DRAFT_FAIL)
    } finally {
      setDrafting(false)
    }
  }

  const copyDraft = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setDraftError('Copy did not work. Press and hold the text to copy it yourself.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 2px' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mvp-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: -6, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ChevronLeft size={19} color={C.mute} />
        </button>
        <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>Questions and answers</span>
      </div>
      <div style={{ fontSize: 13, color: C.mute, padding: '0 2px 14px', lineHeight: 1.5 }}>
        Google does not let apps read or answer listing questions anymore, so this happens on Google itself.
      </div>

      <a
        href={answerHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mvp-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, borderRadius: 13, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
      >
        Answer on Google <ExternalLink size={15} />
      </a>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '17px 15px', marginTop: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>Got a question?</div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.5 }}>
          Paste it here and we will draft your answer.
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 5 }} htmlFor="gbp-qanda-question">The question</label>
          <textarea
            id="gbp-qanda-question"
            value={question}
            onChange={(e) => { setQuestion(e.target.value); setDraftError(null) }}
            rows={3}
            placeholder="Paste the question just as they asked it."
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, color: C.ink, font: 'inherit', resize: 'vertical' }}
          />

          <button
            type="button"
            onClick={() => { void requestDraft() }}
            disabled={drafting || !isPro}
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, cursor: drafting || !isPro ? 'default' : 'pointer', opacity: drafting || !isPro ? 0.7 : 1, font: 'inherit' }}
          >
            {drafting
              ? <><Loader2 size={15} className="mvp-spin" /> Writing your draft&hellip;</>
              : <><Sparkles size={15} /> Draft my answer</>}
          </button>
          {!isPro && (
            <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0', textAlign: 'center' }}>
              Apnosh AI drafting is on the Pro plan.
            </p>
          )}
          {draftError && <div style={errLineStyle}>{draftError}</div>}

          {draft && (
            <div style={{ marginTop: 12, background: C.bg, borderRadius: 12, padding: '12px 13px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>Your draft</div>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{draft}</div>
              <button
                type="button"
                onClick={() => { void copyDraft() }}
                style={{ marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 40, borderRadius: 11, border: 'none', background: copied ? C.greenDk : C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', font: 'inherit', transition: 'background .15s ease' }}
              >
                {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
              </button>
              <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0' }}>
                Copy this and post it on Google.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Post an update (the hub's fourth card) ─────────────────────── */

const POST_MAX_UI = 1500
const POST_FAIL = 'We could not post this right now. Try again in a minute.'

/** The button choices the composer offers. The server also accepts ORDER. */
type PostCtaChoice = 'none' | 'LEARN_MORE' | 'CALL'

/**
 * Map one gbp-post response to the honest owner line. Never optimistic:
 * "Posted to Google." appears ONLY on live:true (Google returned the created
 * post, which is a create's own proof); ok without proof reads as
 * sent-not-showing-yet; 429 is Google's own per-minute cap in plain words;
 * 400/403 bodies are the server's plain owner words; anything else gets the
 * generic could-not-post line (raw 5xx strings never render). Exported for
 * the render smoke.
 */
export function postResultNote(status: number, body: { ok?: boolean; live?: boolean; error?: string } | null): SaveNote {
  if (status === 200 && body?.ok) {
    return body.live === true
      ? { tone: 'ok', text: 'Posted to Google.' }
      : { tone: 'pending', text: 'Sent to Google. It can take a few minutes to show.' }
  }
  if (status === 429) return { tone: 'error', text: 'Google only allows a few edits per minute. Try again in a minute.' }
  if ((status === 400 || status === 403) && typeof body?.error === 'string' && body.error.trim()) {
    return { tone: 'error', text: body.error }
  }
  return { tone: 'error', text: POST_FAIL }
}

/** What a finished publish leaves on screen: the honest line + the proof link
 *  when Google sent one back. */
export interface PostedState { note: SaveNote; postUrl: string | null }

const ctaChipStyle = (active: boolean): CSSProperties => ({
  padding: '7px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', font: 'inherit',
  border: `0.5px solid ${active ? C.green : C.line}`,
  background: active ? C.greenSoft : '#fff',
  color: active ? C.greenDk : C.ink,
})

/**
 * Compose one Google post (What's New) and publish it live: a textarea with
 * a live count against Google's 1500 rule, "Draft it for me" (POST
 * gbp-post-draft fills the box), an optional button (None / Learn more with
 * an https link / Call), and "Publish to Google" (POST gbp-post). Text and
 * one button only — no photos and no scheduling here.
 *
 * The published line is never optimistic: "Posted to Google." ONLY when
 * Google returned the created post; a tappable "See it" only when Google sent
 * the public link back. After a successful publish the composer clears, the
 * proof line shows, and a quiet "Post again" resets. Publishing and drafting
 * are Pro; non-Pro sees the plain hint and the server enforces it regardless.
 *
 * The initial* props are a TEST SEAM for the render smoke only (they prefill
 * the composer, pick a button, inject a note, or land on the posted screen
 * without a fetch); the live page never passes them.
 */
export function GbpPostView({ clientId, isPro, onBack, initialText, initialCta, initialSaveNote, initialPosted }: {
  clientId: string
  isPro: boolean
  onBack: () => void
  initialText?: string
  initialCta?: { choice: PostCtaChoice; url?: string }
  initialSaveNote?: SaveNote
  initialPosted?: PostedState
}) {
  const [text, setText] = useState(initialText ?? '')
  const [ctaChoice, setCtaChoice] = useState<PostCtaChoice>(initialCta?.choice ?? 'none')
  const [ctaUrl, setCtaUrl] = useState(initialCta?.url ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [note, setNote] = useState<SaveNote | null>(initialSaveNote ?? null)
  const [posted, setPosted] = useState<PostedState | null>(initialPosted ?? null)

  const requestDraft = async () => {
    if (drafting || publishing) return
    setDrafting(true)
    setDraftError(null)
    try {
      const r = await fetch('/api/dashboard/gbp-post-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const j = await r.json().catch(() => ({})) as { draft?: unknown; error?: unknown }
      if (!r.ok || typeof j.draft !== 'string' || !j.draft.trim()) {
        // Only surface the server's message on our own 502s (plain owner
        // words); anything else gets the generic plain line.
        const msg = r.status === 502 && typeof j.error === 'string' && j.error ? j.error : DRAFT_FAIL
        throw new Error(msg)
      }
      setText(j.draft)
      setLocalError(null)
    } catch (e) {
      setDraftError(e instanceof Error && e.message ? e.message : DRAFT_FAIL)
    } finally {
      setDrafting(false)
    }
  }

  const publish = async () => {
    if (publishing) return
    const v = text.trim()
    if (!v) { setLocalError('Write your update first.'); return }
    if (v.length > POST_MAX_UI) { setLocalError(`Google allows up to ${POST_MAX_UI} characters. This has ${v.length}.`); return }
    if (ctaChoice === 'LEARN_MORE' && !/^https:\/\//i.test(ctaUrl.trim())) {
      setLocalError('The button link must start with https://.')
      return
    }
    setLocalError(null)
    setNote(null)
    setPublishing(true)
    try {
      const cta = ctaChoice === 'none' ? undefined
        : ctaChoice === 'CALL' ? { type: 'CALL' }
          : { type: 'LEARN_MORE', url: ctaUrl.trim() }
      const r = await fetch('/api/dashboard/gbp-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, text: v, ...(cta ? { cta } : {}) }),
      })
      const j = await r.json().catch(() => null) as { ok?: boolean; live?: boolean; postUrl?: unknown; error?: string } | null
      const n = postResultNote(r.status, j)
      if (r.status === 200 && j?.ok === true) {
        // Google accepted the post: clear the composer and show the proof line.
        setPosted({ note: n, postUrl: typeof j.postUrl === 'string' && j.postUrl ? j.postUrl : null })
        setText('')
        setCtaChoice('none')
        setCtaUrl('')
      } else {
        setNote(n)
      }
    } catch {
      setNote({ tone: 'error', text: POST_FAIL })
    } finally {
      setPublishing(false)
    }
  }

  const len = text.trim().length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 2px' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mvp-row"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: -6, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ChevronLeft size={19} color={C.mute} />
        </button>
        <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink }}>Post an update</span>
      </div>
      <div style={{ fontSize: 13, color: C.mute, padding: '0 2px 14px', lineHeight: 1.5 }}>
        Share news on your Google listing.
      </div>

      {posted ? (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '17px 15px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <SaveNoteLine note={posted.note} />
          {posted.postUrl && (
            <a
              href={posted.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mvp-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 12, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}
            >
              See it on Google <ExternalLink size={15} />
            </a>
          )}
          <button
            type="button"
            onClick={() => { setPosted(null); setNote(null); setLocalError(null); setDraftError(null) }}
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8, height: 40, borderRadius: 12, border: 'none', background: 'none', color: C.mute, fontSize: 14, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}
          >
            Post again
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '17px 15px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 5 }} htmlFor="gbp-post-text">Your update</label>
          <textarea
            id="gbp-post-text"
            value={text}
            onChange={(e) => { setText(e.target.value); setLocalError(null) }}
            rows={6}
            placeholder="What is new at your place? A dish, a special, a change in hours."
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, color: C.ink, font: 'inherit', resize: 'vertical' }}
          />
          <div style={{ fontSize: 12, color: len > POST_MAX_UI ? C.red : C.mute, margin: '6px 2px 0' }}>
            {len} of {POST_MAX_UI} characters.
          </div>

          {isPro && (
            <button
              type="button"
              onClick={() => { void requestDraft() }}
              disabled={drafting || publishing}
              className="mvp-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, height: 44, borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 14.5, fontWeight: 700, cursor: drafting ? 'default' : 'pointer', opacity: drafting ? 0.8 : 1, font: 'inherit' }}
            >
              {drafting
                ? <><Loader2 size={15} className="mvp-spin" /> Writing your draft&hellip;</>
                : <><Sparkles size={15} /> Draft it for me</>}
            </button>
          )}
          {draftError && <div style={errLineStyle}>{draftError}</div>}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 7 }}>Add a button</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setCtaChoice('none'); setLocalError(null) }} style={ctaChipStyle(ctaChoice === 'none')}>None</button>
              <button type="button" onClick={() => { setCtaChoice('LEARN_MORE'); setLocalError(null) }} style={ctaChipStyle(ctaChoice === 'LEARN_MORE')}>Learn more</button>
              <button type="button" onClick={() => { setCtaChoice('CALL'); setLocalError(null) }} style={ctaChipStyle(ctaChoice === 'CALL')}>Call</button>
            </div>
            {ctaChoice === 'LEARN_MORE' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 5 }} htmlFor="gbp-post-cta-url">Button link</label>
                <input
                  id="gbp-post-cta-url"
                  type="url"
                  inputMode="url"
                  value={ctaUrl}
                  onChange={(e) => { setCtaUrl(e.target.value); setLocalError(null) }}
                  placeholder="https://yourplace.com"
                  style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `0.5px solid ${C.line}`, background: C.bg, padding: '10px 12px', fontSize: 13.5, color: C.ink, font: 'inherit' }}
                />
                <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '6px 0 0' }}>
                  The button carries the link, so keep links out of the post text.
                </p>
              </div>
            )}
            {ctaChoice === 'CALL' && (
              <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '8px 0 0' }}>
                The Call button uses the phone number on your listing.
              </p>
            )}
          </div>

          {localError && <div style={errLineStyle}>{localError}</div>}
          {note && <SaveNoteLine note={note} />}

          <button
            type="button"
            onClick={() => { void publish() }}
            disabled={publishing || !isPro}
            className="mvp-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 14, height: 46, borderRadius: 13, border: 'none', background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, cursor: publishing || !isPro ? 'default' : 'pointer', opacity: publishing || !isPro ? 0.7 : 1, font: 'inherit' }}
          >
            {publishing ? <><Loader2 size={16} className="mvp-spin" /> Posting to Google&hellip;</> : 'Publish to Google'}
          </button>
          {!isPro && (
            <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0', textAlign: 'center' }}>
              Posting from here is on the Pro plan.
            </p>
          )}
          <p style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, margin: '9px 0 0', textAlign: 'center' }}>
            Your update shows on Google as the business.
          </p>
        </div>
      )}
    </div>
  )
}
