/**
 * POST /api/design/draft — the free AI graphic draft (GD-4b).
 *
 * The bottom rung of the graphic ladder (owner decisions 2026-08-19):
 *   - PRO-ONLY: free drafts are a Pro perk; everyone else gets a plain 403
 *     message, never a silent failure.
 *   - STRAIGHT TO THE OWNER: the draft lands in their approvals instantly as a
 *     'client_review' graphic deliverable — the same row GD-2's "Have a
 *     designer finish this" button already upgrades. No staff QA on drafts the
 *     owner asked for themselves.
 *   - REAL ASSETS: composed from the client's own brand colors, logo, and
 *     photo library through the fixed template kit (templates.tsx). The AI
 *     writes words and picks; it never invents imagery.
 *   - CAPPED: 10 drafts per business per day — generous for a restaurant,
 *     a wall against loops.
 *
 * AI honesty: the copy call uses the same direct Anthropic transport as the
 * describe route. If it fails (credits, timeout), the draft still renders with
 * plain deterministic copy and the row says so — a broken model must never
 * kill the button (the 54-surfaces-down lesson).
 */

import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { listMyDesignPhotos } from '@/lib/design/client-photos'
import { occasionById } from '@/lib/design/occasions'
import { renderTemplate, TEMPLATE_IDS, type DraftInputs, type TemplateId } from '@/lib/design/templates'

export const maxDuration = 30

const DAILY_CAP = 10

interface Copy { headline: string; subline: string; template: TemplateId }

async function aiCopy(brief: string, businessName: string): Promise<Copy | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You write short graphic copy for a restaurant called "${businessName}". The graphic is about: ${brief}\n\nReply with ONLY a JSON object: {"headline": string (max 6 words, punchy, no quotes inside), "subline": string (max 14 words, plain and warm), "template": one of ${JSON.stringify(TEMPLATE_IDS)}}. Pick the template that fits the message.`,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) { console.warn('[design draft] ai copy failed:', res.status); return null }
    const data = await res.json() as { content?: { text?: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const p = JSON.parse(m[0]) as Partial<Copy>
    if (typeof p.headline !== 'string' || typeof p.subline !== 'string') return null
    const template = (TEMPLATE_IDS as readonly string[]).includes(String(p.template)) ? p.template as TemplateId : 'announcement'
    return { headline: p.headline.slice(0, 80), subline: p.subline.slice(0, 140), template }
  } catch (e) {
    console.warn('[design draft] ai copy error:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { occasion?: string; brief?: string }
  try { body = await req.json() } catch { body = {} }

  const admin = createAdminClient()
  // resolve the caller's business + client (same two doors as the requests route)
  const { data: biz } = await admin
    .from('businesses').select('id, name, client_id, brand_colors').eq('owner_id', user.id).maybeSingle()
  let business = biz
  if (!business) {
    const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
    if (cu?.client_id) {
      const { data: b2 } = await admin
        .from('businesses').select('id, name, client_id, brand_colors').eq('client_id', cu.client_id).maybeSingle()
      business = b2
    }
  }
  if (!business) return NextResponse.json({ error: 'No business on this account yet' }, { status: 403 })

  // PRO gate (owner decision 1)
  const { data: client } = await admin.from('clients').select('tier').eq('id', business.client_id).maybeSingle()
  if (!isProTier(client?.tier ?? null)) {
    return NextResponse.json({ error: 'Free AI drafts are part of the Pro plan.' }, { status: 403 })
  }

  // the daily wall
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const { count } = await admin
    .from('deliverables')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('content->>source', 'ai-draft')
    .gte('created_at', dayStart.toISOString())
  if ((count ?? 0) >= DAILY_CAP) {
    return NextResponse.json({ error: `That's ${DAILY_CAP} drafts today — the daily limit. More tomorrow.` }, { status: 429 })
  }

  // the brief: an occasion id from the Campaigns rail, or the caller's own words
  const occ = typeof body.occasion === 'string' ? occasionById(body.occasion) : null
  const brief = occ?.brief ?? (typeof body.brief === 'string' && body.brief.trim() ? body.brief.trim().slice(0, 300) : null)
  if (!brief) return NextResponse.json({ error: 'Say what the graphic is for' }, { status: 400 })

  // real assets only (owner decision 3: AI-enhanced imagery later, as a choice).
  // Brand record first (onboarding's client_brands), businesses.brand_colors second.
  const library = await listMyDesignPhotos().catch(() => null)
  const photoUrl = library?.photos?.[0]?.url ?? null
  const { data: brand } = await admin
    .from('client_brands').select('primary_color, logo_url').eq('client_id', business.client_id).maybeSingle()
  const colors = (business.brand_colors ?? {}) as Record<string, unknown>
  const primary = brand?.primary_color
    ?? (typeof colors.primary === 'string' ? colors.primary : typeof colors.main === 'string' ? colors.main : null)

  const copy = await aiCopy(brief, business.name)
  const fallbackTemplate: TemplateId = occ
    ? (occ.id === 'nye' || occ.id === 'valentines' || occ.id === 'halloween' ? 'holiday' : 'special')
    : 'announcement'
  const inputs: DraftInputs = {
    template: copy?.template ?? fallbackTemplate,
    headline: copy?.headline ?? (occ ? occ.name : 'Something good is coming'),
    subline: copy?.subline ?? `At ${business.name}`,
    dateLine: occ ? occ.nextOn(new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
    brand: { name: business.name, primary, logoUrl: brand?.logo_url ?? null },
    photoUrl,
  }

  // render + store
  try {
    const img = new ImageResponse(renderTemplate(inputs), { width: 1080, height: 1080 })
    const png = Buffer.from(await img.arrayBuffer())
    const path = `drafts/${business.id}/${Date.now()}.png`
    const { error: upErr } = await admin.storage.from('client-assets').upload(path, png, { contentType: 'image/png', upsert: true })
    if (upErr) throw new Error(upErr.message)
    const { data: pub } = admin.storage.from('client-assets').getPublicUrl(path)
    const url = pub.publicUrl

    const { data: row, error: insErr } = await admin
      .from('deliverables')
      .insert({
        business_id: business.id,
        type: 'graphic',
        title: `${occ ? occ.name : 'Your graphic'} (AI draft)`,
        description: brief,
        status: 'client_review',
        preview_urls: [url],
        file_urls: [url],
        content: { source: 'ai-draft', occasion: occ?.id ?? null, template: inputs.template, headline: inputs.headline, subline: inputs.subline, aiCopy: !!copy },
      })
      .select('id')
      .single()
    if (insErr || !row) throw new Error(insErr?.message ?? 'insert failed')
    return NextResponse.json({ id: row.id, url })
  } catch (e) {
    console.error('[design draft] render/store failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not make the draft. Try again in a moment.' }, { status: 500 })
  }
}
