/**
 * /dashboard/campaigns/new — the campaign builder.
 *
 * Now renders the new catalog-driven builder (the ported design, wired to real
 * menu + business name + persistence via the builder adapter). The legacy
 * pick/spec/path/review builder is replaced. Honors ?template=<id> deep-links
 * from the discovery/preview pages + Home suggestions, mapped onto the new
 * catalog inside the wrapper.
 */
import CampaignBuilderEntry from '@/components/mvp/campaign-builder/builder-entry'

export const dynamic = 'force-dynamic'

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ template?: string | string[] }> }) {
  const sp = await searchParams
  const template = typeof sp.template === 'string' ? sp.template : undefined
  return <CampaignBuilderEntry template={template} />
}
