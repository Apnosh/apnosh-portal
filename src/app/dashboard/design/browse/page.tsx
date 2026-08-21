/**
 * /dashboard/design/browse — the store's Graphics section (P2 of the catalog
 * decision). Pure registry render; tapping a tile opens the order flow with
 * the type pre-selected via ?job=.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import GraphicsBrowse from '@/components/design/graphics-browse'

export const dynamic = 'force-dynamic'

export default function DesignBrowsePage() {
  return (
    <MvpShell active="campaigns">
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100%' }}>
        <GraphicsBrowse />
      </div>
    </MvpShell>
  )
}
