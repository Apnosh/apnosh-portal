/**
 * /dashboard/preview/[id] — client-side preview of a content_drafts
 * row that staff has approved. The owner reads the caption, sees the
 * attached media, + can sign off in one tap. Sign-off sets
 * client_signed_off_at; staff sees the green light in /work/drafts
 * and proceeds to schedule.
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
    .select('id, client_id, idea, caption, hashtags, status, proposed_via, target_platforms, target_publish_date, approved_at, client_signed_off_at, media_urls')
    .eq('id', id)
    .maybeSingle()

  if (!draft) notFound()
  if ((draft.client_id as string) !== clientId) notFound()

  const mediaUrls = Array.isArray(draft.media_urls) ? (draft.media_urls as string[]) : []

  return (
    <>
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
      {/* The post's media, so sign-off is never caption-only. Rendered
          server-side here; same img/video sniff other draft surfaces use. */}
      {mediaUrls.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-10">
          <div className="bg-white rounded-2xl ring-1 ring-ink-6 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-3">Photos and video</p>
            <div className="grid grid-cols-2 gap-2">
              {mediaUrls.map(u => (
                <div key={u} className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-ink-6 bg-ink-7">
                  {/\.(mp4|mov|m4v|webm)(\?|$)/i.test(u) ? (
                    <video src={u} className="w-full h-full object-cover" controls muted playsInline preload="metadata" />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
