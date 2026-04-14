'use server'

import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function createShareLink(cycleId: string, clientId: string, roleFilter: string) {
  const supabase = await createClient()
  const token = crypto.randomBytes(24).toString('hex')
  const expires = new Date()
  expires.setDate(expires.getDate() + 30)

  const { data, error } = await supabase
    .from('production_share_links')
    .insert({
      cycle_id: cycleId,
      client_id: clientId,
      role_filter: roleFilter,
      token,
      expires_at: expires.toISOString(),
    })
    .select('token')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, token: data.token }
}

export async function getShareLinkData(token: string) {
  const supabase = await createClient()

  // Fetch the share link
  const { data: link } = await supabase
    .from('production_share_links')
    .select('id, cycle_id, client_id, role_filter, expires_at, revoked')
    .eq('token', token)
    .maybeSingle()

  if (!link) return { error: 'Link not found' }
  if (link.revoked) return { error: 'This link has been revoked' }
  if (new Date(link.expires_at) < new Date()) return { error: 'This link has expired' }

  // Fetch client name
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', link.client_id)
    .single()

  // Fetch cycle month
  const { data: cycle } = await supabase
    .from('content_cycles')
    .select('month')
    .eq('id', link.cycle_id)
    .single()

  // Fetch content items for this cycle
  const { data: items } = await supabase
    .from('content_calendar_items')
    .select('*')
    .eq('cycle_id', link.cycle_id)
    .order('scheduled_date', { ascending: true })

  return {
    clientName: client?.name || 'Client',
    month: cycle?.month || '',
    roleFilter: link.role_filter,
    items: items || [],
  }
}
