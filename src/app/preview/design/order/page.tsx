/**
 * /preview/design/order — the design order flow, no login (DESIGN-ORDERING Phase B testing).
 *
 * Same contract as /preview/campaign: a working surface fed by hand-written fixtures, reading
 * nothing. The menu and the photo library are constants below (the real photo library is
 * flagged infrastructure, reuse flag 1); the describe step calls the real /api/design/describe
 * and degrades to chips when it cannot. Prices come from the real engine and rate card, which
 * is why the placeholder banner shows: RATE_CARD.approved is false until the designer
 * job-history review lands.
 */

import DesignOrderFlow, { type DesignAsset } from '@/components/design/design-order-flow'

export const metadata = { title: 'Design order, no login' }

/* SVG data URIs: the preview needs zero network and zero storage. Dimensions are the point —
 * two pass the quality gate, one fails it on purpose so the gate is visible. */
const ph = (w: number, h: number, hue: number, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,72%)"/><text x="50%" y="52%" font-family="sans-serif" font-size="${Math.round(w / 9)}" fill="rgba(0,0,0,0.45)" text-anchor="middle">${label}</text></svg>`
  )}`

const FIXTURE_ASSETS: DesignAsset[] = [
  { id: 'fx-1', url: ph(1600, 1200, 18, 'Patio'), width: 1600, height: 1200, label: 'Patio at dusk' },
  { id: 'fx-2', url: ph(1400, 1400, 152, 'Ribs'), width: 1400, height: 1400, label: 'Rib platter' },
  { id: 'fx-3', url: ph(640, 480, 205, 'Logo'), width: 640, height: 480, label: 'Old logo scan' },
]

const FIXTURE_MENU = [
  { id: 'm-1', name: 'Rib platter' },
  { id: 'm-2', name: 'Beer pitchers' },
  { id: 'm-3', name: 'Brisket sandwich' },
  { id: 'm-4', name: 'Loaded fries' },
]

export default function PreviewDesignOrderPage() {
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', background: '#F5F5F7' }}>
      <DesignOrderFlow menu={FIXTURE_MENU} assets={FIXTURE_ASSETS} />
    </div>
  )
}
