/**
 * order-site-crawl — fetch a client's own website and pull the ordering / booking links.
 *
 * Split out of the order-links route so the advice route reads the SAME evidence. Two
 * surfaces disagreeing about whether a restaurant has ordering would be worse than
 * either being wrong alone.
 *
 * Kept out of order-links.ts on purpose: that module is pure and unit tested, and this
 * one does network I/O. Best-effort throughout, a dead or slow site yields no links and
 * a plain reason, never a thrown request.
 */

import { findOrderingLinks, type FoundLink } from './order-links'

export interface SiteCrawl {
  links: FoundLink[]
  /** Plain sentence for the owner when we could not read it. null when we could. */
  error: string | null
  /** False when we never got a page at all. The difference between "found nothing" and
   *  "could not look" is load-bearing: only the first is evidence. */
  readable: boolean
}

export async function crawlSiteForOrdering(url: string): Promise<SiteCrawl> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApnoshBot/1.0; +https://apnosh.com)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { links: [], error: `Your site returned ${res.status}.`, readable: false }
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return { links: [], error: 'That address did not return a web page.', readable: false }
    // Cap the body: ordering links live in the nav, near the top, and a huge page
    // should not stall the request.
    const html = (await res.text()).slice(0, 600_000)
    return { links: findOrderingLinks(html, res.url), error: null, readable: true }
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError'
      ? 'Your site took too long to answer.'
      : 'We could not reach your site.'
    return { links: [], error: msg, readable: false }
  }
}

/** The client's website with a protocol, or null. */
export function siteUrlOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = String(raw).trim()
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}
