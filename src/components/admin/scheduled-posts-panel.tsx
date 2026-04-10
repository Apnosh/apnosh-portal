'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  CalendarClock, ChevronRight, Image as ImageIcon, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'

interface ScheduledPost {
  id: string
  input_text: string | null
  scheduled_for: string
  service_area: string | null
  content_format: string | null
  client_id: string
  client_name: string
  client_slug: string
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function bucketFor(scheduledFor: string): 'overdue' | 'today' | 'week' | 'later' {
  const now = startOfDay(new Date())
  const target = startOfDay(new Date(scheduledFor))
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'week'
  return 'later'
}

function formatRelative(scheduledFor: string): string {
  const now = startOfDay(new Date())
  const target = startOfDay(new Date(scheduledFor))
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays <= 7) return `In ${diffDays}d`
  return new Date(scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ScheduledPostsPanel() {
  const supabase = createClient()
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // Pull all scheduled posts from now back to 7 days overdue, forward 30 days
    const from = new Date()
    from.setDate(from.getDate() - 7)
    const to = new Date()
    to.setDate(to.getDate() + 30)

    const { data } = await supabase
      .from('content_queue')
      .select('id, input_text, scheduled_for, service_area, content_format, client_id, clients(name, slug)')
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', from.toISOString())
      .lte('scheduled_for', to.toISOString())
      .order('scheduled_for', { ascending: true })

    if (data) {
      const mapped: ScheduledPost[] = data.map(row => {
        const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
        return {
          id: row.id,
          input_text: row.input_text,
          scheduled_for: row.scheduled_for,
          service_area: row.service_area,
          content_format: row.content_format,
          client_id: row.client_id,
          client_name: (client as { name?: string } | null)?.name ?? 'Unknown client',
          client_slug: (client as { slug?: string } | null)?.slug ?? '',
        }
      })
      setPosts(mapped)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['content_queue'], load)

  const overdue = posts.filter(p => bucketFor(p.scheduled_for) === 'overdue')
  const today = posts.filter(p => bucketFor(p.scheduled_for) === 'today')
  const week = posts.filter(p => bucketFor(p.scheduled_for) === 'week')
  const later = posts.filter(p => bucketFor(p.scheduled_for) === 'later')

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="h-4 w-40 bg-ink-6 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-bg-2 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-ink-4" />
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Scheduled Posts</h2>
        </div>
        <p className="text-xs text-ink-4">Nothing on the schedule. Approved posts with a publish date will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-indigo-600" />
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Scheduled Posts</h2>
        </div>
        <span className="text-[10px] text-ink-4 font-medium">{posts.length} upcoming</span>
      </div>

      {overdue.length > 0 && (
        <Section
          label="Overdue"
          count={overdue.length}
          headerClass="text-red-700"
          iconAccent="text-red-600"
          icon={AlertTriangle}
        >
          {overdue.map(p => <PostRow key={p.id} post={p} accent="red" />)}
        </Section>
      )}

      {today.length > 0 && (
        <Section
          label="Today"
          count={today.length}
          headerClass="text-amber-700"
          iconAccent="text-amber-600"
        >
          {today.map(p => <PostRow key={p.id} post={p} accent="amber" />)}
        </Section>
      )}

      {week.length > 0 && (
        <Section
          label="This Week"
          count={week.length}
          headerClass="text-ink-3"
          iconAccent="text-ink-4"
        >
          {week.map(p => <PostRow key={p.id} post={p} accent="ink" />)}
        </Section>
      )}

      {later.length > 0 && (
        <Section
          label="Later"
          count={later.length}
          headerClass="text-ink-4"
          iconAccent="text-ink-4"
        >
          {later.map(p => <PostRow key={p.id} post={p} accent="ink" />)}
        </Section>
      )}
    </div>
  )
}

function Section({
  label, count, headerClass, iconAccent, icon: Icon, children,
}: {
  label: string
  count: number
  headerClass: string
  iconAccent: string
  icon?: typeof AlertTriangle
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className={`w-3 h-3 ${iconAccent}`} />}
        <span className={`text-[10px] font-bold uppercase tracking-wider ${headerClass}`}>
          {label}
        </span>
        <span className="text-[10px] text-ink-4">· {count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function PostRow({
  post, accent,
}: { post: ScheduledPost; accent: 'red' | 'amber' | 'ink' }) {
  const accentMap = {
    red: 'border-red-200 bg-red-50/40 hover:bg-red-50',
    amber: 'border-amber-200 bg-amber-50/40 hover:bg-amber-50',
    ink: 'border-ink-6 hover:bg-bg-2',
  }
  const dateClass = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    ink: 'text-ink-4',
  }

  return (
    <Link
      href={`/admin/clients/${post.client_slug}?tab=queue`}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors group ${accentMap[accent]}`}
    >
      <div className="w-7 h-7 rounded-lg bg-white border border-ink-6 flex items-center justify-center flex-shrink-0">
        <ImageIcon className="w-3.5 h-3.5 text-ink-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink truncate">{post.client_name}</p>
        <p className="text-[11px] text-ink-3 truncate">
          {post.input_text || 'Scheduled post'}
        </p>
      </div>
      <span className={`text-[10px] font-bold flex-shrink-0 ${dateClass[accent]}`}>
        {formatRelative(post.scheduled_for)}
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  )
}
