/**
 * Type definitions for the AI Marketing Operator.
 */

import type { UpdatePayload, FanoutTarget, UpdateType } from '@/lib/updates/types'

// ─── Records ───────────────────────────────────────────────────

export type AgentRunStatus = 'pending' | 'running' | 'success' | 'failed'
export type AgentRunType = 'weekly_analysis' | 'anomaly_check' | 'manual'

export interface AgentRun {
  id: string
  clientId: string
  runType: AgentRunType
  triggeredBy: 'cron' | 'manual' | 'api'
  status: AgentRunStatus
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  summary: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  createdAt: string
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'cancelled'
export type ProposalCategory = 'anomaly_response' | 'content' | 'maintenance' | 'opportunity'

export interface ProposedAction {
  id: string
  clientId: string
  agentRunId: string | null
  locationId: string | null
  type: UpdateType | 'social_post'
  payload: UpdatePayload['data'] | SocialPostPayload
  targets: FanoutTarget[]
  scheduledFor: string | null
  summary: string
  reasoning: string | null
  confidenceScore: number | null
  category: ProposalCategory | null
  status: ProposalStatus
  approvedBy: string | null
  approvedAt: string | null
  executedAt: string | null
  rejectionReason: string | null
  executedUpdateId: string | null
  createdAt: string
  expiresAt: string | null
}

// ─── Proposal payloads (extends update types with content-specific) ──

/**
 * Social post is a new "type" only in the Operator's vocabulary -- it's a
 * draft for an IG/FB/social post that doesn't fit hours/menu/promo/event.
 * When approved, it executes as a content piece, not as an update record.
 */
export interface SocialPostPayload {
  caption: string                     // post copy
  platforms: ('instagram' | 'facebook' | 'tiktok')[]
  photo_asset_url?: string            // existing asset to use
  hashtags?: string[]
  posting_time_recommendation?: string // ISO datetime
}

// ─── Claude-side structured output schema ──────────────────────

export interface ClaudeProposalOutput {
  summary: string                      // narrative overview of the week
  proposals: Array<{
    type: UpdateType | 'social_post'
    summary: string                    // 1-line description for the queue
    reasoning: string                  // why this action
    confidence: number                 // 0-1
    category: ProposalCategory
    payload: Record<string, unknown>   // type-specific
    targets: FanoutTarget[]
    scheduled_for?: string             // ISO datetime
  }>
}

// ─── Input bundle to Claude ────────────────────────────────────

export interface ClientContext {
  client: {
    id: string
    name: string
    slug: string
    primary_industry: string | null
    brief_description: string | null
    goals: unknown
    target_audience: unknown
    content_pillars: unknown
    competitors: unknown
  }
  brand: {
    primary_color: string | null
    voice_notes: string | null
    photo_style: string | null
    visual_style: string | null
  } | null
  primaryLocation: {
    name: string
    address: string | null
    hours: unknown
  } | null
  recentMetrics: {
    last30_impressions: number
    last30_calls: number
    last30_directions: number
    last30_website_clicks: number
    last30_menu_clicks: number
    prev30_impressions: number
    prev30_calls: number
    prev30_directions: number
    prev30_website_clicks: number
    prev30_menu_clicks: number
  } | null
  recentUpdates: Array<{
    type: string
    summary: string | null
    published_at: string | null
  }>
  activePromotions: number
  upcomingEvents: number
}
