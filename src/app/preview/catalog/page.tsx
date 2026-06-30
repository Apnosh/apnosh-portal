/**
 * DEV-ONLY preview of the editable admin catalog (no auth, no DB writes) so the editor UI can be
 * reviewed without an admin session. Feeds CatalogAdmin the static in-code catalog as rows, in
 * preview mode (save + publish are no-ops). Not reachable in production.
 */
import { notFound } from 'next/navigation'
import { CatalogAdmin } from '@/app/admin/catalog/catalog-admin'
import { PRICED_CATALOG } from '@/lib/campaigns/data/priced-catalog'
import { serviceToRow } from '@/lib/campaigns/data/catalog-db-shape'
import { plainNameOf } from '@/lib/campaigns/catalog'

export const dynamic = 'force-dynamic'

export default async function CatalogPreview({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const rows = PRICED_CATALOG.map((s, i) => serviceToRow(s, i, plainNameOf(s)))
  return <CatalogAdmin rows={rows} preview initialOpenId={sp.open} />
}
