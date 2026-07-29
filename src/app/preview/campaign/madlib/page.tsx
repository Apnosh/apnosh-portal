'use client'

/**
 * /preview/campaign/madlib — the REAL madlib Builder + full builder store on fixtures, no login,
 * for Strategist's Desk verification (DESK-1/3). ?item=<id> picks the madlib's campaign
 * (default firstvisit); ?store=1 mounts the whole ApnoshCampaign instead (browse → PDP).
 * Saving needs a real account so onCreate/onGenerate are honest no-ops.
 */
import { useSearchParams } from 'next/navigation'
import { Suspense, type ComponentType } from 'react'
import ApnoshCampaignRaw, { Builder as MadlibBuilderRaw } from '@/components/mvp/campaign-builder/apnosh-campaign'

const ApnoshCampaign = ApnoshCampaignRaw as unknown as ComponentType<{
  initialItem?: string
  onCreate?: (p: unknown) => Promise<boolean>
}>
const MadlibBuilder = MadlibBuilderRaw as unknown as ComponentType<{
  itemId: string
  onBack: () => void
  onGenerate: (vals: Record<string, unknown>) => void
}>

function View() {
  const params = useSearchParams()
  if (params.get('store')) return <ApnoshCampaign initialItem={params.get('item') ?? 'gbp'} onCreate={async () => false} />
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <MadlibBuilder itemId={params.get('item') ?? 'firstvisit'} onBack={() => history.back()} onGenerate={() => alert('Preview only — building a plan needs a real account.')} />
      </div>
    </div>
  )
}

export default function PreviewMadlibPage() {
  return <Suspense fallback={null}><View /></Suspense>
}
