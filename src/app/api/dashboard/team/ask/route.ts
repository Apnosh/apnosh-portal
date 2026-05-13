/**
 * POST /api/dashboard/team/ask
 *
 * Conversational entry point for "I want more help on my account."
 * The client types a sentence about what they need — no specialist
 * picker, no role chips, no pricing implication. Strategist gets a
 * notification with the message + link to the team page; she replies
 * via the messages thread and sends a quote if needed.
 *
 * This is the "I just want to ask someone" path that replaces the
 * marketplace browser as the default Add-to-your-team flow.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

interface Body {
  clientId: string
  message: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  const message = body?.message?.trim()
  if (!body?.clientId || !message) {
    return NextResponse.json({ error: 'clientId and non-empty message required' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'message too long (max 2000 chars)' }, { status: 400 })
  }

  // Tenancy gate.
  const { clientId } = await resolveCurrentClient(body.clientId)
  if (clientId !== body.clientId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  /* Drop a client_tasks row so the strategist sees it in their inbox
     alongside other client requests. Same source enum value the
     existing content_request flow uses so the staff inbox treats it
     consistently. */
  const { data: task } = await admin.from('client_tasks').insert({
    client_id: body.clientId,
    title: 'Wants help adding to their team',
    body: message,
    source: 'client_request',
    status: 'todo',
    created_by: user.id,
    visible_to_client: true,
  }).select('id').maybeSingle()

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'team.help_requested',
    subject_type: 'client_task',
    subject_id: task?.id ?? null,
    actor_id: user.id,
    actor_role: 'client',
    summary: 'Client asked their strategist for team help',
    payload: { message_chars: message.length },
  })

  await notifyStaffForClient(
    body.clientId,
    ['strategist', 'onboarder'],
    {
      kind: 'client_request',
      title: 'Client wants more team support',
      body: message.slice(0, 140),
      link: `/work/inbox?focus=${task?.id ?? ''}`,
    },
  ).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true, taskId: task?.id ?? null })
}
