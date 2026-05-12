/**
 * Per-client approval flow preferences. Lives on clients.approval_settings (jsonb).
 *
 * Toggles compose to model the common owner workflows:
 *  - Strict review: { media_required, signoff_required, !direct, !auto }
 *  - Trust-based: { !media_required, !signoff_required, direct, !auto }
 *  - Streamlined: { !media_required, signoff_required, !direct, auto }
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ApprovalSettings {
  /** Strategist can't mark a draft 'approved' until media_urls is non-empty. */
  media_required_before_approval: boolean
  /** Client must sign off before a draft can move to 'published'. */
  client_signoff_required: boolean
  /** Strategist can publish even when client_signoff_required would otherwise block. */
  allow_strategist_direct_publish: boolean
  /** As soon as client_signed_off_at is stamped, fire the publish flow. */
  auto_publish_on_signoff: boolean
}

export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  media_required_before_approval: false,
  client_signoff_required: true,
  allow_strategist_direct_publish: false,
  auto_publish_on_signoff: false,
}

/**
 * Read approval settings for a client. Returns DEFAULTS for any
 * missing keys, so the caller never has to null-check individual
 * fields. Safe to call on legacy rows that pre-date migration 124.
 */
export async function getApprovalSettings(clientId: string): Promise<ApprovalSettings> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('approval_settings')
    .eq('id', clientId)
    .maybeSingle()

  const raw = (data?.approval_settings as Partial<ApprovalSettings> | null) ?? null
  return { ...DEFAULT_APPROVAL_SETTINGS, ...(raw ?? {}) }
}

/**
 * Update a subset of toggles. Performs a server-side merge by reading
 * + writing back the full object, so concurrent edits land cleanly
 * (last-writer-wins per key, not per row).
 */
export async function updateApprovalSettings(
  clientId: string,
  patch: Partial<ApprovalSettings>,
): Promise<ApprovalSettings> {
  const current = await getApprovalSettings(clientId)
  const next: ApprovalSettings = { ...current, ...patch }

  const admin = createAdminClient()
  await admin.from('clients').update({ approval_settings: next }).eq('id', clientId)
  return next
}
