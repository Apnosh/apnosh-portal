/**
 * Shared layout for every /dashboard/social/* page. Renders the
 * sticky sub-nav strip above each child so owners can jump between
 * Overview / Calendar / Inbox / Performance / Library in one click.
 *
 * Mirrors the /dashboard/website layout so navigation feels
 * consistent across channels.
 */

import SocialNav from './social-nav'

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SocialNav />
      {children}
    </>
  )
}
