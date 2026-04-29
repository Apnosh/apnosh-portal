/**
 * Focused page: daily specials editor.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { listMySpecials } from '@/lib/dashboard/specials-actions'
import { getMySiteOverview } from '@/lib/dashboard/my-site-actions'
import SpecialsEditor from '@/components/dashboard/website/specials-editor'

export default async function SpecialsPage() {
  const overviewRes = await getMySiteOverview()
  if (!overviewRes.success) redirect('/dashboard/website')
  const specialsRes = await listMySpecials()
  const specials = specialsRes.success ? specialsRes.data : []

  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website/manage"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to my website
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Daily specials</h1>
        <p className="text-sm text-ink-3">
          Recurring deals like &ldquo;Happy Hour 3-5pm.&rdquo; Hides on your site when empty.
        </p>
      </div>

      <SpecialsEditor initialItems={specials} />
    </div>
  )
}
