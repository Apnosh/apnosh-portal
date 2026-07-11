/**
 * /dashboard/google-profile — "Fix your Google profile", the owner-facing
 * section-by-section walkthrough of the read-only GBP diagnosis. Two doors:
 *  - plain (no params): the standalone checker, reached from More (prod legacy).
 *  - ?campaignId=<id>: a CAMPAIGN task (the gbp card's free self-serve version).
 *    Back returns to that campaign's setup page, and an all-good fresh diagnosis
 *    marks the campaign task done (GbpFixer POSTs /api/campaigns/:id/gbp-fixed;
 *    the server re-checks and stamps execution.gbpFixedAt itself).
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import GbpFixer from '@/components/mvp/gbp-fixer'
import { getCampaign } from '@/lib/campaigns/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'

/**
 * Resolve the walkthrough mode SERVER-SIDE for a campaign task, from the stored lane
 * AND the live client tier — never from a URL param. The line's ownerMode records which
 * owner-run lane the owner picked at ship ('diy' checklist vs 'ai' drafts). AI is served
 * ONLY when the stored lane is 'ai' AND the client is still Pro (a downgrade since ship
 * falls back to the checklist). Anything else — legacy line with no mode, a diy lane, a
 * missing campaign — resolves to the checklist.
 */
async function resolveCampaignMode(campaignId: string): Promise<'diy' | 'ai'> {
  const campaign = await getCampaign(campaignId).catch(() => null)
  if (!campaign) return 'diy'
  const gbpLine = (campaign.draft.items ?? []).find((it) => it.serviceId === 'gbp-setup' && it.producer === 'diy')
  if (gbpLine?.ownerMode !== 'ai') return 'diy'
  // Stored lane is 'ai' — re-check the LIVE tier so a downgrade never keeps serving AI.
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select('tier').eq('id', campaign.clientId).maybeSingle()
  return isProTier((data as { tier?: string | null } | null)?.tier) ? 'ai' : 'diy'
}

export default async function GoogleProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  // Sanitize before it lands in an href/API path — ids are uuid-shaped, nothing else passes.
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  // Campaign task: mode is the SERVER's call (stored lane × live tier). Standalone/legacy door
  // (no campaignId): 'ai' by default, but the fixer still gates the draft buttons on the live
  // tier via useClient, so a non-Pro owner there sees the checklist, never a button that 403s.
  const mode = campaignId ? await resolveCampaignMode(campaignId) : 'ai'
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title={campaignId ? 'Fix your Google profile' : 'Your Google helper'}
          subtitle={campaignId ? 'What Google shows customers today' : 'Your profile and your reviews, one place'}
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <GbpFixer campaignId={campaignId} mode={mode} />
    </MvpShell>
  )
}
