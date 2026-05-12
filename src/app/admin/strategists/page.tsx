/**
 * /admin/strategists — legacy URL. Redirects to /admin/team which
 * supports all 17 roles, not just strategists.
 */

import { redirect } from 'next/navigation'

export default function LegacyStrategistsPage() {
  redirect('/admin/team')
}
