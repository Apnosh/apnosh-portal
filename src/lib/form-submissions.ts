'use server'

/**
 * Owner-facing helpers for the Forms page. Reads + status mutations
 * for form_submissions.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export type FormKind = 'contact' | 'catering' | 'reservation' | 'newsletter' | 'feedback' | 'job_inquiry' | 'other'
export type FormStatus = 'new' | 'read' | 'replied' | 'archived'

export interface FormSubmission {
  id: string
  kind: FormKind
  display_name: string | null
  display_email: string | null
  display_phone: string | null
  source_url: string | null
  fields: Record<string, string>
  status: FormStatus
  notes: string | null
  submitted_at: string
  read_at: string | null
  replied_at: string | null
}

export async function listFormSubmissions(filter?: {
  status?: FormStatus | 'all'
  kind?: FormKind | 'all'
}): Promise<FormSubmission[]> {
  const { clientId } = await resolveCurrentClient()
  if (!clientId) return []
  const admin = createAdminClient()
  let q = admin
    .from('form_submissions')
    .select('id, kind, display_name, display_email, display_phone, source_url, fields, status, notes, submitted_at, read_at, replied_at')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status)
  if (filter?.kind && filter.kind !== 'all') q = q.eq('kind', filter.kind)
  const { data } = await q
  return (data ?? []) as FormSubmission[]
}

export async function markFormStatus(id: string, status: FormStatus): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, clientId } = await resolveCurrentClient()
  if (!user || !clientId) return { ok: false, error: 'Not authenticated' }
  const admin = createAdminClient()
  const patch: Record<string, string | null> = { status }
  if (status === 'read') patch.read_at = new Date().toISOString()
  if (status === 'replied') patch.replied_at = new Date().toISOString()
  if (status === 'archived') patch.archived_at = new Date().toISOString()
  const { error } = await admin
    .from('form_submissions')
    .update(patch)
    .eq('id', id)
    .eq('client_id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setFormNotes(id: string, notes: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, clientId } = await resolveCurrentClient()
  if (!user || !clientId) return { ok: false, error: 'Not authenticated' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('form_submissions')
    .update({ notes: notes.trim() || null })
    .eq('id', id)
    .eq('client_id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getFormSubmissionStats(): Promise<{ total: number; unread: number }> {
  const { clientId } = await resolveCurrentClient()
  if (!clientId) return { total: 0, unread: 0 }
  const admin = createAdminClient()
  const [{ count: total }, { count: unread }] = await Promise.all([
    admin.from('form_submissions').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    admin.from('form_submissions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'new'),
  ])
  return { total: total ?? 0, unread: unread ?? 0 }
}
