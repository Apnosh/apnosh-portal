/**
 * SOURCE-OF-TRUTH REGISTRY for the 5-stage outcome funnel.
 * =========================================================
 * Apnosh sells outcome accountability: a client must be able to trace
 * EVERY number back to a real source. This file is the single, honest
 * inventory of every metric source across the funnel — what provider it
 * comes from, which raw columns/API fields feed it, whether it is
 * actually wired today, and its best-case status.
 *
 * PHASE 1 SCOPE: this is the registry + a status resolver + an admin
 * board only. It changes NO client-facing number. Sources that are stubs
 * or not-yet-wired are represented honestly (COMING_SOON /
 * AVAILABLE_NOT_CONNECTED), never faked into a CONNECTED number.
 *
 * The channel enum is NOT duplicated here — we import ConnectorChannel /
 * ConnectorStatus from the integrations layer (the connector registry is
 * the source of truth for "does an adapter exist").
 */

import type { ConnectorChannel, ConnectorStatus } from '@/lib/integrations/types'

// ── Status model (owner-decided, 5 top states) ──────────────────────────
// A CONNECTED source that is genuinely zero is CONNECTED + hasData:false
// (NO_DATA), never a 6th top status.
export type SourceStatus =
  | 'CONNECTED'                // real adapter + active connection + metric wired
  | 'AVAILABLE_NOT_CONNECTED'  // integration exists but this metric isn't flowing
  | 'ERROR'                    // this client's connection for the provider is broken
  | 'COMING_SOON'              // no adapter exists yet — a stub, never a number
  | 'MANUAL_ENTRY'             // value came from a human typing it (badge with who/when)

// Providers a source can come from. The first five overlap the connector
// channel enum (adapters exist / are planned); the rest have no adapter yet.
export type SourceProvider =
  | 'google_business_profile'
  | 'instagram'
  | 'google_analytics'
  | 'google_search_console'
  | 'tiktok'
  | 'facebook'
  | 'yelp'
  | 'pos'
  | 'reservations'
  | 'delivery'
  | 'loyalty'
  | 'email'

export type FunnelStage = 1 | 2 | 3 | 4 | 5

export const STAGE_NAMES: Record<FunnelStage, string> = {
  1: 'Awareness',
  2: 'Interest',
  3: 'Actions',
  4: 'Sales',
  5: 'Retention',
}

export type SourceAuthType = 'oauth' | 'api_key' | 'manual' | 'none'

/** Per-client config keys (set by the owner) that a wired source can additionally
 *  require before it can resolve CONNECTED. Owner decision: NO auto-detect. */
export type ClientConfigKey = 'ga4_menu_path' | 'ga4_order_domain'

export interface SourceDef {
  /** stable id, matches the funnel/insights metric key */
  id: string
  /** owner words, 5th-grade reading level */
  displayName: string
  provider: SourceProvider
  /** funnel stage 1..5 */
  stage: FunnelStage
  /** the gbp_metrics / social_metrics columns or API metric names this maps to */
  metricKeys: string[]
  /** static best-case status (no client context): COMING_SOON when no adapter,
   *  CONNECTED when a real adapter + wired metric exists, AVAILABLE_NOT_CONNECTED
   *  when the integration exists but this metric is not wired. The per-client
   *  resolver refines this against the client's real connection. */
  baseStatus: SourceStatus
  authType: SourceAuthType
  docsUrl: string | null
  notes: string
  /** is the metric actually ingested today (an active connection alone is NOT
   *  enough — a source whose column/event we don't pull is wired:false and can
   *  never resolve CONNECTED). */
  wired: boolean
  /** When set, an active provider connection is necessary but NOT sufficient:
   *  this per-client config value (owner-set) must ALSO be present before the
   *  source resolves CONNECTED. Missing config → AVAILABLE_NOT_CONNECTED with
   *  configMissingReason. Used by the GA4 event sources (no auto-detect). */
  requiresClientConfig?: ClientConfigKey
  /** Owner-words hint shown when requiresClientConfig is set but missing. */
  configMissingReason?: string
  /** the primary sub-metric of its stage (e.g. direction requests in Actions) */
  isHero?: boolean
  /** the stage's headline number (e.g. covers in Sales) */
  isStageNumber?: boolean
  /** a drill-down detail, NOT summed into the stage total */
  isDrilldown?: boolean
}

// Convenience note fragments so honesty language is consistent.
const IG_MEDIA_NOTE =
  'Our Instagram sync pulls only ACCOUNT-level reach/impressions/engaged/followers. This metric is media-level in the Graph API and is not pulled — the only path today is manual admin entry.'
const IG_ACCOUNT_NOTE =
  'Account-level in the Graph API but not yet requested by our sync. Manual admin entry is the only path today.'
const GA4_EVENT_NOTE =
  'GA4 site sessions are ingested, but this is a custom GA4 event we do not yet ingest. Even with an active GA4 connection it stays AVAILABLE_NOT_CONNECTED until the event is wired.'
const NO_ADAPTER_NOTE =
  'No adapter exists yet. Stub only — never shows a number until built.'

/**
 * THE DEFINITIVE LIST. Every source across all 5 stages.
 * Order = the order they read in each stage.
 */
export const SOURCES: SourceDef[] = [
  // ─────────────────────────────── STAGE 1 · AWARENESS ───────────────────────────────
  {
    id: 'gbp_impressions_search',
    displayName: 'Times you showed up in Google Search',
    provider: 'google_business_profile',
    stage: 1,
    metricKeys: ['impressions_search_mobile', 'impressions_search_desktop', 'search_views'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric. Search impressions split by mobile/desktop; legacy search_views mirrors the total.',
    wired: true,
  },
  {
    id: 'gbp_impressions_maps',
    displayName: 'Times you showed up in Google Maps',
    provider: 'google_business_profile',
    stage: 1,
    metricKeys: ['impressions_maps_mobile', 'impressions_maps_desktop'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric. Maps impressions split by mobile/desktop.',
    wired: true,
  },
  {
    id: 'ig_reach',
    displayName: 'People your Instagram reached',
    provider: 'instagram',
    stage: 1,
    metricKeys: ['reach'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real IG metric — fetchInstagramInsights pulls account-level reach.',
    wired: true,
  },
  {
    id: 'tiktok_video_views',
    displayName: 'Views on your TikTok videos',
    provider: 'tiktok',
    stage: 1,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'oauth',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE,
    wired: false,
  },
  {
    id: 'facebook_reach',
    displayName: 'People your Facebook reached',
    provider: 'facebook',
    stage: 1,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'oauth',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' (Facebook Page reach via the Graph API.)',
    wired: false,
  },
  {
    id: 'yelp_views',
    displayName: 'Views on your Yelp page',
    provider: 'yelp',
    stage: 1,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' (Yelp business page views.)',
    wired: false,
  },
  // Drill-downs (NOT summed into the Awareness total)
  {
    id: 'gbp_search_keywords',
    displayName: 'What people searched to find you',
    provider: 'google_business_profile',
    stage: 1,
    metricKeys: ['top_queries'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric — topQueries stored as jsonb (top ~10 search terms).',
    wired: true,
    isDrilldown: true,
  },
  {
    id: 'ig_nonfollower_reach_pct',
    displayName: 'Share of reach from people who don’t follow you',
    provider: 'instagram',
    stage: 1,
    metricKeys: [],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Instagram integration exists, but non-follower reach breakdown is not pulled by our sync.',
    wired: false,
    isDrilldown: true,
  },
  {
    id: 'gsc_site_impressions',
    displayName: 'Times your website showed up on Google',
    provider: 'google_search_console',
    stage: 1,
    metricKeys: ['impressions'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Search Console adapter exists and site impressions are ingested when the connection is active. Commonly not-connected/errored today, so the per-client resolver decides.',
    wired: true,
    isDrilldown: true,
  },

  // ─────────────────────────────── STAGE 2 · INTEREST ───────────────────────────────
  // NOTE: "GBP profile views" was intentionally NOT included. Google's
  // Performance API has no dedicated profile-views metric (only impressions),
  // and the owner's rule is: if we can't source it honestly, we don't track it.
  // (gbp_photo_views was removed: Google's Performance API no longer reports
  //  photo views — every ingested row is 0. Owner rule: can't source it, don't
  //  track it. Same call as gbp_profile_views.)
  {
    id: 'ig_profile_visits',
    displayName: 'People who opened your Instagram profile',
    provider: 'instagram',
    stage: 2,
    metricKeys: ['profile_visits', 'profile_views'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes:
      'Real IG metric. The daily sync-social-metrics edge function pulls profile_views from the Graph API into social_metrics.profile_visits. (P1 marked this unwired by only checking the app-side sync — the edge function is the daily writer.)',
    wired: true,
  },
  {
    id: 'ig_engaged',
    displayName: 'Times people engaged with your posts',
    provider: 'instagram',
    stage: 2,
    metricKeys: ['engagement', 'total_interactions'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes:
      'Real IG metric. The daily sync-social-metrics edge function writes total_interactions (falling back to per-post likes+comments) into social_metrics.engagement.',
    wired: true,
  },
  {
    id: 'ig_saves',
    displayName: 'Times people saved your posts',
    provider: 'instagram',
    stage: 2,
    metricKeys: ['saves'],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: IG_MEDIA_NOTE,
    wired: false,
  },
  {
    id: 'ig_shares',
    displayName: 'Times people shared your posts',
    provider: 'instagram',
    stage: 2,
    metricKeys: ['shares'],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: IG_MEDIA_NOTE,
    wired: false,
  },
  {
    id: 'ga4_website_visits',
    displayName: 'Visits to your website',
    provider: 'google_analytics',
    stage: 2,
    metricKeys: ['sessions'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GA4 metric — website sessions (visits) are ingested daily into website_metrics.sessions whenever GA4 is connected. No per-client config needed (unlike menu views).',
    wired: true,
  },
  {
    id: 'ga4_menu_views',
    displayName: 'People who viewed your menu page',
    provider: 'google_analytics',
    stage: 2,
    metricKeys: ['menu_views'],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes:
      'Real GA4 page-view data. We read the exact menu page path from settings, then sum views for that page. Turns on once GA4 is connected and a menu page path is set.',
    wired: true,
    requiresClientConfig: 'ga4_menu_path',
    configMissingReason: 'Add your menu page path in settings',
  },
  {
    id: 'gbp_menu_clicks',
    displayName: 'People who opened your menu on Google',
    provider: 'google_business_profile',
    stage: 2,
    metricKeys: ['food_menu_clicks'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric (BUSINESS_FOOD_MENU_CLICKS) — taps on the menu link in your Google listing. Pulled daily into gbp_metrics.food_menu_clicks (added to the sync 2026-07-13). Zero until Google records menu taps.',
    wired: true,
  },

  // ─────────────────────────────── STAGE 3 · ACTIONS ───────────────────────────────
  {
    id: 'gbp_direction_requests',
    displayName: 'People who asked for directions to you',
    provider: 'google_business_profile',
    stage: 3,
    metricKeys: ['directions'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric — the primary intent signal for Actions.',
    wired: true,
    isHero: true,
  },
  {
    id: 'gbp_calls',
    displayName: 'People who called you from Google',
    provider: 'google_business_profile',
    stage: 3,
    metricKeys: ['calls'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric.',
    wired: true,
  },
  {
    id: 'gbp_website_clicks',
    displayName: 'People who clicked to your website from Google',
    provider: 'google_business_profile',
    stage: 2,
    metricKeys: ['website_clicks'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric.',
    wired: true,
  },
  {
    id: 'gbp_booking_clicks',
    displayName: 'People who clicked to book from Google',
    provider: 'google_business_profile',
    stage: 3,
    metricKeys: ['bookings'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric — bookings column present in gbp_metrics and populated by ingest.',
    wired: true,
  },
  {
    id: 'ig_link_clicks',
    displayName: 'Clicks on your Instagram link',
    provider: 'instagram',
    stage: 2,
    metricKeys: [],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: IG_MEDIA_NOTE,
    wired: false,
  },
  {
    id: 'ga4_order_clicks',
    displayName: 'People who clicked to order online',
    provider: 'google_analytics',
    stage: 3,
    metricKeys: ['order_clicks'],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes:
      'Real GA4 outbound-click data. We read the exact ordering site from settings, then count clicks that leave for it. Turns on once GA4 is connected and an ordering site is set.',
    wired: true,
    requiresClientConfig: 'ga4_order_domain',
    configMissingReason: 'Add your ordering site in settings',
  },
  {
    id: 'ga4_phone_taps',
    displayName: 'People who tapped your phone number',
    provider: 'google_analytics',
    stage: 3,
    metricKeys: ['phone_tap'],
    baseStatus: 'AVAILABLE_NOT_CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes:
      'Google Analytics cannot see phone taps on its own. Add a small tracking tag to your website to count them.',
    wired: false,
  },
  {
    id: 'reservations',
    displayName: 'Tables booked online',
    provider: 'reservations',
    stage: 3,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'oauth',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' (OpenTable / Resy.)',
    wired: false,
  },

  // ─────────────────────────────── STAGE 4 · SALES ───────────────────────────────
  {
    id: 'pos_covers',
    displayName: 'Guests served',
    provider: 'pos',
    stage: 4,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' The Sales stage headline once a POS is connected.',
    wired: false,
    isStageNumber: true,
  },
  {
    id: 'pos_revenue',
    displayName: 'Money made',
    provider: 'pos',
    stage: 4,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE,
    wired: false,
  },
  {
    id: 'pos_avg_ticket',
    displayName: 'Average spend per guest',
    provider: 'pos',
    stage: 4,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: 'Derived from revenue ÷ covers. Needs a connected POS first — no adapter yet.',
    wired: false,
  },
  {
    id: 'delivery_orders',
    displayName: 'Delivery orders',
    provider: 'delivery',
    stage: 4,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'oauth',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' (DoorDash / UberEats.)',
    wired: false,
  },

  // ─────────────────────────────── STAGE 5 · RETENTION ───────────────────────────────
  {
    id: 'pos_repeat_customers',
    displayName: 'Guests who came back',
    provider: 'pos',
    stage: 5,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE + ' Preferred Retention headline once a POS is connected.',
    wired: false,
    isStageNumber: true,
  },
  {
    id: 'loyalty_redemptions',
    displayName: 'Rewards redeemed',
    provider: 'loyalty',
    stage: 5,
    metricKeys: [],
    baseStatus: 'COMING_SOON',
    authType: 'api_key',
    docsUrl: null,
    notes: NO_ADAPTER_NOTE,
    wired: false,
  },
  {
    id: 'ga4_returning_users',
    displayName: 'Website visitors who came back',
    provider: 'google_analytics',
    stage: 5,
    metricKeys: ['returningUsers'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Derived from GA4 sessions, which ARE ingested when the connection is active (not a custom event). Commonly not-connected/errored today, so the per-client resolver decides.',
    wired: true,
  },
  {
    id: 'gbp_review_count',
    displayName: 'Number of Google reviews',
    provider: 'google_business_profile',
    stage: 5,
    metricKeys: ['review_count', 'reviews'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric — review count from the places/reviews sync.',
    wired: true,
  },
  {
    id: 'gbp_rating_trend',
    displayName: 'Your star rating over time',
    provider: 'google_business_profile',
    stage: 5,
    metricKeys: ['rating', 'local_reviews'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real GBP metric — average rating from the places/reviews sync.',
    wired: true,
  },
  {
    id: 'ig_follower_growth',
    displayName: 'New Instagram followers',
    provider: 'instagram',
    stage: 5,
    metricKeys: ['followers_gained', 'followers_count'],
    baseStatus: 'CONNECTED',
    authType: 'oauth',
    docsUrl: null,
    notes: 'Real IG metric — followers_count / gained pulled by our sync.',
    wired: true,
  },
]

// ── Short card labels ───────────────────────────────────────────────────
// The `displayName` above is the full owner-words sentence ("Times you showed
// up in Google Maps") — right for the admin board and a hover. But on the tiny
// breakdown cards (a 2–4 column grid), a sentence wraps to four lines and buries
// the number. So each source also gets a SHORT noun label ("Google Maps views")
// for the card. Still honest: impressions read as "views" (not "people"), IG
// stays "reach", nothing is renamed into a claim it can't back.
export const SHORT_LABELS: Record<string, string> = {
  // Stage 1 · Awareness
  gbp_impressions_search: 'Google Search views',
  gbp_impressions_maps: 'Google Maps views',
  ig_reach: 'Instagram reach',
  tiktok_video_views: 'TikTok views',
  facebook_reach: 'Facebook reach',
  yelp_views: 'Yelp views',
  gbp_search_keywords: 'Search terms',
  ig_nonfollower_reach_pct: 'New-audience reach',
  gsc_site_impressions: 'Website in Google',
  // Stage 2 · Interest
  ig_profile_visits: 'Profile visits',
  ig_engaged: 'Post engagement',
  ig_saves: 'Post saves',
  ig_shares: 'Post shares',
  ga4_menu_views: 'Menu page views',
  gbp_menu_clicks: 'Menu opens on Google',
  // Stage 3 · Actions
  gbp_direction_requests: 'Directions',
  gbp_calls: 'Calls',
  gbp_website_clicks: 'Website clicks',
  gbp_booking_clicks: 'Booking clicks',
  ig_link_clicks: 'Instagram link taps',
  ga4_website_visits: 'Website visits',
  ga4_order_clicks: 'Online-order clicks',
  ga4_phone_taps: 'Phone taps',
  reservations: 'Online reservations',
  // Stage 4 · Sales
  pos_covers: 'Guests served',
  pos_revenue: 'Revenue',
  pos_avg_ticket: 'Avg per guest',
  delivery_orders: 'Delivery orders',
  // Stage 5 · Retention
  pos_repeat_customers: 'Repeat guests',
  loyalty_redemptions: 'Rewards redeemed',
  ga4_returning_users: 'Returning visitors',
  gbp_review_count: 'Google reviews',
  gbp_rating_trend: 'Star rating',
  ig_follower_growth: 'New followers',
}

/** Short card label for a source; falls back to the full displayName. */
export function shortLabelFor(id: string): string {
  return SHORT_LABELS[id] ?? SOURCE_BY_ID[id]?.displayName ?? id
}

// ── Lookups ─────────────────────────────────────────────────────────────
export const SOURCE_BY_ID: Record<string, SourceDef> = Object.fromEntries(
  SOURCES.map(s => [s.id, s]),
)

export function sourcesForStage(stage: FunnelStage): SourceDef[] {
  return SOURCES.filter(s => s.stage === stage)
}

/**
 * Provider → the connector channel(s) whose channel_connections row proves
 * this provider is live for a client. Instagram may live under either the
 * business-login ('instagram') or agency-login ('instagram_direct') channel.
 * Providers with no entry (pos/reservations/delivery/loyalty/email) have no
 * adapter — their sources are always COMING_SOON.
 */
export const PROVIDER_CHANNELS: Partial<Record<SourceProvider, ConnectorChannel[]>> = {
  google_business_profile: ['google_business_profile'],
  instagram: ['instagram', 'instagram_direct'],
  google_analytics: ['google_analytics'],
  google_search_console: ['google_search_console'],
  tiktok: ['tiktok'],
}

/**
 * The UI verb for a status. ERROR → "Reconnect" (the connection is broken,
 * not absent). AVAILABLE_NOT_CONNECTED → "Connect". Everything else has no
 * call to action.
 */
export function sourceActionVerb(status: SourceStatus): 'Connect' | 'Reconnect' | null {
  if (status === 'ERROR') return 'Reconnect'
  if (status === 'AVAILABLE_NOT_CONNECTED') return 'Connect'
  return null
}

// ── Resolver types ──────────────────────────────────────────────────────
export interface ResolvedSource {
  status: SourceStatus
  /** CONNECTED-but-genuinely-zero is CONNECTED + hasData:false (NO_DATA). */
  hasData: boolean
  lastUpdated: string | null
  errorReason: string | null
  /** Non-error hint (e.g. a config-missing prompt) shown neutrally, not as an error. */
  hint?: string | null
  /** MANUAL_ENTRY provenance — modeled now, populated later. */
  manualBy?: string | null
  manualAt?: string | null
}

export type ResolvedSourceMap = Record<string, ResolvedSource>

/** The owner-set per-client config the resolver consults for config-gated
 *  sources (currently the two GA4 event sources). Keys match ClientConfigKey. */
export interface ResolverClientConfig {
  ga4_menu_path?: string | null
  ga4_order_domain?: string | null
}

/** A trimmed channel_connections row, keyed by channel, that the resolver reads. */
export interface ConnectionSnapshot {
  status: ConnectorStatus | string
  sync_error: string | null
  last_sync_at: string | null
}

export type ConnectionsByChannel = Partial<Record<ConnectorChannel | string, ConnectionSnapshot>>

/**
 * PURE resolver — given a client's connections-by-channel, resolve every
 * source's live status. No I/O, so it is unit-testable offline. The DB read
 * lives in resolveSourceStatuses (server-only) below.
 *
 * Rules:
 *  - no-adapter source (COMING_SOON base) → COMING_SOON always.
 *  - provider connection missing / disconnected / pending → AVAILABLE_NOT_CONNECTED.
 *  - provider connection in error → ERROR + reason (verb "Reconnect").
 *  - provider connection active + source.wired → CONNECTED.
 *  - provider connection active but NOT wired → AVAILABLE_NOT_CONNECTED.
 *  - provider connection active + wired + requiresClientConfig, but the config
 *    value is missing → AVAILABLE_NOT_CONNECTED + configMissingReason hint.
 */
export function resolveSourceStatusesFrom(
  connections: ConnectionsByChannel,
  config: ResolverClientConfig = {},
): ResolvedSourceMap {
  const out: ResolvedSourceMap = {}
  for (const source of SOURCES) {
    out[source.id] = resolveOne(source, connections, config)
  }
  return out
}

function comingSoon(): ResolvedSource {
  return { status: 'COMING_SOON', hasData: false, lastUpdated: null, errorReason: null }
}

function notConnected(): ResolvedSource {
  return { status: 'AVAILABLE_NOT_CONNECTED', hasData: false, lastUpdated: null, errorReason: null }
}

function resolveOne(
  source: SourceDef,
  connections: ConnectionsByChannel,
  config: ResolverClientConfig,
): ResolvedSource {
  // No adapter → never a number.
  if (source.baseStatus === 'COMING_SOON') return comingSoon()

  const channels = PROVIDER_CHANNELS[source.provider]
  if (!channels || channels.length === 0) return comingSoon()

  // First present connection among the provider's channels.
  let conn: ConnectionSnapshot | undefined
  for (const ch of channels) {
    if (connections[ch]) {
      conn = connections[ch]
      break
    }
  }
  if (!conn) return notConnected()

  if (conn.status === 'error') {
    return {
      status: 'ERROR',
      hasData: false,
      lastUpdated: conn.last_sync_at ?? null,
      errorReason: conn.sync_error ?? 'Connection error',
    }
  }

  if (conn.status === 'active') {
    // Active connection is necessary but NOT sufficient — the metric must be wired.
    if (source.wired) {
      // A config-gated source (GA4 event sources) also needs its owner-set value.
      if (source.requiresClientConfig) {
        const val = config[source.requiresClientConfig]
        if (!val || !String(val).trim()) {
          return {
            status: 'AVAILABLE_NOT_CONNECTED',
            hasData: false,
            lastUpdated: conn.last_sync_at ?? null,
            errorReason: null,
            hint: source.configMissingReason ?? null,
          }
        }
      }
      return {
        status: 'CONNECTED',
        hasData: true, // best-effort default; refined by a real data check later
        lastUpdated: conn.last_sync_at ?? null,
        errorReason: null,
      }
    }
    return notConnected()
  }

  // pending / disconnected / anything else → not connected.
  return notConnected()
}
