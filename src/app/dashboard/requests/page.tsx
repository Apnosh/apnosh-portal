/**
 * /dashboard/requests — the Request Desk (creative requests, owner side).
 *
 * One desk for asking Apnosh to make anything: graphics, menus, logos, websites, short
 * video, photo shoots, social batches, emails, ads, print, writing. Reached from the
 * store's Creatives shelf. The owner's REAL menu feeds the Featuring picker in the
 * food-visual flows (video, photos, social).
 */

import RequestFlow from '@/components/requests/request-flow'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'

export const metadata = { title: 'Request creative work' }
export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const res = await listMyMenuItems().catch(() => null)
  const menu = res && res.success ? res.data.map((m) => ({ id: m.id, name: m.name })) : []
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <RequestFlow menu={menu} />
    </div>
  )
}
