/**
 * /dashboard/design/order — the graphic configurator, the real door (DESIGN-ORDERING Phase B).
 *
 * Reached from the store's "Get a graphic made" card. The menu chips are the signed-in
 * client's REAL menu items, and the photo step is the client's REAL library: Photos & files
 * uploads plus menu dish photos (client-photos.ts). Fixtures only ever appear in dev when
 * the account genuinely has nothing.
 *
 * While RATE_CARD.approved is false the flow itself shows the amber test-prices banner on
 * every step, so this surface is safe to open during owner testing and must not be sold
 * until the reviewed rate card flips the flag.
 */

import DesignOrderFlow, { type DesignSeed } from '@/components/design/design-order-flow'
import MvpShell from '@/components/mvp/mvp-shell'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { occasionById } from '@/lib/design/occasions'
import { FIXTURE_ASSETS, FIXTURE_MENU } from '@/lib/design/fixture-assets'
import { listMyDesignPhotos } from '@/lib/design/client-photos'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'

export const metadata = { title: 'Get a graphic made' }
export const dynamic = 'force-dynamic'

export default async function DesignOrderPage({ searchParams }: { searchParams: Promise<{ draft?: string | string[]; occasion?: string | string[] }> }) {
  /* GD-2: opened from an existing draft ("Have a designer finish this").
   * The deliverable is read with the CALLER'S session, so row-level security
   * decides ownership — a foreign id simply loads nothing and the flow opens
   * blank. */
  const sp = await searchParams
  const draftId = typeof sp.draft === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.draft) ? sp.draft : null
  let seed: DesignSeed | null = null
  if (draftId) {
    try {
      const supabase = await createServerClient()
      const { data: d } = await supabase
        .from('deliverables')
        .select('id, title, description, type, preview_urls, file_urls')
        .eq('id', draftId)
        .maybeSingle()
      if (d) {
        seed = {
          draftId: d.id as string,
          described: [d.title, d.description].filter(Boolean).join('. ') || undefined,
          referenceUrl: (Array.isArray(d.preview_urls) && d.preview_urls[0]) || (Array.isArray(d.file_urls) && d.file_urls[0]) || null,
        }
      }
    } catch { /* flow opens blank; never blocks on a draft read */ }
  }
  /* GD-3: opened from an occasion card on the Campaigns page. The date is
   * derived server-side from the occasion id — never trusted from the URL. */
  if (!seed && typeof sp.occasion === 'string') {
    const occ = occasionById(sp.occasion)
    if (occ) {
      const next = occ.nextOn(new Date())
      const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      seed = { described: occ.brief, eventDateISO: iso }
    }
  }
  /* The signed-in client's real menu feeds the Featuring chips. An empty or failed read
   * falls back to nothing-to-feature rather than fake dishes; fixtures are preview-only. */
  const [res, library] = await Promise.all([
    listMyMenuItems().catch(() => null),
    listMyDesignPhotos(),
  ])
  const menu =
    res && res.success && res.data.length > 0
      ? res.data.map((m) => ({ id: m.id, name: m.name }))
      : process.env.NODE_ENV !== 'production'
        ? FIXTURE_MENU
        : []
  const assets =
    library.photos.length > 0
      ? library.photos
      : process.env.NODE_ENV !== 'production'
        ? FIXTURE_ASSETS
        : []

  /* Inside the standard shell (owner ask 2026-08-18): the bottom nav must never
   * disappear on a creatives flow — it reads as leaving the app. */
  return (
    <MvpShell active="campaigns">
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100%', background: '#F5F5F7' }}>
        <DesignOrderFlow menu={menu} assets={assets} businessName={library.businessName} seed={seed} />
      </div>
    </MvpShell>
  )
}
