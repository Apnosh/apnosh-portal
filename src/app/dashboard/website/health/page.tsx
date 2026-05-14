/**
 * Legacy route. Site health used to be its own page; the status
 * strip + inline punch list on /dashboard/website now covers the
 * same job in a fraction of the space. Redirect for any old links.
 */

import { redirect } from 'next/navigation'

export default function WebsiteHealthRedirect() {
  redirect('/dashboard/website')
}
