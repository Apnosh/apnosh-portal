import 'server-only'
/**
 * ── DEAD RAIL — Google closed this feature for apps ──────────────────────
 * Verified by a live probe on 2026-07-11: GET
 * https://mybusinessqanda.googleapis.com/v1/locations/{l}/questions returns
 * 501 UNIMPLEMENTED, reason API_UNSUPPORTED, message "My Business Q&A API is
 * no longer supported." No app can list or answer listing questions anymore,
 * on any OAuth project. listGbpQuestions and upsertGbpAnswer below can never
 * work against Google again; they are kept only as reference for the honesty
 * contract they implemented (validate-first, pace, read-back proof). The two
 * routes that called them (GET /api/dashboard/gbp-questions and POST
 * /api/dashboard/gbp-answer) now return 410 { code: 'api_removed' } without
 * touching this module. The owner UI hands off to business.google.com and
 * keeps the AI drafter (POST /api/dashboard/gbp-answer-draft), which never
 * touched this API — it only reads our own DB facts and calls the model.
 * validateAnswer IS still live: the draft route uses it as its backstop.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * gbp-qanda — read and answer the customer Questions & Answers on a client's
 * Google Business Profile listing (the owner "Your Google helper" hub).
 *
 * Q&A lives in its own API, the My Business Q&A API:
 *   base https://mybusinessqanda.googleapis.com/v1
 *   GET  locations/{l}/questions            → { questions: [...] } (author, text,
 *        upvoteCount, createTime, topAnswers)
 *   POST locations/{l}/questions/{q}/answers:upsert  body { answer: { text } }
 *        → writes/updates THE merchant answer for that question.
 *
 * Token + location resolution reuses getActiveTokenForClient (gbp-menu.ts) —
 * the same accounts/{a}/locations/{l} idiom every other GBP module uses; Q&A
 * paths need only the locations/{l} segment.
 *
 * Honesty contract (same as gbp-apply):
 *  - validate BEFORE anything else — an invalid answer never burns a rate
 *    slot or reaches Google (deterministic, code-level);
 *  - take a per-location write slot (pace.ts — Google's shared 10/min cap);
 *  - POST the upsert, then RE-READ that question and compare the merchant
 *    answer — live:true ONLY when the read-back matches what was sent;
 *  - failed reads are explicit failed states with a machine code. The Q&A
 *    API must be enabled on the OAuth project; when it is not, Google 403s
 *    with SERVICE_DISABLED — that surfaces as code 'api_disabled' so the UI
 *    can say plainly "This part of Google is not connected yet."
 *  - raw Google error strings are NEVER passed through to owners; every
 *    error string here is written in plain words.
 */

import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { acquireWriteSlot } from '@/lib/gbp-apply/pace'

const QANDA_BASE = 'https://mybusinessqanda.googleapis.com/v1'

export type QandaErrorCode = 'not_connected' | 'api_disabled' | 'google_error'

export interface QandaQuestion {
  /** Stable id: the last segment of the question resource name. */
  id: string
  text: string
  /** Display name of who asked (or a plain fallback, never blank). */
  author: string
  createTime: string
  upvotes: number
  /** The merchant's own answer, when one exists. */
  merchantAnswer: string | null
  /** The top non-merchant answer, when one exists. */
  topAnswer?: { text: string; author: string }
}

export type QandaListResult =
  | { ok: true; questions: QandaQuestion[] }
  | { ok: false; error: string; code: QandaErrorCode }

export type QandaWriteResult =
  | { ok: true; live: boolean; summary: string }
  | { ok: false; error: string; code: 'invalid' | 'rate_limited' | QandaErrorCode }

/* ── Deterministic answer validation (mirrors gbp-apply/validate.ts) ── */

export const ANSWER_MAX = 1000

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|menu|shop|app|biz|info)\b/i
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/
// Same phone shape the GBP post validator uses (dots stay allowed in prose
// like prices and times; real phone shapes still match).
const PHONE_RE = /(\+?\d[\s()-]*){7,}/

export function validateAnswer(text: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof text !== 'string') return { ok: false, error: 'The answer must be text.' }
  const v = text.trim()
  if (!v) return { ok: false, error: 'The answer is empty.' }
  if (v.length > ANSWER_MAX) return { ok: false, error: `The answer is over ${ANSWER_MAX} characters (${v.length}). Trim it and try again.` }
  if (URL_RE.test(v)) return { ok: false, error: 'Remove the link. Google does not allow links in answers.' }
  if (EMAIL_RE.test(v)) return { ok: false, error: 'Remove the email address. Your profile already shows how to reach you.' }
  if (PHONE_RE.test(v)) return { ok: false, error: 'Remove the phone number. Your profile already shows it.' }
  return { ok: true, value: v }
}

/** Question ids ride into a URL path segment: allow only safe resource-id
 *  characters so a crafted id can never redirect the write. */
export function validQuestionId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

/* ── Google wire shapes ── */

interface GbpAuthor { displayName?: string; type?: string }
interface GbpAnswer { name?: string; author?: GbpAuthor; text?: string; upvoteCount?: number }
interface GbpQuestion {
  name?: string
  author?: GbpAuthor
  text?: string
  upvoteCount?: number
  createTime?: string
  topAnswers?: GbpAnswer[]
}

/** locations/{l}/questions/{q} → q (stable id). Null when the shape is off. */
function questionIdFromName(name?: string): string | null {
  const m = /questions\/([^/]+)$/.exec(name ?? '')
  return m ? m[1] : null
}

function normalizeQuestion(raw: GbpQuestion): QandaQuestion | null {
  const id = questionIdFromName(raw.name)
  const text = (raw.text ?? '').trim()
  if (!id || !text) return null
  const answers = raw.topAnswers ?? []
  const merchant = answers.find((a) => a.author?.type === 'MERCHANT' && (a.text ?? '').trim())
  const top = answers.find((a) => a.author?.type !== 'MERCHANT' && (a.text ?? '').trim())
  return {
    id,
    text,
    author: (raw.author?.displayName ?? '').trim() || 'A customer',
    createTime: raw.createTime ?? '',
    upvotes: raw.upvoteCount ?? 0,
    merchantAnswer: merchant ? merchant.text!.trim() : null,
    ...(top ? { topAnswer: { text: top.text!.trim(), author: (top.author?.displayName ?? '').trim() || 'A customer' } } : {}),
  }
}

/* ── Error mapping (plain words only; raw Google strings never escape) ── */

const READ_FAIL = 'We could not read your questions right now.'
const WRITE_FAIL = 'The answer did not go through. Try again in a minute.'

/** The Q&A API not being enabled on the OAuth project surfaces as a 403 with
 *  SERVICE_DISABLED (or the "has not been used ... or it is disabled" wall of
 *  text). That is a setup problem on our side, never the owner's. */
function isApiDisabled(status: number, body: unknown): boolean {
  if (status !== 403) return false
  const s = JSON.stringify(body ?? {})
  return /SERVICE_DISABLED/.test(s) || (/mybusinessqanda/i.test(s) && /not been used|disabled/i.test(s))
}

function mapReadError(status: number, body: unknown, fallback: string): { error: string; code: QandaErrorCode } {
  if (isApiDisabled(status, body)) {
    return { error: 'This part of Google is not connected yet.', code: 'api_disabled' }
  }
  return { error: fallback, code: 'google_error' }
}

/** locations/{l} out of the resolved v4Path (accounts/{a}/locations/{l}). */
function qandaLocationPath(v4Path: string): string | null {
  const m = /locations\/([^/]+)/.exec(v4Path)
  return m ? `locations/${m[1]}` : null
}

/* ── Read ── */

export async function listGbpQuestions(clientId: string): Promise<QandaListResult> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: 'Not connected to Google yet.', code: 'not_connected' }
  const loc = qandaLocationPath(tok.v4Path)
  if (!loc) return { ok: false, error: 'Not connected to Google yet.', code: 'not_connected' }

  const url = `${QANDA_BASE}/${loc}/questions?pageSize=50&answersPerQuestion=10`
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
  } catch {
    return { ok: false, error: READ_FAIL, code: 'google_error' }
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, ...mapReadError(res.status, body, READ_FAIL) }

  const raw = (body as { questions?: GbpQuestion[] }).questions ?? []
  const questions = raw
    .map(normalizeQuestion)
    .filter((q): q is QandaQuestion => q !== null)
  return { ok: true, questions }
}

/* ── Write (upsert THE merchant answer) ── */

export async function upsertGbpAnswer(clientId: string, questionId: string, text: string): Promise<QandaWriteResult> {
  // 1. Validate BEFORE anything else — an invalid answer never burns a rate
  //    slot or reaches Google.
  const checked = validateAnswer(text)
  if (!checked.ok) return { ok: false, error: checked.error, code: 'invalid' }
  if (!validQuestionId(questionId)) return { ok: false, error: 'That question could not be found. Reload and try again.', code: 'invalid' }

  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: 'Not connected to Google yet.', code: 'not_connected' }
  const loc = qandaLocationPath(tok.v4Path)
  if (!loc) return { ok: false, error: 'Not connected to Google yet.', code: 'not_connected' }

  // 2. Pace per location — the same shared slot pool every GBP write uses.
  if (!(await acquireWriteSlot(tok.v4Path))) {
    return { ok: false, error: 'Too many Google edits in the last minute. Wait a moment and try again.', code: 'rate_limited' }
  }

  // 3. The upsert (writes or replaces the ONE merchant answer on this question).
  const url = `${QANDA_BASE}/${loc}/questions/${questionId}/answers:upsert`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: { text: checked.value } }),
    })
  } catch {
    return { ok: false, error: WRITE_FAIL, code: 'google_error' }
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (isApiDisabled(res.status, body)) {
      return { ok: false, error: 'This part of Google is not connected yet.', code: 'api_disabled' }
    }
    return { ok: false, error: WRITE_FAIL, code: 'google_error' }
  }

  // 4. Read the question back and COMPARE — only a matching merchant answer
  //    earns live:true. A failed or mismatching read-back is reported for
  //    what it is, never dressed up as success.
  const reread = await listGbpQuestions(clientId)
  if (!reread.ok) {
    return { ok: true, live: false, summary: 'Sent to Google, but we could not read it back to confirm. Check the listing in a few minutes.' }
  }
  const q = reread.questions.find((x) => x.id === questionId)
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const live = !!q?.merchantAnswer && norm(q.merchantAnswer) === norm(checked.value)
  return live
    ? { ok: true, live: true, summary: 'The answer is confirmed live on the Google listing.' }
    : { ok: true, live: false, summary: 'Sent to Google, but the listing is not showing it yet. Check again in a few minutes.' }
}
