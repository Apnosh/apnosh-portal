'use client'

import ApnoshCampaign from '@/components/mvp/campaign-builder/apnosh-campaign'

export default function BrowsePreviewView() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh' }}>
      <ApnoshCampaign restaurant="Yellow Bee Market" onScratch={() => {}} />
    </div>
  )
}
