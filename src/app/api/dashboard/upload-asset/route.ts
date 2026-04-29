/**
 * Asset upload endpoint for the dashboard.
 *
 * Receives a multipart file from the client-side editor (logo replacement,
 * hero photo, About Us image, menu item photo, etc.), uploads to the
 * existing 'client-graphics' Supabase Storage bucket under the client's
 * own folder, and returns the public URL.
 *
 * Auth: signed-in user mapped to a client_id via client_users (or admin).
 *
 * Constraints (server-side):
 *   - Max size 8MB (configurable via env)
 *   - Image MIME types only: jpeg, png, webp, gif, svg+xml
 *
 * Path layout: <client_id>/asset-<timestamp>-<rand>.<ext>
 *
 * The returned URL is a stable public URL that can be stored in
 * client_content_fields, menu_items.photo_url, brand_assets, etc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-graphics'
const MAX_BYTES = 8 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/svg+xml') return 'svg'
  return 'bin'
}

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)

  // 2. Resolve client_id (from query param if admin, else from user mapping)
  const url = new URL(req.url)
  let clientId = url.searchParams.get('clientId')
  if (!clientId) {
    const admin = adminDb()
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (!cu?.client_id) return NextResponse.json({ error: 'no client' }, { status: 403 })
    clientId = cu.client_id as string
  } else if (!isAdmin) {
    // If a clientId was specified, ensure the caller belongs to it
    const admin = adminDb()
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 3. Parse multipart
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })

  // 4. Validate
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 415 })
  }

  // 5. Upload via admin client (bucket policies vary; service role bypasses RLS
  //    but we already verified caller above). Path includes a random suffix so
  //    re-uploads don't collide.
  const ext = extFromMime(file.type)
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${clientId}/asset-${Date.now()}-${rand}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const admin = adminDb()
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json(
    { url: pub.publicUrl, path, size: file.size, type: file.type, name: file.name },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
