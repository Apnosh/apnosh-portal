import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import MvpMenuEditor from './menu-editor-mvp'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const res = await listMyMenuItems()
  const items = res.success ? res.data : []
  return <MvpMenuEditor initial={items} />
}
