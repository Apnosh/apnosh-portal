import { listAllInstallRequests } from '@/lib/dashboard/install-requests'
import InstallRequestsTable from './installs-table'

/**
 * Admin inbox for "Have us install it" requests filed from the
 * website-setup wizard. One row per (client, tool) install ask.
 * The team picks a row, installs the snippet on the client's site,
 * and marks it done -- which clears the chip in the client's wizard.
 */
export default async function WebsiteInstallsPage() {
  const rows = await listAllInstallRequests()
  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
          Website install requests
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Clients who clicked &quot;Have us install it&quot; in the website-setup wizard.
        </p>
      </div>
      <InstallRequestsTable initialRows={rows} />
    </div>
  )
}
