/**
 * /dashboard/requests — the Request Desk (creative requests, owner side).
 *
 * One desk for asking Apnosh to make anything: graphics, menus, logos, websites, short
 * video, photo shoots, social batches, emails, ads, print, writing. Reached from the
 * store's Creatives shelf. The owner's REAL menu feeds the Featuring picker in the
 * food-visual flows (video, photos, social).
 */

import RequestFlow from '@/components/requests/request-flow'
import MvpShell from '@/components/mvp/mvp-shell'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'

export const metadata = { title: 'Request creative work' }
export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const res = await listMyMenuItems().catch(() => null)
  const menu = res && res.success ? res.data.map((m) => ({ id: m.id, name: m.name })) : []
  /* Inside the standard shell (owner ask 2026-08-18): the bottom nav must never
   * disappear on a creatives flow — it reads as leaving the app. The desk keeps
   * its own paper look inside the frame. */
  return (
    <MvpShell active="campaigns">
      <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100%', background: '#F5F5F7' }}>
        <RequestFlow menu={menu} />
      </div>
    </MvpShell>
  )
}
