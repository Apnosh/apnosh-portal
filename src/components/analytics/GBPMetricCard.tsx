'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { GBPMonthlyData } from '@/types/database'

interface GBPMetricCardProps {
  label: string
  note: string
  icon: React.ElementType
  value: number
  previousValue?: number | null
  yearAgoValue?: number | null
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

function fmt(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(v).toString()
}

export function GBPMetricCard({ label, note, icon: Icon, value, previousValue, yearAgoValue }: GBPMetricCardProps) {
  const pct = previousValue != null ? pctChange(value, previousValue) : null
  const yoyPct = yearAgoValue != null ? pctChange(value, yearAgoValue) : null

  return (
    <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5 flex flex-col gap-2 transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl bg-brand-tint flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-brand-dark" />
        </div>
        {pct != null && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            pct > 0 ? 'bg-emerald-50 text-emerald-600' :
            pct < 0 ? 'bg-red-50 text-red-500' :
            'bg-gray-50 text-gray-400'
          }`}>
            {pct > 0 ? <TrendingUp className="w-3 h-3" /> :
             pct < 0 ? <TrendingDown className="w-3 h-3" /> :
             <Minus className="w-3 h-3" />}
            {pct > 0 ? '+' : ''}{pct}%
          </div>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink tracking-tight">
        {fmt(value)}
      </div>
      <div className="text-sm font-medium text-ink-2">{label}</div>
      <div className="text-[11px] text-ink-4">{note}</div>
      {yoyPct != null && (
        <div className="text-[10px] text-ink-4 mt-auto pt-1 border-t border-ink-6">
          Year-over-year: <span className={yoyPct > 0 ? 'text-emerald-600' : yoyPct < 0 ? 'text-red-500' : ''}>{yoyPct > 0 ? '+' : ''}{yoyPct}%</span>
        </div>
      )}
    </div>
  )
}

// Metric card configurations (matching Lovable's METRIC_CARDS)
export const METRIC_CARD_CONFIGS = [
  { key: 'total_interactions', label: 'Total Interactions', note: 'Calls + Directions + Website + Bookings', compute: (d: GBPMonthlyData) => (d.calls ?? 0) + (d.bookings ?? 0) + (d.directions ?? 0) + (d.website_clicks ?? 0) },
  { key: 'total_views', label: 'Total Profile Views', note: 'Every time your profile was seen', compute: (d: GBPMonthlyData) => (d.search_mobile ?? 0) + (d.search_desktop ?? 0) + (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0) },
  { key: 'maps_impressions', label: 'Google Maps', note: 'Times seen on Google Maps', compute: (d: GBPMonthlyData) => (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0) },
  { key: 'search_impressions', label: 'Google Search', note: 'Times seen on Google Search', compute: (d: GBPMonthlyData) => (d.search_mobile ?? 0) + (d.search_desktop ?? 0) },
  { key: 'website_clicks', label: 'Website Clicks', note: 'Clicked through to your website', compute: (d: GBPMonthlyData) => d.website_clicks ?? 0 },
  { key: 'calls', label: 'Phone Calls', note: 'Called from your profile', compute: (d: GBPMonthlyData) => d.calls ?? 0 },
  { key: 'directions', label: 'Direction Requests', note: 'Asked for directions', compute: (d: GBPMonthlyData) => d.directions ?? 0 },
  { key: 'bookings', label: 'Bookings', note: 'Reservations via your profile', compute: (d: GBPMonthlyData) => d.bookings ?? 0 },
  { key: 'food_orders', label: 'Food Orders', note: 'Orders through your profile', compute: (d: GBPMonthlyData) => d.food_orders ?? 0 },
  { key: 'food_menu_clicks', label: 'Menu Views', note: 'Times your menu was opened', compute: (d: GBPMonthlyData) => d.food_menu_clicks ?? 0 },
  { key: 'messages', label: 'Messages', note: 'Messages sent through profile', compute: (d: GBPMonthlyData) => d.messages ?? 0 },
  { key: 'hotel_bookings', label: 'Hotel Bookings', note: 'Hotel reservations via profile', compute: (d: GBPMonthlyData) => d.hotel_bookings ?? 0 },
] as const

import { Activity, Eye, Map, Search, Globe, Phone, MapPin, CalendarCheck, UtensilsCrossed, MousePointerClick, MessageSquare, Hotel } from 'lucide-react'

export const METRIC_ICONS: Record<string, React.ElementType> = {
  total_interactions: Activity,
  total_views: Eye,
  maps_impressions: Map,
  search_impressions: Search,
  website_clicks: Globe,
  calls: Phone,
  directions: MapPin,
  bookings: CalendarCheck,
  food_orders: UtensilsCrossed,
  food_menu_clicks: MousePointerClick,
  messages: MessageSquare,
  hotel_bookings: Hotel,
}
