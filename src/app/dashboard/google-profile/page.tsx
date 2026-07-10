/**
 * /dashboard/google-profile — "Fix your Google profile", the owner-facing
 * section-by-section walkthrough of the read-only GBP diagnosis. Reached from
 * the More hub family; the component fetches for the signed-in client itself
 * (same useClient pattern as Orders).
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import GbpFixer from '@/components/mvp/gbp-fixer'

export default function GoogleProfilePage() {
  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Fix your Google profile" subtitle="What Google shows customers today" />}>
      <GbpFixer />
    </MvpShell>
  )
}
