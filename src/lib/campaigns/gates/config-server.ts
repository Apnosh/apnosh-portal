/**
 * Checkout Gates — read a campaign's gate config (Phase 4a). Resolves the gates jsonb for a catalog
 * item id: built-in campaigns store it on catalog_content_overrides.gates; admin-created DB campaigns
 * on catalog_campaigns.gates. Server-only. Degrades to null on any failure (missing column pre-218,
 * unknown id) so the checkout falls back to the smart-default gate resolution.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanGatesConfig, resolveGates, type CampaignGatesConfig, type ResolvedGates } from './config'
import type { CampaignDraft } from '../types'

/** The stored gate config for a catalog item id (built-in override first, then DB campaign). Null when
 *  none / on any failure. */
export async function getGatesConfig(sourceCatalogId: string | null | undefined): Promise<CampaignGatesConfig | null> {
  if (!sourceCatalogId) return null
  const admin = createAdminClient()
  // Built-in campaign override.
  try {
    const { data, error } = await admin.from('catalog_content_overrides').select('gates').eq('item_id', sourceCatalogId).maybeSingle()
    if (!error && data && (data as { gates?: unknown }).gates != null) {
      const cfg = cleanGatesConfig((data as { gates?: unknown }).gates)
      if (cfg) return cfg
    }
  } catch { /* fall through */ }
  // Admin-created DB campaign.
  try {
    const { data, error } = await admin.from('catalog_campaigns').select('gates').eq('id', sourceCatalogId).maybeSingle()
    if (!error && data && (data as { gates?: unknown }).gates != null) {
      const cfg = cleanGatesConfig((data as { gates?: unknown }).gates)
      if (cfg) return cfg
    }
  } catch { /* fall through */ }
  return null
}

/** Resolve the enforceable pre-checkout gates for a draft, applying its source campaign's config. */
export async function resolveGatesForDraft(draft: Pick<CampaignDraft, 'items' | 'brief' | 'sourceCatalogId'>): Promise<ResolvedGates> {
  const config = await getGatesConfig(draft.sourceCatalogId)
  return resolveGates(draft, config)
}
