'use server'

/**
 * Server actions for the AI Marketing Operator approval workflow.
 *
 * Public actions:
 *   - runAnalysisAction(clientId)   -- trigger an analysis pass on demand
 *   - listProposals(clientId)       -- proposal queue for the admin UI
 *   - approveProposal(proposalId)   -- approve + execute via client_updates
 *   - rejectProposal(proposalId)    -- reject with optional reason
 *   - listAgentRuns(clientId)       -- audit trail
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { analyzeClient } from './analyze'
import { createUpdate, publishUpdate } from '@/lib/updates/actions'
import type { UpdateType, FanoutTarget, UpdatePayload } from '@/lib/updates/types'
import type { AgentRun, ProposedAction } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }
  return { ok: true, userId: user.id }
}

// ────────────────────────────────────────────────────────────────
// runAnalysisAction -- trigger an analysis pass
// ────────────────────────────────────────────────────────────────

export async function runAnalysisAction(clientId: string): Promise<
  | { success: true; data: { agentRunId: string; proposalCount: number; summary: string; costUsd: number } }
  | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const result = await analyzeClient({
    clientId,
    triggeredBy: 'manual',
    runType: 'manual',
    userId: auth.userId,
  })

  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/admin/clients/${clientId}`)
  return {
    success: true,
    data: {
      agentRunId: result.agentRunId,
      proposalCount: result.proposalCount,
      summary: result.summary,
      costUsd: result.costUsd,
    },
  }
}

// ────────────────────────────────────────────────────────────────
// listProposals + listAgentRuns -- read for admin UI
// ────────────────────────────────────────────────────────────────

export async function listProposals(clientId: string): Promise<
  { success: true; data: ProposedAction[] } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data, error } = await db
    .from('proposed_actions')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map(rowToProposal),
  }
}

export async function listAgentRuns(clientId: string): Promise<
  { success: true; data: AgentRun[] } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data, error } = await db
    .from('agent_runs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map(rowToRun),
  }
}

// ────────────────────────────────────────────────────────────────
// approveProposal -- creates a client_updates row + publishes
// ────────────────────────────────────────────────────────────────

export async function approveProposal(proposalId: string, options?: {
  publishImmediately?: boolean
}): Promise<{ success: true; data: { updateId?: string } } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: proposal, error: pErr } = await db
    .from('proposed_actions').select('*').eq('id', proposalId).maybeSingle()
  if (pErr || !proposal) return { success: false, error: pErr?.message ?? 'Proposal not found' }
  if (proposal.status !== 'pending') {
    return { success: false, error: `Cannot approve proposal in status: ${proposal.status}` }
  }

  // Mark approved
  await db.from('proposed_actions').update({
    status: 'approved',
    approved_by: auth.userId,
    approved_at: new Date().toISOString(),
  }).eq('id', proposalId)

  // 'social_post' type doesn't have a corresponding client_updates type yet
  // so we skip executing it for now -- remains in 'approved' state until
  // social publishing is implemented.
  if (proposal.type === 'social_post') {
    revalidatePath(`/admin/clients/${proposal.client_id}`)
    return { success: true, data: {} }
  }

  // For all other types, create a client_updates row and optionally publish
  const updateType = proposal.type as UpdateType
  const targets = (proposal.targets as FanoutTarget[]) ?? []
  const payload = proposal.payload as UpdatePayload['data']

  const created = await createUpdate({
    clientId: proposal.client_id as string,
    locationId: (proposal.location_id as string | null) ?? null,
    type: updateType,
    payload,
    targets,
    scheduledFor: proposal.scheduled_for as string | null,
    summary: `${proposal.summary as string} (AI-proposed)`,
  })
  if (!created.success) return { success: false, error: created.error }

  let updateId = created.data.id

  if (options?.publishImmediately !== false) {
    const published = await publishUpdate(created.data.id)
    if (!published.success) {
      return { success: false, error: published.error }
    }
  }

  // Link the proposal to the resulting update
  await db.from('proposed_actions').update({
    status: 'executed',
    executed_at: new Date().toISOString(),
    executed_update_id: updateId,
  }).eq('id', proposalId)

  revalidatePath(`/admin/clients/${proposal.client_id}`)
  return { success: true, data: { updateId } }
}

// ────────────────────────────────────────────────────────────────
// rejectProposal
// ────────────────────────────────────────────────────────────────

export async function rejectProposal(proposalId: string, reason?: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: proposal } = await db
    .from('proposed_actions').select('client_id, status').eq('id', proposalId).maybeSingle()
  if (!proposal) return { success: false, error: 'Proposal not found' }
  if (proposal.status !== 'pending') {
    return { success: false, error: `Cannot reject proposal in status: ${proposal.status}` }
  }

  const { error } = await db.from('proposed_actions').update({
    status: 'rejected',
    rejection_reason: reason ?? null,
    approved_by: auth.userId, // store who actioned it
    approved_at: new Date().toISOString(),
  }).eq('id', proposalId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/clients/${proposal.client_id}`)
  return { success: true }
}

// ────────────────────────────────────────────────────────────────
// Row -> domain mapping
// ────────────────────────────────────────────────────────────────

function rowToProposal(row: Record<string, unknown>): ProposedAction {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    agentRunId: (row.agent_run_id as string | null) ?? null,
    locationId: (row.location_id as string | null) ?? null,
    type: row.type as ProposedAction['type'],
    payload: row.payload as ProposedAction['payload'],
    targets: ((row.targets as FanoutTarget[]) ?? []),
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    summary: row.summary as string,
    reasoning: (row.reasoning as string | null) ?? null,
    confidenceScore: (row.confidence_score as number | null) ?? null,
    category: (row.category as ProposedAction['category']) ?? null,
    status: row.status as ProposedAction['status'],
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    executedAt: (row.executed_at as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    executedUpdateId: (row.executed_update_id as string | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

function rowToRun(row: Record<string, unknown>): AgentRun {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    runType: row.run_type as AgentRun['runType'],
    triggeredBy: row.triggered_by as AgentRun['triggeredBy'],
    status: row.status as AgentRun['status'],
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    inputTokens: (row.input_tokens as number | null) ?? null,
    outputTokens: (row.output_tokens as number | null) ?? null,
    costUsd: (row.cost_usd as number | null) ?? null,
    createdAt: row.created_at as string,
  }
}
