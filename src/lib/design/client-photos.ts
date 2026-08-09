import 'server-only'
/**
 * THE REAL PHOTO LIBRARY for the design order flow (reuse flag 1, landed).
 *
 * "Which photos should we use?" is only a real question when the choices are the client's
 * own photos. Two places already hold them:
 *   - assets            the owner's Photos & files library (type 'image')
 *   - menu_items        dish photos (photo_url), labeled by the dish so the designer
 *                       knows exactly what they are looking at
 *
 * Dimensions: the assets page stores "WxH" when it could measure at upload; menu photos
 * never carry dimensions. Unknown sizes go out as 0x0 and the flow measures them in the
 * browser before the quality gate judges them — unknown is a question, never a silent fail.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { DesignAsset } from '@/components/design/design-order-flow'

const MAX_PHOTOS = 60

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const parseDims = (s: string | null): { width: number; height: number } => {
  const m = s?.match(/^(\d+)\s*x\s*(\d+)$/i)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 }
}

export interface DesignPhotoLibrary {
  businessName: string | null
  photos: DesignAsset[]
}

/** The signed-in owner's real photos, library first, then dish photos. Empty on any
 *  failure: the flow's shoot/source/artwork paths keep it honest with zero photos. */
export async function listMyDesignPhotos(): Promise<DesignPhotoLibrary> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { businessName: null, photos: [] }
    const admin = adminDb()
    const { data: cu } = await admin
      .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
    const clientId = cu?.client_id as string | undefined
    if (!clientId) return { businessName: null, photos: [] }

    const [{ data: client }, { data: libraryRows }, { data: menuRows }] = await Promise.all([
      admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
      admin
        .from('assets')
        .select('id, name, file_url, dimensions')
        .eq('client_id', clientId)
        .eq('type', 'image')
        .not('file_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(MAX_PHOTOS),
      admin
        .from('menu_items')
        .select('id, name, photo_url')
        .eq('client_id', clientId)
        .not('photo_url', 'is', null)
        .limit(MAX_PHOTOS),
    ])

    const photos: DesignAsset[] = []
    for (const r of libraryRows ?? []) {
      photos.push({
        id: `lib-${r.id as string}`,
        url: r.file_url as string,
        ...parseDims(r.dimensions as string | null),
        label: (r.name as string) || undefined,
        kind: 'library',
      })
    }
    for (const r of menuRows ?? []) {
      photos.push({
        id: `menu-${r.id as string}`,
        url: r.photo_url as string,
        width: 0,
        height: 0,
        label: (r.name as string) || undefined,
        kind: 'menu',
      })
    }
    return { businessName: (client?.name as string | undefined) ?? null, photos: photos.slice(0, MAX_PHOTOS) }
  } catch {
    return { businessName: null, photos: [] }
  }
}
