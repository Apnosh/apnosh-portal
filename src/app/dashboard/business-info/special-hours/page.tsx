import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo } from '../actions'
import SpecialHoursEditor from './special-hours-editor'

export const dynamic = 'force-dynamic'

export default async function SpecialHoursPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  const loaded = await loadBusinessInfo()
  return <SpecialHoursEditor initial={loaded.info?.specialHours ?? []} gbpConnected={loaded.gbpConnected} />
}
