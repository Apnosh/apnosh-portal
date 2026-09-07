import 'server-only'
/**
 * delivered-assets — when work LANDS, the file lands in the owner's library.
 *
 * The ninety-day audit found zero rows in `assets` on a live account. Three lanes deliver work
 * (a service work order, a creator work order, a published content draft) and none of them put
 * the delivered thing anywhere the owner could open it: the link lived on an admin row, or on a
 * feed post, and the owner's Photos & files page (/dashboard/assets) stayed empty forever.
 *
 * One lane DID try — the photo-library delivery — and it wrote `type: 'file'`, which is not one
 * of the four kinds the table's CHECK allows ('image','video','text','document'). Every non-image
 * delivery was rejected by Postgres into a bare catch. That is the whole of "0 assets rows ever",
 * and it is why the kind is decided by one function here instead of at each call site.
 *
 * Best-effort by contract: a delivery is delivered whether or not the library row lands, so every
 * failure is a console.warn, never a throw. Idempotent on (client_id, file_url) so re-delivering,
 * re-publishing, or a retry never stacks the same file twice.
 */
import { createAdminClient } from '@/lib/supabase/admin'

/** The four kinds the assets table allows (020_social_final_build.sql: the type CHECK). */
export type DeliveredAssetType = 'image' | 'video' | 'text' | 'document'

/**
 * What kind of thing is at this link, from the link alone.
 *
 * We never fetch the URL: a delivery must not wait on someone else's server, and a Drive or
 * Dropbox link answers a HEAD with HTML anyway. Anything we cannot name is a 'document' — the
 * honest catch-all, and the one the Files filter already shows.
 */
export function assetTypeFor(url: string): DeliveredAssetType {
  const path = (url || '').split(/[?#]/)[0].toLowerCase()
  if (/\.(jpe?g|png|webp|gif|heic|heif|avif|svg)$/.test(path)) return 'image'
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(path)) return 'video'
  return 'document'
}

/** Only a real http(s) link becomes a library row. A blank or a "see the shared folder" note is
 *  not something the owner can open, and a row they cannot open is worse than no row. */
function openable(url: string | null | undefined): url is string {
  const u = (url ?? '').trim()
  return /^https?:\/\//i.test(u)
}

/**
 * Put one delivered file in the owner's library.
 *
 * Returns true when a NEW row was written, false for a no-op (not a link, already there, or the
 * write failed and was logged). `uploaded_by_client` is false: Apnosh delivered this, and the
 * table's client-delete policy only covers the owner's own uploads, so a delivered file cannot be
 * deleted out from under the record.
 */
export async function recordDeliveredAsset(args: {
  clientId: string
  /** The owner's own words for the thing, e.g. "Fall photo library". */
  name: string
  url: string | null | undefined
  /** Extra tags beyond the two every delivery carries. */
  tags?: string[]
}): Promise<boolean> {
  if (!args.clientId || !openable(args.url)) return false
  const fileUrl = args.url.trim()
  try {
    const admin = createAdminClient()
    // Idempotence by read-then-insert: there is no unique index on (client_id, file_url), and
    // adding one would fail on accounts that already hold the same link twice from an upload.
    const { data: have } = await admin
      .from('assets')
      .select('id')
      .eq('client_id', args.clientId)
      .eq('file_url', fileUrl)
      .limit(1)
    if (have && have.length) return false
    const { error } = await admin.from('assets').insert({
      client_id: args.clientId,
      name: args.name.slice(0, 200) || 'Delivered work',
      type: assetTypeFor(fileUrl),
      file_url: fileUrl,
      tags: ['delivered', 'apnosh', ...(args.tags ?? [])],
      uploaded_by_client: false,
    })
    if (error) { console.warn('[delivered-assets] library row not written:', error.message); return false }
    return true
  } catch (e) {
    console.warn('[delivered-assets] library write failed:', (e as Error)?.message)
    return false
  }
}

/** Many files from one delivery (a published post's media). Returns how many rows were new. */
export async function recordDeliveredAssets(args: {
  clientId: string
  name: string
  urls: Array<string | null | undefined>
  tags?: string[]
}): Promise<number> {
  const urls = args.urls.filter(openable)
  if (!urls.length) return 0
  let written = 0
  for (let i = 0; i < urls.length; i++) {
    // Numbered only when there is more than one, so a single file keeps the plain name.
    const name = urls.length > 1 ? `${args.name} (${i + 1} of ${urls.length})` : args.name
    if (await recordDeliveredAsset({ clientId: args.clientId, name, url: urls[i], tags: args.tags })) written++
  }
  return written
}
