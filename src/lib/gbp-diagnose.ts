import 'server-only'
/**
 * GBP diagnosis engine — reads the owner's real Google Business Profile
 * and grades it section by section. READ ONLY: nothing here writes to
 * Google, drafts content, or fabricates a number.
 *
 * One engine, three future lanes:
 *   1. Free self-checking checklist (renders these sections as-is)
 *   2. Premium AI fixer (per-section apply; `aiFixable` marks which)
 *   3. Done-for-you ops order
 *
 * Reuses the existing machinery end to end:
 *   - Connection/token resolution: getActiveTokenForClient (gbp-menu),
 *     the same helper gbp-media uses for v4 calls.
 *   - Listing fields (v1): getClientListing (gbp-listing).
 *   - Menu (v4 foodMenus + v1 menu link): getClientMenus / getClientMenuLink.
 *     Note: foodMenus is NOT a valid readMask field on locations.get —
 *     it must be read from its own v4 endpoint (see gbp-menu.ts).
 *   - Photos: v4 media list — the read counterpart of the media POST in
 *     gbp-media.ts, using the same token helper and base URL.
 *   - Overall score: getListingHealth (dashboard) — we reuse the existing
 *     completeness score instead of inventing a second scoring system.
 *
 * Posts freshness is intentionally OMITTED: no existing helper reads
 *  recent Google posts (publish/gbp.ts only writes localPosts), and this
 *  phase adds no new API surface for it. A note in the payload says so.
 *
 * Copy rules: owner words, 5th grade, no jargon, no em dashes. `current`
 * strings only ever contain numbers we actually read from Google.
 */

import { getClientListing } from '@/lib/gbp-listing'
import { getClientMenus, getClientMenuLink, getActiveTokenForClient } from '@/lib/gbp-menu'
import { getListingHealth } from '@/lib/dashboard/get-listing-health'
import { createAdminClient } from '@/lib/supabase/admin'

const V4_BASE = 'https://mybusiness.googleapis.com/v4'

export type GbpSectionStatus = 'good' | 'needs-work' | 'missing' | 'unknown'

export interface GbpDiagnosisSection {
  key: string
  /** Owner words, e.g. "Your photos". */
  label: string
  status: GbpSectionStatus
  /** Short honest string of what is there today. Never invented. */
  current: string
  /** One plain sentence on why this section matters. */
  why: string
  /** Can the premium AI lane draft a fix for this section? */
  aiFixable: boolean
}

export interface GbpDiagnosis {
  connected: boolean
  /** True when an ACTIVE connection exists but the read failed (e.g. token refresh
   *  rejected). Telling the owner to "connect" in that state would be false — the
   *  UI shows a "could not read right now" state instead. */
  readFailed?: boolean
  /** Reuses the existing listing-health score. Null when we could not read enough to score honestly. */
  score: number | null
  sections: GbpDiagnosisSection[]
  /** Plain-language caveats: what we did not or could not check. */
  notes: string[]
  checkedAt: string
}

/* ── Photos (v4 media list) ─────────────────────────────────────────
   gbp-media.ts only POSTs photos; this is the read side of the same
   endpoint, on the same token helper. One page (100 items) covers
   almost every restaurant; if Google says there are more pages we
   report the count as "at least". */

interface MediaItem {
  mediaFormat?: string
  createTime?: string
}

interface PhotoSummary {
  /** Photos we saw (merchant-uploaded; customer photos are a separate endpoint). */
  count: number
  /** Age in whole days of the newest photo we saw, or null if none had a timestamp. */
  newestDays: number | null
  /** True when Google reported more pages than we read. */
  partial: boolean
}

async function listGbpPhotos(
  clientId: string,
): Promise<({ ok: true } & PhotoSummary) | { ok: false; error: string }> {
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { ok: false, error: tok.error }

  let res: Response
  try {
    res = await fetch(`${V4_BASE}/${tok.v4Path}/media?pageSize=100`, {
      headers: { Authorization: `Bearer ${tok.accessToken}` },
    })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const body = await res.json().catch(() => ({})) as {
    mediaItems?: MediaItem[]
    nextPageToken?: string
    error?: { message?: string }
  }
  /* v4 returns 404 for a location with no media at all — that is an
     empty state, not an error (same convention as foodMenus). */
  if (res.status === 404) return { ok: true, count: 0, newestDays: null, partial: false }
  if (!res.ok) return { ok: false, error: body?.error?.message || `HTTP ${res.status}` }

  const photos = (body.mediaItems ?? []).filter(m => (m.mediaFormat ?? 'PHOTO') === 'PHOTO')
  let newest: number | null = null
  for (const p of photos) {
    if (!p.createTime) continue
    const t = new Date(p.createTime).getTime()
    if (!Number.isFinite(t)) continue
    if (newest == null || t > newest) newest = t
  }
  const newestDays = newest == null
    ? null
    : Math.max(0, Math.floor((Date.now() - newest) / 86_400_000))
  return { ok: true, count: photos.length, newestDays, partial: !!body.nextPageToken }
}

/** "12 days old", "about 8 months old", "about 2 years old" — always from a real timestamp. */
function ageWords(days: number): string {
  if (days === 0) return 'from today'
  if (days === 1) return '1 day old'
  if (days < 60) return `${days} days old`
  if (days < 730) return `about ${Math.floor(days / 30)} months old`
  return `about ${Math.floor(days / 365)} years old`
}

/* ── Section builders ───────────────────────────────────────────── */

const WHY = {
  hours: 'People check your hours before they visit.',
  categories: 'Google uses your categories to decide which searches show your listing.',
  description: 'Your description tells Google and customers what makes your place worth the trip.',
  photos: 'Fresh photos help people pick you over the place next door.',
  menu: 'People want to see what you serve before they come in.',
  links: 'Your website and phone number let people order, book, and call.',
} as const

function unknownSection(key: string, label: string, why: string, aiFixable: boolean, current: string): GbpDiagnosisSection {
  return { key, label, status: 'unknown', current, why, aiFixable }
}

/* ── The engine ─────────────────────────────────────────────────── */

export async function diagnoseGbp(clientId: string): Promise<GbpDiagnosis> {
  const checkedAt = new Date().toISOString()
  const notes: string[] = [
    'We did not check Google posts. The portal cannot read past posts yet, so we will not guess.',
  ]

  /* Resolve the connection the same way every gbp module does. If there is no
     connection there is nothing honest to grade. A token FAILURE is not the same
     as no connection: an active row can exist while the read fails (expired token
     + refresh rejected, e.g. wrong-environment OAuth credentials). Telling the
     owner to "connect" in that state would be false, so we check for the row and
     report readFailed instead. */
  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) {
    const { data: activeRow } = await createAdminClient()
      .from('channel_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    const hasConnection = !!activeRow
    const cur = hasConnection ? 'We could not read this right now.' : 'Not connected yet.'
    const why = hasConnection
      ? 'Google did not let us read your profile just now. Try again in a bit.'
      : 'Connect your Google Business Profile so we can check this.'
    return {
      connected: hasConnection,
      ...(hasConnection ? { readFailed: true } : {}),
      score: null,
      sections: [
        unknownSection('hours', 'Your hours', why, false, cur),
        unknownSection('categories', 'Your categories', why, true, cur),
        unknownSection('description', 'Your description', why, true, cur),
        unknownSection('photos', 'Your photos', why, false, cur),
        unknownSection('menu', 'Your menu', why, true, cur),
        unknownSection('links', 'Website and phone', why, false, cur),
      ],
      notes: [...notes, hasConnection
        ? `Google connection exists but reading failed: ${tok.error}`
        : `Google Business Profile is not connected: ${tok.error}`],
      checkedAt,
    }
  }

  /* Every read is best-effort and independent — one failed call turns
     its sections "unknown", never the whole diagnosis. */
  const [listingRes, photosRes, menusRes, menuLinkRes, health] = await Promise.all([
    getClientListing(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    listGbpPhotos(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getClientMenus(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getClientMenuLink(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getListingHealth(clientId).catch(() => null),
  ])

  const sections: GbpDiagnosisSection[] = []
  const fields = listingRes.ok ? listingRes.fields : null
  if (!listingRes.ok) {
    notes.push(`We could not read the listing fields from Google: ${listingRes.error}`)
  }

  /* Hours. Days with no hours show as closed on Google, so a place
     closed 1 or 2 days a week is still in good shape (same 5-day
     threshold listing-health.ts uses). */
  if (fields) {
    const hours = fields.regularHours ?? { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    const days = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)
      .filter(d => (hours[d] ?? []).length > 0).length
    const specialCount = (fields.specialHours ?? []).length
    const specialNote = specialCount > 0
      ? ` You also set special hours for ${specialCount} ${specialCount === 1 ? 'date' : 'dates'}.`
      : ''
    sections.push({
      key: 'hours',
      label: 'Your hours',
      status: days === 0 ? 'missing' : days >= 5 ? 'good' : 'needs-work',
      current: days === 0
        ? 'No hours on your listing.'
        : `Hours set for ${days} of 7 days.${specialNote}`,
      why: WHY.hours,
      aiFixable: false,
    })
  } else {
    sections.push(unknownSection('hours', 'Your hours', WHY.hours, false, 'We could not read your hours right now.'))
  }

  /* Categories. */
  if (fields) {
    const primary = fields.categories?.primary ?? null
    const extra = fields.categories?.additional?.length ?? 0
    sections.push({
      key: 'categories',
      label: 'Your categories',
      status: !primary ? 'missing' : extra >= 1 ? 'good' : 'needs-work',
      current: !primary
        ? 'No main category set.'
        : extra >= 1
          ? `Main category is ${primary.displayName}, plus ${extra} more.`
          : `Main category is ${primary.displayName}. No extra categories yet.`,
      why: WHY.categories,
      aiFixable: true,
    })
  } else {
    sections.push(unknownSection('categories', 'Your categories', WHY.categories, true, 'We could not read your categories right now.'))
  }

  /* Description. Google allows up to 750 characters. */
  if (fields) {
    const desc = (fields.description ?? '').trim()
    const len = desc.length
    sections.push({
      key: 'description',
      label: 'Your description',
      status: len === 0 ? 'missing' : len >= 250 ? 'good' : 'needs-work',
      current: len === 0
        ? 'No description yet.'
        : len >= 250
          ? `Your description is ${len} characters.`
          : len < 80
            ? `Your description is only ${len} characters. That is very short.`
            : `Your description is ${len} characters. Google gives you room for 750.`,
      why: WHY.description,
      aiFixable: true,
    })
  } else {
    sections.push(unknownSection('description', 'Your description', WHY.description, true, 'We could not read your description right now.'))
  }

  /* Photos. Counts photos the business uploaded; customer photos live
     on a different endpoint and are not counted here. */
  if (photosRes.ok) {
    const { count, newestDays, partial } = photosRes
    const countWords = partial ? `At least ${count} photos` : `${count} photos`
    const freshEnough = newestDays != null && newestDays <= 90
    sections.push({
      key: 'photos',
      label: 'Your photos',
      status: count === 0 ? 'missing' : count >= 10 && freshEnough ? 'good' : 'needs-work',
      current: count === 0
        ? 'No photos from the business on your listing.'
        : newestDays == null
          ? `${countWords}. Google did not tell us how old they are.`
          : `${countWords}. Newest is ${ageWords(newestDays)}.`,
      why: WHY.photos,
      aiFixable: false,
    })
  } else {
    sections.push(unknownSection('photos', 'Your photos', WHY.photos, false, 'We could not read your photos right now.'))
    notes.push(`Photo read failed: ${photosRes.error}`)
  }

  /* Menu: a real Google food menu OR a menu link both count. foodMenus
     lives on its own v4 endpoint (not a readMask field), and the menu
     link is a v1 attribute — see gbp-menu.ts for both. */
  {
    const itemCount = menusRes.ok
      ? menusRes.menus.reduce((s, m) => s + m.sections.reduce((t, sec) => t + sec.items.length, 0), 0)
      : 0
    const menuLink = menuLinkRes.ok ? menuLinkRes.url.trim() : ''
    /* Record any failed menu read up front so notes[] stays honest no
       matter which branch grades below. */
    if (!menusRes.ok) notes.push(`Menu read failed: ${menusRes.error}`)
    if (!menuLinkRes.ok) notes.push(`Menu link read failed: ${menuLinkRes.error}`)
    let status: GbpSectionStatus
    let current: string
    if (menusRes.ok && itemCount > 0) {
      status = 'good'
      current = menuLink
        ? `Menu on Google with ${itemCount} items, and your menu link is set.`
        : `Menu on Google with ${itemCount} items.`
    } else if (menuLink) {
      /* The link alone earns "good" (the Menu button works). Only claim
         "no menu items" when we actually read the menu and saw none. */
      status = 'good'
      current = menusRes.ok
        ? 'No menu items on Google, but your menu link is set.'
        : 'Your menu link is set. We could not check your menu items right now.'
    } else if (menusRes.ok && menuLinkRes.ok) {
      status = 'missing'
      current = 'No menu and no menu link on your listing.'
    } else {
      status = 'unknown'
      current = 'We could not read your menu right now.'
    }
    sections.push({ key: 'menu', label: 'Your menu', status, current, why: WHY.menu, aiFixable: true })
  }

  /* Links: website + phone. */
  if (fields) {
    const website = (fields.websiteUri ?? '').trim()
    const phone = (fields.primaryPhone ?? '').trim()
    sections.push({
      key: 'links',
      label: 'Website and phone',
      status: website && phone ? 'good' : website || phone ? 'needs-work' : 'missing',
      current: website && phone
        ? 'Website and phone number are both set.'
        : website
          ? 'Website is set, but there is no phone number.'
          : phone
            ? 'Phone number is set, but there is no website.'
            : 'No website and no phone number.',
      why: WHY.links,
      aiFixable: false,
    })
  } else {
    sections.push(unknownSection('links', 'Website and phone', WHY.links, false, 'We could not read your website and phone right now.'))
  }

  /* Overall score: reuse the existing listing-health score. It only
     counts checks it could actually determine, so it never guesses.
     When nothing was determinable we return null, not a made-up 0. */
  const score = health && health.total > 0 ? health.score : null
  if (score == null) {
    notes.push('No overall score. We could not read enough of the listing to score it honestly.')
  }

  return { connected: true, score, sections, notes, checkedAt }
}
