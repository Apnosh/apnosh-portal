/**
 * /dashboard/wins/[id] — one win, as the square the owner can send.
 *
 * [id] is the card_key, the same natural key the deck and the proof API use, so a link into here
 * survives a card being re-read or re-fired. The card is read for THIS client only; there is no
 * door here to anybody else's numbers.
 *
 * A card that is not a win (a heads-up, a state card, a card with no number in it) says so plainly
 * rather than rendering an empty square. The rules are in src/lib/love/win.ts, the same ones the
 * share route enforces, so this page and the server can never disagree about what is shareable.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientLanguage } from '@/lib/i18n/language'
import { t, localeOf } from '@/lib/i18n/t'
import { isWin } from '@/lib/love/win'
import WinCard from '@/components/mvp/win-card'
import ShareRow from './share-row'

export const dynamic = 'force-dynamic'

export default async function WinPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string }>
}) {
  const { id } = await params
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) redirect('/dashboard')

  const admin = createAdminClient()
  const [{ data: row }, { data: client }, lang] = await Promise.all([
    // select('*') so a database without metadata (pre-262) or share_token (pre-260) still reads.
    admin.from('proof_cards')
      .select('*')
      .eq('client_id', clientId).eq('card_key', decodeURIComponent(id)).maybeSingle(),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    getClientLanguage(clientId),
  ])

  const T = (k: string) => t(k, lang)
  const good = !!row && isWin({ cardKey: String(row.card_key), cardType: String(row.card_type), big: String(row.big), isSample: row.is_sample === true })
  /* the month the win happened in. A row with no readable fired_at gets no month rather than the
     words "Invalid Date" printed on something the owner is about to send somebody. */
  const fired = row?.fired_at ? new Date(String(row.fired_at)) : null
  const monthLabel = fired && !Number.isNaN(fired.getTime())
    ? fired.toLocaleDateString(localeOf(lang), { month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f7', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{'@media print { .rpt-hide { display: none !important; } body { background: #fff !important; } }'}</style>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '14px 16px 40px' }}>
        <Link href="/dashboard/wins" aria-label={T('Back')} className="rpt-hide" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 99, background: '#fff', border: '1px solid #e6e6ea', color: '#1d1d1f', marginBottom: 12 }}>
          <ChevronLeft size={18} />
        </Link>

        {good && row ? (
          <>
            <WinCard
              lang={lang}
              card={{
                label: String(row.label),
                big: String(row.big),
                context: String(row.context),
                bizName: (client?.name as string) || T('Your business'),
                monthLabel,
              }}
            />
            <div style={{ marginTop: 18 }}>
              <ShareRow clientId={clientId} cardKey={String(row.card_key)} title={String(row.big)} />
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', borderRadius: 18, padding: '30px 20px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>{T('Nothing to show here')}</div>
            <div style={{ fontSize: 12.5, color: '#6e6e73', marginTop: 6, lineHeight: 1.5 }}>
              {T('Only an order we counted is something to show. See the rest on your wins shelf.')}
            </div>
            <Link href="/dashboard/wins" style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, textDecoration: 'none' }}>
              {T('Wins')} ›
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
