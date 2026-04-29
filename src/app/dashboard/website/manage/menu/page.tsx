/**
 * Focused page: full menu editor.
 *
 * Linked from the manage-site hub so the editor gets the whole viewport
 * without competing with specials, copy, photos, etc.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { getMySiteOverview } from '@/lib/dashboard/my-site-actions'
import { getMyDashboardConfig } from '@/lib/dashboard/content-actions'
import MenuEditor from '@/components/dashboard/website/menu-editor'
import FeatureDisabled from '@/components/dashboard/website/hub/feature-disabled'

export default async function MenuPage() {
  const [overviewRes, configRes, menuRes] = await Promise.all([
    getMySiteOverview(),
    getMyDashboardConfig(),
    listMyMenuItems(),
  ])
  if (!overviewRes.success) redirect('/dashboard/website')
  // Feature gate: if the customer site didn't declare 'menu' in apnosh-content.json,
  // the editor isn't appropriate for their vertical (e.g. salon). Show a friendly
  // disabled state instead of an empty editor.
  if (configRes.success && !configRes.data.features.includes('menu')) {
    return <FeatureDisabled featureLabel="Menu" />
  }
  const menuItems = menuRes.success ? menuRes.data : []

  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website/manage"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to my website
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Menu</h1>
        <p className="text-sm text-ink-3">
          Your full menu. Update prices, add items, mark featured.
        </p>
      </div>

      <MenuEditor initialItems={menuItems} />
    </div>
  )
}
