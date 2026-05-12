/**
 * POST   /api/work/drafts/[id]/media   — attach a media URL (paste path)
 * PUT    /api/work/drafts/[id]/media   — upload an image file (drag-drop path)
 * DELETE /api/work/drafts/[id]/media?url=...  — remove one URL from the list
 *
 * Both attach paths land in the same content_drafts.media_urls text[].
 * Upload writes to the existing client-assets Supabase Storage bucket
 * with a draft-scoped path so cleanup is straightforward later.
 *
 * Reachability: the paste path does a HEAD fetch + MIME check so a
 * dead Drive link gets caught now rather than during publish.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'client-assets'
const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm))$/i

async function loadDraft(draftId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized', status: 401 as const }

  // RLS gate: hidden drafts return 404.
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, media_urls, status')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return { error: 'draft not found', status: 404 as const }
  if (draft.status === 'published' || draft.status === 'rejected') {
    return { error: `cannot edit media on a ${draft.status} draft`, status: 409 as const }
  }
  return { draft, user }
}

/**
 * Paste path. Body: { url: string }.
 * Validates the URL is HTTP(S) and returns an image/video MIME via HEAD.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params
  const loaded = await loadDraft(draftId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { draft } = loaded

  const body = (await req.json().catch(() => null)) as { url?: string } | null
  const url = body?.url?.trim()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'url must be http(s)' }, { status: 400 })
  }

  // Reachability + MIME sniff. Some hosts (Drive) don't support HEAD;
  // fall through to a small GET range and just look at content-type.
  try {
    let mime: string | null = null
    const headRes = await fetch(url, { method: 'HEAD' })
    if (headRes.ok) {
      mime = headRes.headers.get('content-type')
    }
    if (!mime) {
      const getRes = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-1' } })
      mime = getRes.headers.get('content-type')
    }
    if (!mime || !ALLOWED_MIME.test(mime.split(';')[0].trim())) {
      return NextResponse.json({
        error: `URL didn't return a recognized image/video type (got ${mime ?? 'no content-type'}).`,
        code: 'bad_mime',
      }, { status: 422 })
    }
  } catch {
    return NextResponse.json({
      error: 'Could not reach the URL. Check it is public and try again.',
      code: 'unreachable',
    }, { status: 422 })
  }

  const admin = createAdminClient()
  const current = Array.isArray(draft.media_urls) ? (draft.media_urls as string[]) : []
  if (current.includes(url)) {
    return NextResponse.json({ ok: true, mediaUrls: current })
  }
  const next = [...current, url]
  const { error } = await admin
    .from('content_drafts')
    .update({ media_urls: next, updated_at: new Date().toISOString() })
    .eq('id', draftId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, mediaUrls: next })
}

/**
 * Upload path. Multipart form-data: { file }. Writes to Supabase
 * Storage, then appends the public URL to media_urls.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params
  const loaded = await loadDraft(draftId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { draft, user } = loaded

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required (multipart form-data)' }, { status: 400 })
  }
  if (!ALLOWED_MIME.test(file.type)) {
    return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 415 })
  }
  // 25MB cap. Meta's IG photo limit is 8MB, but we accept up to 25MB
  // so video clips and pre-resize JPEGs fit. The publish step will
  // re-validate.
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'file exceeds 25MB' }, { status: 413 })
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${draft.client_id}/drafts/${draftId}/${Date.now()}-${user.id.slice(0, 8)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const current = Array.isArray(draft.media_urls) ? (draft.media_urls as string[]) : []
  const next = [...current, publicUrl]
  const { error } = await admin
    .from('content_drafts')
    .update({ media_urls: next, updated_at: new Date().toISOString() })
    .eq('id', draftId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, mediaUrls: next, uploaded: publicUrl })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params
  const loaded = await loadDraft(draftId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { draft } = loaded

  const url = new URL(req.url).searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url query param required' }, { status: 400 })

  const admin = createAdminClient()
  const current = Array.isArray(draft.media_urls) ? (draft.media_urls as string[]) : []
  const next = current.filter(u => u !== url)
  if (next.length === current.length) {
    return NextResponse.json({ ok: true, mediaUrls: current })
  }

  const { error } = await admin
    .from('content_drafts')
    .update({ media_urls: next, updated_at: new Date().toISOString() })
    .eq('id', draftId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If the URL was a Supabase Storage object from our bucket, delete
  // the underlying file too. Best-effort — pasted external URLs are
  // left alone.
  if (url.includes(`/storage/v1/object/public/${BUCKET}/`)) {
    const key = url.split(`/${BUCKET}/`).pop()
    if (key) {
      await admin.storage.from(BUCKET).remove([key]).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true, mediaUrls: next })
}
