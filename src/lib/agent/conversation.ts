/**
 * Conversation manager.
 *
 * The agent runtime that ties everything together. Each call to
 * `runAgentTurn` follows this loop:
 *
 *   1. Append the user's message as a turn
 *   2. Load client facts + active prompt + enabled tools
 *   3. Call Claude with messages-so-far + tools
 *   4. If Claude returns text -> append assistant turn, done
 *   5. If Claude returns tool_use -> create tool_executions rows in
 *      'pending_confirmation' state for any destructive tools, OR
 *      directly run safe (non-destructive) tools
 *   6. Append the tool_use as an assistant turn
 *   7. Return what should be rendered to the user
 *
 * Confirmation happens out-of-band: the UI shows a preview, the user
 * clicks Confirm, which calls `confirmAndExecute(executionId)`, which
 * runs the handler and appends a 'tool' role turn with the result.
 *
 * The next `runAgentTurn` call picks up from there, feeds the tool
 * result back to Claude, and gets the next message.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ConversationTurn, ToolExecutionContext, AgentToolDefinition,
} from './types'
import { loadEnabledToolsForClient, getToolHandler } from './registry'

// ─── Start + lookup ───────────────────────────────────────────────

export async function startConversation(args: {
  clientId: string
  startedBy: string | null
  title?: string
}): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_conversations')
    .insert({
      client_id: args.clientId,
      started_by: args.startedBy,
      title: args.title ?? null,
      status: 'active',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to start conversation: ${error?.message}`)
  return { id: data.id as string }
}

export async function loadConversationTurns(conversationId: string): Promise<ConversationTurn[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_conversation_turns')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('turn_index', { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToTurn)
}

function rowToTurn(r: Record<string, unknown>): ConversationTurn {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    turnIndex: r.turn_index as number,
    role: r.role as ConversationTurn['role'],
    content: r.content,
    toolCalls: (r.tool_calls as ConversationTurn['toolCalls']) ?? null,
    toolCallId: (r.tool_call_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    promptVersion: (r.prompt_version as number | null) ?? null,
    inputTokens: (r.input_tokens as number | null) ?? null,
    outputTokens: (r.output_tokens as number | null) ?? null,
    latencyMs: (r.latency_ms as number | null) ?? null,
    createdAt: r.created_at as string,
  }
}

// ─── Append turns ─────────────────────────────────────────────────

export async function appendUserTurn(
  conversationId: string,
  text: string,
): Promise<ConversationTurn> {
  return appendTurn(conversationId, {
    role: 'user',
    content: text,
  })
}

export async function appendAssistantTurn(
  conversationId: string,
  args: {
    text: string | null
    toolCalls?: ConversationTurn['toolCalls']
    model: string
    promptVersion: number
    inputTokens?: number
    outputTokens?: number
    latencyMs?: number
  },
): Promise<ConversationTurn> {
  return appendTurn(conversationId, {
    role: 'assistant',
    content: args.text,
    toolCalls: args.toolCalls ?? null,
    model: args.model,
    promptVersion: args.promptVersion,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    latencyMs: args.latencyMs,
  })
}

export async function appendToolResultTurn(
  conversationId: string,
  args: { toolCallId: string; result: unknown },
): Promise<ConversationTurn> {
  return appendTurn(conversationId, {
    role: 'tool',
    content: args.result,
    toolCallId: args.toolCallId,
  })
}

async function appendTurn(
  conversationId: string,
  fields: {
    role: ConversationTurn['role']
    content: unknown
    toolCalls?: ConversationTurn['toolCalls']
    toolCallId?: string
    model?: string
    promptVersion?: number
    inputTokens?: number
    outputTokens?: number
    latencyMs?: number
  },
): Promise<ConversationTurn> {
  const admin = createAdminClient()
  // Compute next turn_index (atomicity is OK -- one chat at a time per user).
  const { data: lastTurn } = await admin
    .from('agent_conversation_turns')
    .select('turn_index')
    .eq('conversation_id', conversationId)
    .order('turn_index', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextIndex = ((lastTurn?.turn_index as number | undefined) ?? -1) + 1

  const { data, error } = await admin
    .from('agent_conversation_turns')
    .insert({
      conversation_id: conversationId,
      turn_index: nextIndex,
      role: fields.role,
      content: fields.content,
      tool_calls: fields.toolCalls ?? null,
      tool_call_id: fields.toolCallId ?? null,
      model: fields.model ?? null,
      prompt_version: fields.promptVersion ?? null,
      input_tokens: fields.inputTokens ?? null,
      output_tokens: fields.outputTokens ?? null,
      latency_ms: fields.latencyMs ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Failed to append turn: ${error?.message}`)
  return rowToTurn(data as Record<string, unknown>)
}

// ─── Tool execution lifecycle ─────────────────────────────────────

/**
 * Create a tool_executions row in 'pending_confirmation' state.
 * The agent UI shows the preview; the user clicks Confirm to call
 * `confirmAndExecute(id)` which runs the handler and appends the
 * result as a tool-role turn.
 *
 * For non-destructive tools, the caller can skip the confirmation
 * and call `executeNow` directly.
 */
export async function createPendingExecution(args: {
  conversationId: string
  turnId: string
  clientId: string
  tool: AgentToolDefinition
  input: unknown
  /* Claude's tool_use_id from the tool_use block. Stored so the
     follow-up tool_result block can reference it (Anthropic requires
     id match between tool_use and tool_result). */
  toolUseId: string
}): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_tool_executions')
    .insert({
      conversation_id: args.conversationId,
      turn_id: args.turnId,
      client_id: args.clientId,
      tool_name: args.tool.name,
      tool_version: args.tool.version,
      input: args.input,
      audit_event_type: args.tool.auditEventType,
      event_payload: {},  // finalized at execute time
      status: args.tool.requiresConfirmation ? 'pending_confirmation' : 'confirmed',
      tool_use_id: args.toolUseId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to create execution: ${error?.message}`)
  return { id: data.id as string }
}

/**
 * User clicked Confirm. Run the handler, finalize the event_payload,
 * append a tool-role turn with the result, advance status to 'executed'.
 */
export async function confirmAndExecute(args: {
  executionId: string
  actingAsStrategistId: string | null
}): Promise<{ ok: true; output: unknown } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: row, error: rowErr } = await admin
    .from('agent_tool_executions')
    .select('*')
    .eq('id', args.executionId)
    .maybeSingle()
  if (rowErr || !row) return { ok: false, error: 'Execution not found' }
  if (row.status !== 'pending_confirmation' && row.status !== 'confirmed') {
    return { ok: false, error: `Cannot execute from status ${row.status}` }
  }

  const handler = getToolHandler(toHandlerName(row.tool_name as string))
  if (!handler) return { ok: false, error: `No registered handler for ${row.tool_name}` }

  // Capture previous state (best-effort; tools that don't need undo return null).
  const previousState: Record<string, unknown> | null = null

  await admin.from('agent_tool_executions').update({
    status: 'confirmed',
    confirmed_by_user_at: new Date().toISOString(),
    previous_state: previousState,
  }).eq('id', args.executionId)

  const ctx: ToolExecutionContext = {
    clientId: row.client_id as string,
    conversationId: (row.conversation_id as string | null) ?? null,
    turnId: (row.turn_id as string | null) ?? null,
    executionId: args.executionId,
    capturePreviousState: async () => null,
    actingAsStrategistId: args.actingAsStrategistId,
  }

  try {
    const output = await handler(row.input, ctx)
    await admin.from('agent_tool_executions').update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      output,
      event_payload: {
        client_id: row.client_id,
        tool: row.tool_name,
        version: row.tool_version,
        input: row.input,
        output,
      },
    }).eq('id', args.executionId)

    if (row.conversation_id) {
      /* Use Claude's tool_use_id (not our execution UUID) so the
         tool_result block matches the original tool_use block when
         we feed messages back to Claude on the next turn. */
      const toolUseId = (row.tool_use_id as string | null) ?? args.executionId
      await appendToolResultTurn(row.conversation_id as string, {
        toolCallId: toolUseId,
        result: output,
      })
    }
    return { ok: true, output }
  } catch (err) {
    const message = (err as Error).message
    await admin.from('agent_tool_executions').update({
      status: 'failed',
      failed_reason: message,
    }).eq('id', args.executionId)
    return { ok: false, error: message }
  }
}

/** User clicked Cancel on a pending confirmation. */
export async function cancelExecution(executionId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('agent_tool_executions').update({
    status: 'cancelled',
  }).eq('id', executionId).eq('status', 'pending_confirmation')
}

/** Convention: tool name "update_menu_item" maps to handler "updateMenuItem". */
function toHandlerName(toolName: string): string {
  return toolName.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

// ─── Active conversation lookup ───────────────────────────────────

export async function getOrStartActiveConversation(args: {
  clientId: string
  startedBy: string | null
}): Promise<{ id: string; isNew: boolean }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_conversations')
    .select('id')
    .eq('client_id', args.clientId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) return { id: data.id as string, isNew: false }
  const { id } = await startConversation(args)
  return { id, isNew: true }
}

// Re-export so callers have a single place to import from.
export { loadEnabledToolsForClient }
