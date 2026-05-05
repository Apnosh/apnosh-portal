/**
 * Drive → Supabase storage import.
 *
 * For each {fileId, destination?, alt?} in the request:
 *   1. Download the binary from Drive (using the Apnosh service token)
 *   2. Upload to client-assets bucket at {clientId}/site-builder/drive/{stable-name}
 *   3. Insert into the assets table with proper metadata + tags
 *   4. If destination is set, patch site_configs.draft_data accordingly
 *      (e.g. destination "hero.photoUrl" sets the hero photo URL;
 *       "gallery" appends to gallery.photos[]; "location:alki" sets
 *       that location's photoUrl)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFileAsBuffer, refreshAccessToken } from '@/lib/google-drive'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface ImportItem {
  fileId: string
  fileName: string
  mimeType: string
  /** Where to route the imported asset. Examples:
   *   "skip"               — just register, no draft change
   *   "hero.photoUrl"      — set draft_data.hero.photoUrl
   *   "about.photoUrl"     — set draft_data.about.photoUrl
   *   "header.logo"        — set draft_data.brand.logoUrl
   *   "gallery"            — append to gallery.photos[]
   *   "location:<id>"      — set locations[<id>].photoUrl
   *   "testimonial:<idx>"  — set testimonials.items[<idx>].photoUrl
   */
  destination?: string
  alt?: string
}

interface ImportRequest {
  clientId: string
  items: ImportItem[]
}

interface ImportResult {
  fileId: string
  fileName: string
  url: string | null
  destination: string | null
  error: string | null
}

export async function POST(req: NextRequest) {
  // Admin gate
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

  const body = await req.json().catch(() => null) as ImportRequest | null
  if (!body?.clientId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'clientId and items[] required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const token = await getValidDriveTokenInternal(admin)
  if (!token) {
    return NextResponse.json({ error: 'Drive not connected — connect via Settings → Integrations first' }, { status: 412 })
  }

  // Process each file sequentially to keep memory bounded
  const results: ImportResult[] = []
  for (const item of body.items) {
    const r: ImportResult = { fileId: item.fileId, fileName: item.fileName, url: null, destination: null, error: null }
    try {
      // 1. Download from Drive
      const dl = await downloadFileAsBuffer(token, item.fileId)
      if (!dl) { r.error = 'Drive download failed'; results.push(r); continue }

      // 2. Upload to Supabase storage
      const ext = guessExtension(item.fileName, item.mimeType, dl.contentType)
      const safeName = sanitizeFilename(item.fileName).replace(/\.[^.]+$/, '')
      const key = `${body.clientId}/site-builder/drive/${Date.now()}-${rand()}-${safeName}${ext}`
      const { error: uploadErr } = await admin.storage
        .from('client-assets')
        .upload(key, new Uint8Array(dl.buffer), {
          contentType: item.mimeType || dl.contentType,
          upsert: false,
        })
      if (uploadErr) { r.error = uploadErr.message; results.push(r); continue }
      const { data: urlData } = admin.storage.from('client-assets').getPublicUrl(key)
      r.url = urlData.publicUrl

      // 3. Insert into assets table
      const tags = inferTagsFromFilename(item.fileName)
      if (item.destination && item.destination !== 'skip') tags.push(destToTag(item.destination))
      const { error: insErr } = await admin
        .from('assets')
        .insert({
          client_id: body.clientId,
          name: item.fileName,
          type: item.mimeType?.startsWith('video/') ? 'video' : 'image',
          file_url: r.url,
          mime_type: item.mimeType ?? dl.contentType,
          file_size: dl.buffer.byteLength,
          tags,
          uploaded_by_client: false,
          uploaded_by_client_user: null,
        })
      if (insErr) console.warn('[drive-import] assets insert failed:', insErr.message)

      // 4. Patch draft_data if destination is set
      if (item.destination && item.destination !== 'skip') {
        await applyDestination(admin, body.clientId, item.destination, r.url, item.alt)
        r.destination = item.destination
      }
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e)
    }
    results.push(r)
  }

  return NextResponse.json({
    success: true,
    results,
    summary: {
      total: results.length,
      ok: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
    },
  })
}

// ---------- helpers ----------

async function getValidDriveTokenInternal(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data } = await admin
    .from('integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('provider', 'google_drive')
    .maybeSingle()
  const row = data as { access_token: string; refresh_token: string | null; token_expires_at: string | null } | null
  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const buffer = 60 * 1000
  if (expiresAt - Date.now() > buffer) return row.access_token

  if (!row.refresh_token) return null
  try {
    const refreshed = await refreshAccessToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await admin
      .from('integrations')
      .update({
        access_token: refreshed.access_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'google_drive')
    return refreshed.access_token
  } catch {
    return null
  }
}

async function applyDestination(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  destination: string,
  url: string,
  alt?: string,
): Promise<void> {
  const { data: row } = await admin
    .from('site_configs')
    .select('draft_data')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!row) return
  const draft = (row.draft_data as RestaurantSite | null) ?? null
  if (!draft) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next: any = JSON.parse(JSON.stringify(draft))

  if (destination === 'hero.photoUrl') {
    next.hero = { ...next.hero, photoUrl: url }
  } else if (destination === 'about.photoUrl') {
    next.about = { ...next.about, photoUrl: url }
  } else if (destination === 'header.logo') {
    next.brand = { ...next.brand, logoUrl: url }
  } else if (destination === 'gallery') {
    const photos = Array.isArray(next.gallery?.photos) ? next.gallery.photos : []
    next.gallery = {
      ...(next.gallery ?? { enabled: true, heading: 'Photos', description: '', photos: [] }),
      enabled: true,
      photos: [...photos, { url, caption: '', alt: alt ?? '' }],
    }
  } else if (destination.startsWith('location:')) {
    const id = destination.slice('location:'.length)
    const locs = Array.isArray(next.locations) ? next.locations : []
    next.locations = locs.map((l: { id?: string }) => l.id === id ? { ...l, photoUrl: url } : l)
  } else if (destination.startsWith('testimonial:')) {
    const idx = parseInt(destination.slice('testimonial:'.length), 10)
    const items = Array.isArray(next.testimonials?.items) ? next.testimonials.items : []
    next.testimonials = {
      ...(next.testimonials ?? { enabled: true, heading: 'What guests are saying', items: [] }),
      items: items.map((t: object, i: number) => i === idx ? { ...t, photoUrl: url } : t),
    }
  }

  await admin
    .from('site_configs')
    .update({ draft_data: next })
    .eq('client_id', clientId)
}

function guessExtension(filename: string, mimeType: string, fallbackMime: string): string {
  const fromName = filename.match(/\.[a-zA-Z0-9]+$/)?.[0]
  if (fromName) return fromName.toLowerCase()
  const m = mimeType || fallbackMime
  if (m.includes('jpeg')) return '.jpg'
  if (m.includes('png')) return '.png'
  if (m.includes('webp')) return '.webp'
  if (m.includes('gif')) return '.gif'
  if (m.includes('mp4')) return '.mp4'
  if (m.includes('quicktime')) return '.mov'
  return ''
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 64)
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8)
}

function inferTagsFromFilename(name: string): string[] {
  const tags: string[] = []
  const n = name.toLowerCase()
  const KEYWORDS = ['hero', 'banner', 'about', 'logo', 'menu', 'food', 'drink', 'group', 'location', 'exterior', 'interior', 'gallery', 'press']
  for (const k of KEYWORDS) {
    if (n.includes(k)) tags.push(k)
  }
  return tags
}

function destToTag(destination: string): string {
  if (destination.startsWith('location:')) return 'location'
  if (destination.startsWith('testimonial:')) return 'testimonial'
  if (destination === 'header.logo') return 'logo'
  if (destination === 'hero.photoUrl') return 'hero'
  if (destination === 'about.photoUrl') return 'about'
  if (destination === 'gallery') return 'gallery'
  return destination
}
