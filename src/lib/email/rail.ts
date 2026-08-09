import 'server-only'
/**
 * email/rail — the campaign send rail, the email sibling of attempt-publish.
 *
 * An email piece is a content_drafts row with target_platforms = {email}, a
 * subject (email_subject) and a body (caption). It rides the SAME spine as a
 * social piece — draft, approve, owner sign-off, schedule — and when its
 * moment comes the publish-scheduled cron calls sendEmailDraft instead of
 * attemptPublish.
 *
 * Money-shaped rules, same as the checkout:
 *   - FAIL CLOSED: nothing bulk-sends unless EMAIL_SEND_ENABLED === 'true'
 *     (see rail-core.emailRailEnabled). The refusal is a hard fail so the
 *     cron parks the draft instead of retrying forever.
 *   - Consent twice over: the OWNER must have signed the draft (same gate as
 *     social), and every GUEST can leave with one tap (signed unsubscribe
 *     link on every email; unsubscribed contacts are never sent again).
 *   - Idempotent per person: email_sends is unique on (draft_id, contact_id),
 *     and a retry only targets contacts without a 'sent' receipt — a flaky
 *     first attempt can never double-send to the people it reached.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getApprovalSettings } from '@/lib/work/approval-settings'
import {
  emailRailEnabled, unsubToken, chunk, renderEmailHtml, emailPreflight,
} from './rail-core'

const SITE_URL = 'https://portal.apnosh.com'
const BATCH_SIZE = 100 // Resend's batch endpoint maximum

const unsubSecret = (): string =>
  process.env.UNSUB_SECRET || process.env.CRON_SECRET || 'unsub-dev-secret'

export interface SendEmailDraftResult {
  ok: boolean
  errorCode?:
    | 'draft_not_found'
    | 'awaiting_signoff'
    | 'rail_closed'
    | 'no_subject'
    | 'no_caption'
    | 'no_audience'
    | 'all_sends_failed'
  error?: string
  sent?: number
  failed?: number
}

interface ContactRow { id: string; email: string; name: string | null }

/** Everyone on the client's list who has not unsubscribed. */
export async function audienceForClient(clientId: string): Promise<ContactRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('guest_contacts')
    .select('id, email, name')
    .eq('client_id', clientId)
    .is('unsubscribed_at', null)
    .limit(5000)
  return (data ?? []) as ContactRow[]
}

/** Send a due email draft to the client's whole list. Mirrors attemptPublish's
 *  contract: never throws, does NOT flip draft.status (the cron owns that),
 *  stamps published_at as the receipt when at least one send lands. */
export async function sendEmailDraft(draftId: string): Promise<SendEmailDraftResult> {
  const admin = createAdminClient()

  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, client_id, caption, email_subject, status, client_signed_off_at, published_at')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return { ok: false, errorCode: 'draft_not_found', error: 'draft not found' }

  // Idempotency: a draft with a receipt never sends again.
  if (draft.published_at) return { ok: true, sent: 0, failed: 0 }

  // Same owner-consent gate as social publishing, same chokepoint rule.
  const settings = await getApprovalSettings(draft.client_id as string)
  if (
    settings.client_signoff_required &&
    !draft.client_signed_off_at &&
    !settings.allow_strategist_direct_publish
  ) {
    return {
      ok: false,
      errorCode: 'awaiting_signoff',
      error: 'Waiting for the owner to sign off before this email goes out.',
    }
  }

  const audience = await audienceForClient(draft.client_id as string)
  const pre = emailPreflight(
    { subject: draft.email_subject as string | null, body: draft.caption as string | null },
    audience.length,
    emailRailEnabled({
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED,
    }),
  )
  if (!pre.ok) return { ok: false, errorCode: pre.code, error: pre.error }

  // A retry only targets contacts without a 'sent' receipt for THIS draft.
  const { data: priorSends } = await admin
    .from('email_sends')
    .select('contact_id, status')
    .eq('draft_id', draftId)
  const alreadySent = new Set((priorSends ?? []).filter((r) => r.status === 'sent').map((r) => r.contact_id as string))
  const targets = audience.filter((c) => !alreadySent.has(c.id))
  if (targets.length === 0) {
    // Everyone was reached on a prior attempt; stamp the receipt and finish.
    await admin.from('content_drafts').update({ published_at: new Date().toISOString() }).eq('id', draftId)
    return { ok: true, sent: 0, failed: 0 }
  }

  const { data: client } = await admin
    .from('clients').select('name').eq('id', draft.client_id as string).maybeSingle()
  const businessName = (client?.name as string | undefined) || 'Your restaurant'

  const key = process.env.RESEND_API_KEY as string
  const from = process.env.EMAIL_FROM || 'Apnosh <team@apnosh.com>'
  const subject = (draft.email_subject as string).trim()
  const bodyText = (draft.caption as string).trim()

  let sent = 0
  let failed = 0
  for (const group of chunk(targets, BATCH_SIZE)) {
    const payload = group.map((c) => {
      const unsubUrl = `${SITE_URL}/u/${unsubToken(c.id, unsubSecret())}`
      return {
        from,
        to: [c.email],
        subject,
        html: renderEmailHtml({ bodyText, businessName, unsubUrl }),
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    let ids: (string | null)[] = group.map(() => null)
    let batchError: string | null = null
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = (await r.json().catch(() => null)) as { data?: { id?: string }[] } | null
      if (r.ok && Array.isArray(j?.data)) {
        ids = group.map((_, i) => j!.data![i]?.id ?? null)
      } else {
        batchError = `resend ${r.status}`
      }
    } catch (e) {
      batchError = e instanceof Error ? e.message : 'network error'
    }

    const rows = group.map((c, i) => {
      const okOne = !batchError && ids[i] !== null
      if (okOne) sent++
      else failed++
      return {
        draft_id: draftId,
        client_id: draft.client_id as string,
        contact_id: c.id,
        email: c.email,
        status: okOne ? 'sent' : 'failed',
        provider_id: ids[i],
        error: okOne ? null : batchError ?? 'no id returned',
      }
    })
    // Upsert so a retry overwrites old 'failed' rows and can never duplicate.
    await admin.from('email_sends').upsert(rows, { onConflict: 'draft_id,contact_id' })
  }

  if (sent === 0) {
    return { ok: false, errorCode: 'all_sends_failed', error: 'The email provider refused every send. Will retry.', failed }
  }

  // The receipt: published_at marks the blast as done (partial failures stay
  // visible in email_sends; already-sent people are excluded from any retry).
  await admin
    .from('content_drafts')
    .update({ published_at: new Date().toISOString() })
    .eq('id', draftId)

  await admin.from('events').insert({
    client_id: draft.client_id as string,
    event_type: 'draft.emailed',
    subject_type: 'content_draft',
    subject_id: draftId,
    actor_role: 'system',
    summary: `Emailed ${sent} guests${failed ? ` (${failed} failed)` : ''}`,
    payload: { sent, failed, audience: audience.length },
  })

  // Money-in: same accrual hook every publish path shares.
  try {
    const { accrueChargeForPublishedDraft } = await import('@/lib/campaigns/work-orders')
    await accrueChargeForPublishedDraft(draftId)
  } catch (e) {
    console.error('email send charge accrual threw', draftId, e)
  }

  return { ok: true, sent, failed }
}
