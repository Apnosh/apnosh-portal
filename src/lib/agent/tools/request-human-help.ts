/**
 * Tool: request_human_help
 *
 * Lets the agent escalate to a human technician when the owner's
 * request is out of scope for what the agent can / should do.
 * Creates a row in content_queue (the existing change-request inbox)
 * tagged source='ai_escalation' so strategists can triage agent
 * escalations distinctly from owner-filed requests.
 *
 * The agent should call this when:
 *   - No tool covers the request ("redesign my homepage" → human)
 *   - Owner explicitly asks for a human
 *   - High-stakes judgment is needed (legal copy, sensitive PR)
 *   - The agent has tried and failed twice
 *
 * Non-destructive (it just files a ticket), but requires_confirmation
 * so the owner can confirm what's being asked.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface RequestHumanHelpInput {
  summary: string                  // 1-line summary of what the owner needs
  details?: string                 // Optional longer description / context
  urgency?: 'low' | 'medium' | 'high'
  category?:
    | 'website_change'
    | 'new_page'
    | 'design_help'
    | 'copywriting'
    | 'photo_shoot'
    | 'integration_issue'
    | 'billing'
    | 'other'
}

export const REQUEST_HUMAN_HELP_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      maxLength: 200,
      description: 'One-sentence summary of what the owner needs help with.',
    },
    details: {
      type: 'string',
      maxLength: 2000,
      description: 'Longer description with context (what they tried, why this is needed, deadlines, etc.).',
    },
    urgency: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'How time-sensitive this is. Default low.',
    },
    category: {
      type: 'string',
      enum: ['website_change', 'new_page', 'design_help', 'copywriting', 'photo_shoot', 'integration_issue', 'billing', 'other'],
      description: 'Best-fit category so the strategist team can route it.',
    },
  },
  required: ['summary'],
  additionalProperties: false,
} as const

export interface RequestHumanHelpOutput {
  request_id: string
  message_to_owner: string
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<RequestHumanHelpOutput> {
  const input = rawInput as RequestHumanHelpInput
  const admin = createAdminClient()

  const description = [
    `[AI escalation] ${input.summary}`,
    input.urgency ? `Urgency: ${input.urgency}` : null,
    input.category ? `Category: ${input.category}` : null,
    input.details ? `\nDetails:\n${input.details}` : null,
    ctx.conversationId ? `\nConversation: ${ctx.conversationId}` : null,
  ].filter(Boolean).join('\n')

  const { data: inserted, error } = await admin
    .from('content_queue')
    .insert({
      client_id: ctx.clientId,
      request_type: 'client_request',
      submitted_by: 'ai',
      input_text: description,
      service_area: input.category === 'billing' ? 'social' : 'website',
      size: 'feed',
      status: 'new',
      drafts: [],
    })
    .select('id')
    .single()

  if (error || !inserted) {
    throw new Error(`Failed to create help request: ${error?.message ?? 'unknown'}`)
  }

  // Also flip the conversation status to escalated so the chat UI
  // shows the right banner.
  if (ctx.conversationId) {
    await admin.from('agent_conversations').update({
      status: 'escalated',
      escalation_request_id: inserted.id,
    }).eq('id', ctx.conversationId)
  }

  return {
    request_id: inserted.id as string,
    message_to_owner: `Got it — I've passed this to your account manager (${input.urgency === 'high' ? 'high urgency, expect a reply within a few hours' : 'they typically reply within 1 business day'}). I'll be quiet while they pick it up so you don't get duplicate messages.`,
  }
}

registerToolHandler('requestHumanHelp', handler as never)
