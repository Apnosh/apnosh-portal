/**
 * /dashboard/campaigns/build — retired. The Content Menu is now the draft step INSIDE
 * the main builder (/new), not a separate page. Redirect here to /new, preserving any
 * ?template= / ?draft= params so old links keep working.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BuildRedirect({ searchParams }: { searchParams: Promise<{ template?: string | string[]; draft?: string | string[] }> }) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  if (typeof sp.template === 'string') qs.set('template', sp.template)
  if (typeof sp.draft === 'string') qs.set('draft', sp.draft)
  const q = qs.toString()
  redirect(`/dashboard/campaigns/new${q ? `?${q}` : ''}`)
}
