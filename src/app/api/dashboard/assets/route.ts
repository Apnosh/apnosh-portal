/**
 * The owner's photo library, for picking one in a flow (Announce, the content screen, 2026-09-22).
 * GET ?clientId= → the newest image assets: id, name, url, when. Read only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId') ?? ''
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('assets').select('id, name, file_url, type, created_at').eq('client_id', clientId).eq('type', 'image').not('file_url', 'is', null).order('created_at', { ascending: false }).limit(40)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photos: (data ?? []).map((a) => ({ id: a.id as string, name: (a.name as string) ?? '', url: a.file_url as string, at: a.created_at as string })) })
}
