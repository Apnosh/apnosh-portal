'use client'

/**
 * Wrapper that feeds the ported campaign-builder design (apnosh-campaign.jsx)
 * real portal data: the owner's business name and menu items. Defines onClose
 * (exit to the campaigns list) and onCreate (Stage 4 will adapt the builder
 * output to a CampaignDraft + persist via createCampaign).
 */

import { useEffect, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { draftFromBuilder } from '@/lib/campaigns/builder/adapter'
// apnosh-campaign is intentionally .jsx (untyped design code). TS infers a
// narrow props type from its defaults, so re-type it to the real prop surface.
import ApnoshCampaignRaw from './apnosh-campaign'

type MenuOpt = { l: string }
type CreatePayload = { itemId: string; status: string; vals: Record<string, unknown> }
type BuilderProps = { restaurant?: string; menu?: MenuOpt[]; onCreate?: (p: CreatePayload) => void; onClose?: () => void }
const ApnoshCampaign = ApnoshCampaignRaw as unknown as ComponentType<BuilderProps>

export default function CampaignBuilderEntry() {
  const router = useRouter()
  const { client } = useClient()
  const [menu, setMenu] = useState<MenuOpt[] | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    listMyMenuItems()
      .then((res) => { if (!cancelled) setMenu(res.success ? res.data.map((m) => ({ l: m.name })) : []) })
      .catch(() => { if (!cancelled) setMenu([]) })
    return () => { cancelled = true }
  }, [])

  const onClose = () => router.push('/dashboard/campaigns')
  const onCreate = async (payload: CreatePayload) => {
    if (!client?.id) return
    try {
      const draft = draftFromBuilder(payload)
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, draft }),
      })
      if (!res.ok) return
      const { id } = (await res.json()) as { id?: string }
      // The builder shows its own "added" confirm; navigate to the real saved
      // campaign once it's persisted.
      if (id) router.push(`/dashboard/campaigns/${id}`)
    } catch {
      /* leave the confirm screen up; the owner can retry */
    }
  }

  return (
    <ApnoshCampaign
      restaurant={client?.name || 'your restaurant'}
      menu={menu}
      onCreate={onCreate}
      onClose={onClose}
    />
  )
}
