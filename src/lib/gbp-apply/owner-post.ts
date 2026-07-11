import 'server-only'
/**
 * gbp-apply/owner-post — the owner "Post an update" rail: publish ONE Google
 * Business Profile post (What's New) to the client's live listing, through the
 * SAME v4 localPosts publisher the admin work-order lane uses
 * (src/lib/publish/gbp.ts publishToGbp, see dispatch.ts pushGbpPost).
 *
 * Honesty contract (same as gbp-apply/fields.ts):
 *  1. validate BEFORE anything else — an invalid post never burns a rate slot
 *     or reaches Google (deterministic, code-level, no AI);
 *  2. refuse the ambiguous multi-location client;
 *  3. take a per-location rate slot (pace.ts — Google's shared 10/min cap);
 *  4. publish via publishToGbp; a create has no PATCH-style read-back, so the
 *     proof is what Google itself returns: the created post's resource name
 *     (live:true) and its public searchUrl when Google sends one. A create
 *     that comes back without a post name is reported as sent-not-confirmed
 *     (live:false) — never dressed up as live.
 *
 * Post rules (deterministic, mirror the publish path's validator posture in
 * validate.ts validateGbpPost): no URLs in the text (the CTA button carries
 * the one allowed link, and it must be https), no emails, no phone numbers
 * (the profile already shows the number; Google reads raw contact details in
 * posts as spam). Text caps at Google's own 1500-character summary limit.
 * Text + button only — no photos and no scheduling on this rail.
 */

import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { publishToGbp } from '@/lib/publish/gbp'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWriteSlot } from './pace'
import { validateWebsite } from './validate'

/** Google's hard cap on a local post summary (publish/gbp.ts trims here too). */
export const OWNER_POST_MAX = 1500

/** The CTA buttons this rail offers. CALL uses the listing's phone (no url);
 *  the others carry the one allowed link. */
export const OWNER_CTA_TYPES = ['LEARN_MORE', 'ORDER', 'CALL'] as const
export type OwnerCtaType = (typeof OWNER_CTA_TYPES)[number]

export interface OwnerPostInput {
  text: string
  cta?: { type: OwnerCtaType; url?: string } | null
}

export type OwnerPostOutcome =
  | { ok: true; live: boolean; postUrl: string | null; postName: string | null; summary: string }
  | { ok: false; error: string; code: 'invalid' | 'not_connected' | 'multi_location' | 'rate_limited' | 'google_error' }

/* ── Deterministic validation (mirrors validate.ts validateGbpPost, minus the
 *    drafter-only minimum — owners write their own short posts) ── */

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|menu|shop|app|biz|info)\b/i
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/
// Same phone shape the GBP post/answer validators use (dots stay allowed in
// prose like prices and times; real phone shapes still match).
const PHONE_RE = /(\+?\d[\s()-]*){7,}/

export type ValidatedOwnerPost =
  | { ok: true; text: string; cta: { type: OwnerCtaType; url?: string } | null }
  | { ok: false; error: string }

/** Validate the whole post (text + optional CTA). Every error is plain owner words. */
export function validateOwnerPost(input: unknown): ValidatedOwnerPost {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'The post is empty.' }
  const raw = input as { text?: unknown; cta?: unknown }

  if (typeof raw.text !== 'string') return { ok: false, error: 'The post must be text.' }
  const text = raw.text.trim()
  if (!text) return { ok: false, error: 'The post is empty.' }
  if (text.length > OWNER_POST_MAX) {
    return { ok: false, error: `The post is over ${OWNER_POST_MAX} characters (${text.length}). Trim it and try again.` }
  }
  if (URL_RE.test(text)) return { ok: false, error: 'Remove the link from the post text. The post button carries the link.' }
  if (EMAIL_RE.test(text)) return { ok: false, error: 'Remove the email address from the post.' }
  if (PHONE_RE.test(text)) return { ok: false, error: 'Remove the phone number from the post. Your profile already shows it.' }

  if (raw.cta == null) return { ok: true, text, cta: null }
  if (typeof raw.cta !== 'object') return { ok: false, error: 'The button is not set up right. Pick one from the list.' }
  const cta = raw.cta as { type?: unknown; url?: unknown }
  if (typeof cta.type !== 'string' || !(OWNER_CTA_TYPES as readonly string[]).includes(cta.type)) {
    return { ok: false, error: 'The button is not set up right. Pick one from the list.' }
  }
  const type = cta.type as OwnerCtaType

  if (type === 'CALL') {
    // CALL uses the listing's own phone number; a link here would go nowhere.
    if (typeof cta.url === 'string' && cta.url.trim()) {
      return { ok: false, error: 'A Call button uses your listing phone number and does not take a link.' }
    }
    return { ok: true, text, cta: { type } }
  }

  // LEARN_MORE / ORDER require the one allowed link, and it must be https.
  if (typeof cta.url !== 'string' || !cta.url.trim()) {
    return { ok: false, error: 'That button needs a web address. Add one that starts with https://.' }
  }
  const url = validateWebsite(cta.url)
  if (!url.ok) return { ok: false, error: url.error }
  return { ok: true, text, cta: { type, url: url.value } }
}

/* ── Injectable collaborators (harness-testable, zero network: scripts/verify-gbp-post.ts) ── */

export interface OwnerPostDeps {
  getToken: (clientId: string) => Promise<{ accessToken: string; v4Path: string } | { error: string }>
  countAssignedLocations: (clientId: string) => Promise<number>
  acquireSlot: (locationKey: string) => Promise<boolean>
  publish: typeof publishToGbp
}

const defaultDeps: OwnerPostDeps = {
  getToken: (clientId) => getActiveTokenForClient(clientId, null),
  countAssignedLocations: async (clientId) => {
    const admin = createAdminClient()
    const { count } = await admin.from('gbp_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'assigned')
    return count ?? 0
  },
  acquireSlot: acquireWriteSlot,
  publish: publishToGbp,
}

/** Publish one owner-composed post to the live Google listing. */
export async function publishOwnerGbpPost(
  clientId: string,
  input: OwnerPostInput,
  deps: OwnerPostDeps = defaultDeps,
): Promise<OwnerPostOutcome> {
  // 1. Validate BEFORE anything else — an invalid post never burns a rate slot
  //    or reaches Google.
  const checked = validateOwnerPost(input)
  if (!checked.ok) return { ok: false, error: checked.error, code: 'invalid' }

  // 2. Resolve the target location; refuse the ambiguous multi-location case
  //    (a post could land on the wrong listing).
  const tok = await deps.getToken(clientId)
  if ('error' in tok) return { ok: false, error: 'Not connected to Google yet.', code: 'not_connected' }
  if ((await deps.countAssignedLocations(clientId)) > 1) {
    return { ok: false, error: 'This business has more than one Google location, so a post could land on the wrong one. Post from the Google dashboard for now.', code: 'multi_location' }
  }

  // 3. Pace per location — the same shared slot pool every GBP write uses.
  if (!(await deps.acquireSlot(tok.v4Path))) {
    return { ok: false, error: 'Too many Google edits in the last minute. Wait a moment and try again.', code: 'rate_limited' }
  }

  // 4. Publish through the one shared publisher. Text + button only.
  const res = await deps.publish({
    resourceName: tok.v4Path,
    accessToken: tok.accessToken,
    text: checked.text,
    mediaUrls: [],
    callToAction: checked.cta ? { actionType: checked.cta.type, ...(checked.cta.url ? { url: checked.cta.url } : {}) } : null,
  })
  if (!res.success) {
    return { ok: false, error: 'The post did not go through. Try again in a minute.', code: 'google_error' }
  }

  // 5. Proof is what Google returned. A create has no separate read-back: the
  //    created post's resource name IS the confirmation, and searchUrl is the
  //    public link when Google sends one. No name → honest sent-not-confirmed.
  if (!res.postName) {
    return { ok: true, live: false, postUrl: null, postName: null, summary: 'Sent to Google. It can take a few minutes to show.' }
  }
  return {
    ok: true,
    live: true,
    postUrl: res.searchUrl ?? null,
    postName: res.postName,
    summary: 'Posted to Google.',
  }
}
