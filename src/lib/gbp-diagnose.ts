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

import { getClientListing, type DayKey } from '@/lib/gbp-listing'
import { getClientMenus, getClientMenuLink, getActiveTokenForClient } from '@/lib/gbp-menu'
import { readGbpAttributes, type GbpAttributeItem, type GbpAttributeGroupKey } from '@/lib/gbp-attributes'
import { getListingHealth } from '@/lib/dashboard/get-listing-health'
import { createAdminClient } from '@/lib/supabase/admin'

const V4_BASE = 'https://mybusiness.googleapis.com/v4'

export type GbpSectionStatus = 'good' | 'needs-work' | 'missing' | 'unknown'

/**
 * Per-section CONTENT detail so the review can show the owner the actual
 * values on Google (the real hours, the real category names, the photo
 * thumbnails), not just a summary line. Same honesty rules as `current`:
 * every value here was read from Google on this diagnosis. When a read
 * failed or the data is absent, `detail` is simply omitted (or its fields
 * are null) — never guessed, and never a raw error string. Arrays are
 * capped (12 photos, 12 menu items) so the payload stays small enough for
 * the PDP's localStorage cache.
 */
export type GbpSectionDetail =
  | {
      kind: 'hours'
      /** All 7 days, Monday first. Closed days say "Closed". */
      days: Array<{ day: string; hours: string }>
      /** Only present when the owner set special hours. */
      specialCount?: number
    }
  | { kind: 'categories'; primary: string | null; additional: string[] }
  | { kind: 'description'; text: string | null }
  | {
      kind: 'photos'
      count: number
      /** e.g. "about 2 months old" — only when Google gave a timestamp. */
      newestLabel?: string
      /** Up to 12 thumbnail URLs, newest first when timestamps exist. */
      items: Array<{ url: string }>
    }
  | {
      kind: 'menu'
      itemCount: number
      /** Up to 12 items; price only when Google has one (e.g. "$8.99"). */
      items: Array<{ name: string; price?: string }>
      menuLink?: string | null
    }
  | { kind: 'links'; website: string | null; phone: string | null }
  | {
      kind: 'attrs'
      /** Yes/no listing options in this group. value null = never answered. */
      items: Array<{ id: string; label: string; value: boolean | null }>
    }

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
  /** One deterministic sentence or two of plain advice, computed ONLY from
   *  the real read data: good sections get a confirmation plus one concrete
   *  idea, weak sections get a direct fix suggestion. Never invented facts,
   *  never a guessed number. */
  advice?: string
  /** The actual content on Google (see GbpSectionDetail). Absent when the
   *  read failed — the UI falls back to `current`. */
  detail?: GbpSectionDetail
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
  /** Public Google Maps URL of the listing (where reviews and Q&A live). Only set when read from Google. */
  mapsUri?: string
}

/* ── Photos (v4 media list) ─────────────────────────────────────────
   gbp-media.ts only POSTs photos; this is the read side of the same
   endpoint, on the same token helper. One page (100 items) covers
   almost every restaurant; if Google says there are more pages we
   report the count as "at least". */

interface MediaItem {
  mediaFormat?: string
  createTime?: string
  /** Small rendition Google serves for thumbnails. */
  thumbnailUrl?: string
  /** Full-size Google-hosted URL (fallback when no thumbnail). */
  googleUrl?: string
}

interface PhotoSummary {
  /** Photos we saw (merchant-uploaded; customer photos are a separate endpoint). */
  count: number
  /** Age in whole days of the newest photo we saw, or null if none had a timestamp. */
  newestDays: number | null
  /** True when Google reported more pages than we read. */
  partial: boolean
  /** Up to 12 thumbnail URLs (newest first when timestamps exist). Only
   *  URLs Google actually returned — items without one are skipped. */
  items: Array<{ url: string }>
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
  if (res.status === 404) return { ok: true, count: 0, newestDays: null, partial: false, items: [] }
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
  /* Thumbnails for the review: newest first (undated last), capped at 12,
     and only items where Google actually returned a URL. */
  const items = photos
    .map(p => {
      const t = p.createTime ? new Date(p.createTime).getTime() : NaN
      return { url: (p.thumbnailUrl || p.googleUrl || '').trim(), t: Number.isFinite(t) ? t : -Infinity }
    })
    .filter(x => x.url)
    .sort((a, b) => b.t - a.t)
    .slice(0, 12)
    .map(x => ({ url: x.url }))
  return { ok: true, count: photos.length, newestDays, partial: !!body.nextPageToken, items }
}

/** "12 days old", "about 8 months old", "about 2 years old" — always from a real timestamp. */
function ageWords(days: number): string {
  if (days === 0) return 'from today'
  if (days === 1) return '1 day old'
  if (days < 60) return `${days} days old`
  if (days < 730) return `about ${Math.floor(days / 30)} months old`
  return `about ${Math.floor(days / 365)} years old`
}

/* ── Hours detail formatting ────────────────────────────────────────
   gbp-listing gives each day as ranges of "HH:MM" (24h; "24:00" =
   closes at midnight). The review shows them the way the owner reads
   them: "8:00 AM to 9:00 PM". */

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

/** "08:00" → "8:00 AM"; "21:30" → "9:30 PM"; "24:00"/"00:00" → "12:00 AM". */
function fmtTime(t: string): string {
  const [hRaw, mRaw] = t.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  const h24 = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0
  const mm = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0
  const ampm = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

/** One day's ranges as owner words; multiple ranges join with a comma. */
function dayHoursWords(ranges: Array<{ open: string; close: string }>): string {
  if (ranges.length === 0) return 'Closed'
  return ranges.map(r => `${fmtTime(r.open)} to ${fmtTime(r.close)}`).join(', ')
}

/* ── Section builders ───────────────────────────────────────────── */

const WHY = {
  hours: 'People check your hours before they visit.',
  categories: 'Google uses your categories to decide which searches show your listing.',
  description: 'Your description tells Google and customers what makes your place worth the trip.',
  photos: 'Fresh photos help people pick you over the place next door.',
  menu: 'People want to see what you serve before they come in.',
  links: 'Your website and phone number let people order, book, and call.',
  getting: 'People check parking and access before they head over.',
  seating: 'People want to know if they can sit outside, bring a laptop, or find a restroom.',
  service: 'People check how they can order and pay before they come.',
} as const

function unknownSection(key: string, label: string, why: string, aiFixable: boolean, current: string, advice: string): GbpDiagnosisSection {
  return { key, label, status: 'unknown', current, why, aiFixable, advice }
}

/* ── Attribute groups (getting here / seating / service) ────────────
   Built from readGbpAttributes: only attributes Google says are valid
   for THIS location, with the owner's current yes/no or null = never
   answered. Status: good when every shown option has an answer,
   needs-work when any is blank, unknown when the read failed. */

const ATTR_GROUP_META: Record<GbpAttributeGroupKey, { label: string; why: string; goodIdea: string }> = {
  getting: {
    label: 'Getting here',
    why: WHY.getting,
    goodIdea: 'One idea: add a photo of your entrance so people spot you from the street.',
  },
  seating: {
    label: 'Seating and space',
    why: WHY.seating,
    goodIdea: 'One idea: add a photo of your seating so people can picture the space.',
  },
  service: {
    label: 'Service and payments',
    why: WHY.service,
    goodIdea: 'One idea: post an update when you add a new way to order or pay.',
  },
}

const ATTR_GROUP_ORDER: GbpAttributeGroupKey[] = ['getting', 'seating', 'service']

/** "A", "A and B", "A, B, and C", "A, B, C, and 2 more" — real labels only. */
function joinLabels(labels: string[], cap = 3): string {
  const shown = labels.slice(0, cap)
  const rest = labels.length - shown.length
  if (rest > 0) return `${shown.join(', ')}, and ${rest} more`
  if (shown.length === 1) return shown[0]
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`
  return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`
}

function attrSection(key: GbpAttributeGroupKey, items: GbpAttributeItem[]): GbpDiagnosisSection {
  const meta = ATTR_GROUP_META[key]
  if (items.length === 0) {
    /* Google's metadata offers no matching options for this location's
       category — nothing to set, and claiming "missing" would be false. */
    return {
      key,
      label: meta.label,
      status: 'unknown',
      current: 'Google does not offer these options for your listing.',
      why: meta.why,
      aiFixable: false,
      advice: 'Google does not offer these options for your business type, so there is nothing to set here.',
    }
  }
  const unset = items.filter((it) => it.value === null)
  const setCount = items.length - unset.length
  const good = unset.length === 0
  const advice = good
    ? `All ${items.length} ${items.length === 1 ? 'answer is' : 'answers are'} set. ${meta.goodIdea}`
    : `${joinLabels(unset.map((it) => it.label))} ${unset.length === 1 ? 'is' : 'are'} blank. Blank reads as a mystery. Yes or No both help.`
  return {
    key,
    label: meta.label,
    status: good ? 'good' : 'needs-work',
    current: `${setCount} of ${items.length} set.`,
    why: meta.why,
    aiFixable: false,
    advice,
    detail: { kind: 'attrs', items: items.map((it) => ({ id: it.id, label: it.label, value: it.value })) },
  }
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
    const adv = hasConnection
      ? 'We could not read this right now. Try again in a bit.'
      : 'Connect your Google profile, then run this check again.'
    return {
      connected: hasConnection,
      ...(hasConnection ? { readFailed: true } : {}),
      score: null,
      sections: [
        unknownSection('hours', 'Your hours', why, false, cur, adv),
        unknownSection('categories', 'Your categories', why, true, cur, adv),
        unknownSection('description', 'Your description', why, true, cur, adv),
        unknownSection('photos', 'Your photos', why, false, cur, adv),
        unknownSection('menu', 'Your menu', why, true, cur, adv),
        unknownSection('links', 'Website and phone', why, false, cur, adv),
        unknownSection('getting', ATTR_GROUP_META.getting.label, why, false, cur, adv),
        unknownSection('seating', ATTR_GROUP_META.seating.label, why, false, cur, adv),
        unknownSection('service', ATTR_GROUP_META.service.label, why, false, cur, adv),
      ],
      notes: [...notes, hasConnection
        ? `Google connection exists but reading failed: ${tok.error}`
        : `Google Business Profile is not connected: ${tok.error}`],
      checkedAt,
    }
  }

  /* Every read is best-effort and independent — one failed call turns
     its sections "unknown", never the whole diagnosis. */
  const [listingRes, photosRes, menusRes, menuLinkRes, health, attrsRes] = await Promise.all([
    getClientListing(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    listGbpPhotos(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getClientMenus(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getClientMenuLink(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
    getListingHealth(clientId).catch(() => null),
    readGbpAttributes(clientId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'read failed' })),
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
    const hoursAdvice = days === 0
      ? 'No days have hours yet. Set all 7 days. If you are closed a day, mark it closed so people know.'
      : days >= 5
        ? `${days === 7 ? 'All 7 days are set' : `Hours are set for ${days} of 7 days`}. One idea: add special hours before the next holiday so nobody shows up to a closed door.`
        : `Only ${days} of 7 days have hours. Fill in the other ${7 - days}. If you are closed a day, mark it closed so people know.`
    sections.push({
      key: 'hours',
      label: 'Your hours',
      status: days === 0 ? 'missing' : days >= 5 ? 'good' : 'needs-work',
      current: days === 0
        ? 'No hours on your listing.'
        : `Hours set for ${days} of 7 days.${specialNote}`,
      why: WHY.hours,
      aiFixable: false,
      advice: hoursAdvice,
      detail: {
        kind: 'hours',
        days: DAY_ORDER.map(d => ({ day: DAY_LABEL[d], hours: dayHoursWords(hours[d] ?? []) })),
        ...(specialCount > 0 ? { specialCount } : {}),
      },
    })
  } else {
    sections.push(unknownSection('hours', 'Your hours', WHY.hours, false, 'We could not read your hours right now.', 'We could not read your hours right now. Try again in a bit.'))
  }

  /* Categories. */
  if (fields) {
    const primary = fields.categories?.primary ?? null
    const extra = fields.categories?.additional?.length ?? 0
    const catAdvice = !primary
      ? 'Pick a main category. Google cannot show you in searches without one.'
      : extra >= 1
        ? `You have ${1 + extra} categories set. If you serve a cuisine that is not listed, add it. Categories decide which searches show you.`
        : `Your main category is ${primary.displayName}, but there are no extra ones. Add 2 or 3 that fit what you serve. Each one is another search you can show up in.`
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
      advice: catAdvice,
      detail: {
        kind: 'categories',
        primary: primary?.displayName ?? null,
        additional: (fields.categories?.additional ?? []).map(c => c.displayName),
      },
    })
  } else {
    sections.push(unknownSection('categories', 'Your categories', WHY.categories, true, 'We could not read your categories right now.', 'We could not read your categories right now. Try again in a bit.'))
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
      advice: len === 0
        ? 'Write a description. Three or four plain sentences about what you serve and what makes it special is enough to start.'
        : len >= 250
          ? `Your description is ${len} characters. One idea: read it once a season and swap in your newest dishes so it stays true.`
          : `Your description is ${len} characters, and Google gives you room for 750. Use more of it: what you serve, what makes it special, and the feel of the place.`,
      detail: { kind: 'description', text: len > 0 ? desc : null },
    })
  } else {
    sections.push(unknownSection('description', 'Your description', WHY.description, true, 'We could not read your description right now.', 'We could not read your description right now. Try again in a bit.'))
  }

  /* Photos. Counts photos the business uploaded; customer photos live
     on a different endpoint and are not counted here. */
  if (photosRes.ok) {
    const { count, newestDays, partial } = photosRes
    const countWords = partial ? `At least ${count} photos` : `${count} photos`
    const freshEnough = newestDays != null && newestDays <= 90
    /* Advice built only from the real count + the real newest-photo age. */
    const have = partial ? `You have at least ${count} photos` : `You have ${count} photos`
    let photosAdvice: string
    if (count === 0) {
      photosAdvice = 'Add your first photos. Start with three: one dish, one drink, one of the space.'
    } else if (newestDays == null) {
      photosAdvice = `${have}, but Google did not say how old they are. Add a fresh one: one dish, one drink, one of the space.`
    } else if (!freshEnough) {
      photosAdvice = `${have}, but the newest is ${ageWords(newestDays)}. Fresh photos get more taps. Add one dish, one drink, one of the space.`
    } else if (count < 10) {
      photosAdvice = `${have} and the newest is ${ageWords(newestDays)}. Get to 10 or more: one dish, one drink, one of the space.`
    } else {
      photosAdvice = `${have} and the newest is ${ageWords(newestDays)}. One idea: add one new dish photo each week to stay fresh.`
    }
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
      advice: photosAdvice,
      detail: {
        kind: 'photos',
        count,
        ...(newestDays != null ? { newestLabel: ageWords(newestDays) } : {}),
        items: photosRes.items,
      },
    })
  } else {
    sections.push(unknownSection('photos', 'Your photos', WHY.photos, false, 'We could not read your photos right now.', 'We could not read your photos right now. Try again in a bit.'))
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
    /* Detail only when we actually read the menu (itemCount would be a
       guess otherwise). Up to 12 items, in menu order; price only when
       Google has one (gbp-menu already turned Money into "8.99"). */
    let detail: GbpSectionDetail | undefined
    if (menusRes.ok) {
      const items: Array<{ name: string; price?: string }> = []
      for (const m of menusRes.menus) {
        for (const sec of m.sections) {
          for (const it of sec.items) {
            if (items.length >= 12) break
            const name = (it.name ?? '').trim()
            if (!name) continue
            const price = (it.price ?? '').trim().replace(/^\$/, '')
            items.push(price ? { name, price: `$${price}` } : { name })
          }
        }
      }
      detail = {
        kind: 'menu',
        itemCount,
        items,
        menuLink: menuLinkRes.ok ? (menuLink || null) : null,
      }
    }
    /* Advice from the real item count + link state only. */
    let menuAdvice: string
    if (menusRes.ok && itemCount > 0) {
      menuAdvice = menuLink
        ? `Your menu on Google shows ${itemCount} items and your menu link is set. One idea: when a price changes, update it here the same day.`
        : `Your menu on Google shows ${itemCount} items. One idea: add your menu link too so the Menu button works everywhere.`
    } else if (menuLink) {
      menuAdvice = 'Your menu link is set. One idea: add a few best sellers as menu items on Google so they show right in search.'
    } else if (status === 'missing') {
      menuAdvice = 'Add a menu link or a few menu items. People pick where to eat by the menu.'
    } else {
      menuAdvice = 'We could not read your menu right now. Try again in a bit.'
    }
    sections.push({ key: 'menu', label: 'Your menu', status, current, why: WHY.menu, aiFixable: true, advice: menuAdvice, ...(detail ? { detail } : {}) })
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
      advice: website && phone
        ? 'Website and phone are both set. One idea: tap the website link once a month to make sure it still works.'
        : website
          ? 'Your website is set, but there is no phone number. Add it so people can call.'
          : phone
            ? 'Your phone number is set, but there is no website. Add it so people can see your menu and book.'
            : 'Add your website and phone number. People use them to order, book, and call.',
      detail: { kind: 'links', website: website || null, phone: phone || null },
    })
  } else {
    sections.push(unknownSection('links', 'Website and phone', WHY.links, false, 'We could not read your website and phone right now.', 'We could not read your website and phone right now. Try again in a bit.'))
  }

  /* Getting here / Seating and space / Service and payments — the Google
     listing ATTRIBUTES the owner can answer yes or no. Best-effort like
     every other read: a failed attributes read turns these three unknown
     and never blocks the rest of the diagnosis. */
  if (attrsRes.ok) {
    for (const key of ATTR_GROUP_ORDER) {
      sections.push(attrSection(key, attrsRes.groups[key]))
    }
  } else {
    for (const key of ATTR_GROUP_ORDER) {
      const meta = ATTR_GROUP_META[key]
      sections.push(unknownSection(key, meta.label, meta.why, false, 'We could not read these right now.', 'We could not read these right now. Try again in a bit.'))
    }
    notes.push(`Attributes read failed: ${attrsRes.error}`)
  }

  /* Overall score: reuse the existing listing-health score. It only
     counts checks it could actually determine, so it never guesses.
     When nothing was determinable we return null, not a made-up 0. */
  const score = health && health.total > 0 ? health.score : null
  if (score == null) {
    notes.push('No overall score. We could not read enough of the listing to score it honestly.')
  }

  const mapsUri = listingRes.ok && listingRes.mapsUri ? listingRes.mapsUri : undefined
  return { connected: true, score, sections, notes, checkedAt, ...(mapsUri ? { mapsUri } : {}) }
}
