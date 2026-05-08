/**
 * "Today" strip — top-of-dashboard quick-glance for the marketing
 * operator. Strictly marketing-focused: what's publishing today, what
 * needs immediate attention, and the one-line trend signal for the week.
 *
 * Three cells, left to right:
 *   1. Going out today — count + label of scheduled marketing items
 *      publishing in the next 24 hours
 *   2. Needs attention — single most urgent unread/unanswered/unapproved
 *      item; tap to act
 *   3. Trend signal — reach or customer-actions delta for the week
 *
 * No weather, no walk-in predictions, no operations data. Apnosh is the
 * marketing co-pilot, not a restaurant business OS.
 *
 * Edge-cached for 5 minutes since "scheduled today" can shift quickly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'

export const revalidate = 300

interface TodayData {
  scheduled: {
    count: number
    nextLabel: string  // e.g. "Weekend brunch reel · 5pm"
    nextAt: string | null  // ISO time of next item
  }
  attention: {
    label: string
    href: string
    urgency: 'high' | 'medium' | 'low'
  } | null
  signal: {
    label: string
    value: string
    up: boolean | null
  } | null
  generatedAt: string
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    const hr = d.getHours()
    const min = d.getMinutes()
    const m = hr % 12 === 0 ? 12 : hr % 12
    const ampm = hr >= 12 ? 'pm' : 'am'
    return `${m}${min ? ':' + String(min).padStart(2, '0') : ''}${ampm}`
  }
  // Next-day or later — show day-of-week
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' })
}

function snippet(text: string | null, max = 32): string {
  if (!text) return 'Scheduled post'
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : t.slice(0, max - 1).trim() + '…'
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000)

  // Parallel: scheduled posts (next 24h) · unanswered review · pending approvals · pulse
  const [scheduledRow, unansweredRow, approvalsRow, pulse] = await Promise.all([
    admin
      .from('scheduled_posts')
      .select('id, text, scheduled_for, platforms')
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .gte('scheduled_for', now.toISOString())
      .lte('scheduled_for', in24h.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(5),
    admin
      .from('reviews')
      .select('id, rating, posted_at')
      .eq('client_id', clientId)
      .is('response_text', null)
      .order('rating', { ascending: true })  // worst first
      .order('posted_at', { ascending: false })
      .limit(1),
    admin
      .from('deliverables')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', clientId)
      .eq('status', 'client_review'),
    getPulseData(clientId).catch(() => null),
  ])

  const scheduled = scheduledRow.data ?? []
  const next = scheduled[0]
  const scheduledData: TodayData['scheduled'] = next
    ? {
        count: scheduled.length,
        nextLabel: `${snippet(next.text)} · ${timeLabel(next.scheduled_for)}`,
        nextAt: next.scheduled_for,
      }
    : { count: 0, nextLabel: 'Nothing queued for today', nextAt: null }

  // Pick the single most-urgent attention item
  let attention: TodayData['attention'] = null
  const lowReview = unansweredRow.data?.[0]
  const approvalCount = approvalsRow.count ?? 0
  if (lowReview && lowReview.rating <= 3) {
    attention = {
      label: `${lowReview.rating}★ review needs reply`,
      href: '/dashboard/local-seo/reviews',
      urgency: 'high',
    }
  } else if (approvalCount > 0) {
    attention = {
      label: `${approvalCount} item${approvalCount === 1 ? '' : 's'} to approve`,
      href: '/dashboard/approvals',
      urgency: approvalCount >= 3 ? 'high' : 'medium',
    }
  } else if (lowReview) {
    attention = {
      label: `New ${lowReview.rating}★ review — reply ready`,
      href: '/dashboard/local-seo/reviews',
      urgency: 'medium',
    }
  }

  // Trend signal — prefer reach, fall back to customers
  let signal: TodayData['signal'] = null
  if (pulse?.reach.state === 'live' && pulse.reach.delta) {
    signal = {
      label: 'Reach this week',
      value: pulse.reach.delta,
      up: pulse.reach.up ?? null,
    }
  } else if (pulse?.customers.state === 'live' && pulse.customers.delta) {
    signal = {
      label: 'Customer actions this week',
      value: pulse.customers.delta,
      up: pulse.customers.up ?? null,
    }
  }

  const result: TodayData = {
    scheduled: scheduledData,
    attention,
    signal,
    generatedAt: new Date().toISOString(),
  }
  return NextResponse.json(result)
}
