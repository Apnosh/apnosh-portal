/**
 * Client-safe campaign view layer: the SavedCampaign shape (returned by the
 * API) plus pure mappers that turn it into the Campaigns-board card VM and
 * honest bill labels. No server-only imports — safe in client components.
 */

import { summarize } from './types'
import { turnaroundFor } from './data/service-turnaround'
import type { CampaignDraft, LineItem, PieceProducer } from './types'

export interface SavedCampaign {
  clientId: string
  draft: CampaignDraft
  phase: 'build' | 'review' | 'ship' | 'monitor' | 'iterate'
  /** 'stopped' is terminal: the owner ended the campaign (in-flight work finished
   *  and billed; nothing new starts or posts). A stopped campaign can never re-ship. */
  status: 'draft' | 'shipped' | 'stopped'
  shippedAt: string | null
  /** when a human on the Apnosh team reviewed + took on the order (from /admin/campaign-orders).
   *  Absent on drafts and pre-feature constructions; null = shipped but not yet confirmed. */
  confirmedAt?: string | null
  createdAt: string
  updatedAt: string
  /** Owner's chosen creators per discipline, e.g. { Video: 'v_maya' }. Empty
   *  disciplines fall back to the auto-matched default at render time. */
  creatorChoices: Record<string, string>
  /** Per-piece service: how each creative piece is made — team, a marketplace creator,
   *  an AI draft, or the owner themselves (diy). Keyed by discipline:slot (e.g.
   *  { 'Video:0': 'creator' }); a piece with no entry uses the marketplace default. */
  producerChoices: Record<string, PieceProducer>
  /** How hands-on the owner is with the creative direction. */
  creativeControl: 'handoff' | 'approve_concept' | 'owner_directs'
  /** Owner execution inputs from the "Get it ready" screen; feed the brief. */
  execution: CampaignExecution
}

/** Owner-facing rollup of what a campaign has accrued to bill — one charge per
 *  delivered-and-accepted piece. Accrual only; nothing is charged via Stripe yet. */
export interface CampaignCharges {
  accruedCents: number
  count: number
}

/** Creator-facing rollup of what they have earned — net (after Apnosh's fee) across
 *  their approved pieces. Accrual only; no real transfer has happened yet. */
export interface CreatorEarnings {
  netCents: number    // total earned (accrued + payable + paid)
  paidCents: number   // of that, already paid out
  count: number
}

export interface CampaignExecution {
  // Creative-brief inputs — these are the ONLY execution keys read into the creative/creator
  // brief prompts (see work-orders-core.ts, creator-brief.ts, readiness.ts). Keep that true:
  // anything below this block is operational/team-facing and must stay out of AI prompts.
  featuring?: string   // the exact dish/item to feature
  offerText?: string   // the exact offer wording + terms
  mustSay?: string     // anything that must be included
  avoid?: string       // anything to keep out
  postNotes?: string   // timing / posting preferences
  // Setup-intake fields (surfaced on the /campaigns/[id]/ready "Get it ready" needs page, service-driven
  // via service-needs.ts). Operational only:
  // gathered to help the team start fast, never fed to the brief AI. go-live date lives on the
  // campaign's target_date column, not here.
  shootTimes?: string    // best days/times for an on-site shoot
  blackoutDates?: string // busy dates to avoid
  onSiteContact?: string // who to ask for on arrival
  accessNotes?: string   // parking / entry / logistics
  bestReach?: string     // best way + time to reach the owner
  filmStaff?: string     // OK to film + tag staff (Yes / Ask first / No)
  socialHandles?: string // their Instagram / TikTok handles
  orderingLink?: string  // online ordering link
  setupNotes?: string    // anything else that helps the team
  vendorInfo?: string    // ordering / POS / booking system (from a pos-vendor service)
  menuSource?: string    // where to find the current menu (from a menu service)
  footageUrls?: string   // comma-joined public URLs of client-uploaded clips/photos (the "edit my footage" card)
  // Intake-rail fields (playbook needsInput consumers, service-needs.ts). Operational only,
  // never fed to AI prompts:
  deliveryAccess?: string // delivery apps + login email / store IDs (delivery-opt)
  siteAccess?: string     // website tool or the person who manages the site (site-menu)
  adAccess?: string       // existing Meta/Google ad accounts, or 'none' (paid-ads)
  adTargeting?: string    // the area + people the ads should reach (paid-ads)
  brandVoice?: string     // how replies/content should sound; words to use and avoid (review-responses)
  photoUrls?: string      // comma-joined URLs of owner-uploaded photos (gbp-setup photo set)
  setupSkipped?: string  // comma-separated readiness action ids the owner deferred ("Skip for now")
  /** ISO stamp: the /dashboard/google-profile walkthrough came back ALL-GOOD on a fresh read
   *  (the self-serve gbp version's completion). Server-written ONLY, by POST
   *  /api/campaigns/:id/gbp-fixed, which re-runs the diagnosis itself and stamps only on a
   *  full, successful, every-section-good read. NOT in the owner PATCH whitelist, so it
   *  cannot be forged or cleared through the API — same guarantee as wrapUpSentAt. */
  gbpFixedAt?: string
  /** ISO stamp: the completion sweep sent the owner's wrap-up letter. System-written
   *  (cron via admin client); NOT in the owner PATCH whitelist, so it cannot be forged
   *  or cleared through the API. */
  wrapUpSentAt?: string
}

/** Owner-facing rollup of a shipped campaign's pieces (content_drafts), so the
 *  detail page can mirror real progress instead of a static "preparing" banner.
 *  Dead states (rejected/failed) are excluded from total but surfaced as dropped. */
export interface CampaignProgress {
  total: number
  live: number          // published pieces + delivered (proof-backed) services
  queued: number        // scheduled or approved+signed, committed to go out
  awaitingYou: number   // delivered creator work, or an approved draft holding for your sign-off
  inProgress: number    // being made (idea/draft/produced/etc.), incl. services being set up
  nextDueISO: string | null
  dropped?: number      // killed pieces kept visible (team reject / creator decline) — not in total
  /** Service work blocked on the owner (blocked_client / ready_for_client). Kept
   *  SEPARATE from awaitingYou: the piece-worded surfaces (readiness copy, the
   *  inbox CTA, the digest) count awaitingYou and would miscount/dead-end on
   *  services. Recurring-class services are excluded from all counts. */
  servicesAwaitingYou?: number
}

export type CampPerf =
  | { type: 'progress'; live: number; total: number }
  | { type: 'ready'; ready: number }
  | { type: 'trend'; trend: 'up' | 'down' | 'flat'; note: string; metric: string; spark: number[] }
  | { type: 'lift'; pct: number; reach: number }

export interface CampCard {
  key: string
  kind: 'live' | 'draft' | 'done'
  title: string
  pill: string
  pillIcon: 'dot' | 'calendar' | 'check'
  blurb: string
  cost: string | null
  recurring: boolean
  perf: CampPerf | null
  review: boolean
  href: string
}

/** Honest cost label from the included line items. */
export function billLabel(items: LineItem[]): { cost: string | null; recurring: boolean } {
  const s = summarize(items)
  if (s.perMonth > 0) return { cost: `$${s.perMonth}/mo`, recurring: true }
  if (s.oneTimeOnDelivery > 0) return { cost: `$${s.oneTimeOnDelivery} one-time`, recurring: false }
  return { cost: null, recurring: false }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Has the owner finished the setup THEY owe for this campaign (the "Needs you" inputs)? Pure over the
 *  campaign alone — the core owner-provided inputs a shipped content campaign can't start without:
 *  the go-live date, the dish to feature, shoot access (if it films), and the ordering vendor (if it
 *  touches ordering). Deliberately owner-INPUT only (not team gates like connecting Google), so a
 *  campaign reads "Needs you" exactly when it's stalled on the owner. Cheap enough to run per list card. */
export function ownerSetupComplete(s: SavedCampaign): boolean {
  if (s.draft.path === 'diy') return true   // owner self-runs a DIY plan; nothing is owed to a team
  const d = s.draft
  const ex = s.execution ?? {}
  const filled = (v?: string) => !!(v && v.trim())
  const beats = d.brief?.contentBeats ?? []
  const hasContent = beats.length > 0
  const svc = new Set((d.items ?? []).filter((it) => it.included && !it.optOut).map((it) => it.serviceId).filter((x): x is string => !!x))
  const need: boolean[] = []
  if (hasContent) {
    need.push(!!d.targetDate)        // a go-live date to build toward
    need.push(filled(ex.featuring))  // the exact dish/item to feature
    const hasShoot = beats.some((b) => ['reel', 'video', 'photo'].includes(b.type))
      || ['photo-library', 'video-engine', 'video-single', 'creator-collab', 'menu-photo-refresh'].some((id) => svc.has(id))
    if (hasShoot) need.push(filled(ex.shootTimes), filled(ex.onSiteContact), filled(ex.filmStaff))
  }
  if (['ordering-setup', 'delivery-opt', 'ai-phone', 'giftcards', 'google-food-order'].some((id) => svc.has(id))) need.push(filled(ex.vendorInfo))
  // The self-serve Google-profile fix (the gbp card's free version): the campaign's deliverable
  // IS the owner's walkthrough, so the campaign honestly needs them until the fixer's all-good
  // diagnosis stamps execution.gbpFixedAt.
  const diyGbp = (d.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'gbp-setup' && it.producer === 'diy')
  if (diyGbp) need.push(filled(ex.gbpFixedAt))
  return need.every(Boolean)
}

/** The honest post-ship phase of a SHIPPED campaign. State comes from REAL production progress
 *  (content_drafts + work orders) — NOT the line-item `lock` field, which is created 'editable' and
 *  never advanced. If the owner still owes required setup and nothing has posted, that's the honest
 *  blocker (Needs you). Otherwise: nothing published ⇒ In production; some out ⇒ Live; all out ⇒ Done.
 *  One source of truth so the list card + the detail page always say the same thing. */
export type ShippedPhase = 'setup' | 'production' | 'live' | 'done'

/** Upper-bound setup window for a plan's services, in CALENDAR days: the slowest included service's
 *  turnaround maximum (external gates included), business days converted to calendar. 0 = no services
 *  with a known turnaround. The turnaround model is the only per-service clock we have (services carry
 *  no execution timestamps), so everything built on this is an ESTIMATE and must say so. */
export function servicesSetupWindowDays(items: LineItem[]): number {
  let maxBiz = 0
  for (const it of items) {
    // Owner-run lines (producer 'diy', the self-serve gbp version) are not team work — they
    // never put a campaign in "your team is setting things up".
    if (!it.included || it.optOut || it.producer === 'diy' || !it.serviceId) continue
    const t = turnaroundFor(it.serviceId)
    if (!t) continue
    const d = t.class === 'setup' ? t.business.max + (t.gate?.addDays.max ?? 0)
      : t.class === 'creative' ? t.business.max + (t.shootLeadDays?.max ?? 0)
      : t.startsWithin.max
    if (d > maxBiz) maxBiz = d
  }
  return maxBiz === 0 ? 0 : Math.ceil(maxBiz * 7 / 5)   // business days -> calendar days
}

/** Same math scoped to ONE turnaround class, so each timeline stage (setting up / being made /
 *  running) carries its own honest upper-bound estimate in calendar days. 0 = no such services. */
export function serviceClassWindowDays(items: LineItem[], cls: 'setup' | 'creative' | 'recurring'): number {
  let maxBiz = 0
  for (const it of items) {
    if (!it.included || it.optOut || it.producer === 'diy' || !it.serviceId) continue
    const t = turnaroundFor(it.serviceId)
    if (!t || t.class !== cls) continue
    const d = t.class === 'setup' ? t.business.max + (t.gate?.addDays.max ?? 0)
      : t.class === 'creative' ? t.business.max + (t.shootLeadDays?.max ?? 0)
      : t.startsWithin.max
    if (d > maxBiz) maxBiz = d
  }
  return maxBiz === 0 ? 0 : Math.ceil(maxBiz * 7 / 5)
}

/** True while a just-shipped campaign's SERVICES are still inside their estimated setup window: from
 *  shipped_at until servicesSetupWindowDays has passed — used to say "your team is setting things up"
 *  instead of the false "running" right after ship. */
export function servicesSettingUp(s: SavedCampaign, nowMs = Date.now()): boolean {
  if (!s.shippedAt) return false
  const shipped = new Date(s.shippedAt).getTime()
  if (isNaN(shipped)) return false
  const calDays = servicesSetupWindowDays(s.draft.items)
  if (!calDays) return false
  const elapsed = (nowMs - shipped) / 86400000
  return elapsed >= 0 && elapsed < calDays
}

/** A pure owner-run plan, finished: every included, non-opted-out line is owner-run (producer
 *  'diy') and every one carries its completion signal. Only the self-serve gbp walkthrough HAS
 *  a completion signal today (execution.gbpFixedAt, server-verified by the gbp-fixed route),
 *  so any other owner-run line keeps this false — we never claim Done on work nothing checked.
 *  Feeds shippedStatus: such a plan mints no pieces or work orders (progress total stays 0),
 *  so without this signal it would read "Live · running" forever after the owner finished
 *  its only deliverable. */
export function ownerRunWorkDone(s: SavedCampaign): boolean {
  const lines = (s.draft.items ?? []).filter((it) => it.included && !it.optOut)
  if (!lines.length || lines.some((it) => it.producer !== 'diy')) return false
  const ex = s.execution ?? {}
  return lines.every((it) => it.serviceId === 'gbp-setup' && !!ex.gbpFixedAt?.trim())
}

// Cells the detail page relies on being IMPOSSIBLE: diy never yields 'setup' (ownerSetupComplete is
// true for diy). NOTE (services in progress): finite service work orders now count in total/live, so
// a services-only campaign CAN reach 'done' once every service is delivered with proof — the old
// "settles at 'live'" invariant only still holds for plans whose services are all recurring-class
// (those are excluded from the counts, so total stays 0 and the settingUp branch below still runs).
// ownerRunDone (ownerRunWorkDone above): a pure owner-run plan whose deliverable checked out —
// it also has total 0, and it DOES reach 'done'.
export function shippedStatus(progress: CampaignProgress | null | undefined, hasContentPlanned: boolean, setupComplete = true, settingUp = false, ownerRunDone = false): { phase: ShippedPhase; label: string; blurb: string; live: number; total: number } {
  const p = progress ?? null
  const totalPieces = p?.total ?? 0
  // Once anything has actually posted, setup is moot — show the real state.
  if (p && p.total > 0) {
    if (p.live >= p.total) return { phase: 'done', label: 'Done', blurb: 'Wrapped — full results inside', live: p.live, total: p.total }
    if (p.live > 0) return { phase: 'live', label: 'Live', blurb: `Live · ${p.live} of ${p.total} out`, live: p.live, total: p.total }
  }
  // Nothing live yet: the owner's unfinished setup is the honest blocker, ahead of "in production".
  if (!setupComplete) return { phase: 'setup', label: 'Needs you', blurb: 'Finish setup so your team can start', live: 0, total: totalPieces }
  // A finished owner-run plan: its only deliverable was the owner's own (checked) work, and
  // nothing else was ever minted to run — Done, not an immortal "Live · running". Guarded on
  // total 0 so real pieces (impossible for an all-diy plan, but cheap to be safe) always win.
  if (ownerRunDone && totalPieces === 0) return { phase: 'done', label: 'Done', blurb: 'Done · you finished it yourself', live: 0, total: 0 }
  if (totalPieces > 0) return { phase: 'production', label: 'In production', blurb: "In production · your team's on it", live: 0, total: totalPieces }
  if (hasContentPlanned) return { phase: 'production', label: 'In production', blurb: "In production · your team's on it", live: 0, total: 0 }
  // Services-only: right after ship the team is still SETTING UP the services (per the turnaround
  // estimates) — saying "running" then would be a lie. Past the window, it settles at Live.
  if (settingUp) return { phase: 'production', label: 'In production', blurb: 'In production · your team is setting things up', live: 0, total: 0 }
  return { phase: 'live', label: 'Live', blurb: 'Live · running', live: 0, total: 0 }
}

export function campaignCardVM(s: SavedCampaign, progress?: CampaignProgress | null): CampCard {
  const items = s.draft.items
  const total = items.filter((it) => it.included && !it.optOut).length
  const { cost, recurring } = billLabel(items)
  const base = { key: s.draft.id, title: s.draft.name, cost, recurring, review: false, href: `/dashboard/campaigns/${s.draft.id}` }

  // Stopped is terminal — never the Draft card (which carries a live Ship footer).
  if (s.status === 'stopped') {
    return { ...base, kind: 'done', pill: 'Stopped', pillIcon: 'dot', blurb: 'Stopped · anything in flight finished and billed', perf: null }
  }

  if (s.status !== 'shipped') {
    const inReview = s.phase === 'review'   // strategist path: built by Apnosh, awaiting the owner's OK
    return {
      ...base, kind: 'draft', pill: inReview ? 'In review' : 'Draft', pillIcon: 'dot', review: inReview,
      blurb: inReview ? 'Apnosh is building this · you approve before it ships' : total ? `Ready when you are · ${plural(total, 'piece', 'pieces')}` : 'Ready when you are',
      perf: total ? { type: 'ready', ready: total } : null,
    }
  }

  const st = shippedStatus(progress, (s.draft.brief?.contentBeats?.length ?? 0) > 0, ownerSetupComplete(s), servicesSettingUp(s), ownerRunWorkDone(s))
  return {
    ...base, kind: st.phase === 'done' ? 'done' : 'live', pill: st.label, pillIcon: st.phase === 'done' ? 'check' : 'dot', blurb: st.blurb,
    review: st.phase === 'setup',
    perf: st.total > 0 ? { type: 'progress', live: st.live, total: st.total } : null,
  }
}
