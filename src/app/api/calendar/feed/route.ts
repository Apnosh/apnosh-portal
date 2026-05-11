/**
 * GET /api/calendar/feed?c=<clientId>&t=<token>
 *
 * Returns an iCalendar (.ics) feed of everything on the client's
 * unified calendar so they can subscribe from Google / Apple / Outlook.
 *
 * Auth: no session required (subscription clients won't carry one).
 * The clientId is signed with a server secret; we verify before
 * serving. Token can be rotated via CALENDAR_FEED_SECRET.
 *
 * Window: 30 days back to 365 days forward. Cached 15 minutes at
 * the edge so subscription pollers don't hammer the DB.
 */

import { NextRequest } from 'next/server'
import { getCalendar, type CalendarEvent, type CalendarEventKind } from '@/lib/dashboard/get-calendar'
import { verifyClientId } from '@/lib/calendar/feed-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('c') ?? ''
  const token = url.searchParams.get('t') ?? ''

  if (!verifyClientId(clientId, token)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const from = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const to = new Date(Date.now() + 365 * 86_400_000).toISOString()
  const events = await getCalendar(clientId, { fromIso: from, toIso: to })

  const ics = buildIcs(events)
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="apnosh.ics"',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  })
}

function buildIcs(events: CalendarEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Apnosh//Portal Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Apnosh',
    'X-WR-CALDESC:Posts, emails, shoots, and tasks from your Apnosh portal',
  ]
  const stamp = formatIcsTime(new Date())
  for (const e of events) {
    const start = new Date(e.startIso)
    const durMin = e.kind === 'shoot' ? 120 : e.kind === 'task' ? 15 : 30
    const end = new Date(start.getTime() + durMin * 60_000)
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@apnosh-portal`)
    lines.push(`DTSTAMP:${stamp}`)
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(start)}`)
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDays(start, 1))}`)
    } else {
      lines.push(`DTSTART:${formatIcsTime(start)}`)
      lines.push(`DTEND:${formatIcsTime(end)}`)
    }
    lines.push(`SUMMARY:${escapeIcs(`[${kindLabel(e.kind)}] ${e.title}`)}`)
    const desc = [
      e.detail ?? '',
      `Status: ${e.status}`,
      e.platforms?.length ? `Platforms: ${e.platforms.join(', ')}` : '',
    ].filter(Boolean).join('\\n')
    if (desc) lines.push(`DESCRIPTION:${escapeIcs(desc)}`)
    lines.push(`CATEGORIES:${kindLabel(e.kind).toUpperCase()}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function kindLabel(k: CalendarEventKind): string {
  switch (k) {
    case 'post': return 'Post'
    case 'email': return 'Email'
    case 'shoot': return 'Shoot'
    case 'content': return 'Content'
    case 'task': return 'Task'
  }
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function formatIcsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function formatIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}
