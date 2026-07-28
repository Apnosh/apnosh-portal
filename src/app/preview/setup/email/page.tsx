/**
 * /preview/setup/email — the land-in-the-inbox walkthrough on a real diagnosis, with no login.
 *
 * WHAT IS REAL HERE, and it is more than any other preview: the diagnosis is genuine. SPF and DMARC
 * are public, so this route runs the same lookups the live card runs, against a domain typed into
 * the URL. Nothing is faked and nothing is granted. `?domain=` picks the subject; the default is
 * apnosh.com, whose records are currently a good demonstration of the problem this card fixes.
 *
 * Mounted in MvpShell for the same reason as the others: without it, a desktop window sprawls and
 * the preview lies about layout.
 */

import Link from 'next/link'
import { resolveTxt, resolveMx } from 'node:dns/promises'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import { buildReport, DKIM_SELECTORS, type DnsAnswers } from '@/lib/email/deliverability'
import PreviewEmailView from './preview-view'

export const metadata = { title: 'Land in the inbox, preview' }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function txt(name: string): Promise<string[]> {
  try { return (await resolveTxt(name)).map((c) => c.join('')) } catch { return [] }
}

export default async function PreviewEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = typeof sp.domain === 'string' ? sp.domain : 'apnosh.com'
  const domain = /^[a-z0-9.-]+$/i.test(raw) ? raw.toLowerCase().replace(/^www\./, '') : 'apnosh.com'

  const [apexTxt, dmarcTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)])
  let domainResolves = apexTxt.length > 0 || dmarcTxt.length > 0
  if (!domainResolves) {
    try { domainResolves = (await resolveMx(domain)).length > 0 } catch { domainResolves = false }
  }
  let dkim: DnsAnswers['dkim'] = null
  for (const { selector, who } of DKIM_SELECTORS) {
    const rows = await txt(`${selector}._domainkey.${domain}`)
    const rec = rows.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='))
    if (rec) { dkim = { selector, who, record: rec }; break }
  }
  const report = buildReport({ domain, apexTxt, dmarcTxt, dkim, domainResolves })

  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Land in the inbox"
          subtitle="What your domain says about who may send as you"
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      )}
    >
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ background: '#fbf0da', borderRadius: 13, padding: '10px 12px', fontSize: 12, color: '#8a5a0c', lineHeight: 1.45 }}>
          This diagnosis is real, not a fixture: these are the live records for <b>{domain}</b>, read
          just now. Add <b>?domain=stripe.com</b> to the address to see a fully correct one.{' '}
          <Link href="/preview/campaign" style={{ color: '#8a5a0c', fontWeight: 640 }}>All screens</Link>
        </div>
      </div>
      <PreviewEmailView report={report} />
    </MvpShell>
  )
}
