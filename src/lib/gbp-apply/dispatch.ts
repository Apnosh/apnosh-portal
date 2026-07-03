import 'server-only'
/**
 * gbp-apply/dispatch — the engine that runs a work-order step's bound GBP action for one client.
 * READ actions (access check, 30-day baseline from stored metrics, review-link synthesis, verification
 * status) are safe and live. The WRITE path is draft → review → push: prepareWrite drafts + reads the
 * current live value (never mutates); pushWrite is the live write, and it is HONEST about what happened:
 * it validates before consuming a rate slot, writes, reads the value back, and only claims "live" when
 * the read-back matches what was sent. Every write is paced per GBP LOCATION (Google caps profile edits
 * at 10/min and that cap cannot be raised) — durably via the gbp_write_ledger RPC when migration 191 is
 * applied, falling back to a per-instance token bucket until then.
 */
import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { updateClientListing, getClientListing } from '@/lib/gbp-listing'
import { publishToGbp } from '@/lib/publish/gbp'
import { createAdminClient } from '@/lib/supabase/admin'
import { draftDescription, draftGbpPost } from './draft'
import { validateDescription, validateGbpPost } from './validate'
import type { StepAction } from './bindings'

export type ApplyResult = {
  ok: boolean
  /** one-line result shown to the operator + stored as the step's proof note */
  summary?: string
  error?: string
  /** false when the action is a declared write not yet wired for live push */
  enabled?: boolean
  reason?: string
  proofUrl?: string
  detail?: Record<string, unknown> | null
}

/* ── Paced write path: ≤10 edits/min per GBP location (Google's un-raisable cap).
 *    Source of truth = the gbp_write_ledger RPC (atomic, shared across server instances; migration
 *    191). Until that migration is applied, fall back to the in-memory per-instance bucket — safe for
 *    one careful operator, NOT for concurrent fleets, which is why the durable path exists. */
const writeStamps = new Map<string, number[]>()
function acquireLocalSlot(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (writeStamps.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) { writeStamps.set(key, recent); return false }
  recent.push(now)
  writeStamps.set(key, recent)
  return true
}

export async function acquireWriteSlot(locationKey: string): Promise<boolean> {
  const admin = createAdminClient()
  try {
    const { data, error } = await admin.rpc('gbp_acquire_write_slot', { p_location: locationKey, p_limit: 10, p_window_secs: 60 })
    if (!error && typeof data === 'boolean') return data
  } catch { /* table/function not applied yet — fall back below */ }
  return acquireLocalSlot(locationKey)
}

async function accessProbe(clientId: string): Promise<ApplyResult> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: `Not connected to Google yet: ${tok.error}` }
  return { ok: true, summary: 'Connected. We can reach and manage the Google profile.', detail: { location: tok.v4Path } }
}

async function baseline(clientId: string): Promise<ApplyResult> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await admin
    .from('gbp_metrics')
    .select('date, calls, directions, website_clicks, impressions_total')
    .eq('client_id', clientId)
    .gte('date', since)
    .order('date', { ascending: false })
  if (error) return { ok: false, error: error.message }
  const rows = data ?? []
  if (rows.length === 0) {
    // No rows in the window. Distinguish "metrics sync has not run yet" (stay open, retry later —
    // completing now would freeze a false zero baseline that lift reporting compares against) from
    // "genuinely a new listing" (any-ever rows exist outside the window, or none at all after sync).
    const { count } = await admin.from('gbp_metrics').select('date', { count: 'exact', head: true }).eq('client_id', clientId)
    if ((count ?? 0) === 0) {
      return { ok: false, error: 'No Google numbers on file yet. The metrics sync has not run for this client. Check back after the first sync.' }
    }
    return { ok: true, summary: 'No activity in the last 30 days. Baseline recorded as zero.', detail: { days: 0, calls: 0, directions: 0, websiteClicks: 0, views: 0 } }
  }
  const sum = (k: 'calls' | 'directions' | 'website_clicks' | 'impressions_total') => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)
  const calls = sum('calls'), directions = sum('directions'), web = sum('website_clicks'), views = sum('impressions_total')
  return {
    ok: true,
    summary: `Baseline over the last ${rows.length} days: ${calls} calls, ${directions} direction requests, ${web} website clicks, ${views} views.`,
    detail: { days: rows.length, calls, directions, websiteClicks: web, views },
  }
}

async function voiceOfMerchant(clientId: string): Promise<ApplyResult> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: `Not connected to Google yet: ${tok.error}`, detail: { kind: 'error' } }
  // v4Path is accounts/{a}/locations/{l}; the verifications API takes locations/{l}.
  const loc = tok.v4Path.split('/').slice(-2).join('/')
  const res = await fetch(`https://mybusinessverifications.googleapis.com/v1/${loc}/VoiceOfMerchantState`, {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const raw = (body?.error?.message as string) || `HTTP ${res.status}`
    // Friendly mapping for the common infra cases, so the operator sees an instruction, not a wall of text.
    const friendly = /has not been used|is disabled|PERMISSION_DENIED|accessNotConfigured/i.test(raw)
      ? 'The Verifications API is not enabled for our Google project yet. Enable "My Business Verifications API" in the Google Cloud console, then check again.'
      : raw
    return { ok: false, error: friendly, detail: { kind: 'error' } }
  }
  const verified = !!body?.hasVoiceOfMerchant
  // ok only when truly verified, so the claim step is never marked done on a 'pending' state.
  return verified
    ? { ok: true, summary: 'Verified. The profile is live and fully editable.', detail: { kind: 'verified', verified: true } }
    : { ok: false, reason: 'Not verified yet. Google still needs to confirm this listing before it goes live. This is normal and can take a few days.', detail: { kind: 'not_verified', verified: false } }
}

async function reviewLink(clientId: string): Promise<ApplyResult> {
  const admin = createAdminClient()
  const { data } = await admin.from('businesses').select('primary_place_id').eq('client_id', clientId).maybeSingle()
  const placeId = (data?.primary_place_id as string | null) ?? null
  if (!placeId) return { ok: false, error: 'No Google place id on file yet, so the review link cannot be built. Claim and verify the listing first.' }
  const url = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
  return { ok: true, summary: 'Review request link generated.', proofUrl: url, detail: { placeId } }
}

/** Run a step's bound READ action for one client. Writes never come through here — the apply route
 *  sends them to prepareWrite/pushWrite, which carry the consent + pacing machinery. */
export async function runStepAction(clientId: string, action: StepAction): Promise<ApplyResult> {
  if (action.kind === 'write') return { ok: false, error: 'Writes go through prepare and push, not the read runner.' }
  switch (action.handler) {
    case 'accessProbe': return accessProbe(clientId)
    case 'baseline': return baseline(clientId)
    case 'reviewLink': return reviewLink(clientId)
    case 'voiceOfMerchant': return voiceOfMerchant(clientId)
    default: return { ok: false, error: `No handler for ${action.handler}` }
  }
}

/* ── Write path ── */

export type PrepareResult = { ok: boolean; proposed?: string; current?: string | null; note?: string; error?: string }

export async function prepareWrite(clientId: string, action: StepAction): Promise<PrepareResult> {
  if (action.handler === 'description') {
    const [draft, live] = await Promise.all([draftDescription(clientId), getClientListing(clientId, null)])
    if (!draft.ok) return { ok: false, error: draft.error }
    const current = live.ok ? (live.fields.description ?? null) : null
    return { ok: true, proposed: draft.proposed, current }
  }
  if (action.handler === 'gbpPosts') {
    // A post has no meaningful "current live value" — each publish is a new post.
    const draft = await draftGbpPost(clientId)
    if (!draft.ok) return { ok: false, error: draft.error }
    return { ok: true, proposed: draft.proposed, current: null }
  }
  return { ok: true, note: `The draft for ${action.label} lands next. The push path is ready.` }
}

export type PushOutcome = ApplyResult & { detail?: { sent?: string; readBack?: string | null; verified?: boolean } & Record<string, unknown> }

/** Publish one reviewed post to the live profile. Same honesty contract as the
 *  description push: validate before burning a rate slot, refuse the ambiguous
 *  multi-location case, and only claim "live" on Google's own confirmation — a
 *  returned post name IS the read-back for a create, and its public searchUrl
 *  becomes the step's proof link. */
async function pushGbpPost(clientId: string, value: string): Promise<PushOutcome> {
  const check = validateGbpPost(value)
  if (!check.ok) return { ok: false, error: check.error }
  const v = check.value

  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: `Not connected to Google yet: ${tok.error}` }
  const admin = createAdminClient()
  const { count } = await admin.from('gbp_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'assigned')
  if ((count ?? 0) > 1) return { ok: false, error: 'This client has more than one Google location, so a push could hit the wrong one. Per-location targeting is coming; for now post from the Google dashboard.' }

  if (!(await acquireWriteSlot(tok.v4Path))) return { ok: false, error: 'Too many Google edits in the last minute for this profile. Wait a moment and push again.' }

  // The validator strips URLs from the text promising "the button carries the link" —
  // keep that promise: attach a Learn-more button pointing at the site on file. No
  // site, no button (the post still stands; the profile itself carries the basics).
  const { data: biz } = await admin.from('businesses').select('website_url').eq('client_id', clientId).maybeSingle()
  let site = ((biz?.website_url as string | null) ?? '').trim()
  if (!site) {
    const { data: cl } = await admin.from('clients').select('website').eq('id', clientId).maybeSingle()
    site = ((cl?.website as string | null) ?? '').trim()
  }
  if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`
  const callToAction = site ? { actionType: 'LEARN_MORE', url: site } : null

  const res = await publishToGbp({ resourceName: tok.v4Path, accessToken: tok.accessToken, text: v, mediaUrls: [], callToAction })
  if (!res.success) return { ok: false, error: res.error ?? 'Google did not accept the post.' }
  if (!res.postName) {
    return { ok: true, summary: 'Submitted to Google, but no post id came back to confirm it. Open the profile and check the post is showing.', detail: { sent: v, readBack: null, verified: false } }
  }
  return {
    ok: true,
    summary: 'The post is confirmed live on the Google profile.',
    proofUrl: res.searchUrl,
    detail: { sent: v, readBack: res.postName, verified: true, postName: res.postName, searchUrl: res.searchUrl ?? null },
  }
}

export async function pushWrite(clientId: string, action: StepAction, value: string): Promise<PushOutcome> {
  if (action.handler === 'gbpPosts') return pushGbpPost(clientId, value)
  if (action.handler !== 'description') return { ok: false, enabled: false, reason: `Live push for ${action.label} is wired next.` }

  // 1. Validate BEFORE anything else — an invalid value must never burn a rate slot or reach Google.
  const check = validateDescription(value)
  if (!check.ok) return { ok: false, error: check.error }
  const v = check.value

  // 2. Resolve the target location. Guard the ambiguous case: a client with multiple assigned GBP
  //    locations would silently write to the default-resolved one, so refuse until targeting is wired.
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: `Not connected to Google yet: ${tok.error}` }
  const admin = createAdminClient()
  const { count } = await admin.from('gbp_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'assigned')
  if ((count ?? 0) > 1) return { ok: false, error: 'This client has more than one Google location, so a push could hit the wrong one. Per-location targeting is coming; for now make this edit in the Google dashboard.' }

  // 3. Pace per location (10/min, un-raisable), only now that the write is definitely going out.
  if (!(await acquireWriteSlot(tok.v4Path))) return { ok: false, error: 'Too many Google edits in the last minute for this profile. Wait a moment and push again.' }

  // 4. Write, then read back and COMPARE. Only a matching read-back earns "live"; anything else is
  //    reported for what it is, so the tool never claims more than Google confirmed.
  const res = await updateClientListing(clientId, { description: v })
  if (!res.ok) return { ok: false, error: res.error }
  const live = await getClientListing(clientId, null)
  if (!live.ok) {
    return { ok: true, summary: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new text.', detail: { sent: v, readBack: null, verified: false } }
  }
  const readBack = live.fields.description ?? null
  const matches = (readBack ?? '').replace(/\s+/g, ' ').trim() === v.replace(/\s+/g, ' ').trim()
  return matches
    ? { ok: true, summary: 'The description is confirmed live on the Google profile.', detail: { sent: v, readBack, verified: true } }
    : { ok: true, summary: 'Submitted to Google, but the profile is not showing the new text yet (Google may still be processing or reviewing it). Check again shortly.', detail: { sent: v, readBack, verified: false } }
}
