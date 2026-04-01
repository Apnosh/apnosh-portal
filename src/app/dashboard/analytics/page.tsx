'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Users, Eye, MousePointerClick, UserPlus,
  Camera, Globe, Video, Mail, Smartphone, Search, Star, MapPin,
} from 'lucide-react'
import AnalyticsInsights from './insights'

// ── Types ────────────────────────────────────────────────────────────

type DateRange = '7d' | '30d' | '90d' | 'year'

// ── Config & Data ────────────────────────────────────────────────────

const dateRanges: { label: string; value: DateRange }[] = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'This year', value: 'year' },
]

const topStats = [
  { label: 'Total Reach', value: '48.2K', change: '+12%', up: true, icon: Eye, color: 'bg-blue-50 text-blue-600' },
  { label: 'Engagement Rate', value: '4.8%', change: '+0.6%', up: true, icon: MousePointerClick, color: 'bg-brand-tint text-brand-dark' },
  { label: 'New Followers', value: '+342', change: '+18%', up: true, icon: UserPlus, color: 'bg-purple-50 text-purple-600' },
  { label: 'Website Clicks', value: '1,247', change: '-3%', up: false, icon: MousePointerClick, color: 'bg-amber-50 text-amber-600' },
]

const socialPlatforms = [
  {
    name: 'Camera',
    icon: Camera,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    followers: '2,847',
    reach: '28.4K',
    engagement: '5.2%',
    topPost: 'Spring Collection Launch carousel — 4.2K reach, 312 likes',
  },
  {
    name: 'Globe',
    icon: Globe,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    followers: '1,523',
    reach: '12.1K',
    engagement: '3.8%',
    topPost: 'St. Patrick\'s Day promo — 2.8K reach, 89 shares',
  },
  {
    name: 'TikTok',
    icon: Video,
    color: 'text-ink',
    bg: 'bg-ink-6',
    followers: '894',
    reach: '7.7K',
    engagement: '6.1%',
    topPost: 'Behind the Scenes kitchen reel — 5.1K views, 423 likes',
  },
]

const topContent = [
  { title: 'Spring Collection Launch', platform: 'Camera', reach: '4.2K', engagement: '7.4%', date: 'Mar 2' },
  { title: 'St. Patrick\'s Day Promo', platform: 'Globe', reach: '2.8K', engagement: '5.1%', date: 'Mar 14' },
  { title: 'Behind the Scenes Reel', platform: 'TikTok', reach: '5.1K', engagement: '8.2%', date: 'Mar 4' },
  { title: 'Weekly Specials Announcement', platform: 'Globe', reach: '1.9K', engagement: '3.6%', date: 'Mar 5' },
  { title: 'Customer Spotlight Story', platform: 'Camera', reach: '1.7K', engagement: '4.8%', date: 'Mar 7' },
]

const platformIconMap: Record<string, typeof Camera> = {
  Camera,
  Globe,
  TikTok: Video,
}

const platformColorMap: Record<string, string> = {
  Camera: 'text-pink-600',
  Globe: 'text-blue-600',
  TikTok: 'text-ink',
}

const emailStats = [
  { label: 'Campaigns Sent', value: '4' },
  { label: 'Open Rate', value: '42.3%' },
  { label: 'Click Rate', value: '8.7%' },
  { label: 'Revenue Attributed', value: '$1,240' },
]

const seoStats = [
  { label: 'Google Maps Ranking', value: '#3', icon: MapPin },
  { label: 'Total Reviews', value: '127', icon: Star },
  { label: 'Citation Accuracy', value: '94%', icon: Search },
]

// ── Component ────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Analytics</h1>
          <p className="text-ink-3 text-sm mt-1">Overview of your marketing performance.</p>
        </div>

        {/* Date range selector */}
        <div className="flex gap-1 bg-bg-2 rounded-xl p-1 w-fit">
          {dateRanges.map((dr) => (
            <button
              key={dr.value}
              onClick={() => setDateRange(dr.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                dateRange === dr.value
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              {dr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {topStats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4 hover:shadow-sm transition-shadow">
            <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
            <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${stat.up ? 'text-emerald-600' : 'text-red-500'}`}>
              {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {stat.change} vs last period
            </div>
          </div>
        ))}
      </div>

      {/* Social Media Breakdown */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Social Media</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {socialPlatforms.map((p) => (
            <div key={p.name} className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg ${p.bg} flex items-center justify-center`}>
                  <p.icon className={`w-5 h-5 ${p.color}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-ink">{p.name}</h3>
                  <p className="text-[11px] text-ink-4">{p.followers} followers</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-xl text-ink">{p.reach}</p>
                  <p className="text-[11px] text-ink-4">Reach this period</p>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-xl text-ink">{p.engagement}</p>
                  <p className="text-[11px] text-ink-4">Engagement rate</p>
                </div>
              </div>
              <div className="pt-3 border-t border-ink-6">
                <p className="text-[11px] text-ink-4 mb-1">Top post</p>
                <p className="text-xs text-ink-2 leading-relaxed">{p.topPost}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Performing Content */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Top Performing Content</h2>
        <div className="space-y-2">
          {topContent.map((item, i) => {
            const Icon = platformIconMap[item.platform] ?? Eye
            const color = platformColorMap[item.platform] ?? 'text-ink-3'
            return (
              <div
                key={i}
                className="bg-white rounded-xl border border-ink-6 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{item.title}</p>
                    <p className="text-[11px] text-ink-4">{item.platform} &middot; {item.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-medium text-ink">{item.reach}</p>
                    <p className="text-[10px] text-ink-4">Reach</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-ink">{item.engagement}</p>
                    <p className="text-[10px] text-ink-4">Engagement</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Email & SMS */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Email &amp; SMS</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {emailStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                {stat.label === 'Campaigns Sent' ? <Mail className="w-4 h-4" /> :
                 stat.label === 'Open Rate' ? <Eye className="w-4 h-4" /> :
                 stat.label === 'Click Rate' ? <MousePointerClick className="w-4 h-4" /> :
                 <Smartphone className="w-4 h-4" />}
              </div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
              <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SEO */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">SEO &amp; Local Presence</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {seoStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-tint text-brand-dark flex items-center justify-center flex-shrink-0">
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-[family-name:var(--font-display)] text-xl text-ink">{stat.value}</div>
                <div className="text-xs text-ink-4">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-ink-6" />

      {/* Content Intelligence, Monthly Trends & Recommendations */}
      <AnalyticsInsights />
    </div>
  )
}
