/**
 * FIXTURE PHOTO LIBRARY for the design order flow — SVG data URIs, zero network, zero storage.
 *
 * The real photo library (upload + storage + gate criteria) is flagged infrastructure
 * (DESIGN-ORDERING reuse flag 1, awaiting owner scoping). Until it lands, both the no-login
 * preview and the dashboard route feed the flow these; dimensions are the point — two pass the
 * quality gate, one fails it on purpose so the gate is visible.
 */

export interface FixtureAsset {
  id: string
  url: string
  width: number
  height: number
  label?: string
  kind?: 'library' | 'menu'
}

const ph = (w: number, h: number, hue: number, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,72%)"/><text x="50%" y="52%" font-family="sans-serif" font-size="${Math.round(w / 9)}" fill="rgba(0,0,0,0.45)" text-anchor="middle">${label}</text></svg>`
  )}`

export const FIXTURE_ASSETS: FixtureAsset[] = [
  { id: 'fx-1', url: ph(1600, 1200, 18, 'Patio'), width: 1600, height: 1200, label: 'Patio at dusk', kind: 'library' },
  /* 0x0 on purpose: exercises the flow's in-browser measurement path (menu photos ship
   * with unknown dimensions in production) */
  { id: 'fx-2', url: ph(1400, 1400, 152, 'Ribs'), width: 0, height: 0, label: 'Rib platter', kind: 'menu' },
  { id: 'fx-3', url: ph(640, 480, 205, 'Logo'), width: 640, height: 480, label: 'Old logo scan', kind: 'library' },
  /* Enough photos to cross the explore thresholds (8 collapses, 12 gains search) so the
   * preview exercises Show-all + search exactly like a real library would. */
  { id: 'fx-4', url: ph(1500, 1000, 30, 'Bar'), width: 1500, height: 1000, label: 'Bar top', kind: 'library' },
  { id: 'fx-5', url: ph(1300, 1300, 90, 'Fries'), width: 1300, height: 1300, label: 'Loaded fries', kind: 'menu' },
  { id: 'fx-6', url: ph(1250, 1250, 120, 'Wings'), width: 1250, height: 1250, label: 'Smoked wings', kind: 'menu' },
  { id: 'fx-7', url: ph(1200, 1600, 260, 'Team'), width: 1200, height: 1600, label: 'Kitchen team', kind: 'library' },
  { id: 'fx-8', url: ph(1450, 1100, 45, 'Booth'), width: 1450, height: 1100, label: 'Corner booth', kind: 'library' },
  { id: 'fx-9', url: ph(1350, 1350, 170, 'Brisket'), width: 1350, height: 1350, label: 'Brisket sandwich', kind: 'menu' },
  { id: 'fx-10', url: ph(1100, 1100, 200, 'Pie'), width: 1100, height: 1100, label: 'Pecan pie', kind: 'menu' },
  { id: 'fx-11', url: ph(1700, 1100, 60, 'Front'), width: 1700, height: 1100, label: 'Storefront', kind: 'library' },
  { id: 'fx-12', url: ph(1050, 1050, 330, 'Slaw'), width: 1050, height: 1050, label: 'House slaw', kind: 'menu' },
  { id: 'fx-13', url: ph(900, 700, 15, 'Menu'), width: 900, height: 700, label: 'Menu snapshot', kind: 'library' },
]

export const FIXTURE_MENU = [
  { id: 'm-1', name: 'Rib platter' },
  { id: 'm-2', name: 'Beer pitchers' },
  { id: 'm-3', name: 'Brisket sandwich' },
  { id: 'm-4', name: 'Loaded fries' },
]
