/**
 * GET /api/dashboard/email-health — reads the domain's real SPF, DKIM and DMARC records.
 *
 * A public DNS lookup, which is why this card can diagnose from a cold start: no OAuth, no
 * password, nothing granted. The same query any receiving mail server makes before deciding
 * whether to trust a message from this restaurant.
 *
 * DKIM COSTS 12 LOOKUPS AND MAY STILL COME BACK EMPTY, by design. The selector is chosen by
 * whoever sends the mail and DNS cannot be enumerated, so we try the common ones and report
 * `unknown` rather than "missing" when none answer. See lib/email/deliverability.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveTxt } from 'node:dns/promises'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReport, DKIM_SELECTORS, type DnsAnswers } from '@/lib/email/deliverability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

/** TXT answers arrive as arrays of chunks (a long record is split at 255 characters), so each
 *  record has to be rejoined before anything tries to read it. Missing the join is how a long
 *  DKIM key or a chained SPF record reads as gibberish. */
async function txt(name: string): Promise<string[]> {
  try {
    const rows = await resolveTxt(name)
    return rows.map((chunks) => chunks.join(''))
  } catch {
    // ENOTFOUND / ENODATA both mean "nothing there", which is an answer, not an error.
    return []
  }
}

/** Strip a URL or an email down to the bare domain. Owners paste all three. */
export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const withoutScheme = s.replace(/^[a-z]+:\/\//, '')
  const afterAt = withoutScheme.includes('@') ? withoutScheme.split('@').pop()! : withoutScheme
  const host = afterAt.split('/')[0].split('?')[0].split(':')[0].replace(/\.$/, '')
  // www is a subdomain; the records that matter live at the apex, and checking www would report a
  // false "missing" on a domain that is set up correctly.
  const bare = host.replace(/^www\./, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null
}

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  // An explicit ?domain= wins, so the walkthrough can let an owner correct a wrong one on screen.
  let domain = normalizeDomain(req.nextUrl.searchParams.get('domain') ?? '')
  if (!domain) {
    const admin = createAdminClient()
    const { data } = await admin.from('clients').select('website').eq('id', clientId).maybeSingle()
    domain = normalizeDomain((data?.website as string | null) ?? '')
  }
  if (!domain) {
    return NextResponse.json({ error: 'We do not have your website address yet, so there is nothing to look up.' }, { status: 400 })
  }

  const [apexTxt, dmarcTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)])

  // The apex answering at all is our "does this domain exist" signal. A domain with no TXT records
  // is normal, so absence of TXT is not absence of domain: only treat it as missing when the DMARC
  // lookup ALSO found nothing and the apex has no records whatsoever.
  let domainResolves = apexTxt.length > 0 || dmarcTxt.length > 0
  if (!domainResolves) {
    try {
      const { resolveMx } = await import('node:dns/promises')
      const mx = await resolveMx(domain)
      domainResolves = mx.length > 0
    } catch { domainResolves = false }
  }

  // Sequential-ish but bounded: 12 short lookups, first hit wins.
  let dkim: DnsAnswers['dkim'] = null
  for (const { selector, who } of DKIM_SELECTORS) {
    const rows = await txt(`${selector}._domainkey.${domain}`)
    const rec = rows.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='))
    if (rec) { dkim = { selector, who, record: rec }; break }
  }

  return NextResponse.json(buildReport({ domain, apexTxt, dmarcTxt, dkim, domainResolves }))
}
