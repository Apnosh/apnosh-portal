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
  const onCreate = (_payload: CreatePayload) => {
    // Stage 4: map (itemId + vals) -> CampaignDraft -> createCampaign, then route
    // to the saved campaign. For now this is a no-op so the flow is navigable.
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
