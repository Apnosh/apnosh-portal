import { listClientsWebsiteData } from '@/lib/admin/website-data-tools'
import WebsiteToolsTable from './website-tools-table'

/**
 * Admin tool: per-client website data pipeline controls. Lets a
 * strategist trigger GSC 16-month backfills, re-run GA syncs, and
 * see at a glance which clients have sync errors or missing data.
 */
export default async function WebsiteToolsPage() {
  const rows = await listClientsWebsiteData()
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
          Website data tools
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Pull historical search data, re-run analytics syncs, inspect errors. Per-client controls.
        </p>
      </div>
      <WebsiteToolsTable initialRows={rows} />
    </div>
  )
}
