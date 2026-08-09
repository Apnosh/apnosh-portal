/**
 * email/rail-core — the send rail's pure center, sim-locked.
 *
 * Everything here is deterministic and import-safe (no server deps), so
 * scripts/sim/send-rail.ts can hold the rules still:
 *   - the kill switch fails closed (key alone is not consent to bulk-send)
 *   - unsubscribe tokens are HMAC-signed and tamper-evident
 *   - every rendered email carries the unsubscribe link and the sender line
 *   - preflight refuses exactly the states a retry cannot fix
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** Bulk email may go out only when the key exists AND the switch is deliberately
 *  on. RESEND_API_KEY alone also powers small transactional notes (a quote
 *  arriving), so it must not arm campaign blasts by itself. Fail closed. */
export function emailRailEnabled(env: { RESEND_API_KEY?: string; EMAIL_SEND_ENABLED?: string }): boolean {
  return Boolean(env.RESEND_API_KEY) && env.EMAIL_SEND_ENABLED === 'true'
}

/** Signed unsubscribe token: `<contactId>.<hmac>`. The link must work forever
 *  with no login, and must not let anyone unsubscribe someone else by guessing. */
export function unsubToken(contactId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(contactId).digest('base64url')
  return `${contactId}.${sig}`
}

/** Returns the contact id when the signature holds, null for anything else. */
export function verifyUnsubToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const id = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1))
  const expect = Buffer.from(createHmac('sha256', secret).update(id).digest('base64url'))
  if (sig.length !== expect.length) return null
  return timingSafeEqual(sig, expect) ? id : null
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The one email template: the body in clean paragraphs, then the required
 *  footer (who sent it, unsubscribe). Plain and readable beats clever. */
export function renderEmailHtml(args: {
  bodyText: string
  businessName: string
  unsubUrl: string
  address?: string | null
}): string {
  const paragraphs = args.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  const addressLine = args.address ? `${escapeHtml(args.address)} · ` : ''
  return [
    '<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Georgia,serif;color:#1c2420;font-size:16px;">',
    paragraphs,
    '<hr style="border:none;border-top:1px solid #e4e0d5;margin:26px 0 14px;"/>',
    `<p style="margin:0;font-size:12px;color:#8a877c;line-height:1.6;">Sent by ${escapeHtml(args.businessName)} · ${addressLine}`,
    `<a href="${args.unsubUrl}" style="color:#8a877c;">Unsubscribe</a></p>`,
    '</div>',
  ].join('')
}

/** An email piece is a draft aimed at exactly the email channel — never mixed
 *  with social platforms, whose content shape and preflight are different. */
export function isEmailDraft(targetPlatforms: string[] | null | undefined): boolean {
  return Array.isArray(targetPlatforms) && targetPlatforms.length === 1 && targetPlatforms[0] === 'email'
}

export type EmailPreflightCode = 'rail_closed' | 'no_subject' | 'no_caption' | 'no_audience'

/** The refusals a retry cannot fix (all four are hard fails for the cron). */
export function emailPreflight(
  draft: { subject: string | null | undefined; body: string | null | undefined },
  audienceCount: number,
  railOn: boolean,
): { ok: true } | { ok: false; code: EmailPreflightCode; error: string } {
  if (!railOn) {
    return { ok: false, code: 'rail_closed', error: 'Email sending is not switched on yet.' }
  }
  if (!draft.subject?.trim()) {
    return { ok: false, code: 'no_subject', error: 'Add a subject line before this email can go out.' }
  }
  if (!draft.body?.trim()) {
    return { ok: false, code: 'no_caption', error: 'Write the email body before it can go out.' }
  }
  if (audienceCount <= 0) {
    return { ok: false, code: 'no_audience', error: 'No guests on the list yet. Add guests, then reschedule.' }
  }
  return { ok: true }
}
