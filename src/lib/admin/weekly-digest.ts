'use server'

/**
 * Weekly digest renderer. For each active client, produces an
 * email-ready summary of "what Apnosh AI did for you this week":
 *   - Tools the agent executed
 *   - Posts published
 *   - Recaps generated
 *   - Open suggestions waiting on them
 *   - Feedback CTA
 *
 * v1: renders as plain text + HTML on an admin page. You copy + paste
 * into your email tool. v2 (not built): wires SendGrid / Resend /
 * Mailgun to auto-send.
 *
 * Why ship v1 first: email infra is a separate dependency. v1 lets
 * the team get value from the content while we figure out the
 * sending pipeline (or just do it manually for the first 20 clients).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

export interface DigestSnippet {
  clientId: string
  clientName: string
  isBeta: boolean
  ownerEmails: string[]
  weekStartIso: string
  weekEndIso: string
  toolsRun: Array<{ name: string; count: number }>
  postsPublished: number
  conversationsCount: number
  ownerThumbsUp: number
  ownerThumbsDown: number
  openSuggestions: number
  textBody: string
  htmlBody: string
}

export async function buildWeeklyDigests(opts: { weeksBack?: number } = {}): Promise<DigestSnippet[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const weeksBack = opts.weeksBack ?? 1
  const end = new Date()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 7 * weeksBack)

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, is_beta')
    .neq('status', 'churned')

  const snippets: DigestSnippet[] = []
  for (const c of (clients ?? []) as Array<{ id: string; name: string; is_beta: boolean | null }>) {
    const snippet = await buildOneDigest({
      clientId: c.id,
      clientName: c.name,
      isBeta: !!c.is_beta,
      start, end,
    })
    /* Only include clients with at least 1 conversation OR 1 open
       suggestion -- empty digests aren't worth sending. */
    if (snippet.conversationsCount > 0 || snippet.openSuggestions > 0) {
      snippets.push(snippet)
    }
  }
  return snippets
}

async function buildOneDigest(args: {
  clientId: string
  clientName: string
  isBeta: boolean
  start: Date
  end: Date
}): Promise<DigestSnippet> {
  const admin = createAdminClient()

  const [convRes, execRes, evalRes, updatesRes, notifRes, ownersRes] = await Promise.all([
    admin.from('agent_conversations')
      .select('id, status')
      .eq('client_id', args.clientId)
      .gte('started_at', args.start.toISOString()),
    admin.from('agent_tool_executions')
      .select('tool_name')
      .eq('client_id', args.clientId)
      .eq('status', 'executed')
      .gte('executed_at', args.start.toISOString()),
    admin.from('agent_evaluations')
      .select('thumbs')
      .eq('rater_type', 'owner')
      .gte('created_at', args.start.toISOString())
      .in('conversation_id', (await listConvIds(args.clientId, args.start))),
    admin.from('client_updates')
      .select('type')
      .eq('client_id', args.clientId)
      .eq('status', 'published')
      .gte('created_at', args.start.toISOString()),
    admin.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', args.clientId)
      .eq('type', 'agent_suggestion')
      .is('read_at', null),
    /* Owner contact emails -- to compose the To: field. */
    admin.from('clients').select('email, primary_contact').eq('id', args.clientId).maybeSingle(),
  ])

  const convs = (convRes.data ?? []) as Array<{ id: string; status: string }>
  const execs = (execRes.data ?? []) as Array<{ tool_name: string }>
  const evals = (evalRes.data ?? []) as Array<{ thumbs: string | null }>
  const updates = (updatesRes.data ?? []) as Array<{ type: string }>
  const openSuggestions = notifRes.count ?? 0
  const ownerEmails: string[] = []
  if (ownersRes.data) {
    const e = ownersRes.data as { email: string | null }
    if (e.email) ownerEmails.push(e.email)
  }

  /* Aggregate tool counts. */
  const toolCounts = new Map<string, number>()
  for (const e of execs) {
    toolCounts.set(e.tool_name, (toolCounts.get(e.tool_name) ?? 0) + 1)
  }
  const toolsRun = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const postsPublished = updates.filter(u => u.type === 'promotion' || u.type === 'event').length
  const ownerThumbsUp = evals.filter(e => e.thumbs === 'up').length
  const ownerThumbsDown = evals.filter(e => e.thumbs === 'down').length

  /* Compose text + html. Keep both short. */
  const lines: string[] = []
  lines.push(`Hi ${args.clientName}!`)
  lines.push('')
  lines.push(`Here's what Apnosh AI did for you this week:`)
  lines.push('')
  for (const t of toolsRun.slice(0, 6)) {
    lines.push(`  • ${prettyTool(t.name)}: ${t.count}`)
  }
  if (toolsRun.length === 0) {
    lines.push(`  (No actions this week -- want help getting started? Ask the chat anything.)`)
  }
  lines.push('')
  if (postsPublished > 0) lines.push(`✅ ${postsPublished} Google Business Profile post${postsPublished === 1 ? '' : 's'} published`)
  if (openSuggestions > 0) lines.push(`🔔 ${openSuggestions} suggestion${openSuggestions === 1 ? '' : 's'} waiting for you in the portal`)
  if (ownerThumbsUp + ownerThumbsDown > 0) {
    lines.push(`📊 You rated the AI ${ownerThumbsUp} 👍 / ${ownerThumbsDown} 👎 this week`)
  }
  lines.push('')
  lines.push(`What's missing? Hit reply and tell us what you wish the AI could do. Real owner feedback shapes what we build next.`)
  lines.push('')
  lines.push(`-- Apnosh`)
  const textBody = lines.join('\n')

  const htmlBody = `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 580px; line-height: 1.6; color: #222;">
  <p>Hi ${escapeHtml(args.clientName)},</p>
  <p>Here's what <strong>Apnosh AI</strong> did for you this week:</p>
  ${toolsRun.length > 0 ? `<ul style="padding-left: 20px;">${toolsRun.slice(0, 6).map(t => `<li>${escapeHtml(prettyTool(t.name))}: <strong>${t.count}</strong></li>`).join('')}</ul>` : `<p><em>No actions this week -- want help getting started? Just ask Apnosh AI anything.</em></p>`}
  ${postsPublished > 0 || openSuggestions > 0 || (ownerThumbsUp + ownerThumbsDown > 0) ? `<p>${[
    postsPublished > 0 ? `✅ ${postsPublished} Google post${postsPublished === 1 ? '' : 's'} published` : null,
    openSuggestions > 0 ? `🔔 ${openSuggestions} suggestion${openSuggestions === 1 ? '' : 's'} waiting for you` : null,
    (ownerThumbsUp + ownerThumbsDown) > 0 ? `📊 You rated us ${ownerThumbsUp} 👍 / ${ownerThumbsDown} 👎` : null,
  ].filter(Boolean).join('<br>')}</p>` : ''}
  <p>What's missing? Hit reply and tell us what you wish the AI could do. Real owner feedback shapes what we build next.</p>
  <p style="color: #888; font-size: 13px;">-- Apnosh</p>
</div>`

  return {
    clientId: args.clientId,
    clientName: args.clientName,
    isBeta: args.isBeta,
    ownerEmails,
    weekStartIso: args.start.toISOString(),
    weekEndIso: args.end.toISOString(),
    toolsRun,
    postsPublished,
    conversationsCount: convs.length,
    ownerThumbsUp,
    ownerThumbsDown,
    openSuggestions,
    textBody,
    htmlBody,
  }
}

async function listConvIds(clientId: string, since: Date): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_conversations')
    .select('id')
    .eq('client_id', clientId)
    .gte('started_at', since.toISOString())
  const rows = (data ?? []) as Array<{ id: string }>
  return rows.length > 0 ? rows.map(r => r.id) : ['00000000-0000-0000-0000-000000000000']
}

function prettyTool(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
