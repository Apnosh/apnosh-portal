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
// Import tools to register handlers. NEW tools must be added here so
// their registerToolHandler() side-effect fires before any agent turn.
import '@/lib/agent/tools/update-menu-item'
import '@/lib/agent/tools/update-page-copy'
import '@/lib/agent/tools/update-hours'
import '@/lib/agent/tools/post-to-gbp'
import '@/lib/agent/tools/request-human-help'
import '@/lib/agent/tools/tag-photo'
import '@/lib/agent/tools/search-business-data'
import '@/lib/agent/tools/draft-review-response'
import '@/lib/agent/tools/generate-post-ideas'
import '@/lib/agent/tools/weekly-recap'
import { runAgentTurn, type AgentTurnResult } from './runtime'
import {
  getOrStartActiveConversation, loadConversationTurns,
  confirmAndExecute, cancelExecution,
} from './conversation'
import type { ConversationTurn } from './types'
import { checkAndEnforceLimits, getUsageSnapshot } from './limits'

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
  | { success: false; error: string; capReached?: boolean; capKind?: string }
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

  /* Hard cap enforcement happens BEFORE we burn any tokens. */
  const limit = await checkAndEnforceLimits(ctx.clientId)
  if (!limit.allowed) {
    return {
      success: false,
      error: limit.blockedReason ?? 'Usage cap reached',
      capReached: true,
      capKind: limit.blockedKind,
    }
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
  // The result was already appended as a tool-role turn by
  // confirmAndExecute -- we call runAgentTurn WITHOUT a userMessage
  // so Claude responds to the existing message history (which now
  // ends in the tool_result) instead of seeing a synthetic user
  // message in the chat.
  if (exec.conversation_id) {
    try {
      await runAgentTurn({
        conversationId: exec.conversation_id as string,
        clientId: ctx.clientId,
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

// ─── Photo upload ──────────────────────────────────────────────────

/**
 * Upload a photo into the client's asset library so it can be
 * referenced by tool calls (update_menu_item, post_to_gbp, etc.) in
 * subsequent agent turns. Returns the public URL the agent should
 * receive in its next message.
 *
 * Photos land in the `client-photos` storage bucket + a row in
 * `client_assets` tagged with the conversation id so the strategist
 * review queue can see what the owner shared.
 */
export async function uploadPhotoForAgent(args: {
  conversationId: string
  fileName: string
  contentType: string
  base64: string             // raw base64, no data: prefix
}): Promise<
  | { success: true; assetId: string; fileUrl: string; orientation: 'landscape' | 'portrait' | 'square' }
  | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  // Verify ownership of the conversation.
  const { data: conv } = await admin
    .from('agent_conversations')
    .select('client_id')
    .eq('id', args.conversationId)
    .maybeSingle()
  if (!conv || conv.client_id !== ctx.clientId) {
    return { success: false, error: 'Conversation not found' }
  }

  // Decode and upload.
  let buffer: Buffer
  try {
    buffer = Buffer.from(args.base64, 'base64')
  } catch (err) {
    return { success: false, error: `Bad base64: ${(err as Error).message}` }
  }
  // 10MB cap to keep this honest.
  if (buffer.length > 10 * 1024 * 1024) {
    return { success: false, error: 'Photo too large (max 10MB)' }
  }

  const ext = (args.fileName.split('.').pop() ?? 'jpg').toLowerCase()
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg'
  const path = `${ctx.clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

  const { error: upErr } = await admin.storage
    .from('client-photos')
    .upload(path, buffer, {
      contentType: args.contentType,
      upsert: false,
    })
  if (upErr) return { success: false, error: `Storage upload failed: ${upErr.message}` }

  const { data: urlData } = admin.storage.from('client-photos').getPublicUrl(path)
  const fileUrl = urlData.publicUrl

  // We don't have image dimensions server-side without pulling in a
  // codec library; mark orientation 'square' as a safe default. The
  // client UI can override via a follow-up update if needed.
  const orientation: 'landscape' | 'portrait' | 'square' = 'square'

  const { data: inserted, error: insErr } = await admin
    .from('client_assets')
    .insert({
      client_id: ctx.clientId,
      type: 'photo',
      file_url: fileUrl,
      filename: args.fileName,
      tags: ['from_agent_chat', `conversation:${args.conversationId}`],
      description: null,
      quality_rating: 'good',
      orientation,
      mood: 'casual',
      uploaded_by: 'client',
      uploaded_by_user_id: ctx.userId,
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { success: false, error: `Asset row insert failed: ${insErr?.message ?? 'unknown'}` }
  }

  return { success: true, assetId: inserted.id as string, fileUrl, orientation }
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

// ─── Judgment capture (AI-First Principle #3) ────────────────────

/**
 * One of the 8 AI-First Principles: every approve/revise/reject of an
 * AI output records a reason. We surface these as 1-tap chips on each
 * assistant turn. The tag set is short on purpose -- forced choice
 * gives us clean training data; a free-text "other" lets owners say
 * what doesn't fit.
 */
export type JudgmentTag =
  | 'helpful'              // 👍 catch-all positive
  | 'on_brand'             // captures voice well
  | 'specific'             // referenced our actual data
  | 'wrong_info'           // factual error or hallucination
  | 'off_brand'            // tone is off
  | 'too_generic'          // generic advice not specific to us
  | 'unhelpful'            // didn't address what I asked
  | 'too_long'
  | 'too_short'
  | 'other'

export async function judgeAssistantTurn(args: {
  turnId: string
  thumbs: 'up' | 'down'
  tags: JudgmentTag[]
  notes?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  /* Verify the turn belongs to this client (defense in depth -- the
     turn -> conversation -> client_id join). */
  const { data: turn } = await admin
    .from('agent_conversation_turns')
    .select('conversation_id, role')
    .eq('id', args.turnId)
    .maybeSingle()
  if (!turn) return { success: false, error: 'Turn not found' }
  if (turn.role !== 'assistant') return { success: false, error: 'Can only judge assistant turns' }

  const { data: conv } = await admin
    .from('agent_conversations')
    .select('client_id')
    .eq('id', turn.conversation_id)
    .maybeSingle()
  if (!conv || conv.client_id !== ctx.clientId) {
    return { success: false, error: 'Conversation not found' }
  }

  /* One rating per (turn, owner). Owners can change their mind. */
  const { error } = await admin.from('agent_evaluations').upsert({
    conversation_id: turn.conversation_id,
    turn_id: args.turnId,
    rater_type: 'owner',
    rater_id: ctx.userId,
    thumbs: args.thumbs,
    tags: args.tags,
    notes: args.notes ?? null,
    /* Map our user-friendly tags to the 1-5 scales for aggregate
       reporting. Owners aren't going to fill in 4 numeric scores;
       we derive them from tags so we still get the structured data
       the AI-First Principles expect. */
    overall: args.thumbs === 'up' ? 5 : 2,
    output_on_brand: args.tags.includes('off_brand') ? 2 : args.tags.includes('on_brand') ? 5 : null,
    understood_intent: args.tags.includes('unhelpful') ? 2 : args.tags.includes('specific') ? 5 : null,
  }, { onConflict: 'turn_id,rater_id' })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/** Forced reason tag when an owner cancels a pending tool execution. */
export type CancelReasonTag =
  | 'wrong_values'         // numbers/text wrong
  | 'not_what_i_asked'     // wrong action entirely
  | 'changed_my_mind'
  | 'will_do_myself'
  | 'other'

export async function cancelWithReason(args: {
  executionId: string
  reason: CancelReasonTag
  notes?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { data: exec } = await admin
    .from('agent_tool_executions')
    .select('client_id, conversation_id')
    .eq('id', args.executionId)
    .maybeSingle()
  if (!exec || exec.client_id !== ctx.clientId) {
    return { success: false, error: 'Execution not found' }
  }
  /* Mark the execution cancelled + persist the reason on its
     event_payload so the strategist review queue + future training
     can read it. */
  await admin.from('agent_tool_executions').update({
    status: 'cancelled',
    failed_reason: `Cancelled by owner: ${args.reason}${args.notes ? ` -- ${args.notes}` : ''}`,
  }).eq('id', args.executionId).in('status', ['pending_confirmation', 'confirmed'])

  /* Also record on agent_evaluations against the conversation so the
     cross-conversation view captures the pattern. */
  if (exec.conversation_id) {
    await admin.from('agent_evaluations').insert({
      conversation_id: exec.conversation_id,
      rater_type: 'owner',
      rater_id: ctx.userId,
      thumbs: 'down',
      tags: [args.reason],
      notes: args.notes ?? null,
      overall: 2,
    })
  }

  return { success: true }
}

// ─── Usage snapshot for the chat UI meter ──────────────────────────

export interface UsageMeter {
  tierLabel: string
  primaryLimitLabel: string | null
  /** 0..1 ratio of remaining capacity; null when no cap applies. */
  ratio: number | null
}

export async function getMyUsage(): Promise<
  { success: true; data: UsageMeter } | { success: false; error: string }
> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const snapshot = await getUsageSnapshot(ctx.clientId)
  return {
    success: true,
    data: {
      tierLabel: snapshot.tier.label,
      primaryLimitLabel: snapshot.primaryLimitLabel,
      ratio: snapshot.primaryLimitTotal != null && snapshot.primaryLimitRemaining != null
        ? snapshot.primaryLimitRemaining / snapshot.primaryLimitTotal
        : null,
    },
  }
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
