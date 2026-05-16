/**
 * Agent foundation types.
 *
 * Mirrors the DB schema for the agent stack. Keep this in sync with
 * the migration in /supabase/migrations/* (or whichever applied
 * migration created these tables).
 *
 * Design principle: every concept is a typed event, not a free-form
 * blob. That lets us replay conversations, A/B test prompts, run
 * evals against held-out data, and surface cross-client patterns
 * once we have enough volume.
 */

// ─── Knowledge: client facts ──────────────────────────────────────

export type FactSource =
  | 'onboarding'      // captured during signup wizard
  | 'extracted'       // background job scraped the client's site/IG/GBP
  | 'conversation'    // agent learned during a chat
  | 'owner_stated'    // owner explicitly told us
  | 'strategist'      // strategist entered via admin
  | 'cron'            // automated refresh
  | 'platform'        // pulled from a connected platform's API

export interface ClientFact {
  id: string
  clientId: string
  factKey: string                  // e.g. "brand.voice.tone"
  factValue: unknown               // JSON-typed; consumers cast
  source: FactSource
  sourceRef: Record<string, unknown> | null
  confidence: number               // 0.0 - 1.0
  lastVerifiedAt: string
  createdAt: string
  updatedAt: string
}

// ─── Tools: versioned registry ────────────────────────────────────

export interface AgentToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique name (e.g. "update_menu_item"). One active version per name. */
  name: string
  /** Bumped when the tool's input shape or behavior changes. */
  version: number
  /** Plain English. Shown to the LLM. */
  description: string
  /** JSON schema for inputs. Used by Anthropic tool-calling. */
  jsonSchema: Record<string, unknown>
  /** Handler identifier; resolved to a function in src/lib/agent/tools/handlers/. */
  handler: string
  /** Whether the user must click-confirm before execute. */
  requiresConfirmation: boolean
  /** Whether the action affects the live site / live platform. */
  destructive: boolean
  /** The typed event emitted on success (e.g. "MenuItemUpdated"). */
  auditEventType: string
  /** Service tiers this tool is available to by default. */
  defaultForTiers: string[]
  /** Globally enabled toggle (kill switch). */
  enabledGlobally: boolean
  /** Soft-retire timestamp; if set, tool is no longer offered. */
  retiredAt: string | null
  /** Free-form changelog notes for this version. */
  notes: string | null
  /** Pure handler -- runs only after status='confirmed'. */
  execute?: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>
}

/** Context passed to every tool handler so it can read facts, write events, etc. */
export interface ToolExecutionContext {
  clientId: string
  conversationId: string | null
  turnId: string | null
  executionId: string
  /** Returns the previous state of whatever the tool is about to change. Used for undo. */
  capturePreviousState: () => Promise<Record<string, unknown> | null>
  /** Strategist (admin) acting on behalf of the client. null when the owner is in the chat. */
  actingAsStrategistId: string | null
}

// ─── Prompts: versioned, swappable ────────────────────────────────

export type PromptSlot =
  | 'main_agent'           // the front-of-house agent
  | 'fact_extractor'       // background job: pull facts from past content
  | 'intent_classifier'    // route owner messages into the right tool category
  | 'on_brand_critic'      // checks generated copy against brand voice

export interface AgentPrompt {
  id: string
  slot: PromptSlot
  version: number
  isActive: boolean
  /** Anthropic model id (e.g. "claude-opus-4-7-20251022"). Swap to upgrade. */
  model: string
  systemText: string
  notes: string | null
  createdAt: string
  activatedAt: string | null
}

// ─── Conversations + turns ────────────────────────────────────────

export type ConversationStatus = 'active' | 'completed' | 'escalated' | 'abandoned'

export interface AgentConversation {
  id: string
  clientId: string
  startedBy: string | null    // auth user id; null = system-initiated
  startedAt: string
  endedAt: string | null
  title: string | null        // auto-summarized
  summary: string | null      // auto-summarized
  status: ConversationStatus
  escalationRequestId: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

export type TurnRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ConversationTurn {
  id: string
  conversationId: string
  turnIndex: number
  role: TurnRole
  /** Free-form content. For 'user' / 'assistant' / 'system' = string. For 'tool' = result. */
  content: unknown
  /** When the assistant is requesting tools, the requested calls. */
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null
  /** When the role is 'tool', which call this is responding to. */
  toolCallId: string | null
  model: string | null
  promptVersion: number | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  createdAt: string
}

// ─── Tool executions: the typed event log ─────────────────────────

export type ToolExecutionStatus =
  | 'pending_confirmation'  // agent asked, user hasn't confirmed yet
  | 'confirmed'              // user confirmed; handler about to run
  | 'executed'               // handler ran successfully
  | 'failed'                 // handler errored
  | 'reverted'               // undone after the fact
  | 'cancelled'              // user said no to the confirmation

export interface ToolExecution<TInput = unknown, TOutput = unknown> {
  id: string
  conversationId: string | null
  turnId: string | null
  clientId: string
  toolName: string
  toolVersion: number
  input: TInput
  output: TOutput | null
  /** The typed event name (mirrors AgentToolDefinition.auditEventType). */
  auditEventType: string
  /** The actual event payload as JSON. Frozen at execution time. */
  eventPayload: Record<string, unknown>
  status: ToolExecutionStatus
  confirmedByUserAt: string | null
  executedAt: string | null
  failedReason: string | null
  revertedAt: string | null
  revertsExecutionId: string | null
  /** Snapshot of "what it was before" -- enables undo without time travel. */
  previousState: Record<string, unknown> | null
  createdAt: string
}

// ─── Evaluations + outcomes ───────────────────────────────────────

export type RaterType = 'owner' | 'strategist' | 'auto'

export interface AgentEvaluation {
  id: string
  conversationId: string
  raterType: RaterType
  raterId: string | null
  /** All 1-5 scales. null = not evaluated. */
  understoodIntent: number | null
  pickedRightTool: number | null
  outputOnBrand: number | null
  escalatedAppropriately: number | null
  overall: number | null
  thumbs: 'up' | 'down' | null
  notes: string | null
  tags: string[] | null
  createdAt: string
}

export interface AgentOutcome {
  id: string
  conversationId: string | null
  toolExecutionId: string | null
  /** e.g. "ig_post_engagement", "gbp_views_lift", "pos_revenue_delta". */
  metricName: string
  baselineValue: number | null
  observedValue: number | null
  observedAt: string
  windowDays: number | null
  signalStrength: 'strong' | 'weak' | 'noisy' | null
  notes: string | null
  createdAt: string
}

// ─── Helper: stable list of standard fact keys ────────────────────

/**
 * Canonical fact keys we care about. Use these instead of stringly-typed
 * keys when you can, so we have one source of truth for the knowledge
 * graph schema. New keys can be added freely (no migration needed --
 * the storage is jsonb), but adding them here gets you autocomplete
 * + protects against typos in code.
 */
export const FACT_KEYS = {
  // Brand voice
  BRAND_TONE: 'brand.voice.tone',
  BRAND_DO_SAY: 'brand.voice.do_say',
  BRAND_DONT_SAY: 'brand.voice.dont_say',
  BRAND_EXAMPLE_PHRASES: 'brand.voice.example_phrases',

  // Visual identity
  VISUAL_PRIMARY_COLOR: 'visual.colors.primary',
  VISUAL_LOGO_URL: 'visual.logo.url',
  VISUAL_PHOTO_STYLE: 'visual.photos.style',

  // Operations
  CALENDAR_HOURS: 'calendar.hours',
  CALENDAR_HOLIDAY_HOURS: 'calendar.holiday_hours',
  CALENDAR_TIME_ZONE: 'calendar.timezone',

  // Menu
  MENU_STYLE: 'menu.style',
  MENU_PRICE_TIER: 'menu.price_tier',
  MENU_SIGNATURE_ITEMS: 'menu.signature_items',
  MENU_DIETARY_OPTIONS: 'menu.dietary_options',

  // Owner preferences
  OWNER_PREFERRED_CONTACT: 'owner.preferred_contact',
  OWNER_APPROVAL_THRESHOLD: 'owner.approval_threshold', // 'always' | 'destructive_only' | 'never'
  OWNER_NAME: 'owner.name',

  // Connected channels (account ids, handles, etc.)
  CHANNEL_INSTAGRAM_HANDLE: 'channels.instagram.handle',
  CHANNEL_FACEBOOK_PAGE_ID: 'channels.facebook.page_id',
  CHANNEL_GBP_LOCATION_ID: 'channels.gbp.location_id',
  CHANNEL_GITHUB_REPO: 'channels.github.repo',

  // Business facts
  BUSINESS_VERTICAL: 'business.vertical',
  BUSINESS_LOCATION_COUNT: 'business.location_count',
  BUSINESS_GOAL: 'business.primary_goal',
} as const

export type StandardFactKey = typeof FACT_KEYS[keyof typeof FACT_KEYS]
