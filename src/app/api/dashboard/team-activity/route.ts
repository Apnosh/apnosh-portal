/**
 * Recent admin/strategist activity on this client's listing.
 * Powers the "Handled by your Apnosh team" panel.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ACTION_LABEL: Record<string, string> = {
  update_attributes: 'Updated listing attributes',
  update_menu: 'Updated menu',
  update_hours: 'Updated hours',
  update_description: 'Refreshed business description',
  update_categories: 'Tuned listing categories',
  update_listing: 'Updated listing details',
}

export async function GET(_req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()

  const [auditRes, repliesRes] = await Promise.all([
    admin
      .from('gbp_listing_audit')
      .select('action, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('reviews')
      .select('responded_at, author_name, source')
      .eq('client_id', clientId)
      .not('responded_at', 'is', null)
      .order('responded_at', { ascending: false })
      .limit(15),
  ])

  type Entry = { date: string; kind: 'listing_update' | 'review_reply' | 'menu_update' | 'attributes'; description: string }
  const entries: Entry[] = []

  for (const r of (auditRes.data ?? []) as Array<{ action: string; created_at: string }>) {
    const label = ACTION_LABEL[r.action] ?? 'Updated listing'
    const kind: Entry['kind'] = r.action === 'update_menu'
      ? 'menu_update'
      : r.action === 'update_attributes'
        ? 'attributes'
        : 'listing_update'
    entries.push({ date: r.created_at, kind, description: label })
  }

  for (const r of (repliesRes.data ?? []) as Array<{ responded_at: string; author_name: string | null; source: string }>) {
    if (!r.responded_at) continue
    const who = r.author_name ?? 'a customer'
    const where = r.source === 'google' ? 'Google' : r.source.charAt(0).toUpperCase() + r.source.slice(1)
    entries.push({
      date: r.responded_at,
      kind: 'review_reply',
      description: `Replied to ${who}'s ${where} review`,
    })
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return NextResponse.json({ entries: entries.slice(0, 10) })
}
