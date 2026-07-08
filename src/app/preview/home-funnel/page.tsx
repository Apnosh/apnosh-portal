/**
 * Demo route for <HomeFunnel /> — the whole-business marketing funnel (real
 * Google signals + owner dials) in the glass-vessel style. Runs on realistic
 * market/cafe mock defaults; ungated on purpose (illustrative).
 */
import type { Metadata } from 'next'
import HomeFunnel from '@/components/mvp/home-funnel'

export const metadata: Metadata = { title: 'Marketing Funnel — Apnosh' }

export default function HomeFunnelPreview() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', padding: '22px 14px 44px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <HomeFunnel />
      </div>
    </div>
  )
}
