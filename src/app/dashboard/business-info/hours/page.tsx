import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo } from '../actions'
import HoursEditor from './hours-editor'

export const dynamic = 'force-dynamic'

export default async function HoursPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  const loaded = await loadBusinessInfo()
  return <HoursEditor initialHours={loaded.info?.hours ?? null} />
}
