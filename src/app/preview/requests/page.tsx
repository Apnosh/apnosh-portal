/**
 * /preview/requests — the Request Desk, unauthenticated preview (house preview pattern,
 * like /preview/design/order and /preview/campaign/*).
 *
 * Renders the REAL RequestFlow component. Signed out, the list read comes back empty and
 * a submit shows the calm error path, which is itself part of what this preview proves.
 * Kept as a permanent regression surface + phone-testable link.
 */

import RequestFlow from '@/components/requests/request-flow'

export const metadata = { title: 'Request creative work (preview)' }

export default function RequestsPreviewPage() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <RequestFlow />
    </div>
  )
}
