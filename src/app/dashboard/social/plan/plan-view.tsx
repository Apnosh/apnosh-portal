'use client'

/**
 * Editorial plan view — month + next month rendered as two stacked
 * sections. Each section: theme hero, content pillars chips, key
 * dates rail, then the slate of posts planned against the month.
 *
 * Empty months explain what the page will look like once the
 * strategist publishes a theme.
 */

import Link from 'next/link'
import {
  Sparkles, ChevronRight,
  Image as ImageIcon, Camera, Globe, Music, Send,
} from 'lucide-react'
import type { EditorialPlanData, EditorialMonth, PlannedItem } from '@/lib/dashboard/get-editorial-plan'

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  facebook: Globe,
  tiktok: Music,
  linkedin: Send,
}

const PILLAR_TINTS = [
  'bg-amber-50 text-amber-700 ring-amber-100',
  'bg-sky-50 text-sky-700 ring-sky-100',
  'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-violet-50 text-violet-700 ring-violet-100',
  'bg-orange-50 text-orange-700 ring-orange-100',
]

export default function EditorialPlanView({ data }: { data: EditorialPlanData }) {
  /* Header lives in the parent Calendar page now -- this view renders
     only the two month sections so it slots cleanly under the tab strip. */
  return (
    <div className="space-y-10 pt-2">
      <MonthSection month={data.thisMonth} primary />
      <MonthSection month={data.nextMonth} primary={false} />
    </div>
  )
}

function MonthSection({ month, primary }: { month: EditorialMonth; primary: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className={`tracking-tight ${primary ? 'text-[24px] font-bold text-ink' : 'text-[18px] font-semibold text-ink-2'}`}>
          {month.monthLabel}
        </h2>
        {month.theme && (
          <p className="text-[11px] text-ink-4 tabular-nums">
            {month.publishedCount + month.scheduledCount + month.inReviewCount} posts planned
          </p>
        )}
      </div>

      {month.theme ? (
        <>
          <ThemeHero theme={month.theme} />
          {month.theme.pillars.length > 0 && (
            <Pillars pillars={month.theme.pillars} />
          )}
          {month.theme.keyDates.length > 0 && (
            <KeyDates dates={month.theme.keyDates} />
          )}
          <Slate
            items={month.items}
            published={month.publishedCount}
            scheduled={month.scheduledCount}
            inReview={month.inReviewCount}
          />
        </>
      ) : (
        <EmptyMonth primary={primary} />
      )}
    </div>
  )
}

function ThemeHero({ theme }: { theme: EditorialMonth['theme'] }) {
  if (!theme) return null
  return (
    <div
      className="rounded-2xl border bg-gradient-to-br from-amber-50/60 via-white to-white p-6 mb-4"
      style={{ borderColor: 'var(--db-border, #f0e6d6)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 leading-none mb-1.5">
        This month&rsquo;s theme
      </p>
      <h3 className="text-[22px] sm:text-[24px] font-bold text-ink tracking-tight leading-tight">
        {theme.themeName}
      </h3>
      {theme.themeBlurb && (
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          {theme.themeBlurb}
        </p>
      )}
    </div>
  )
}

function Pillars({ pillars }: { pillars: string[] }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
        Content pillars
      </p>
      <div className="flex flex-wrap gap-1.5">
        {pillars.map((p, i) => (
          <span
            key={p}
            className={`inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full ring-1 ${PILLAR_TINTS[i % PILLAR_TINTS.length]}`}
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}

function KeyDates({ dates }: { dates: Array<{ date: string; label: string; note?: string }> }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return (
    <div className="mb-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
        Key dates
      </p>
      <ul className="space-y-1.5">
        {dates.map((d, i) => {
          // Parse YYYY-MM-DD as a LOCAL date (not UTC) so "2026-05-12"
          // renders as May 12 in any timezone instead of slipping to May 11
          // for users west of UTC.
          const [y, mo, da] = (d.date as string).split('-').map(Number)
          const date = new Date(y, (mo ?? 1) - 1, da ?? 1)
          const isPast = date < today
          const daysUntil = Math.round((date.getTime() - today.getTime()) / 86_400_000)
          return (
            <li
              key={i}
              className={`flex items-start gap-3 rounded-xl border bg-white p-3 ${isPast ? 'opacity-60' : ''}`}
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="w-12 flex-shrink-0 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  {date.toLocaleDateString('en-US', { month: 'short' })}
                </p>
                <p className="text-[18px] font-bold text-ink tabular-nums leading-none">
                  {date.getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink leading-tight">{d.label}</p>
                {d.note && (
                  <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{d.note}</p>
                )}
              </div>
              {!isPast && daysUntil >= 0 && (
                <span className="text-[11px] text-ink-4 tabular-nums self-center">
                  {daysUntil === 0 ? 'Today' : `in ${daysUntil}d`}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Slate({
  items, published, scheduled, inReview,
}: {
  items: PlannedItem[]
  published: number
  scheduled: number
  inReview: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
          What&rsquo;s lined up
        </p>
        <p className="text-[11px] text-ink-4 tabular-nums">
          {published > 0 && <span className="text-emerald-700">{published} published</span>}
          {published > 0 && (scheduled > 0 || inReview > 0) && <span> · </span>}
          {scheduled > 0 && <span>{scheduled} scheduled</span>}
          {scheduled > 0 && inReview > 0 && <span> · </span>}
          {inReview > 0 && <span className="text-amber-700">{inReview} in review</span>}
        </p>
      </div>
      {items.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-6 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <p className="text-[12px] text-ink-3 leading-relaxed">
            Posts will line up here once your strategist drafts and schedules them.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map(item => <SlateRow key={item.id} item={item} />)}
          {items.length > 8 && (
            <li className="text-center">
              <Link
                href="/dashboard/calendar"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink py-2"
              >
                And {items.length - 8} more · Open calendar
                <ChevronRight className="w-3 h-3" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function SlateRow({ item }: { item: PlannedItem }) {
  const platform = item.platforms[0] ?? 'instagram'
  const PlatformIcon = PLATFORM_ICON[platform] ?? Camera
  const statusTone = item.status === 'published' ? 'text-emerald-700 bg-emerald-50' :
                     item.status === 'scheduled' ? 'text-sky-700 bg-sky-50' :
                     item.status === 'in_review' ? 'text-amber-700 bg-amber-50' :
                                                    'text-ink-3 bg-ink-7'
  return (
    <li>
      <div
        className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        {item.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.mediaUrl} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-bg-2 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-4 h-4 text-ink-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-ink-2 truncate leading-snug">
            {item.text || 'Scheduled post'}
          </p>
          {item.scheduledFor && (
            <p className="text-[10px] text-ink-4 tabular-nums mt-0.5">
              {new Date(item.scheduledFor).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(item.scheduledFor).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusTone}`}>
          {item.status.replace(/_/g, ' ')}
        </span>
        <PlatformIcon className="w-3 h-3 text-ink-4 flex-shrink-0" />
      </div>
    </li>
  )
}

function EmptyMonth({ primary }: { primary: boolean }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-8 bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-bg-2 text-ink-3 flex-shrink-0">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-ink leading-tight">
            {primary ? 'No theme published yet' : 'Next month is being planned'}
          </p>
          <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">
            {primary
              ? 'Your strategist sets a theme, content pillars, and key dates here. You see it once they share it.'
              : 'Next month’s theme drops a couple of weeks before it starts.'}
          </p>
        </div>
      </div>
    </div>
  )
}
