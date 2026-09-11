'use client'
/**
 * /dashboard/campaigns/new — Create (owner 2026-09-05): the round-4 shelf. Browse by goal, describe
 * it in a sentence, search in plain words, or be guided. Ordering hands off to the builder at
 * /campaigns/new/build (?template=<id> deep-links still work and go straight there).
 *
 * A CLIENT PAGE like every other tab (owner 2026-09-11: "all the pages load like an app except
 * Create"). It was the one server-rendered, force-dynamic route under the app shell, wrapped in a
 * Suspense that painted nothing, so it flashed blank on every visit and could carry a stale
 * payload (the previous deploy's nav) from the router cache until a hard reload. Now it mounts
 * the way Home, Insights and Inbox do.
 */
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CreatePage from '@/components/mvp/create/create-page'

export default function NewCampaignPage() {
  const router = useRouter()
  const params = useSearchParams()
  const template = params.get('template')
  useEffect(() => {
    if (template) router.replace(`/dashboard/campaigns/new/build?template=${encodeURIComponent(template)}`)
  }, [template, router])
  if (template) return null
  return <CreatePage />
}
