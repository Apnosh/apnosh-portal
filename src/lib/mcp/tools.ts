/**
 * MCP tool registry.
 *
 * Each tool is callable by an authenticated MCP principal (one client_id).
 * Tools are the agent-callable surface of Apnosh -- the same operations
 * the web app exposes, but as discrete JSON-RPC methods.
 *
 * Add new tools by appending to TOOLS. The HTTP route auto-exposes them.
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import type { McpPrincipal } from './auth'
import type { UpdateType, UpdatePayload, FanoutTarget, PromotionPayload, HoursPayload } from '@/lib/updates/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

// ─── MCP types (subset of the spec we actually use) ────────────────

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>      // JSON Schema
  handler: (args: unknown, principal: McpPrincipal) => Promise<McpToolResult>
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] }
}
function err(text: string): McpToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

// ─── Tools ─────────────────────────────────────────────────────────

const getMyClient: McpToolDefinition = {
  name: 'get_my_client',
  description: 'Returns the restaurant this MCP key is scoped to: name, slug, industry, primary location.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  handler: async (_args, principal) => {
    const db = adminDb()
    const { data: client } = await db
      .from('clients')
      .select('id, name, slug, industry, website, phone, email')
      .eq('id', principal.clientId)
      .maybeSingle()
    if (!client) return err('Client not found')

    const { data: location } = await db
      .from('gbp_locations')
      .select('location_name, address, hours')
      .eq('client_id', principal.clientId)
      .eq('status', 'assigned')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    return ok(JSON.stringify({ client, primary_location: location ?? null }, null, 2))
  },
}

const listRecentUpdates: McpToolDefinition = {
  name: 'list_recent_updates',
  description: 'Returns the last N published updates (hours, menu, promo, event, closure, info) for this restaurant.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max items (default 10, max 50)' },
    },
    required: [],
  },
  handler: async (args, principal) => {
    const limit = Math.min(50, Math.max(1, Number((args as { limit?: number })?.limit ?? 10)))
    const db = adminDb()
    const { data, error: dbErr } = await db
      .from('client_updates')
      .select('id, type, summary, status, published_at, created_at, payload')
      .eq('client_id', principal.clientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (dbErr) return err(dbErr.message)
    return ok(JSON.stringify(data ?? [], null, 2))
  },
}

const getRecentMetrics: McpToolDefinition = {
  name: 'get_recent_metrics',
  description: 'Returns last-30 vs prior-30 day Google Business Profile metrics: impressions, calls, directions, website clicks, menu clicks. Helps the agent reason about performance trends before suggesting actions.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  handler: async (_args, principal) => {
    const db = adminDb()
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    const { data: metrics } = await db
      .from('gbp_metrics')
      .select('date, impressions_total, calls, directions, website_clicks, food_menu_clicks')
      .eq('client_id', principal.clientId)
      .gte('date', sixtyDaysAgo)
    if (!metrics || metrics.length === 0) return ok('{ "error": "no metrics data yet" }')

    const last30 = metrics.filter(m => (m.date as string) >= thirtyDaysAgo)
    const prev30 = metrics.filter(m => (m.date as string) < thirtyDaysAgo)
    const sum = (rows: typeof metrics, key: string) =>
      rows.reduce((a, r) => a + ((r as Record<string, number>)[key] ?? 0), 0)
    const result = {
      last30: {
        impressions: sum(last30, 'impressions_total'),
        calls: sum(last30, 'calls'),
        directions: sum(last30, 'directions'),
        website_clicks: sum(last30, 'website_clicks'),
        menu_clicks: sum(last30, 'food_menu_clicks'),
      },
      prev30: {
        impressions: sum(prev30, 'impressions_total'),
        calls: sum(prev30, 'calls'),
        directions: sum(prev30, 'directions'),
        website_clicks: sum(prev30, 'website_clicks'),
        menu_clicks: sum(prev30, 'food_menu_clicks'),
      },
    }
    return ok(JSON.stringify(result, null, 2))
  },
}

const publishPromotion: McpToolDefinition = {
  name: 'publish_promotion',
  description: 'Publish a time-bound promotion (happy hour, discount, BOGO). Fans out to GBP, website, and connected social channels automatically. Returns the new update id and per-target fanout result.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name e.g. "Happy Hour 4-6pm"' },
      description: { type: 'string', description: 'Customer-facing description' },
      discount_type: { type: 'string', enum: ['percent', 'amount', 'bogo', 'free_item', 'other'] },
      discount_value: { type: 'number', description: 'Percent (e.g. 25) or cents (e.g. 500)' },
      valid_from: { type: 'string', description: 'ISO datetime' },
      valid_until: { type: 'string', description: 'ISO datetime' },
      code: { type: 'string', description: 'Optional promo code' },
      terms: { type: 'string', description: 'Optional fine print' },
    },
    required: ['name', 'description', 'discount_type', 'valid_from', 'valid_until'],
  },
  handler: async (args, principal) => {
    const a = args as Record<string, unknown>
    const payload: PromotionPayload = {
      name: String(a.name),
      description: String(a.description),
      discount_type: a.discount_type as PromotionPayload['discount_type'],
      discount_value: a.discount_value as number | undefined,
      valid_from: String(a.valid_from),
      valid_until: String(a.valid_until),
      code: a.code as string | undefined,
      terms: a.terms as string | undefined,
    }
    return runUpdate(principal.clientId, 'promotion', payload, `Promo: ${payload.name}`)
  },
}

const updateHours: McpToolDefinition = {
  name: 'update_hours',
  description: 'Update weekly regular hours for the primary location. Pass each day-of-week as an array of {open, close} ranges (HH:MM 24h). Empty array = closed that day. Fans out to GBP, website, Yelp.',
  inputSchema: {
    type: 'object',
    properties: {
      mon: { type: 'array', items: rangeSchema() },
      tue: { type: 'array', items: rangeSchema() },
      wed: { type: 'array', items: rangeSchema() },
      thu: { type: 'array', items: rangeSchema() },
      fri: { type: 'array', items: rangeSchema() },
      sat: { type: 'array', items: rangeSchema() },
      sun: { type: 'array', items: rangeSchema() },
      note: { type: 'string', description: 'Optional human-facing note' },
    },
    required: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  },
  handler: async (args, principal) => {
    const a = args as Record<string, unknown>
    const payload: HoursPayload = {
      scope: 'regular',
      weekly: {
        mon: a.mon as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        tue: a.tue as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        wed: a.wed as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        thu: a.thu as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        fri: a.fri as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        sat: a.sat as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
        sun: a.sun as HoursPayload['weekly'] extends Record<string, infer R> ? R : never,
      },
      note: a.note as string | undefined,
    }
    return runUpdate(principal.clientId, 'hours', payload, 'Hours updated via MCP')
  },
}

const listPendingProposals: McpToolDefinition = {
  name: 'list_pending_proposals',
  description: 'Returns AI Operator proposals awaiting human approval for this restaurant. Each proposal has type, summary, reasoning, confidence, and category.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  handler: async (_args, principal) => {
    const db = adminDb()
    const { data, error: dbErr } = await db
      .from('proposed_actions')
      .select('id, type, summary, reasoning, confidence_score, category, payload, created_at')
      .eq('client_id', principal.clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)
    if (dbErr) return err(dbErr.message)
    return ok(JSON.stringify(data ?? [], null, 2))
  },
}

// ─── Helpers ───────────────────────────────────────────────────────

function rangeSchema() {
  return {
    type: 'object',
    properties: {
      open: { type: 'string', description: 'HH:MM 24h' },
      close: { type: 'string', description: 'HH:MM 24h' },
    },
    required: ['open', 'close'],
  }
}

async function runUpdate(
  clientId: string,
  type: UpdateType,
  payload: UpdatePayload['data'],
  summary: string,
): Promise<McpToolResult> {
  // We replicate the insert here directly (createUpdate requires a session)
  // and call publishUpdate with actor: 'service' to skip session auth.
  const { publishUpdate } = await import('@/lib/updates/actions')
  const db = adminDb()
  const { DEFAULT_TARGETS } = await import('@/lib/updates/types')
  const { filterConnectedTargets } = await import('@/lib/updates/policy')

  const requested = DEFAULT_TARGETS[type]
  const { keep, dropped } = await filterConnectedTargets(clientId, requested)

  const { data: row, error: insertErr } = await db
    .from('client_updates')
    .insert({
      client_id: clientId,
      type,
      payload,
      targets: keep,
      summary,
      created_by: null,
      status: 'draft',
    })
    .select('id')
    .single()
  if (insertErr || !row) return err(insertErr?.message ?? 'Insert failed')

  const fanoutRows = [
    ...keep.map(t => ({ update_id: row.id as string, target: t, status: 'pending' as const })),
    ...dropped.map(t => ({
      update_id: row.id as string,
      target: t,
      status: 'skipped' as const,
      error_message: `${t} is not connected for this client`,
    })),
  ]
  if (fanoutRows.length > 0) {
    await db.from('client_update_fanouts').insert(fanoutRows)
  }

  // Publish using the service actor path (skips session auth since MCP keys
  // are their own auth mechanism).
  const published = await publishUpdate(row.id as string, { actor: 'service' })
  if (!published.success) {
    return err(`Update created (${row.id}) but fanout failed: ${published.error}`)
  }

  return ok(JSON.stringify({
    updateId: row.id,
    published: true,
    targetsKept: keep,
    targetsDropped: dropped,
    fanoutResults: published.data.fanoutResults,
  }, null, 2))
}

// ─── Registry ──────────────────────────────────────────────────────

export const TOOLS: McpToolDefinition[] = [
  getMyClient,
  listRecentUpdates,
  getRecentMetrics,
  listPendingProposals,
  publishPromotion,
  updateHours,
]

export function getToolByName(name: string): McpToolDefinition | undefined {
  return TOOLS.find(t => t.name === name)
}

export function listToolsForClient(): Array<Pick<McpToolDefinition, 'name' | 'description' | 'inputSchema'>> {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }))
}
