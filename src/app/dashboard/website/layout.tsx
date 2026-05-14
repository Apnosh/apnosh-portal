/**
 * Shared layout for every /dashboard/website/* page. Renders the
 * sticky sub-nav strip above each child so owners can jump between
 * Overview / Manage / Health / Traffic / Requests in one click.
 */

import WebsiteNav from './website-nav'

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WebsiteNav />
      {children}
    </>
  )
}
