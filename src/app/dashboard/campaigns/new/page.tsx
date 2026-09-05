/**
 * /dashboard/campaigns/new — Create (owner 2026-09-05): the round-4 shelf. Browse by goal, describe
 * it in a sentence, search in plain words, or be guided. Ordering hands off to the builder at
 * /campaigns/new/build (?template=<id> deep-links still work and go straight there).
 */
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CreatePage from '@/components/mvp/create/create-page'

export const dynamic = 'force-dynamic'

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ template?: string; lens?: string }> }) {
  const { template } = await searchParams
  if (template) redirect(`/dashboard/campaigns/new/build?template=${encodeURIComponent(template)}`)
  return <Suspense fallback={null}><CreatePage /></Suspense>
}
