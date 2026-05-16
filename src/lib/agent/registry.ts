/**
 * Tool registry.
 *
 * Tools are declared in code (for type safety + executable handlers)
 * but their *availability* is controlled by the agent_tools table.
 * The table holds metadata (description, schema, version, kill switch)
 * that we can edit without redeploying. The handler function is
 * resolved at runtime via the `handler` field.
 *
 * Why two sources of truth? Because we want non-engineers (strategists)
 * to be able to:
 *   - retire a tool (set retired_at)
 *   - bump a version (insert new row)
 *   - tweak a description (update text)
 *   - disable for one specific client (client_tool_overrides)
 *
 * ...without touching code or shipping a deploy.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { AgentToolDefinition, ToolExecutionContext } from './types'
import { resolveTier } from './tiers'

// ─── Handler registry ─────────────────────────────────────────────

type ToolHandler = (input: unknown, ctx: ToolExecutionContext) => Promise<unknown>

const handlers = new Map<string, ToolHandler>()

/**
 * Register a tool handler. Called at module-load time by each tool file.
 * The `handler` string in agent_tools must match a registered name here.
 */
export function registerToolHandler(name: string, fn: ToolHandler): void {
  if (handlers.has(name)) {
    throw new Error(`Tool handler "${name}" registered twice`)
  }
  handlers.set(name, fn)
}

export function getToolHandler(name: string): ToolHandler | null {
  return handlers.get(name) ?? null
}

// ─── DB-backed tool catalog ───────────────────────────────────────

/* Tools that only work when the client is on the Apnosh-managed website
   product. Even if an admin grants them via client_tool_overrides, they
   would fail at runtime — we filter them out at the registry layer so
   Claude never sees them in the tool list. */
const WEBSITE_GATED_TOOLS = new Set(['update_page_copy', 'update_menu_item'])

/** Return all tools currently available to the given client. */
export async function loadEnabledToolsForClient(
  clientId: string,
  clientTier: string,
): Promise<AgentToolDefinition[]> {
  const admin = createAdminClient()
  const [toolsRes, overridesRes, clientRes] = await Promise.all([
    admin.from('agent_tools')
      .select('*')
      .is('retired_at', null)
      .eq('enabled_globally', true),
    admin.from('client_tool_overrides')
      .select('tool_name, enabled')
      .eq('client_id', clientId),
    admin.from('clients')
      .select('has_apnosh_website')
      .eq('id', clientId)
      .maybeSingle(),
  ])

  const tools = (toolsRes.data ?? []) as Array<{
    name: string; version: number; description: string; json_schema: Record<string, unknown>;
    handler: string; requires_confirmation: boolean; destructive: boolean;
    audit_event_type: string; default_for_tiers: string[]; enabled_globally: boolean;
    retired_at: string | null; notes: string | null;
  }>
  const overrides = new Map((overridesRes.data ?? []).map(o => [o.tool_name as string, o.enabled as boolean]))
  const hasApnoshWebsite = !!(clientRes.data as { has_apnosh_website?: boolean } | null)?.has_apnosh_website

  /* Resolve the client's tier to its allowed tool list. Per-client
     overrides in client_tool_overrides win over tier defaults so a
     strategist can give a specific Basic-tier client access to
     post_to_gbp (or revoke a tool for a specific client) without
     promoting them to a new tier.

     Website-gated tools (update_page_copy, update_menu_item) are an
     additional check: they require has_apnosh_website=true regardless
     of tier OR override, because the tool handler depends on the
     Apnosh-managed schema/repo to exist. */
  const tier = resolveTier(clientTier)
  return tools
    .filter(t => {
      if (WEBSITE_GATED_TOOLS.has(t.name) && !hasApnoshWebsite) return false
      const override = overrides.get(t.name)
      if (override !== undefined) return override
      return tier.enabledTools.includes(t.name)
    })
    .map(t => ({
      name: t.name,
      version: t.version,
      description: t.description,
      jsonSchema: t.json_schema,
      handler: t.handler,
      requiresConfirmation: t.requires_confirmation,
      destructive: t.destructive,
      auditEventType: t.audit_event_type,
      defaultForTiers: t.default_for_tiers,
      enabledGlobally: t.enabled_globally,
      retiredAt: t.retired_at,
      notes: t.notes,
      execute: getToolHandler(t.handler) ?? undefined,
    }))
}

/** Get one tool definition by name (the currently active version). */
export async function getActiveTool(name: string): Promise<AgentToolDefinition | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('agent_tools')
    .select('*')
    .eq('name', name)
    .is('retired_at', null)
    .maybeSingle()
  if (!data) return null
  const t = data as {
    name: string; version: number; description: string; json_schema: Record<string, unknown>;
    handler: string; requires_confirmation: boolean; destructive: boolean;
    audit_event_type: string; default_for_tiers: string[]; enabled_globally: boolean;
    retired_at: string | null; notes: string | null;
  }
  return {
    name: t.name,
    version: t.version,
    description: t.description,
    jsonSchema: t.json_schema,
    handler: t.handler,
    requiresConfirmation: t.requires_confirmation,
    destructive: t.destructive,
    auditEventType: t.audit_event_type,
    defaultForTiers: t.default_for_tiers,
    enabledGlobally: t.enabled_globally,
    retiredAt: t.retired_at,
    notes: t.notes,
    execute: getToolHandler(t.handler) ?? undefined,
  }
}

// ─── Anthropic tool-calling format ────────────────────────────────

/**
 * Reshape a list of tool definitions into the format Anthropic's
 * tool-use API expects. The agent passes these to claude.messages.create
 * via the `tools` parameter.
 */
export function toAnthropicTools(tools: AgentToolDefinition[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema,
  }))
}
