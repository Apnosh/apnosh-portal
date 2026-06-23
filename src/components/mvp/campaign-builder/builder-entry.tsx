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
type RecItem = { id: string; reason: string }
type CreatePayload = { itemId: string; status: string; vals: Record<string, unknown> }
type BuilderProps = { restaurant?: string; menu?: MenuOpt[]; initialItem?: string; recommended?: RecItem[]; recsLoading?: boolean; onCreate?: (p: CreatePayload) => Promise<boolean>; onClose?: () => void }
const ApnoshCampaign = ApnoshCampaignRaw as unknown as ComponentType<BuilderProps>

// Honor ?template= deep-links from the discovery/preview pages + Home suggestions.
// Map the legacy 8 campaign-template ids onto the new catalog, and pass through
// a real catalog id; anything unknown just lands on the catalog (browse).
const TEMPLATE_MAP: Record<string, string> = {
  'fill-shifts': 'nights', 'new-menu': 'launch', event: 'launch',
  'recurring-night': 'nights', winback: 'winback', regulars: 'regulars',
  discover: 'reach', reviews: 'reviewsplan',
}
const CATALOG_IDS = new Set([
  'reach', 'nights', 'firstvisit', 'regulars', 'catering', 'reviewsplan', 'reel', 'story',
  'carousel', 'graphic', 'dish', 'gpost', 'promoevent', 'launch', 'creator', 'welcome',
  'second', 'news', 'slowoffer', 'birthday', 'earlyaccess', 'shoot', 'gbp', 'reviewsreply',
  'qr', 'friction', 'giftcard', 'ticket', 'winback',
])
function resolveInitialItem(template?: string): string | undefined {
  if (!template) return undefined
  return TEMPLATE_MAP[template] ?? (CATALOG_IDS.has(template) ? template : undefined)
}

export default function CampaignBuilderEntry({ template }: { template?: string }) {
  const router = useRouter()
  const { client } = useClient()
  const [menu, setMenu] = useState<MenuOpt[] | undefined>(undefined)
  const [recommended, setRecommended] = useState<RecItem[] | undefined>(undefined)
  const [recsLoading, setRecsLoading] = useState(false)
  const initialItem = resolveInitialItem(template)

  useEffect(() => {
    let cancelled = false
    listMyMenuItems()
      .then((res) => { if (!cancelled) setMenu(res.success ? res.data.map((m) => ({ l: m.name })) : []) })
      .catch(() => { if (!cancelled) setMenu([]) })
    return () => { cancelled = true }
  }, [])

  // AI recommendations for the catalog (the "Suggested for you" row + featured).
  // Best-effort: the builder falls back to its static suggested row if this fails.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setRecsLoading(true)
    fetch(`/api/campaigns/recommend-items?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.recommended?.length) setRecommended(j.recommended as RecItem[]) })
      .catch(() => { /* keep the static suggested row */ })
      .finally(() => { if (!cancelled) setRecsLoading(false) })
    return () => { cancelled = true }
  }, [client?.id])

  const onClose = () => router.push('/dashboard/campaigns')
  // Returns true only when the campaign actually persisted, so the builder can
  // show a real confirm on success and an error+retry on failure instead of a
  // false "added". On success it deep-links to the saved campaign.
  const onCreate = async (payload: CreatePayload): Promise<boolean> => {
    if (!client?.id) return false
    try {
      const draft = draftFromBuilder(payload)
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, draft }),
      })
      if (!res.ok) return false
      const { id } = (await res.json()) as { id?: string }
      if (id) router.push(`/dashboard/campaigns/${id}`)
      return true
    } catch {
      return false
    }
  }

  return (
    <ApnoshCampaign
      restaurant={client?.name || 'your restaurant'}
      menu={menu}
      initialItem={initialItem}
      recommended={recommended}
      recsLoading={recsLoading}
      onCreate={onCreate}
      onClose={onClose}
    />
  )
}
