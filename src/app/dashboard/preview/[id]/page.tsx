/**
 * /dashboard/preview/[id] — client-side preview of a content_drafts
 * row that staff has approved. The owner reads the caption + can
 * sign off in one tap. Sign-off sets client_signed_off_at; staff
 * sees the green light in /work/drafts and proceeds to schedule.
 *
 * Currently scoped to drafts the client owns AND that originated
 * from a client_request (proposed_via='client_request'). Other
 * drafts route to legacy approvals.
 */

import { redirect, notFound } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import PreviewView from './preview-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string }>
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in to preview content.
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, client_id, idea, caption, hashtags, status, proposed_via, target_platforms, target_publish_date, approved_at, client_signed_off_at')
    .eq('id', id)
    .maybeSingle()

  if (!draft) notFound()
  if ((draft.client_id as string) !== clientId) notFound()

  return (
    <PreviewView
      draftId={id}
      idea={(draft.idea as string) ?? ''}
      caption={(draft.caption as string) ?? ''}
      hashtags={Array.isArray(draft.hashtags) ? (draft.hashtags as string[]) : []}
      status={draft.status as string}
      platforms={Array.isArray(draft.target_platforms) ? (draft.target_platforms as string[]) : []}
      targetPublishDate={(draft.target_publish_date as string) ?? null}
      approvedAt={(draft.approved_at as string) ?? null}
      clientSignedOffAt={(draft.client_signed_off_at as string) ?? null}
    />
  )
}
