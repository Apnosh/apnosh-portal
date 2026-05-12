/**
 * Editor's queue: shoots where raw has been delivered ('uploaded')
 * and shoots they recently completed. RLS scopes to the editor's
 * assigned book (policies in 114).
 *
 * Each row carries the brief, raw clip count, and a thumbnail for
 * fast triage — full clip URLs are fetched on the detail view.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type ShootStatus =
  | 'planned' | 'briefed' | 'in_progress' | 'wrapped'
  | 'uploaded' | 'completed' | 'canceled'

export interface EditJobRow {
  shootId: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  title: string
  scheduledAt: string
  status: ShootStatus
  brief: Record<string, unknown>
  shotList: unknown[]
  locationName: string | null
  rawCount: number
  finalCount: number
  firstClipUrl: string | null
  uploadedAt: string | null
  wrappedAt: string | null
}

export interface EditQueue {
  ready: EditJobRow[]
  completed: EditJobRow[]
}

interface RawShoot {
  id: string
  client_id: string
  title: string
  scheduled_at: string
  status: ShootStatus
  brief: Record<string, unknown> | null
  shot_list: unknown[] | null
  location_name: string | null
  uploaded_at: string | null
  wrapped_at: string | null
}

export async function getEditQueue(): Promise<EditQueue> {
  const supabase = await createServerClient()

  const [readyRes, completedRes] = await Promise.all([
    supabase
      .from('shoots')
      .select('id, client_id, title, scheduled_at, status, brief, shot_list, location_name, uploaded_at, wrapped_at')
      .eq('status', 'uploaded')
      .order('uploaded_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('shoots')
      .select('id, client_id, title, scheduled_at, status, brief, shot_list, location_name, uploaded_at, wrapped_at')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const all = [
    ...((readyRes.data ?? []) as RawShoot[]),
    ...((completedRes.data ?? []) as RawShoot[]),
  ]
  const shootIds = all.map(s => s.id)
  const clientIds = Array.from(new Set(all.map(s => s.client_id)))

  const [clientsRes, uploadsRes] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('clients').select('id, name, slug').in('id', clientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; slug: string | null }> }),
    shootIds.length > 0
      ? supabase.from('shoot_uploads').select('shoot_id, kind, storage_url').in('shoot_id', shootIds)
      : Promise.resolve({ data: [] as Array<{ shoot_id: string; kind: string; storage_url: string }> }),
  ])

  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  for (const c of clientsRes.data ?? []) {
    clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
  }

  // Tally raw/final per shoot + remember a thumbnail-friendly URL.
  const counts = new Map<string, { raw: number; final: number; firstUrl: string | null }>()
  for (const u of uploadsRes.data ?? []) {
    const sid = u.shoot_id as string
    if (!counts.has(sid)) counts.set(sid, { raw: 0, final: 0, firstUrl: null })
    const c = counts.get(sid)!
    if (u.kind === 'raw') c.raw += 1
    if (u.kind === 'final') c.final += 1
    if (c.firstUrl === null) c.firstUrl = u.storage_url as string
  }

  const toRow = (s: RawShoot): EditJobRow => {
    const c = clientMap.get(s.client_id) ?? { name: null, slug: null }
    const counts0 = counts.get(s.id) ?? { raw: 0, final: 0, firstUrl: null }
    return {
      shootId: s.id,
      clientId: s.client_id,
      clientName: c.name,
      clientSlug: c.slug,
      title: s.title,
      scheduledAt: s.scheduled_at,
      status: s.status,
      brief: s.brief ?? {},
      shotList: Array.isArray(s.shot_list) ? s.shot_list : [],
      locationName: s.location_name,
      rawCount: counts0.raw,
      finalCount: counts0.final,
      firstClipUrl: counts0.firstUrl,
      uploadedAt: s.uploaded_at,
      wrappedAt: s.wrapped_at,
    }
  }

  return {
    ready: ((readyRes.data ?? []) as RawShoot[]).map(toRow),
    completed: ((completedRes.data ?? []) as RawShoot[]).map(toRow),
  }
}
