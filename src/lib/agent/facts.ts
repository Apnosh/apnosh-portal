/**
 * Client knowledge base helpers.
 *
 * Facts are key-value pairs with provenance. Each fact has a source
 * ('onboarding' vs 'extracted' vs 'owner_stated' etc.) and a
 * confidence score (0-1). The agent uses confidence + source to
 * decide whether to trust a fact or ask the owner to confirm.
 *
 * Conventions:
 *   - Use FACT_KEYS constants for standard keys (see types.ts)
 *   - Higher confidence wins on write conflicts (so 'owner_stated'
 *     at 1.0 always beats 'extracted' at 0.7)
 *   - Values are jsonb; cast at the call site
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ClientFact, FactSource } from './types'

export async function setFact(args: {
  clientId: string
  key: string
  value: unknown
  source: FactSource
  sourceRef?: Record<string, unknown>
  confidence?: number
}): Promise<void> {
  const admin = createAdminClient()
  const newConfidence = args.confidence ?? defaultConfidenceForSource(args.source)

  // Conflict-aware write: only update if the new fact's confidence
  // beats whatever's there. This means a low-confidence cron refresh
  // won't clobber an owner_stated fact.
  const { data: existing } = await admin
    .from('client_facts')
    .select('confidence, source')
    .eq('client_id', args.clientId)
    .eq('fact_key', args.key)
    .maybeSingle()

  if (existing) {
    const existingConfidence = existing.confidence as number
    // Owner statements always win regardless of confidence math.
    const ownerOverride = args.source === 'owner_stated' && existing.source !== 'owner_stated'
    if (!ownerOverride && newConfidence < existingConfidence) {
      // Refresh last_verified_at so the cron knows the source is still saying the same thing.
      await admin.from('client_facts').update({
        last_verified_at: new Date().toISOString(),
      }).eq('client_id', args.clientId).eq('fact_key', args.key)
      return
    }
  }

  await admin.from('client_facts').upsert({
    client_id: args.clientId,
    fact_key: args.key,
    fact_value: args.value,
    source: args.source,
    source_ref: args.sourceRef ?? null,
    confidence: newConfidence,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,fact_key' })
}

export async function getFact<T = unknown>(
  clientId: string,
  key: string,
): Promise<T | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_facts')
    .select('fact_value')
    .eq('client_id', clientId)
    .eq('fact_key', key)
    .maybeSingle()
  return (data?.fact_value as T) ?? null
}

export async function listFacts(
  clientId: string,
  options: { prefix?: string; minConfidence?: number } = {},
): Promise<ClientFact[]> {
  const admin = createAdminClient()
  let query = admin
    .from('client_facts')
    .select('*')
    .eq('client_id', clientId)
  if (options.minConfidence != null) {
    query = query.gte('confidence', options.minConfidence)
  }
  if (options.prefix) {
    query = query.like('fact_key', `${options.prefix}%`)
  }
  const { data } = await query.order('fact_key', { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    clientId: r.client_id as string,
    factKey: r.fact_key as string,
    factValue: r.fact_value,
    source: r.source as FactSource,
    sourceRef: (r.source_ref as Record<string, unknown> | null) ?? null,
    confidence: r.confidence as number,
    lastVerifiedAt: r.last_verified_at as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

/**
 * Render the client's fact graph as a string the LLM can ingest as
 * context. Excludes low-confidence facts to keep tokens tight.
 */
export async function renderFactsForPrompt(
  clientId: string,
  minConfidence = 0.5,
): Promise<string> {
  const facts = await listFacts(clientId, { minConfidence })
  if (facts.length === 0) return '(no client facts on file yet)'
  const lines = facts.map(f => {
    const value = typeof f.factValue === 'string'
      ? f.factValue
      : JSON.stringify(f.factValue)
    const conf = f.confidence < 0.9 ? ` [confidence ${(f.confidence * 100).toFixed(0)}%]` : ''
    return `  ${f.factKey}: ${value}${conf}`
  })
  return lines.join('\n')
}

function defaultConfidenceForSource(source: FactSource): number {
  switch (source) {
    case 'owner_stated': return 1.0
    case 'strategist':   return 0.95
    case 'platform':     return 0.95   // came from the platform's own API
    case 'onboarding':   return 0.9
    case 'cron':         return 0.85
    case 'extracted':    return 0.7
    case 'conversation': return 0.6
  }
}
