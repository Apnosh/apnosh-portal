/**
 * Focused page: site photo editor (asset fields only).
 *
 * Renders the asset slots declared in the customer's apnosh-content.json
 * (logo, hero, about, etc.) without competing with copy/menu/specials.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMyContentFields } from '@/lib/dashboard/content-actions'
import { getMySiteOverview } from '@/lib/dashboard/my-site-actions'
import ContentEditor from '@/components/dashboard/website/content-editor'

export default async function PhotosPage() {
  const overviewRes = await getMySiteOverview()
  if (!overviewRes.success) redirect('/dashboard/website')
  const contentRes = await getMyContentFields()
  const allFields = contentRes.success ? contentRes.data.fields : []
  const hasSchema = contentRes.success ? contentRes.data.hasSchema : false
  const fields = allFields.filter(f => f.type === 'asset')

  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website/manage"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to my website
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Photos</h1>
        <p className="text-sm text-ink-3">
          Logo, hero photo, about photo, and any other image slots your site exposes.
        </p>
      </div>

      {!hasSchema || fields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-6 bg-white p-6 text-center text-sm text-ink-3">
          No editable photo slots declared on your site yet.
        </div>
      ) : (
        <ContentEditor fields={fields} />
      )}
    </div>
  )
}
