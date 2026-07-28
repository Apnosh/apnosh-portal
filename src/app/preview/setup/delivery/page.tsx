/**
 * /preview/setup/delivery — the delivery-menu card on a worked example, with no login.
 *
 * The menu here is invented, because a real one needs a client. The ARITHMETIC is the real thing:
 * same module, same commission handling, same ceiling. Four dishes chosen to show all the states at
 * once, including the one that still loses money at the highest price we would ask a guest to pay.
 */
import Link from 'next/link'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import { buildMenuReport, type MenuItem } from '@/lib/delivery/menu-fix'
import PreviewDeliveryView from './preview-view'

export const metadata = { title: 'Delivery menu pricing, preview' }

const MENU: MenuItem[] = [
  { id: '1', name: 'Bibimbap', price: 16.0, foodCost: 5.0 },
  { id: '2', name: 'House fries', price: 5.0, foodCost: 3.5 },
  { id: '3', name: 'Ribeye', price: 42.0, foodCost: 14.0 },
  { id: '4', name: 'Soda', price: 3.0, foodCost: 0.4 },
]

export default async function PreviewDeliveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const r = Number(typeof sp.rate === 'string' ? sp.rate : '')
  const rate = Number.isFinite(r) && r > 0.01 && r < 0.6 ? r : 0.30
  const report = buildMenuReport(MENU, 'doordash', rate)

  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Price your delivery menu"
          subtitle="What to charge once the app takes its cut"
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      )}
    >
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ background: '#fbf0da', borderRadius: 13, padding: '10px 12px', fontSize: 12, color: '#8a5a0c', lineHeight: 1.45 }}>
          The menu is made up; the pricing is the real engine. Add <b>?rate=0.15</b> to the address to
          see the same menu on a cheaper plan.{' '}
          <Link href="/preview/campaign" style={{ color: '#8a5a0c', fontWeight: 640 }}>All screens</Link>
        </div>
      </div>
      <PreviewDeliveryView report={report} />
    </MvpShell>
  )
}
