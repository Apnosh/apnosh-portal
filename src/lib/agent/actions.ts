'use server'

/**
 * Server actions the chat UI calls.
 *
 * Thin wrappers around the runtime + conversation manager. Each action
 * resolves the calling user to a client (via the existing portal auth)
 * and never lets cross-client traffic happen.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
// Import tools to register handlers. NEW tools must be added here.
import '@/lib/agent/tools/update-menu-item'
import { runAgentTurn, type AgentTurnResult } from './runtime'
import {
  getOrStartActiveConversation, loadConversationTurns,
  confirmAndExecute, cancelExecution,
} from './conversation'
import type { ConversationTurn } from './types'

async function requireClientContext(): Promise<{ userId: string; clientId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
  if (biz?.client_id) return { userId: user.id, clientId: biz.client_id }
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (cu?.client_id) return { userId: user.id, clientId: cu.client_id }
  return { error: 'No client context' }
}

// ─── Conversation lifecycle ───────────────────────────────────────

export interface SerializedTurn {
  id: string
  role: ConversationTurn['role']
  text: string | null
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null
  toolCallId: string | null
  createdAt: string
}

export interface ChatState {
  conversationId: string
  turns: SerializedTurn[]
  pendingExecutions: Array<{
    id: string
    toolName: string
    toolDescription: string
    destructive: boolean
    input: unknown
  }>
}

export async function getOrStartChat(): Promise<
  { success: true; data: ChatState } | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const { id: conversationId } = await getOrStartActiveConversation({
    clientId: ctx.clientId,
    startedBy: ctx.userId,
  })

  const turns = await loadConversationTurns(conversationId)
  const pending = await loadPendingExecutions(conversationId)

  return {
    success: true,
    data: {
      conversationId,
      turns: turns.map(serializeTurn),
      pendingExecutions: pending,
    },
  }
}

export async function sendMessage(args: {
  conversationId: string
  text: string
}): Promise<
  | { success: true; result: AgentTurnResult; turns: SerializedTurn[] }
  | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  if (!args.text.trim()) return { success: false, error: 'Message is empty' }

  // Verify conversation belongs to this client.
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('agent_conversations')
    .select('client_id')
    .eq('id', args.conversationId)
    .maybeSingle()
  if (!conv || conv.client_id !== ctx.clientId) {
    return { success: false, error: 'Conversation not found' }
  }

  try {
    const result = await runAgentTurn({
      conversationId: args.conversationId,
      clientId: ctx.clientId,
      userMessage: args.text,
    })
    const turns = (await loadConversationTurns(args.conversationId)).map(serializeTurn)
    revalidatePath('/dashboard')
    return { success: true, result, turns }
  } catch (err) {
    return { success: false, error: `Agent error: ${(err as Error).message}` }
  }
}

export async function confirmPendingExecution(executionId: string): Promise<
  { success: true; turns: SerializedTurn[] } | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  const { data: exec } = await admin
    .from('agent_tool_executions')
    .select('client_id, conversation_id')
    .eq('id', executionId)
    .maybeSingle()
  if (!exec || exec.client_id !== ctx.clientId) {
    return { success: false, error: 'Execution not found' }
  }

  const res = await confirmAndExecute({ executionId, actingAsStrategistId: null })
  if (!res.ok) return { success: false, error: res.error }

  // Feed the tool result back into the agent so it can respond.
  if (exec.conversation_id) {
    // The result was already appended as a tool-role turn by
    // confirmAndExecute. Trigger one more agent turn to let it
    // summarize / continue.
    try {
      await runAgentTurn({
        conversationId: exec.conversation_id as string,
        clientId: ctx.clientId,
        userMessage: '(tool execution completed -- continue)',
      })
    } catch (err) {
      console.error('[confirmPendingExecution] follow-up turn failed:', (err as Error).message)
    }
  }

  const turns = exec.conversation_id
    ? (await loadConversationTurns(exec.conversation_id as string)).map(serializeTurn)
    : []
  return { success: true, turns }
}

export async function cancelPendingExecution(executionId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  const { data: exec } = await admin
    .from('agent_tool_executions')
    .select('client_id')
    .eq('id', executionId)
    .maybeSingle()
  if (!exec || exec.client_id !== ctx.clientId) {
    return { success: false, error: 'Execution not found' }
  }
  await cancelExecution(executionId)
  return { success: true }
}

export async function escalateConversation(args: {
  conversationId: string
  reason: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('agent_conversations')
    .select('client_id, summary')
    .eq('id', args.conversationId)
    .maybeSingle()
  if (!conv || conv.client_id !== ctx.clientId) {
    return { success: false, error: 'Conversation not found' }
  }
  await admin.from('agent_conversations').update({
    status: 'escalated',
    ended_at: new Date().toISOString(),
    summary: args.reason || conv.summary,
  }).eq('id', args.conversationId)
  return { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────

function serializeTurn(t: ConversationTurn): SerializedTurn {
  // Display text: assistant + user are strings; everything else stringifies.
  let text: string | null = null
  if (t.role === 'user' || t.role === 'assistant') {
    text = typeof t.content === 'string' ? t.content : null
  } else if (t.role === 'tool') {
    text = typeof t.content === 'string' ? t.content : JSON.stringify(t.content)
  }
  return {
    id: t.id,
    role: t.role,
    text,
    toolCalls: t.toolCalls,
    toolCallId: t.toolCallId,
    createdAt: t.createdAt,
  }
}

async function loadPendingExecutions(conversationId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_tool_executions')
    .select('id, tool_name, input, status')
    .eq('conversation_id', conversationId)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as Array<{ id: string; tool_name: string; input: unknown; status: string }>
  if (rows.length === 0) return []

  // Decorate with tool descriptions + destructive flag.
  const { data: toolMeta } = await admin
    .from('agent_tools')
    .select('name, description, destructive')
    .in('name', rows.map(r => r.tool_name))
    .is('retired_at', null)
  const meta = new Map((toolMeta ?? []).map(m => [m.name as string, m]))
  return rows.map(r => {
    const m = meta.get(r.tool_name) as { description: string; destructive: boolean } | undefined
    return {
      id: r.id,
      toolName: r.tool_name,
      toolDescription: m?.description ?? r.tool_name,
      destructive: m?.destructive ?? true,
      input: r.input,
    }
  })
}
