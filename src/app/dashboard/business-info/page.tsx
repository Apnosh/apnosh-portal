/**
 * /dashboard/business-info — the owner "Business info & hours" hub, rebuilt in
 * the apnosh-mvp design (iOS-Settings grouped list inside MvpShell). Each row
 * shows a live one-line preview and deep-links to a focused editor.
 *
 * Server component: loads the same data as before (loadBusinessInfo +
 * getWebsiteConnection); the editor sub-routes are unchanged.
 */

import { redirect } from 'next/navigation'
import {
  Clock, CalendarDays, Phone, MapPin, UtensilsCrossed, Image as ImageIcon, Tag,
  Globe, ShoppingBag, Share2, ListChecks,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo, type BusinessInfo } from './actions'
import { getWebsiteConnection } from './website-actions'
import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow } from '@/components/mvp/mvp-detail'
import { BrandOrMark } from '@/components/mvp/mvp-insights'

export const dynamic = 'force-dynamic'

const T = { ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', green: '#4abd98' }

function hoursSummary(hours: WeeklyHours | undefined): string {
  if (!hours) return 'Set your weekly hours'
  const keys: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const openDays = keys.filter(k => (hours[k]?.length ?? 0) > 0)
  if (openDays.length === 0) return 'Set your weekly hours'
  if (openDays.length === 7) return 'Open every day'
  return `Open ${openDays.length} days a week`
}

function orderReserveHint(info: BusinessInfo | undefined): string {
  const n = (info?.links?.ordering?.length ?? 0) + (info?.links?.reservations?.length ?? 0)
  return n > 0 ? `${n} link${n > 1 ? 's' : ''}` : 'DoorDash, OpenTable...'
}

function socialHint(info: BusinessInfo | undefined): string {
  const n = Object.values(info?.links?.social ?? {}).filter(Boolean).length
  return n > 0 ? `${n} profile${n > 1 ? 's' : ''}` : 'Instagram, TikTok...'
}

/* the two syncs, as status tiles that wear the network's own mark (portal redesign 2026-09-04) */
function StatusPill({ label, on, provider }: { label: string; on: boolean; provider: 'google_business_profile' | 'website' }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', borderRadius: 16, padding: '10px 12px', opacity: on ? 1 : 0.8 }}>
      <span style={{ position: 'relative', width: 36, height: 36, borderRadius: 99, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.09)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, filter: on ? 'none' : 'grayscale(1)' }}>
        <BrandOrMark provider={provider} size={19} />
        <span style={{ position: 'absolute', right: -1, top: -1, width: 11, height: 11, borderRadius: 99, background: on ? T.green : T.faint, border: '2px solid #fff' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: T.ink }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: on ? '#2e9a78' : T.mute, fontWeight: on ? 600 : 400 }}>{on ? 'Synced' : 'Not connected'}</span>
      </span>
    </div>
  )
}

export default async function BusinessInfoPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  const [loaded, websiteConn] = await Promise.all([
    loadBusinessInfo(),
    getWebsiteConnection(),
  ])
  const info = loaded.info
  const specialCount = info?.specialHours?.length ?? 0

  const subtitle = loaded.gbpConnected || websiteConn.connected
    ? `Edits sync to ${[loaded.gbpConnected && 'Google', websiteConn.connected && 'your website'].filter(Boolean).join(' and ')} automatically`
    : 'Keep your details current'

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Business info" subtitle={subtitle} />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <StatusPill label="Google" on={loaded.gbpConnected} provider="google_business_profile" />
          <StatusPill label="Website" on={websiteConn.connected} provider="website" />
        </div>

        <MvpGroup title="Hours & contact" hue="newfaces">
          <MvpRow icon={<Clock size={18} />} label="Weekly hours" hue="newfaces" sub={hoursSummary(info?.hours)} href="/dashboard/business-info/hours" />
          <MvpRow icon={<CalendarDays size={18} />} label="Special hours" hue="newfaces" sub={specialCount > 0 ? `${specialCount} date${specialCount > 1 ? 's' : ''} set` : 'Holidays and closures'} href="/dashboard/business-info/special-hours" />
          <MvpRow icon={<Phone size={18} />} label="Contact details" hue="newfaces" sub={info?.phone || 'Name, phone, website'} href="/dashboard/business-info/contact" />
          <MvpRow icon={<MapPin size={18} />} label="Address" hue="newfaces" sub={info?.address?.line1 ? [info.address.line1, info.address.city].filter(Boolean).join(', ') : 'Add your address'} href="/dashboard/business-info/address" />
          <MvpRow icon={<MapPin size={18} />} label="Locations" hue="newfaces" sub="Each spot, with its own info" href="/dashboard/business-info/locations" />
        </MvpGroup>

        <MvpGroup title="Menu & photos" hue="catering">
          <MvpRow icon={<UtensilsCrossed size={18} />} label="Menu" hue="catering" sub="Dishes, prices, descriptions" href="/dashboard/business-info/menu" />
          <MvpRow icon={<ImageIcon size={18} />} label="Photos" hue="catering" sub="Logo and gallery" href="/dashboard/assets" />
        </MvpGroup>

        <MvpGroup title="Order & social" hue="online">
          <MvpRow icon={<ShoppingBag size={18} />} label="Order & reserve" hue="online" sub={orderReserveHint(info)} href="/dashboard/business-info/links" />
          <MvpRow icon={<Share2 size={18} />} label="Social links" hue="brand" sub={socialHint(info)} href="/dashboard/business-info/links" />
        </MvpGroup>

        <MvpGroup title="Listing & website" hue="nights">
          <MvpRow icon={<Tag size={18} />} label="Cuisine & category" hue="nights" sub="What you're found for on Google" href="/dashboard/business-info/category" />
          <MvpRow icon={<ListChecks size={18} />} label="Service & amenities" hue="nights" sub="Dine-in, takeout, delivery, more" href="/dashboard/business-info/service-options" />
          <MvpRow icon={<Globe size={18} />} label="Your website" hue="nights" sub={websiteConn.connected ? (websiteConn.siteUrl ?? 'Connected, auto-publishes') : 'Connect to auto-publish'} href="/dashboard/business-info/connect-website" />
        </MvpGroup>

        {loaded.gbpConnected && (
          <p style={{ fontSize: 11.5, color: T.faint, textAlign: 'center', marginTop: 2, padding: '0 16px' }}>
            Changes here update Google{websiteConn.connected ? ' and your website' : ''} automatically.
          </p>
        )}
      </div>
    </MvpShell>
  )
}
