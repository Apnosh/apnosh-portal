/**
 * /w/[token] — one win, in public, and nothing else.
 *
 * No login. The token IS the whole permission, so what it can reach has to be exactly one card:
 * the read is `where share_token = <token>` and it takes a single row. There is no client id in
 * the URL, none on the page, and nothing on the page that another read could be built from — no
 * order, no ledger, no other card, no link into the portal. The most a stranger with a link can
 * learn is the business's name, one number, and the month it happened in, which is what the owner
 * chose to show them.
 *
 * A malformed token never reaches the database: isShareToken checks the shape first.
 *
 * NOINDEX, TWICE. A win is for the person the owner sent it to, not for search. The route sets
 * robots index:false, follow:false, and next.config.ts sends X-Robots-Tag: noindex, nofollow on
 * every /w/ response — the meta tag is only read by something that parses the HTML, and the header
 * covers the rest.
 *
 * A TOKEN THAT FINDS NOTHING IS A 404, not a 200 with an apology on it. A junk token, a token from
 * before migration 260, a card taken down: all of them are pages that do not exist, and saying so
 * with the status is what stops a crawler filing them as real and what makes probing tokens
 * pointless. The words live in not-found.tsx beside this file.
 *
 * The card is drawn in the OWNER's language, not the reader's: it is their business's card, and
 * the reader is somebody they sent it to.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientLanguage } from '@/lib/i18n/language'
import { t, localeOf } from '@/lib/i18n/t'
import { isShareToken, isWin, renderCardWords } from '@/lib/love/win'
import WinCard from '@/components/mvp/win-card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apnosh',
  robots: { index: false, follow: false },
}

export default async function PublicWinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let card: { label: string; big: string; context: string; bizName: string; monthLabel: string } | null = null
  let lang: 'en' | 'es' = 'en'

  if (isShareToken(token)) {
    try {
      const admin = createAdminClient()
      const { data: row } = await admin
        .from('proof_cards')
        // select('*') so a database without metadata (pre-262) still answers this read.
        .select('*')
        .eq('share_token', token)
        .maybeSingle()
      if (row && isWin({ cardKey: String(row.card_key), cardType: String(row.card_type), big: String(row.big), isSample: row.is_sample === true })) {
        const clientId = String(row.client_id)
        const [{ data: client }, l] = await Promise.all([
          admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
          getClientLanguage(clientId),
        ])
        lang = l
        // A row with no readable fired_at gets no month rather than the words "Invalid Date" on
        // a page a stranger is looking at.
        const fired = row.fired_at ? new Date(String(row.fired_at)) : null
        // The card's own words, in the OWNER's language, drawn from what the composer stored on
        // it. Never re-measured: a link somebody was already sent has to keep saying what it said
        // when it was sent.
        const words = renderCardWords(row.metadata, { label: String(row.label), big: String(row.big), context: String(row.context) }, l)
        card = {
          label: words.label,
          big: words.big,
          context: words.context,
          bizName: (client?.name as string) || '',
          monthLabel: fired && !Number.isNaN(fired.getTime())
            ? fired.toLocaleDateString(localeOf(l), { month: 'long', year: 'numeric' })
            : '',
        }
      }
    } catch (e) {
      // A missing column (before migration 260) reads as no card, which is the right answer for a
      // link that cannot exist yet.
      console.warn('[w] share read failed:', (e as Error)?.message)
    }
  }

  // Nothing behind the token: a real 404, drawn by not-found.tsx.
  if (!card) notFound()

  const T = (k: string) => t(k, lang)

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560, padding: '28px 18px 40px' }}>
        <WinCard card={card} lang={lang} />
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a href="https://apnosh.com" style={{ fontSize: 12.5, fontWeight: 600, color: '#6e6e73', textDecoration: 'none' }}>
            {T('Made with Apnosh')}
          </a>
        </div>
      </div>
    </div>
  )
}
