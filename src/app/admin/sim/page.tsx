import { requireAdminUser } from '@/lib/auth/require-admin'
import SimClient from './sim-client'

export const dynamic = 'force-dynamic'

export default async function AdminSimPage() {
  await requireAdminUser()
  return <SimClient />
}
