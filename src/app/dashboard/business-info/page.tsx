/**
 * /dashboard/business-info — card hub.
 *
 * Every editable area is a card. Tap one to open a focused, single-
 * purpose editor (Hours, Special hours, Contact) or jump to the
 * dedicated editor for richer systems (Menu, Photos, Amenities).
 * Cards show a one-line preview of current state so the owner can
 * scan what's set without opening anything.
 *
 * Server component — the cards are just links, no client JS needed.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Clock, CalendarDays, Phone, UtensilsCrossed, ImageIcon, Tag,
  Globe, ChevronRight, CheckCircle2, ShoppingBag, Share2,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo, type BusinessInfo } from './actions'
import { getWebsiteConnection } from './website-actions'
import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'

export const dynamic = 'force-dynamic'

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

export default async function BusinessInfoPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  const [loaded, websiteConn] = await Promise.all([
    loadBusinessInfo(),
    getWebsiteConnection(),
  ])
  const info = loaded.info

  const cards: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; hint: string; href: string; color: string }> = [
    {
      icon: Clock, label: 'Hours', color: 'bg-emerald-500',
      hint: hoursSummary(info?.hours),
      href: '/dashboard/business-info/hours',
    },
    {
      icon: CalendarDays, label: 'Special hours', color: 'bg-rose-500',
      hint: (info?.specialHours?.length ?? 0) > 0 ? `${info!.specialHours.length} date${info!.specialHours.length > 1 ? 's' : ''} set` : 'Holidays & closures',
      href: '/dashboard/business-info/special-hours',
    },
    {
      icon: Phone, label: 'Contact', color: 'bg-blue-500',
      hint: info?.phone || 'Name, phone, website',
      href: '/dashboard/business-info/contact',
    },
    {
      icon: UtensilsCrossed, label: 'Menu', color: 'bg-amber-500',
      hint: 'Items & prices',
      href: '/dashboard/local-seo/menu',
    },
    {
      icon: ImageIcon, label: 'Photos', color: 'bg-purple-500',
      hint: 'Logo & gallery',
      href: '/dashboard/assets',
    },
    {
      icon: Tag, label: 'Cuisine & amenities', color: 'bg-cyan-500',
      hint: 'Categories, parking',
      href: '/dashboard/local-seo/listing',
    },
    {
      icon: ShoppingBag, label: 'Order & reserve', color: 'bg-orange-500',
      hint: orderReserveHint(info),
      href: '/dashboard/business-info/links',
    },
    {
      icon: Share2, label: 'Social links', color: 'bg-fuchsia-500',
      hint: socialHint(info),
      href: '/dashboard/business-info/links',
    },
  ]

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 bg-white border-b border-ink-6">
        <h1 className="text-[24px] font-semibold text-ink leading-tight">Business info</h1>
        <p className="text-[12.5px] text-ink-3 mt-1">
          {loaded.gbpConnected || websiteConn.connected
            ? <>Edits sync to {[loaded.gbpConnected && 'Google', websiteConn.connected && 'your website'].filter(Boolean).join(' + ')} automatically.</>
            : 'Pick what you want to update.'}
        </p>
      </div>

      <div className="px-4 py-5">
        {/* Card grid */}
        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => {
            const Icon = c.icon
            return (
              <Link
                key={c.href}
                href={c.href}
                className="bg-white border border-ink-6 rounded-2xl p-4 flex flex-col gap-2 min-h-[112px] active:bg-ink-7 transition-colors"
              >
                <span className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl text-white ${c.color}`}>
                  <Icon className="w-[22px] h-[22px]" />
                </span>
                <div className="mt-auto">
                  <p className="text-[14.5px] font-semibold text-ink leading-tight">{c.label}</p>
                  <p className="text-[11.5px] text-ink-3 mt-0.5 line-clamp-1">{c.hint}</p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Website connection — full-width row */}
        <div className="mt-3">
          <Link
            href="/dashboard/business-info/connect-website"
            className="bg-white border border-ink-6 rounded-2xl p-4 flex items-center gap-3 active:bg-ink-7 transition-colors"
          >
            <span className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl flex-shrink-0 ${websiteConn.connected ? 'bg-emerald-500 text-white' : 'bg-ink-7 text-ink-3'}`}>
              <Globe className="w-[22px] h-[22px]" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[14.5px] font-semibold text-ink">Your website</p>
                {websiteConn.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <p className="text-[11.5px] text-ink-3 mt-0.5 truncate">
                {websiteConn.connected ? (websiteConn.siteUrl ?? 'Connected — auto-publishes') : 'Connect your Vercel site to auto-publish changes'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-ink-4 flex-shrink-0" />
          </Link>
        </div>

        {loaded.gbpConnected && (
          <p className="text-[11.5px] text-ink-4 text-center mt-5 px-4">
            Changes you make here update Google Business Profile{websiteConn.connected ? ' and your website' : ''} automatically.
          </p>
        )}
      </div>
    </div>
  )
}
