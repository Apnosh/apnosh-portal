/**
 * /dashboard/campaigns/new/build — the configure-and-order flow (the builder), reached from the
 * new Create shelf with ?template=<id>. ?view=build skips the builder's own product page and opens
 * the questions straight away (the shelf already showed the product). ?lens= is kept for old links.
 */
import CampaignBuilderEntry from '@/components/mvp/campaign-builder/builder-entry'

export const dynamic = 'force-dynamic'

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ template?: string; lens?: string; view?: string }> }) {
  const { template, lens, view } = await searchParams
  return <CampaignBuilderEntry template={template} lens={lens} view={view === 'build' ? 'build' : undefined} />
}
