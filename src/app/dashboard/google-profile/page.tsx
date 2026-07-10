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

export default async function GoogleProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.campaignId === 'string' ? sp.campaignId : undefined
  // Sanitize before it lands in an href/API path — ids are uuid-shaped, nothing else passes.
  const campaignId = raw && /^[A-Za-z0-9-]{1,64}$/.test(raw) ? raw : undefined
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Fix your Google profile"
          subtitle="What Google shows customers today"
          backHref={campaignId ? `/dashboard/campaigns/${campaignId}/ready` : '/dashboard/more'}
          backLabel={campaignId ? 'Campaign' : 'More'}
        />
      )}
    >
      <GbpFixer campaignId={campaignId} />
    </MvpShell>
  )
}
