/**
 * Play blueprints — the completeness source of truth.
 *
 * The owner's #1 pain: they ask for one thing ("make a graphic for our
 * event") when what they actually need is the whole play (graphic + socials +
 * Google + a Facebook event page + reminders). A blueprint is the canonical
 * best-practice checklist a great marketer always runs for an occasion — so a
 * plan can never silently come back thin. `core` deliverables are always
 * emitted (the guarantee); `recommended` ones are shown as optional "go
 * further" adds the owner can switch on.
 *
 * Each deliverable resolves to either a priced catalog service (carrying its
 * own why / market / metric / handler) or a content piece (same, via
 * CONTENT_META) — so every line on a plan is equally transparent.
 */
import type { LineItem } from '@/lib/campaigns/types'

export interface BlueprintDeliverable {
  /** Resolve against the priced catalog (serviceById → serviceToLine). */
  serviceId?: string
  /** OR a content piece (CONTENT_META key → buildContentLine). */
  contentType?: string
  /** 'core' is always included (the completeness guarantee); 'recommended'
   *  is shown as an optional add. Defaults to 'core'. */
  tier?: 'core' | 'recommended'
  /** Human relative timing, e.g. "10 days before" — rendered, not computed. */
  offsetLabel?: string
  /** Override the play-grouping stage (otherwise the service/content's own). */
  stage?: LineItem['stage']
  /** Plainer "why" when the catalog's is too operator-voiced for this use. */
  whyOverride?: string
  /** For per-occurrence content/sends: how many. */
  qty?: number
}

export interface PlayBlueprint {
  templateId: string
  deliverables: BlueprintDeliverable[]
}

const D = (d: BlueprintDeliverable): BlueprintDeliverable => d

export const PLAY_BLUEPRINTS: Record<string, PlayBlueprint> = {
  /* ── Promote an event or date — the flagship play ──────────────── */
  event: {
    templateId: 'event',
    deliverables: [
      // Get discovered
      D({ serviceId: 'graphic', offsetLabel: '12 days before' }),
      D({ contentType: 'reel', offsetLabel: '10 days before', whyOverride: 'A teaser reel is what carries the event past your own followers.' }),
      D({ serviceId: 'gbp-event-post', offsetLabel: '10 days before' }),
      D({ serviceId: 'fb-event', offsetLabel: '12 days before' }),
      // Get their RSVPs
      D({ serviceId: 'landing-page', stage: 'capture', offsetLabel: '10 days before', whyOverride: 'Captures who’s coming so the reminders have someone to reach.' }),
      D({ contentType: 'email', stage: 'capture', offsetLabel: '10 days before', whyOverride: 'A save-the-date to the list you own — the cheapest seats to fill.' }),
      // Fill the room
      D({ serviceId: 'reminder-send', qty: 2, stage: 'convert', offsetLabel: '2 days before' }),
      D({ contentType: 'story', stage: 'convert', offsetLabel: 'day of', whyOverride: 'A day-of countdown story is the last nudge for tonight.' }),
      // Go further
      D({ serviceId: 'paid-ads', tier: 'recommended', whyOverride: 'Boost the teaser to nearby locals who don’t follow you yet.' }),
      D({ serviceId: 'vip-comms', tier: 'recommended', whyOverride: 'Give your regulars first dibs before the public sees it.' }),
    ],
  },

  /* ── Launch something new ──────────────────────────────────────── */
  'new-menu': {
    templateId: 'new-menu',
    deliverables: [
      D({ contentType: 'photo', offsetLabel: 'launch week', whyOverride: 'A hero shot of the new item — the asset every channel reuses.' }),
      D({ contentType: 'reel', offsetLabel: 'launch week', whyOverride: 'The new item, up close — the teaser that drives the first orders.' }),
      D({ serviceId: 'graphic', offsetLabel: 'launch week' }),
      D({ contentType: 'post', stage: 'convert', offsetLabel: 'launch week', whyOverride: 'A "now on the menu" post for socials + Google.' }),
      D({ contentType: 'email', stage: 'convert', offsetLabel: 'launch week', whyOverride: 'Announce it to the list you own.' }),
      D({ contentType: 'story', offsetLabel: 'week 2', whyOverride: 'Behind-the-scenes — how it’s made.' }),
      D({ serviceId: 'paid-ads', tier: 'recommended', whyOverride: 'Put the new item in front of new locals.' }),
      D({ serviceId: 'creator-collab', tier: 'recommended', whyOverride: 'Get a local creator to try it first.' }),
    ],
  },

  /* ── Fill slow shifts ──────────────────────────────────────────── */
  'fill-shifts': {
    templateId: 'fill-shifts',
    deliverables: [
      D({ contentType: 'reel', offsetLabel: 'week 1', whyOverride: 'The offer in 12 seconds — the launch reel.' }),
      D({ serviceId: 'graphic', offsetLabel: 'week 1', whyOverride: 'The weekly-deal graphic for every channel.' }),
      D({ serviceId: 'gbp-event-post', offsetLabel: 'week 1', whyOverride: 'A Google post so the deal shows when locals search.' }),
      D({ contentType: 'sms', qty: 4, stage: 'convert', offsetLabel: 'weekly', whyOverride: 'A weekly "tonight!" text — the fastest way to fill the shift.' }),
      D({ contentType: 'email', stage: 'capture', offsetLabel: 'week 1', whyOverride: 'A kickoff email to lapsed guests.' }),
      D({ serviceId: 'offer-eng', tier: 'recommended', whyOverride: 'Engineer the offer so it fills seats and still pays.' }),
      D({ serviceId: 'paid-ads', tier: 'recommended', whyOverride: 'Boost the deal to nearby locals.' }),
    ],
  },

  /* ── Start a recurring night ───────────────────────────────────── */
  'recurring-night': {
    templateId: 'recurring-night',
    deliverables: [
      D({ contentType: 'reel', offsetLabel: 'launch', whyOverride: 'Introduce the night — the launch reel.' }),
      D({ serviceId: 'graphic', offsetLabel: 'launch', whyOverride: 'The recurring-night graphic.' }),
      D({ serviceId: 'fb-event', whyOverride: 'A recurring Facebook event so it shows up every week.' }),
      D({ serviceId: 'gbp-event-post', whyOverride: 'A Google + social post for the night.' }),
      D({ contentType: 'sms', qty: 4, stage: 'convert', offsetLabel: 'weekly', whyOverride: 'A weekly "tonight!" text.' }),
      D({ contentType: 'story', offsetLabel: 'weekly', whyOverride: 'A weekly recap story to build the habit.' }),
      D({ serviceId: 'paid-ads', tier: 'recommended', whyOverride: 'Boost the launch to new locals.' }),
    ],
  },

  /* ── Win back lapsed guests ────────────────────────────────────── */
  winback: {
    templateId: 'winback',
    deliverables: [
      D({ contentType: 'email', stage: 'winback', offsetLabel: 'week 1', whyOverride: 'A we-miss-you email with the offer.' }),
      D({ serviceId: 'reminder-send', qty: 2, stage: 'winback', offsetLabel: 'week 1–2', whyOverride: 'A win-back text + a last-chance reminder.' }),
      D({ serviceId: 'graphic', tier: 'recommended', whyOverride: 'A we-miss-you graphic for the email + socials.' }),
    ],
  },

  /* ── Turn first-timers into regulars ───────────────────────────── */
  regulars: {
    templateId: 'regulars',
    deliverables: [
      D({ serviceId: 'second-visit', whyOverride: 'The single highest-leverage automation — the timed 2nd-visit nudge.' }),
      D({ contentType: 'email', stage: 'nurture', offsetLabel: 'week 1', whyOverride: 'A warm welcome email.' }),
      D({ serviceId: 'reminder-send', qty: 1, stage: 'convert', offsetLabel: 'week 1', whyOverride: 'A 2nd-visit nudge text.' }),
      D({ serviceId: 'loyalty', tier: 'recommended', whyOverride: 'Stand up a loyalty perk so the habit sticks.' }),
    ],
  },

  /* ── Get discovered by new locals ──────────────────────────────── */
  discover: {
    templateId: 'discover',
    deliverables: [
      D({ contentType: 'reel', offsetLabel: 'week 1', whyOverride: 'A signature-dish reel — your best foot forward.' }),
      D({ serviceId: 'graphic', offsetLabel: 'week 1' }),
      D({ contentType: 'photo', offsetLabel: 'week 1', whyOverride: 'Fresh photos for your listings.' }),
      D({ serviceId: 'gbp-event-post', offsetLabel: 'week 1', whyOverride: 'A Google post so new locals find you.' }),
      D({ serviceId: 'local-seo', tier: 'recommended', whyOverride: 'Rank in local search over time.' }),
      D({ serviceId: 'paid-ads', tier: 'recommended', whyOverride: 'Put yourself in front of nearby diners now.' }),
    ],
  },

  /* ── Boost reviews & rating ────────────────────────────────────── */
  reviews: {
    templateId: 'reviews',
    deliverables: [
      D({ serviceId: 'review-engine', whyOverride: 'Auto-invite every guest to leave a review — the engine.' }),
      D({ contentType: 'email', stage: 'advocate', offsetLabel: 'week 1', whyOverride: 'A review-request email to your list.' }),
      D({ serviceId: 'capture-kit', stage: 'advocate', whyOverride: 'An in-store QR + table card so the ask is everywhere.' }),
      D({ serviceId: 'review-responses', tier: 'recommended', whyOverride: 'Answer every review in your voice — lifts the rating further.' }),
    ],
  },
}

export function blueprintFor(templateId: string): PlayBlueprint | undefined {
  return PLAY_BLUEPRINTS[templateId]
}
