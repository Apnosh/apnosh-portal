import 'server-only'
/**
 * Tracked links — the first writer for tracked_links (the table had a reader,
 * /r/[code], but nothing ever minted rows). attemptPublish mints ONE link per
 * campaign draft at the publish chokepoint; the short URL rides the caption and
 * GBP's CTA button, and /r/[code] counts the clicks. That count is the start of
 * real spend→outcome attribution ("your post was tapped 23 times").
 *
 * Honesty + safety rules:
 *  - A link only exists when the business has somewhere real to send people:
 *    the campaign's ordering link, else the business website. No target → no
 *    link, never a placeholder.
 *  - Idempotent per draft (unique partial index on draft_id): a publish retry
 *    reuses the same code, so clicks never split across duplicates.
 *  - Fails soft everywhere (pre-196 columns, missing env, bad URLs) — a link
 *    problem must never block a publish.
 */
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'  // no 0/1/l/o — read-aloud safe
function newCode(len = 7): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  return s
}

/** Normalize an owner-entered URL ('mysite.com') into an absolute https URL, or null. */
function normalizeUrl(raw: unknown): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return null
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withProto)
    return u.href
  } catch {
    return null
  }
}

/**
 * Mint (or reuse) the tracked link for a campaign draft. Returns the short URL
 * (`${NEXT_PUBLIC_APP_URL}/r/{code}`) or null when no link should exist.
 */
export async function mintTrackedLinkForDraft(
  admin: SupabaseClient,
  opts: { draftId: string; campaignId: string; clientId: string },
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return null

  // Reuse first: one link per draft, forever.
  const { data: existing } = await admin
    .from('tracked_links')
    .select('short_code')
    .eq('draft_id', opts.draftId)
    .maybeSingle()
  if (existing?.short_code) return `${base}/r/${existing.short_code}`

  // Where should the link send people? Campaign ordering link first (the owner
  // gave it for exactly this), then the business website.
  const [{ data: camp }, { data: biz }, { data: client }] = await Promise.all([
    admin.from('campaigns').select('execution').eq('id', opts.campaignId).maybeSingle(),
    admin.from('businesses').select('website_url').eq('client_id', opts.clientId).maybeSingle(),
    admin.from('clients').select('website').eq('id', opts.clientId).maybeSingle(),
  ])
  const exec = (camp?.execution && typeof camp.execution === 'object' ? camp.execution : {}) as Record<string, unknown>
  const target =
    normalizeUrl(exec.orderingLink) ??
    normalizeUrl(biz?.website_url) ??
    normalizeUrl(client?.website)
  if (!target) return null

  // Insert with one retry on a short_code collision. A draft_id unique hit means
  // a racing publish minted it first — reuse theirs.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = newCode()
    const { error } = await admin.from('tracked_links').insert({
      client_id: opts.clientId,
      campaign_id: opts.campaignId,
      draft_id: opts.draftId,
      original_url: target,
      short_code: code,
    })
    if (!error) return `${base}/r/${code}`
    if (error.code === '23505') {
      const { data: again } = await admin.from('tracked_links').select('short_code').eq('draft_id', opts.draftId).maybeSingle()
      if (again?.short_code) return `${base}/r/${again.short_code}`
      continue  // short_code collision → retry with a fresh code
    }
    return null  // pre-196 columns (42703) or anything else → no link, never block
  }
  return null
}

/** Sum of tracked-link clicks per draft, for the outcomes reader. Fails soft to empty. */
export async function clicksByDraft(admin: SupabaseClient, draftIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!draftIds.length) return out
  const { data } = await admin.from('tracked_links').select('draft_id, click_count').in('draft_id', draftIds)
  for (const r of (data ?? []) as { draft_id: string | null; click_count: number | null }[]) {
    if (!r.draft_id) continue
    out.set(r.draft_id, (out.get(r.draft_id) ?? 0) + (r.click_count ?? 0))
  }
  return out
}
