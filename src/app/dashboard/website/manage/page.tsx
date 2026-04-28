/**
 * Client-facing site management page.
 *
 * Restaurant managers see their site status, recent updates, and have
 * quick-action buttons to push new updates (hours, menu item, promo,
 * event, closure, info). Bigger changes go through change requests.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMySiteOverview, getMyLocations } from '@/lib/dashboard/my-site-actions'
import { getMyContentFields } from '@/lib/dashboard/content-actions'
import SiteManager from '@/components/dashboard/website/site-manager'
import ContentEditor from '@/components/dashboard/website/content-editor'

export default async function MySitePage() {
  const overviewRes = await getMySiteOverview()
  if (!overviewRes.success) {
    // No client account, fall back to overview page
    redirect('/dashboard/website')
  }
  const locationsRes = await getMyLocations()
  const locations = locationsRes.success ? locationsRes.data : []
  const contentRes = await getMyContentFields()
  const contentFields = contentRes.success ? contentRes.data.fields : []
  const hasContentSchema = contentRes.success ? contentRes.data.hasSchema : false

  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">My website</h1>
        <p className="text-sm text-ink-3">
          See your site status and push quick updates. Bigger changes? Send us a request.
        </p>
      </div>

      <SiteManager overview={overviewRes.data} locations={locations} />

      {hasContentSchema && contentFields.length > 0 && (
        <div className="mt-8">
          <ContentEditor fields={contentFields} />
        </div>
      )}
    </div>
  )
}
