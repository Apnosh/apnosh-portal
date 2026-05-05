/**
 * List a client's linked Google Drive folders + their image/video files.
 * Used by the Drive import drawer in the Site Builder.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listClientDriveFolders } from '@/lib/drive-actions'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { folders, error } = await listClientDriveFolders(clientId)
  if (error) {
    return NextResponse.json({ error, folders: [] }, { status: 200 }) // 200 so UI shows the connect-prompt instead of 5xx
  }

  // Filter each folder's files to images + videos only — those are the ones
  // we can route to site config destinations
  const filtered = folders.map(f => ({
    ...f,
    files: f.files.filter(file =>
      file.mimeType?.startsWith('image/') ||
      file.mimeType?.startsWith('video/'),
    ),
  }))

  return NextResponse.json({ folders: filtered })
}
