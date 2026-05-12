/**
 * POST /api/work/onboarding/commit
 *
 * Provisions a new client from an approved bootstrap proposal:
 *   1. Creates the clients row
 *   2. Creates client_brands with voice_summary
 *   3. Inserts client_knowledge_facts (one row per fact)
 *   4. Inserts the opening editorial_themes row
 *
 * Atomic-ish — failures partway through leave the client created but
 * with partial children. Onboarder can retry the children manually.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

interface CommitBody {
  basics: {
    name: string
    location: string
    cuisine: string
    ownerName: string
    socialHandle?: string
    serviceTier?: 'starter' | 'growth' | 'scale'
    email?: string
    phone?: string
  }
  proposal: {
    voice_summary: string
    voice_traits: string[]
    pet_peeves: string[]
    facts: Array<{ category: string; value: string; rationale: string }>
    opening_theme: {
      theme_name: string
      theme_blurb: string
      pillars: string[]
    }
  }
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as CommitBody | null
  if (!body?.basics?.name || !body.proposal?.voice_summary) {
    return NextResponse.json({ error: 'basics.name + proposal.voice_summary required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Create client
  const slug = slugify(body.basics.name)
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name: body.basics.name,
      slug,
      industry: 'restaurant',
      location: body.basics.location,
      primary_contact: body.basics.ownerName,
      email: body.basics.email ?? null,
      phone: body.basics.phone ?? null,
      socials: body.basics.socialHandle ? { instagram: body.basics.socialHandle } : {},
      tier: ({ starter: 'Basic', growth: 'Standard', scale: 'Pro' } as const)[body.basics.serviceTier ?? 'starter'] ?? 'Basic',
      onboarding_date: new Date().toISOString(),
      status: 'active',
      notes: `Cuisine: ${body.basics.cuisine}`,
    })
    .select('id, name, slug')
    .maybeSingle()
  if (clientErr || !client) {
    return NextResponse.json({ error: clientErr?.message ?? 'client insert failed' }, { status: 500 })
  }

  // 2. Create brand
  const brandMd = `# ${body.basics.name}

## Voice
${body.proposal.voice_summary}

## Traits
${body.proposal.voice_traits.map(t => `- ${t}`).join('\n')}

## Pet peeves (avoid these)
${body.proposal.pet_peeves.map(p => `- ${p}`).join('\n')}`

  const { error: brandErr } = await admin
    .from('client_brands')
    .insert({
      client_id: client.id,
      brand_md: brandMd,
      voice_notes: body.proposal.voice_summary,
      version: 1,
    })
  // Brand error is non-fatal; surface a warning later.

  // 3. Insert facts
  let factsInserted = 0
  if (body.proposal.facts.length > 0) {
    const factRows = body.proposal.facts.map(f => ({
      client_id: client.id,
      category: f.category,
      value: f.value,
      rationale: f.rationale,
      created_by: user.id,
    }))
    const { count, error: factsErr } = await admin
      .from('client_knowledge_facts')
      .insert(factRows, { count: 'exact' })
    if (!factsErr) factsInserted = count ?? factRows.length
  }

  // 4. Opening theme — use current month
  const now = new Date()
  const monthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { error: themeErr } = await admin
    .from('editorial_themes')
    .insert({
      client_id: client.id,
      month: monthIso,
      theme_name: body.proposal.opening_theme.theme_name,
      theme_blurb: body.proposal.opening_theme.theme_blurb,
      pillars: body.proposal.opening_theme.pillars,
      status: 'planning',
      created_by: user.id,
      version: 1,
    })

  await admin.from('events').insert({
    client_id: client.id,
    event_type: 'client.onboarded',
    subject_type: 'client',
    subject_id: client.id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Onboarded ${client.name} (${factsInserted} facts, brand, opening theme)`,
    payload: {
      facts_inserted: factsInserted,
      brand_created: !brandErr,
      theme_created: !themeErr,
    },
  })

  return NextResponse.json({
    ok: true,
    clientId: client.id,
    slug: client.slug,
    name: client.name,
    factsInserted,
    brandCreated: !brandErr,
    themeCreated: !themeErr,
    warnings: [
      ...(brandErr ? [`brand: ${brandErr.message}`] : []),
      ...(themeErr ? [`theme: ${themeErr.message}`] : []),
    ],
  })
}
