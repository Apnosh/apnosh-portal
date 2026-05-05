/**
 * Client moodboard CRUD. Used by the bespoke form to manage
 * persistent inspiration items per client. The bespoke generator and
 * brief composer auto-load these so quality compounds over time.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { user }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_moodboard_items')
    .select('id, url, image_url, title, notes, tags, pinned, added_at')
    .eq('client_id', clientId)
    .order('pinned', { ascending: false })
    .order('added_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

interface AddItemRequest {
  clientId: string
  url?: string
  imageUrl?: string
  title?: string
  notes?: string
  tags?: string[]
  pinned?: boolean
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null) as AddItemRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (!body.url && !body.imageUrl) {
    return NextResponse.json({ error: 'url or imageUrl required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_moodboard_items')
    .insert({
      client_id: body.clientId,
      url: body.url ?? null,
      image_url: body.imageUrl ?? null,
      title: body.title?.trim() || null,
      notes: body.notes?.trim() || null,
      tags: body.tags?.length ? body.tags : null,
      pinned: !!body.pinned,
      added_by: auth.user.id,
    })
    .select('id, url, image_url, title, notes, tags, pinned, added_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_moodboard_items')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

interface PatchRequest {
  id: string
  pinned?: boolean
  notes?: string
  title?: string
  tags?: string[]
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null) as PatchRequest | null
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.pinned === 'boolean') update.pinned = body.pinned
  if (typeof body.notes === 'string') update.notes = body.notes.trim() || null
  if (typeof body.title === 'string') update.title = body.title.trim() || null
  if (Array.isArray(body.tags)) update.tags = body.tags.length ? body.tags : null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_moodboard_items')
    .update(update)
    .eq('id', body.id)
    .select('id, url, image_url, title, notes, tags, pinned, added_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
