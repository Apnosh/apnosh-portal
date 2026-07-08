/**
 * Demo route for <CampaignFunnel /> — the "how did this promo perform" results
 * view (magnet funnel). Runs on the component's mock defaults (Oyster & Wine
 * Night), so it doubles as the pitch/explainer surface. Ungated on purpose:
 * everything on it is illustrative.
 */
import type { Metadata } from 'next'
import CampaignFunnel from '@/components/mvp/campaign-funnel'

export const metadata: Metadata = { title: 'Campaign Results — Apnosh' }

export default function CampaignFunnelPreview() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', padding: '22px 14px 44px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <CampaignFunnel />
      </div>
    </div>
  )
}
