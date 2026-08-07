/**
 * /dashboard/requests — the Request Desk (creative requests, owner side).
 *
 * One desk for asking Apnosh to make anything: graphics, menus, logos, websites, short
 * video, photo shoots, social batches, emails, ads, print, writing. Request first,
 * quote later; nothing here charges. Reached from the store's "Request creative work"
 * card. (This route once redirected to Messages; the request concept now lives here
 * for real, backed by creative_requests.)
 */

import RequestFlow from '@/components/requests/request-flow'

export const metadata = { title: 'Request creative work' }
export const dynamic = 'force-dynamic'

export default function RequestsPage() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <RequestFlow />
    </div>
  )
}
