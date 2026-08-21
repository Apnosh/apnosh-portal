/**
 * POST /api/deliverables/send-off — how a finished piece gets posted (SO-1).
 *
 * Every approved graphic/video ends with one question, in the platform's
 * three-lane language (owner decisions 2026-08-19, included for everyone):
 *   auto  — we post it: AI caption in their voice, owner sees the final
 *           preview and confirms, then the piece rides the EXISTING publish
 *           rail (content_drafts -> publish-scheduled cron -> vendor).
 *   human — someone posts it: staff are notified with the piece linked.
 *   self  — they post it themselves: marked handed off; the vendor post-sync
 *           can later confirm it appeared.
 * The choice is saved as clients.posting_pref (remember, never lock) and every
 * piece can override it.
 *
 * Approval-first: lane 'auto' is TWO steps. Without confirm:true it only
 * returns the caption + platforms preview; nothing is scheduled until the
 * owner's explicit confirm. The confirm tap IS the client sign-off the publish
 * rail's consent gate requires.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyStaffForClient } from '@/lib/notifications'

const LANES = ['auto', 'human', 'self'] as const
type Lane = (typeof LANES)[number]

async function aiCaption(title: string, description: string | null, businessName: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Write a social media caption for a local business called "${businessName}". The post is: ${title}${description ? ` — ${description}` : ''}\n\nRules: 1-2 short sentences, warm and plain, at most 2 fitting hashtags at the end, no quotes around it. Reply with ONLY the caption text.`,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) { console.warn('[send-off] caption ai failed:', res.status); return null }
    const data = await res.json() as { content?: { text?: string }[] }
    const text = (data.content?.[0]?.text ?? '').trim()
    return text ? text.slice(0, 400) : null
  } catch (e) {
    console.warn('[send-off] caption ai error:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { deliverableId?: string; lane?: string; confirm?: boolean; caption?: string; remember?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const lane = (LANES as readonly string[]).includes(String(body.lane)) ? body.lane as Lane : null
  const deliverableId = typeof body.deliverableId === 'string' ? body.deliverableId : null
  if (!lane || !deliverableId) return NextResponse.json({ error: 'lane and deliverableId required' }, { status: 400 })

  const admin = createAdminClient()
  // resolve business + client, same two doors as everywhere
  const { data: biz } = await admin.from('businesses').select('id, name, client_id').eq('owner_id', user.id).maybeSingle()
  let business = biz
  if (!business) {
    const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
    if (cu?.client_id) {
      const { data: b2 } = await admin.from('businesses').select('id, name, client_id').eq('client_id', cu.client_id).maybeSingle()
      business = b2
    }
  }
  if (!business) return NextResponse.json({ error: 'No business on this account' }, { status: 403 })

  const { data: d } = await admin
    .from('deliverables')
    .select('id, business_id, title, description, type, file_urls, content')
    .eq('id', deliverableId)
    .eq('business_id', business.id)
    .maybeSingle()
  if (!d) return NextResponse.json({ error: 'Not your deliverable' }, { status: 404 })

  const stampSendOff = async (extra: Record<string, unknown> = {}) => {
    const content = { ...((d.content ?? {}) as Record<string, unknown>), sendOff: lane, sendOffAt: new Date().toISOString(), ...extra }
    await admin.from('deliverables').update({ content }).eq('id', d.id)
  }
  const savePref = async () => {
    if (body.remember === false) return
    const { error } = await admin.from('clients').update({ posting_pref: lane }).eq('id', business.client_id)
    if (error && error.code !== '42703') console.warn('[send-off] pref save failed:', error.message)
  }

  if (lane === 'self') {
    await stampSendOff()
    await savePref()
    return NextResponse.json({ ok: true, lane })
  }

  if (lane === 'human') {
    await stampSendOff()
    await savePref()
    // law: no silent stalls — staff hear about it the moment it lands
    await notifyStaffForClient(business.client_id, ['content'], {
      kind: 'task' as never,
      title: `Post this for ${business.name}`,
      body: `"${d.title}" is approved and waiting to be posted (owner picked done-for-you posting).`,
      link: `/work`,
    }).catch((e) => console.error('[send-off] staff notify failed:', e))
    return NextResponse.json({ ok: true, lane })
  }

  // lane 'auto' — connected platforms from the social connection's cache.
  // The social channel is stored under its VENDOR name (zernio today, ayrshare
  // in the bake-off era) — caught live 2026-08-19 when 'social' matched nothing
  // for a client with five linked platforms.
  const { data: conns } = await admin
    .from('channel_connections')
    .select('channel, metadata')
    .eq('client_id', business.client_id)
    .in('channel', ['zernio', 'ayrshare', 'social'])
  const cached = (conns ?? [])
    .map((r) => ((r.metadata as Record<string, unknown> | null)?.platforms as string[] | undefined) ?? [])
    .find((p) => p.length > 0) ?? []
  const platforms = cached.filter((p) => ['instagram', 'facebook', 'tiktok', 'linkedin'].includes(p))
  if (platforms.length === 0) {
    return NextResponse.json({ error: 'No social accounts connected yet. Connect them first, or post it yourself.' }, { status: 409 })
  }

  const media = Array.isArray(d.file_urls) ? (d.file_urls as string[]).filter(Boolean) : []
  if (media.length === 0) return NextResponse.json({ error: 'This piece has no files to post.' }, { status: 409 })

  /* TikTok takes only VIDEOS from auto-posting. Photo posts get accepted by
   * the vendor and then fail on TikTok's side minutes later with no error
   * (proven live 2026-08-20) — so for image pieces we say so up front instead
   * of promising a post that quietly never lands. */
  const isVideoPiece = d.type === 'video' || media.some((u) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u))
  const skipped: { platform: string; reason: string }[] = []
  let postPlatforms = platforms
  if (!isVideoPiece && postPlatforms.includes('tiktok')) {
    postPlatforms = postPlatforms.filter((p) => p !== 'tiktok')
    skipped.push({ platform: 'tiktok', reason: 'TikTok only takes videos from auto-posting. Post this one there yourself if you want it on TikTok.' })
  }
  if (postPlatforms.length === 0) {
    return NextResponse.json({ error: 'Only TikTok is connected, and TikTok only takes videos from auto-posting. Post this one yourself, or connect another account.' }, { status: 409 })
  }

  const caption = typeof body.caption === 'string' && body.caption.trim()
    ? body.caption.trim().slice(0, 400)
    : (await aiCaption(d.title, d.description, business.name)) ?? `${d.title} — at ${business.name}.`

  if (!body.confirm) {
    // approval-first: show the exact caption + accounts; nothing moves yet
    return NextResponse.json({ preview: { caption, platforms: postPlatforms, skipped } })
  }

  const when = new Date(Date.now() + 2 * 60_000).toISOString()
  const { data: draft, error: insErr } = await admin
    .from('content_drafts')
    .insert({
      client_id: business.client_id,
      idea: `Send-off: ${d.title}`.slice(0, 280),
      /* P1 tag spine: the piece's type rides onto the posting rail, so the
       * published post's metrics can be grouped by type later. */
      media_brief: { designType: ((d.content ?? {}) as Record<string, unknown>).designType ?? null, deliverableId: d.id },
      caption,
      media_urls: media,
      target_platforms: postPlatforms,
      status: 'scheduled',
      scheduled_for: when,
      /* 'client_request' is the constraint-approved value that fits: the owner
       * asked for their own piece to be posted. The idea prefix carries the
       * send-off traceability. (23514 caught live on the first real run.) */
      proposed_via: 'client_request',
      client_signed_off_at: new Date().toISOString(), // the confirm tap IS the sign-off
    })
    .select('id')
    .single()
  if (insErr || !draft) {
    console.error('[send-off] draft insert failed:', insErr?.message)
    return NextResponse.json({ error: 'Could not schedule the post. Try again.' }, { status: 500 })
  }
  await stampSendOff({ sendOffDraftId: draft.id })
  await savePref()
  return NextResponse.json({ ok: true, lane, draftId: draft.id, platforms: postPlatforms, scheduledFor: when })
}
