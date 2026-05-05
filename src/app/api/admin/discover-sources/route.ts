/**
 * Auto-research source URLs for a client. Returns a list of candidate URLs
 * the operator can review + pull from in the Site Builder's Sources tab.
 *
 * Discovery strategy:
 *   1. clients.website          → kind: "website"
 *   2. Probe website + common menu paths (/menu, /food, /menu.pdf)
 *   3. clients.socials.{ig,tt,fb,linkedin,twitter} → kind: "social"
 *   4. Google Maps search URL from name + city/state (kind: "gbp" — operator
 *      picks the actual map URL after clicking through)
 *   5. Generic Google search URL for press features ("<name>" "review")
 *
 * Probes are HEAD/GET requests with short timeouts. Returns only URLs that
 * either resolved 200 OR are known-direct (socials, GBP search). Operator
 * still reviews before pulling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gatherClientContext } from '@/lib/site-config/gather-context'

type SourceKind = 'website' | 'menu' | 'gbp' | 'social' | 'press'

interface DiscoveredSource {
  url: string
  kind: SourceKind
  /** Where we found this URL */
  origin: 'profile' | 'probe' | 'derived'
  /** True if HEAD/GET returned 200; false if known-direct without probe */
  verified: boolean
  note?: string
}

interface DiscoverRequest { clientId: string }

const MENU_PATHS = ['/menu/', '/menu', '/food-menu', '/our-menu', '/menus', '/menu.pdf', '/dinner-menu', '/lunch-menu']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as DiscoverRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const ctx = await gatherClientContext(body.clientId)
  const sources: DiscoveredSource[] = []

  // ----- 1. Existing website -----
  if (ctx.client.website) {
    const websiteUrl = normalize(ctx.client.website)
    if (websiteUrl) {
      sources.push({
        url: websiteUrl,
        kind: 'website',
        origin: 'profile',
        verified: false, // will probe below
      })
    }
  }

  // ----- 2. Socials -----
  const socials = ctx.client.socials ?? {}
  for (const [platform, raw] of Object.entries(socials)) {
    if (!raw || typeof raw !== 'string') continue
    const url = socialToUrl(platform, raw)
    if (!url) continue
    sources.push({
      url,
      kind: 'social',
      origin: 'profile',
      verified: false,
      note: platform,
    })
  }

  // ----- 3. Probe menu paths on the website -----
  if (ctx.client.website) {
    const base = normalize(ctx.client.website)
    if (base) {
      const probes = await Promise.all(
        MENU_PATHS.map(p => probeUrl(joinUrl(base, p))),
      )
      for (const r of probes) {
        if (r.ok) {
          sources.push({
            url: r.url,
            kind: 'menu',
            origin: 'probe',
            verified: true,
            note: 'menu page',
          })
          break // Only need one menu URL — first hit wins
        }
      }
    }
  }

  // ----- 4. Probe the website itself -----
  const websiteIdx = sources.findIndex(s => s.kind === 'website')
  if (websiteIdx >= 0) {
    const probe = await probeUrl(sources[websiteIdx].url)
    sources[websiteIdx].verified = probe.ok
    if (probe.finalUrl && probe.finalUrl !== sources[websiteIdx].url) {
      sources[websiteIdx].url = probe.finalUrl
    }
  }

  // ----- 5. Verify socials (HEAD only — fast) -----
  await Promise.all(
    sources
      .filter(s => s.kind === 'social' && !s.verified)
      .map(async s => {
        const r = await probeUrl(s.url, 'HEAD')
        s.verified = r.ok
      }),
  )

  // ----- 6. Google Maps + press search URLs (derived, not probed) -----
  if (ctx.client.name) {
    const cityHint = ctx.locations[0]?.city || ctx.client.location || ''
    const mapsQuery = encodeURIComponent(`${ctx.client.name} ${cityHint}`.trim())
    sources.push({
      url: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
      kind: 'gbp',
      origin: 'derived',
      verified: false,
      note: 'Open in browser, copy the actual place URL',
    })
  }

  // ----- 7. Dedupe + sort (verified first, then by kind) -----
  const seen = new Set<string>()
  const unique: DiscoveredSource[] = []
  for (const s of sources) {
    const key = s.url.toLowerCase().replace(/\/+$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(s)
  }

  const KIND_ORDER: Record<SourceKind, number> = { website: 0, menu: 1, gbp: 2, social: 3, press: 4 }
  unique.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  })

  return NextResponse.json({
    success: true,
    sources: unique,
    summary: {
      total: unique.length,
      verified: unique.filter(s => s.verified).length,
    },
  })
}

// ----- Helpers -----

function normalize(input: string): string | null {
  let v = input.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v
  try {
    const u = new URL(v)
    return u.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

function joinUrl(base: string, path: string): string {
  if (!path.startsWith('/')) path = '/' + path
  try {
    const u = new URL(path, base)
    return u.href
  } catch {
    return base + path
  }
}

function socialToUrl(platform: string, value: string): string | null {
  const p = platform.toLowerCase()
  const v = value.trim()
  // Already a URL?
  if (/^https?:\/\//i.test(v)) return v
  // Normalize handle (strip @, /)
  const handle = v.replace(/^[@/]+/, '').replace(/[/\s].*$/, '')
  if (!handle) return null
  switch (p) {
    case 'instagram': return `https://instagram.com/${handle}`
    case 'tiktok':    return `https://tiktok.com/@${handle.replace(/^@/, '')}`
    case 'facebook':  return `https://facebook.com/${handle}`
    case 'twitter':
    case 'x':         return `https://x.com/${handle}`
    case 'linkedin':  return `https://www.linkedin.com/in/${handle}`
    case 'youtube':   return `https://youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`
    default:          return null
  }
}

async function probeUrl(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<{ url: string; ok: boolean; finalUrl?: string }> {
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Apnosh-SiteBuilder/1.0)',
        Accept: 'text/html,*/*',
      },
      signal: AbortSignal.timeout(6_000),
    })
    return { url, ok: res.ok, finalUrl: res.url }
  } catch {
    return { url, ok: false }
  }
}
