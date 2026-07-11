/**
 * POST /api/admin/catalog-content/upload?itemId=... — hero-image upload for the
 * campaign content CMS (Phase C1). Same bucket + constraints as the dashboard's
 * upload-asset route (client-graphics, 8MB, image MIME types), but stored under a
 * catalog-content/ folder since campaign content is catalog-wide, not client-owned.
 * Returns the stable public URL the admin saves into hero_image. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAMPAIGN_CONTENT } from '@/lib/campaigns/data/campaign-content'
import { isValidCampaignSlug } from '@/lib/campaigns/data/db-campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-graphics'
const MAX_BYTES = 8 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
])

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/avif') return 'avif'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'image/heif') return 'heif'
  return 'bin'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // A built-in content id (C1) or a DB-campaign slug (C2 — may not be saved yet, the
  // create form uploads before the first save). Anything else is junk. Admin-only route,
  // and the file lands under the shared catalog-content/ folder either way.
  const itemId = req.nextUrl.searchParams.get('itemId') ?? ''
  if (!(itemId in CAMPAIGN_CONTENT) && !isValidCampaignSlug(itemId)) {
    return NextResponse.json({ error: 'unknown campaign id' }, { status: 400 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 415 })

  const ext = extFromMime(file.type)
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `catalog-content/${itemId}-${Date.now()}-${rand}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: pub.publicUrl, path }, { headers: { 'Cache-Control': 'no-store' } })
}
