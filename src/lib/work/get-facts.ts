/**
 * Server-side reads for the client_knowledge_facts table. RLS scopes
 * the result — strategist sees facts for assigned clients, admin
 * sees everything, client sees their own.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  type FactCategory, type FactConfidence, type FactSource,
} from './fact-types'

// Re-export so callers can `import { FactCategory } from '@/lib/work/get-facts'`
// without knowing about the split. Server callers get types; client callers
// import from './fact-types' directly to avoid pulling in supabase/server.
export type { FactCategory, FactConfidence, FactSource } from './fact-types'
export { FACT_CATEGORIES, FACT_CATEGORY_LABELS } from './fact-types'

export interface FactRow {
  id: string
  clientId: string
  category: FactCategory
  fact: string
  source: FactSource
  confidence: FactConfidence
  recordedBy: string | null
  recordedAt: string
  active: boolean
}

export async function getClientFacts(clientId: string, opts: { activeOnly?: boolean } = {}): Promise<FactRow[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('client_knowledge_facts')
    .select('id, client_id, category, fact, source, confidence, recorded_by, recorded_at, active')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false })
    .limit(500)

  if (opts.activeOnly !== false) {
    q = q.eq('active', true)
  }

  const { data, error } = await q
  if (error || !data) return []

  return data.map(d => ({
    id: d.id as string,
    clientId: d.client_id as string,
    category: d.category as FactCategory,
    fact: d.fact as string,
    source: d.source as FactSource,
    confidence: (d.confidence as FactConfidence) ?? 'medium',
    recordedBy: (d.recorded_by as string) ?? null,
    recordedAt: (d.recorded_at as string) ?? new Date().toISOString(),
    active: Boolean(d.active),
  }))
}
