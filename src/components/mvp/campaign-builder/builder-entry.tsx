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
type BuilderProps = { restaurant?: string; menu?: MenuOpt[]; initialItem?: string; recommended?: RecItem[]; firstLaunch?: boolean; onCreate?: (p: CreatePayload) => void; onSaveDraft?: (p: CreatePayload) => void; onClose?: () => void }
const ApnoshCampaign = ApnoshCampaignRaw as unknown as ComponentType<BuilderProps>

// Honor ?template= deep-links from the discovery/preview pages + Home suggestions.
// The catalog is scoped to the services we actually deliver; map legacy deep-links
// onto the nearest one, and let anything unknown land on the catalog (browse).
const TEMPLATE_MAP: Record<string, string> = {
  'new-menu': 'reel', event: 'reel', discover: 'gbp', reviews: 'gbp',
}
const CATALOG_IDS = new Set([
  'reel', 'graphic', 'carousel', 'website', 'seo', 'gbp', 'shoot',
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
  const [firstLaunch, setFirstLaunch] = useState(false)
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
    fetch(`/api/campaigns/recommend-items?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.recommended?.length) setRecommended(j.recommended as RecItem[]) })
      .catch(() => { /* keep the static suggested row */ })
    return () => { cancelled = true }
  }, [client?.id])

  // First-campaign launch offer: on if this client has no campaigns yet.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/campaigns?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && Array.isArray(j?.campaigns)) setFirstLaunch(j.campaigns.length === 0) })
      .catch(() => { /* default: no launch offer */ })
    return () => { cancelled = true }
  }, [client?.id])

  const onClose = () => router.push('/dashboard/campaigns')

  async function persist(payload: CreatePayload, phase: 'review' | 'build'): Promise<string | undefined> {
    if (!client?.id) return undefined
    const draft = { ...draftFromBuilder(payload), phase }
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, draft }),
    })
    if (!res.ok) return undefined
    const { id } = (await res.json()) as { id?: string }
    return id
  }

  // Build my plan → persist, then land on the campaign detail page where the
  // owner reviews the plan and taps Approve & ship (the merged review+ship page).
  const onCreate = async (payload: CreatePayload) => {
    try {
      const id = await persist(payload, 'review')
      if (id) router.push(`/dashboard/campaigns/${id}`)
    } catch { /* builder keeps its confirm up; owner can retry */ }
  }

  // Save as draft → persist in the 'build' phase (reads as "Draft") and return
  // to the campaigns list so the owner can finish it later.
  const onSaveDraft = async (payload: CreatePayload) => {
    try {
      await persist(payload, 'build')
    } finally {
      router.push('/dashboard/campaigns')
    }
  }

  return (
    <ApnoshCampaign
      restaurant={client?.name || 'your restaurant'}
      menu={menu}
      initialItem={initialItem}
      recommended={recommended}
      firstLaunch={firstLaunch}
      onCreate={onCreate}
      onSaveDraft={onSaveDraft}
      onClose={onClose}
    />
  )
}
