/**
 * Checkout Gates — read a campaign's gate config (Phase 4a). Resolves the gates jsonb for a catalog
 * item id: built-in campaigns store it on catalog_content_overrides.gates; admin-created DB campaigns
 * on catalog_campaigns.gates. Server-only. Degrades to null on any failure (missing column pre-218,
 * unknown id) so the checkout falls back to the smart-default gate resolution.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanGatesConfig, resolveGates, type AssetFacts, type CampaignGatesConfig, type ResolvedGates } from './config'
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

/** What we already know about this buyer, so the asset gates never re-ask what's on file.
 *  Best-effort: any read failure just means the question gets asked (honest, never wrong). */
async function assetFactsForClient(clientId: string | undefined): Promise<AssetFacts> {
  if (!clientId) return {}
  const admin = createAdminClient()
  const facts: AssetFacts = {}
  try {
    const [bizRes, chanRes] = await Promise.all([
      admin.from('businesses').select('website_url').eq('client_id', clientId).maybeSingle(),
      admin.from('channel_connections').select('channel').eq('client_id', clientId).eq('channel', 'google_business_profile').eq('status', 'active').limit(1),
    ])
    const url = (bizRes.data as { website_url?: string | null } | null)?.website_url
    if (typeof url === 'string' && url.trim()) facts.hasWebsite = true
    if (((chanRes.data ?? []) as unknown[]).length > 0) facts.gbpConnected = true
  } catch { /* ask instead of assume */ }
  return facts
}

/** Resolve the enforceable pre-checkout gates for a draft, applying its source campaign's config
 *  plus the smart-default asset checks (skipping what the client's own records already answer). */
export async function resolveGatesForDraft(draft: Pick<CampaignDraft, 'items' | 'brief' | 'sourceCatalogId' | 'sourceCatalogIds'>, opts?: { clientId?: string }): Promise<ResolvedGates> {
  const [config, facts] = await Promise.all([
    getGatesConfig(draft.sourceCatalogId),
    assetFactsForClient(opts?.clientId),
  ])
  return resolveGates(draft, config, facts)
}
