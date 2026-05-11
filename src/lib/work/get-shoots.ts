/**
 * Server-side reads for the field shoots surface.
 *
 * Used by /work/shoots (list) and /work/shoots/[id] (detail). RLS
 * already scopes the result to crew membership for non-admin users,
 * so these helpers just select the columns we need.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export interface FieldShoot {
  id: string
  title: string
  scheduledAt: string
  durationMin: number
  status: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  locationName: string | null
  locationAddr: string | null
  contactName: string | null
  contactPhone: string | null
  shotListCount: number
  myRole: string | null
  isLead: boolean
}

export interface FieldShootDetail extends FieldShoot {
  locationLat: number | null
  locationLng: number | null
  locationNotes: string | null
  brief: Record<string, unknown>
  shotList: Array<{ id?: string; label: string; done?: boolean; notes?: string }>
  moodBoardUrls: string[]
  uploads: Array<{ id: string; storageUrl: string; fileName: string; kind: string; uploadedAt: string }>
}

export async function getMyShoots(): Promise<FieldShoot[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Pull crew rows for this person, then join shoot + client info.
  // Two-step keeps the join shape simple under RLS.
  const { data: crew } = await supabase
    .from('shoot_crew')
    .select('shoot_id, role, is_lead')
    .eq('person_id', user.id)
    .is('declined_at', null)

  if (!crew || crew.length === 0) return []

  const shootIds = crew.map(c => c.shoot_id as string)
  const crewByShoot = new Map(crew.map(c => [c.shoot_id as string, c]))

  const { data: shoots } = await supabase
    .from('shoots')
    .select('id, client_id, title, scheduled_at, duration_min, status, location_name, location_addr, contact_name, contact_phone, shot_list')
    .in('id', shootIds)
    .order('scheduled_at', { ascending: true })

  if (!shoots) return []

  const clientIds = Array.from(new Set(shoots.map(s => s.client_id as string)))
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, slug')
    .in('id', clientIds)
  const clientMap = new Map((clients ?? []).map(c => [c.id as string, c]))

  return shoots.map(s => {
    const c = clientMap.get(s.client_id as string)
    const cr = crewByShoot.get(s.id as string)
    const shotList = Array.isArray(s.shot_list) ? (s.shot_list as unknown[]) : []
    return {
      id: s.id as string,
      title: (s.title as string) ?? 'Untitled shoot',
      scheduledAt: s.scheduled_at as string,
      durationMin: (s.duration_min as number) ?? 90,
      status: (s.status as string) ?? 'planned',
      clientId: s.client_id as string,
      clientName: (c?.name as string) ?? null,
      clientSlug: (c?.slug as string) ?? null,
      locationName: (s.location_name as string) ?? null,
      locationAddr: (s.location_addr as string) ?? null,
      contactName: (s.contact_name as string) ?? null,
      contactPhone: (s.contact_phone as string) ?? null,
      shotListCount: shotList.length,
      myRole: (cr?.role as string) ?? null,
      isLead: Boolean(cr?.is_lead),
    }
  })
}

export async function getShootDetail(id: string): Promise<FieldShootDetail | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: s } = await supabase.from('shoots').select('*').eq('id', id).maybeSingle()
  if (!s) return null

  const { data: c } = await supabase
    .from('clients')
    .select('name, slug')
    .eq('id', s.client_id as string)
    .maybeSingle()

  const { data: cr } = await supabase
    .from('shoot_crew')
    .select('role, is_lead')
    .eq('shoot_id', id)
    .eq('person_id', user.id)
    .maybeSingle()

  const { data: ups } = await supabase
    .from('shoot_uploads')
    .select('id, storage_url, file_name, kind, uploaded_at')
    .eq('shoot_id', id)
    .order('uploaded_at', { ascending: false })

  return {
    id: s.id as string,
    title: (s.title as string) ?? 'Untitled shoot',
    scheduledAt: s.scheduled_at as string,
    durationMin: (s.duration_min as number) ?? 90,
    status: (s.status as string) ?? 'planned',
    clientId: s.client_id as string,
    clientName: (c?.name as string) ?? null,
    clientSlug: (c?.slug as string) ?? null,
    locationName: (s.location_name as string) ?? null,
    locationAddr: (s.location_addr as string) ?? null,
    locationLat: (s.location_lat as number) ?? null,
    locationLng: (s.location_lng as number) ?? null,
    locationNotes: (s.location_notes as string) ?? null,
    contactName: (s.contact_name as string) ?? null,
    contactPhone: (s.contact_phone as string) ?? null,
    brief: (s.brief as Record<string, unknown>) ?? {},
    shotList: Array.isArray(s.shot_list) ? (s.shot_list as Array<{ label: string; done?: boolean; notes?: string }>) : [],
    moodBoardUrls: Array.isArray(s.mood_board_urls) ? (s.mood_board_urls as string[]) : [],
    uploads: (ups ?? []).map(u => ({
      id: u.id as string,
      storageUrl: u.storage_url as string,
      fileName: u.file_name as string,
      kind: u.kind as string,
      uploadedAt: u.uploaded_at as string,
    })),
    shotListCount: Array.isArray(s.shot_list) ? (s.shot_list as unknown[]).length : 0,
    myRole: (cr?.role as string) ?? null,
    isLead: Boolean(cr?.is_lead),
  }
}
