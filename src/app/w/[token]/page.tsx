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
 * NOINDEX. A win is for the person the owner sent it to, not for search. robots is set to
 * index:false, follow:false on the route itself, so it applies whether or not a card is found.
 *
 * The card is drawn in the OWNER's language, not the reader's: it is their business's card, and
 * the reader is somebody they sent it to.
 */

import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientLanguage } from '@/lib/i18n/language'
import { t, localeOf } from '@/lib/i18n/t'
import { isShareToken, isWin } from '@/lib/love/win'
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
        card = {
          label: String(row.label),
          big: String(row.big),
          context: String(row.context),
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

  const T = (k: string) => t(k, lang)

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 560, padding: '28px 18px 40px' }}>
        {card ? (
          <>
            <WinCard card={card} lang={lang} />
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <a href="https://apnosh.com" style={{ fontSize: 12.5, fontWeight: 600, color: '#6e6e73', textDecoration: 'none' }}>
                {T('Made with Apnosh')}
              </a>
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', borderRadius: 18, padding: '38px 22px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f' }}>{T('This link does not work')}</div>
            <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 6, lineHeight: 1.5 }}>
              {T('It may have been cut short, or the card was taken down. Ask for it again.')}
            </div>
            <div style={{ marginTop: 16 }}>
              <a href="https://apnosh.com" style={{ fontSize: 12.5, fontWeight: 600, color: '#6e6e73', textDecoration: 'none' }}>
                {T('Made with Apnosh')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
