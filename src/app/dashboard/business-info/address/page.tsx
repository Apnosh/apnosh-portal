import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo } from '../actions'
import AddressEditor from './address-editor'

export const dynamic = 'force-dynamic'

export default async function AddressPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  const loaded = await loadBusinessInfo()
  return (
    <AddressEditor
      initial={loaded.info?.address ?? { line1: '', city: '', state: '', zip: '' }}
      gbpConnected={loaded.gbpConnected}
    />
  )
}
