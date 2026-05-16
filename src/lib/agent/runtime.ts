/**
 * Agent runtime: the loop that turns "user said something" into
 * "assistant responded + maybe staged some tool calls for confirmation".
 *
 * Called from server actions in /lib/agent/actions.ts. Stays pure of
 * Next.js / React; only talks to Supabase + Anthropic.
 *
 * Lifecycle per call:
 *   1. Append the user's message as a turn
 *   2. Load: active prompt (system + model), client facts, enabled tools, recent turns
 *   3. Call Claude with messages-so-far + tools
 *   4. Persist usage/cost on the assistant turn
 *   5. If response is plain text -> append assistant turn, return text + no pending tools
 *   6. If response has tool_use blocks:
 *      a. For destructive tools -> create pending_confirmation tool_execution rows
 *         (don't run yet -- UI shows preview, user confirms)
 *      b. For non-destructive tools -> create + execute immediately,
 *         feed result back into the loop, recurse once
 *   7. Append assistant turn (with the tool_calls), return text + pending tool executions
 *
 * Auto-loop is capped at 5 iterations to prevent runaway tool-chaining.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AgentToolDefinition, ToolExecutionContext } from './types'
import {
  appendUserTurn, appendAssistantTurn, appendToolResultTurn,
  createPendingExecution, loadConversationTurns, loadEnabledToolsForClient,
} from './conversation'
import { loadClientContext } from './context-loader'
import { getToolHandler, toAnthropicTools } from './registry'

const anthropic = new Anthropic()

const MAX_TOOL_ITERATIONS = 5

interface ActivePrompt {
  version: number
  model: string
  systemText: string
}

async function loadActivePrompt(slot = 'main_agent'): Promise<ActivePrompt> {
  const admin = createAdminClient()
  const { data } = await admin.from('agent_prompts')
    .select('version, model, system_text')
    .eq('slot', slot)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) throw new Error(`No active prompt for slot ${slot}`)
  return {
    version: data.version as number,
    model: data.model as string,
    systemText: data.system_text as string,
  }
}

async function loadClientTier(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
  return (data?.tier as string | undefined) ?? 'Basic'
}

// ─── Public entry point ───────────────────────────────────────────

export interface AgentTurnResult {
  /** The assistant's final text to render in the chat. */
  text: string | null
  /** Tool executions awaiting the user's confirmation. UI renders previews. */
  pendingExecutions: Array<{
    id: string
    toolName: string
    toolDescription: string
    destructive: boolean
    input: unknown
  }>
  /** True if the agent escalated. UI shows the "human will follow up" state. */
  escalated: boolean
  /** Token usage for analytics + cost tracking. */
  usage: {
    inputTokens: number
    outputTokens: number
    iterations: number
  }
}

export async function runAgentTurn(args: {
  conversationId: string
  clientId: string
  /* The new user message. When omitted, we don't append anything new
     and just let Claude respond to whatever's already in the message
     history -- used for follow-up turns after a confirmation, where
     the tool_result is already in the DB and Claude just needs to
     summarize. */
  userMessage?: string
}): Promise<AgentTurnResult> {
  // Append the user turn first so it's persisted even if Claude errors.
  if (args.userMessage) {
    await appendUserTurn(args.conversationId, args.userMessage)
  }

  const [prompt, context, tools, tier] = await Promise.all([
    loadActivePrompt('main_agent'),
    loadClientContext(args.clientId),
    loadClientTier(args.clientId).then(t => loadEnabledToolsForClient(args.clientId, t)),
    loadClientTier(args.clientId),
  ])
  void tier

  const toolByName = new Map(tools.map(t => [t.name, t]))
  const anthropicTools = toAnthropicTools(tools)

  // Build messages from the conversation history.
  const turns = await loadConversationTurns(args.conversationId)
  const messages = turnsToAnthropicMessages(turns)

  const systemFull = [
    prompt.systemText.trim(),
    '',
    '────────────────────────────────────────────────────────────',
    '## CLIENT SNAPSHOT (fresh as of this turn)',
    '────────────────────────────────────────────────────────────',
    context.text,
    '────────────────────────────────────────────────────────────',
    '',
    `Reasoning guidance:`,
    `- ALWAYS ground your responses in the client snapshot above. Cite specific items (e.g. "your Banh Mi Combo is $12.99") instead of generic advice.`,
    `- If the owner asks for a recommendation, reference their actual menu, recent activity, and connected channels -- not generic restaurant advice.`,
    `- For metrics questions, call search_business_data for fresh numbers; the snapshot's 7-day perf is just a hint.`,
    `- When you need to make a change, call the appropriate tool. Destructive tools show the owner a preview; you don't need to ask "are you sure?" yourself.`,
    `- Only call request_human_help when no tool covers the request or when human judgment is needed beyond your scope.`,
  ].join('\n')

  let totalIn = 0
  let totalOut = 0
  let iterations = 0
  const pendingExecutions: AgentTurnResult['pendingExecutions'] = []
  let lastAssistantText: string | null = null
  let escalated = false

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations += 1
    const t0 = Date.now()
    const response = await anthropic.messages.create({
      model: prompt.model,
      max_tokens: 2048,
      system: systemFull,
      tools: anthropicTools.length > 0
        ? anthropicTools as unknown as Anthropic.Tool[]
        : undefined,
      messages,
    })
    const latencyMs = Date.now() - t0
    totalIn += response.usage.input_tokens
    totalOut += response.usage.output_tokens

    // Pull text + tool_use blocks out of the response.
    const textBlocks: string[] = []
    const toolUses: Array<{ id: string; name: string; input: unknown }> = []
    for (const block of response.content) {
      if (block.type === 'text') textBlocks.push(block.text)
      else if (block.type === 'tool_use') {
        toolUses.push({ id: block.id, name: block.name, input: block.input })
      }
    }
    const assistantText = textBlocks.join('\n').trim()
    lastAssistantText = assistantText || lastAssistantText

    // Persist the assistant turn.
    const assistantTurn = await appendAssistantTurn(args.conversationId, {
      text: assistantText || null,
      toolCalls: toolUses.length > 0 ? toolUses : null,
      model: prompt.model,
      promptVersion: prompt.version,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
    })

    // Append to the in-memory message list so the next iteration sees it.
    messages.push({
      role: 'assistant',
      content: response.content as Anthropic.ContentBlockParam[],
    })

    // No tool calls -> we're done.
    if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
      break
    }

    // Process each tool call.
    const toolResultsForNextTurn: Anthropic.ToolResultBlockParam[] = []
    let anyDestructivePending = false

    for (const use of toolUses) {
      const tool = toolByName.get(use.name)
      if (!tool) {
        toolResultsForNextTurn.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Error: tool "${use.name}" is not available to this client.`,
          is_error: true,
        })
        continue
      }

      // Stage the tool execution. Destructive tools get a
      // pending_confirmation row + UI preview; non-destructive ones
      // we run inline and feed the result back to Claude.
      const exec = await createPendingExecution({
        conversationId: args.conversationId,
        turnId: assistantTurn.id,
        clientId: args.clientId,
        tool,
        input: use.input,
        toolUseId: use.id,
      })

      if (tool.requiresConfirmation || tool.destructive) {
        anyDestructivePending = true
        pendingExecutions.push({
          id: exec.id,
          toolName: tool.name,
          toolDescription: tool.description,
          destructive: tool.destructive,
          input: use.input,
        })
        // Don't add a tool_result block yet -- we'll wait for the user.
        // Claude doesn't get to continue in this same turn.
        toolResultsForNextTurn.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: 'Awaiting owner confirmation.',
        })

        // Special case: if the tool is the escalation tool, mark
        // the conversation escalated.
        if (tool.name === 'request_human_help') {
          escalated = true
        }
        continue
      }

      // Non-destructive tool: execute now and feed result back.
      const result = await runHandlerInline(tool, exec.id, args.clientId, args.conversationId, assistantTurn.id, use.input, use.id)
      toolResultsForNextTurn.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        is_error: false,
      })
    }

    // Feed tool results back into the conversation as a user-role
    // tool_result message (Anthropic's required format).
    messages.push({
      role: 'user',
      content: toolResultsForNextTurn,
    })

    // If any destructive tools are pending, stop -- the UI needs to
    // show previews and wait for confirmation. The next runAgentTurn
    // call (triggered after the user confirms) will feed the result
    // back into the loop.
    if (anyDestructivePending) break
  }

  return {
    text: lastAssistantText,
    pendingExecutions,
    escalated,
    usage: { inputTokens: totalIn, outputTokens: totalOut, iterations },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

async function runHandlerInline(
  tool: AgentToolDefinition,
  executionId: string,
  clientId: string,
  conversationId: string,
  turnId: string,
  input: unknown,
  toolUseId: string,
): Promise<unknown> {
  const admin = createAdminClient()
  const handler = getToolHandler(snakeToCamel(tool.handler))
  if (!handler) {
    await admin.from('agent_tool_executions').update({
      status: 'failed',
      failed_reason: `No registered handler for ${tool.handler}`,
    }).eq('id', executionId)
    return { error: `Tool ${tool.name} has no registered handler.` }
  }
  const ctx: ToolExecutionContext = {
    clientId,
    conversationId,
    turnId,
    executionId,
    capturePreviousState: async () => null,
    actingAsStrategistId: null,
  }
  try {
    const output = await handler(input, ctx)
    await admin.from('agent_tool_executions').update({
      status: 'executed',
      confirmed_by_user_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      output,
      event_payload: { client_id: clientId, tool: tool.name, version: tool.version, input, output },
    }).eq('id', executionId)
    if (conversationId) {
      /* Use Claude's tool_use_id so the persisted tool_result block
         matches its tool_use parent on the next message rebuild. */
      await appendToolResultTurn(conversationId, { toolCallId: toolUseId, result: output })
    }
    return output
  } catch (err) {
    const message = (err as Error).message
    await admin.from('agent_tool_executions').update({
      status: 'failed',
      failed_reason: message,
    }).eq('id', executionId)
    return { error: message }
  }
}

/**
 * Rebuild Anthropic's messages[] from our conversation_turns rows.
 * We store turns in our own schema; this maps them back to the format
 * Claude expects. Tool-result turns become user-role messages with a
 * tool_result content block (Anthropic's required shape).
 */
function turnsToAnthropicMessages(
  turns: Array<{ role: string; content: unknown; toolCalls: unknown; toolCallId: string | null }>,
): Anthropic.MessageParam[] {
  /* Strategy: we just persisted the user turn at the start of
     runAgentTurn, so it's in `turns`. For previous assistant turns we
     need to reconstruct the content array (text + tool_use blocks).
     For previous tool-result turns we wrap as user/tool_result. */
  const messages: Anthropic.MessageParam[] = []
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = []

  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      messages.push({ role: 'user', content: pendingToolResults })
      pendingToolResults = []
    }
  }

  for (const turn of turns) {
    if (turn.role === 'user') {
      flushToolResults()
      const text = typeof turn.content === 'string'
        ? turn.content
        : JSON.stringify(turn.content)
      messages.push({ role: 'user', content: text })
    } else if (turn.role === 'assistant') {
      flushToolResults()
      const blocks: Anthropic.ContentBlockParam[] = []
      if (typeof turn.content === 'string' && turn.content) {
        blocks.push({ type: 'text', text: turn.content })
      }
      if (Array.isArray(turn.toolCalls)) {
        for (const call of turn.toolCalls as Array<{ id: string; name: string; input: unknown }>) {
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.input as Record<string, unknown>,
          })
        }
      }
      if (blocks.length > 0) {
        messages.push({ role: 'assistant', content: blocks })
      }
    } else if (turn.role === 'tool') {
      if (!turn.toolCallId) continue
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: turn.toolCallId,
        content: typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content),
      })
    }
  }
  flushToolResults()
  return messages
}

function snakeToCamel(s: string): string {
  // Our convention is that agent_tools.handler is already camelCase
  // (e.g. "updateMenuItem"). This shim is a no-op for that case but
  // tolerates snake_case if anyone registers a tool that way.
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}
