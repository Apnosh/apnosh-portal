/**
 * Shared layout for every /dashboard/local-seo/* page.
 *
 * Renders the LocalSeoNav sub-tab strip above each child so owners
 * always see Overview / Reviews / Your listing / Locations and can
 * jump between them in one click — same pattern Social media uses.
 */

import LocalSeoNav from './local-seo-nav'

export default function LocalSeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LocalSeoNav />
      {children}
    </>
  )
}
