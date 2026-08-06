'use client'

import type React from 'react'

import ApnoshCampaignRaw from '@/components/mvp/campaign-builder/apnosh-campaign'

/* The ported JSX narrows its inferred props from defaults (same issue builder-entry
 * re-types around); re-type the preview's slice of the surface. */
const ApnoshCampaign = ApnoshCampaignRaw as unknown as React.FC<{ restaurant?: string; onScratch?: () => void }>

export default function BrowsePreviewView() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh' }}>
      <ApnoshCampaign restaurant="Yellow Bee Market" onScratch={() => {}} />
    </div>
  )
}
