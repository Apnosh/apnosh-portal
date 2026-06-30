'use client'

/** Feeds the Content Menu the owner's real business name + menu items (for the dish
 *  picker) and the client id (for create). Thin wrapper, mirroring builder-entry. */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { C } from '@/components/campaigns/ui'
import ContentMenu from './content-menu'

export default function ContentMenuEntry({ draftId }: { draftId?: string }) {
  const { client } = useClient()
  const [menuItems, setMenuItems] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    listMyMenuItems()
      .then((r) => { if (!cancelled) setMenuItems(r.success ? r.data.map((m) => m.name) : []) })
      .catch(() => { if (!cancelled) setMenuItems([]) })
    return () => { cancelled = true }
  }, [])

  if (!client?.id) {
    return <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.faint, gap: 8 }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
  }
  return <ContentMenu restaurant={client.name || 'your restaurant'} menuItems={menuItems} clientId={client.id} draftId={draftId} />
}
