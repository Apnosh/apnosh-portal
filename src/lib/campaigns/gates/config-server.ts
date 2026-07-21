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
  const gates = resolveGates(draft, config, facts)

  // An asset gate protects a PURCHASE. It exists so we never take money for work that
  // cannot be delivered, and so a plan does not ship to a team that will be blocked.
  //
  // An owner-run plan is neither. Nothing is charged, no work order is minted, and the
  // owner does the work themselves against their own systems. If it turns out they have
  // no ordering page, they find that out in a minute at no cost, which is exactly what
  // self-serve is for. Asking them to qualify first is a checkout question with no
  // checkout behind it.
  //
  // So: when every line the owner is buying is owner-run, the asset gates drop. Custom
  // gates set by an admin stay, since those are deliberate per-campaign asks, and the
  // booking gate stays because a shoot is a real appointment either way.
  const live = (draft.items ?? []).filter((it) => it.included && !it.optOut)
  const allOwnerRun = live.length > 0 && live.every((it) => it.producer === 'diy')
  if (!allOwnerRun) return gates
  return { ...gates, custom: gates.custom.filter((g) => !g.id.startsWith('asset-')) }
}
