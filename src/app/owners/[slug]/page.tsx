import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { referralsEnabled } from '@/lib/referral-gate'
import { getClientLanguage } from '@/lib/i18n/language'
import { t, type Lang } from '@/lib/i18n/t'
import { getPromiseRows } from '@/lib/promises/read'
import { creditWords, REFERRAL_CREDIT_CENTS } from '@/lib/referrals/model'
import { referralCodeFor } from '@/lib/referrals/server'

/**
 * /owners/<slug> — one owner's page, for the friend they sent it to.
 *
 * THREE LOCKS, and all three are on the server:
 *   1. REFERRALS_ENABLED. With the switch off this URL is a 404, like every other referral surface.
 *   2. clients.featured_opt_in. Off by default (migration 261). A real business does not get a
 *      public page because a feature shipped; it gets one because its owner tapped a switch.
 *   3. noindex, always. Even opted in, this page is for a link somebody was sent, not for search.
 *      The owner asked to be shown to a friend, not to be listed.
 *
 * EVERY NUMBER ON IT COMES FROM THE LEDGER. The wins are order_promises rows in state 'counted' —
 * the same read the owner's own card and Home use (src/lib/promises/read.ts). Nothing is estimated
 * here, nothing is rounded up, and a business with no counted number shows no numbers at all.
 *
 * The page is drawn in the OWNER's language (clients.preferred_language), because it is their
 * page. The chrome around the numbers is translated; the ledger's own words — a card's title, the
 * line under a count — arrive in the language they were written in, which is English today. Saying
 * that plainly is better than translating half a sentence.
 */

/* Five minutes of cache, because this page is a link an owner hands out and every visit
   otherwise runs the whole promise read. Turning the page OFF does not wait for it: the opt-in
   route calls revalidatePath on this path, so a page taken down is down on the tap. */
export const revalidate = 300

interface PageProps { params: Promise<{ slug: string }> }

interface OwnerRow { id: string; name: string; slug: string; brief_description: string | null; featured_opt_in: boolean }

async function ownerFor(slug: string): Promise<OwnerRow | null> {
  if (!referralsEnabled() || !slug) return null
  try {
    const { data } = await createAdminClient()
      .from('clients')
      .select('id, name, slug, brief_description, featured_opt_in')
      .eq('slug', slug)
      .maybeSingle()
    const row = data as OwnerRow | null
    if (!row || !row.featured_opt_in) return null
    return row
  } catch (e) {
    // Pre-261 there is no featured_opt_in column, so nobody has opted in, so there is no page.
    console.warn('[owners] could not read the owner (apply migration 261?):', e instanceof Error ? e.message : e)
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const owner = await ownerFor(slug)
  return {
    // The browser tab: a business name and ours, joined. Not a sentence, so not translated.
    title: owner ? [owner.name, 'Apnosh'].join(' · ') : 'Apnosh',
    // Never indexed, opted in or not.
    robots: { index: false, follow: false },
  }
}

export default async function OwnerPage({ params }: PageProps) {
  const { slug } = await params
  const owner = await ownerFor(slug)
  if (!owner) notFound()

  const lang: Lang = await getClientLanguage(owner.id)
  const T = (k: string, vars?: Record<string, string | number>) => t(k, lang, vars)

  // The counted wins only. Never 'counting', never an estimate — a page that says a number to a
  // stranger has to be one the owner could point at in their own dashboard.
  const wins = (await getPromiseRows(owner.id, 0).catch(() => []))
    .filter((r) => r.state === 'counted')
    .slice(0, 4)

  // One photo the owner already put in their library. A picker belongs on the tell-a-friend page
  // and is a follow-up; until it exists, the newest photo is the honest stand-in.
  let photo: string | null = null
  try {
    const { data } = await createAdminClient()
      .from('assets')
      .select('file_url')
      .eq('client_id', owner.id)
      .eq('type', 'image')
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    photo = (data?.file_url as string) || null
  } catch { /* no photo is a fine page */ }

  const amount = creditWords(REFERRAL_CREDIT_CENTS)
  /* The button carries the OWNER'S OWN CODE. Without it the page would promise a friend $50 and
     then send them to a signup that had never heard of them — the credit only exists because the
     code travels. No code, no promise: the page says the plain invitation instead.

     READ, never make. This page is a public GET; anybody on the internet can call it, and a GET
     that writes a row is a GET that can be used to write rows. The code is made when the owner
     turns their page on, which is a thing they chose to do. */
  const code = await referralCodeFor(owner.id)

  return (
    <main style={{
      fontFamily: "'Inter',system-ui,sans-serif", color: '#1d1d1f', background: '#fff',
      minHeight: '100dvh', margin: '0 auto', maxWidth: 620, padding: '28px 20px 48px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2e9a78' }}>
        {T('An owner on Apnosh')}
      </div>
      <h1 style={{ fontFamily: "'Cal Sans','Inter',system-ui,sans-serif", fontSize: 32, fontWeight: 700, margin: '6px 0 8px', lineHeight: 1.15 }}>
        {owner.name}
      </h1>
      {owner.brief_description && (
        <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.5, margin: '0 0 18px' }}>{owner.brief_description}</p>
      )}

      {photo && (
        <img
          src={photo}
          alt=""
          style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 18, display: 'block', margin: '0 0 20px' }}
        />
      )}

      {wins.length > 0 && (
        <section style={{ margin: '0 0 22px' }}>
          <h2 style={{ fontSize: 12.5, fontWeight: 600, color: '#6e6e73', margin: '0 0 8px', padding: '0 2px' }}>
            {T('What we counted for them')}
          </h2>
          {wins.map((w) => (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
              background: '#fbfcfb', border: '1px solid #e6e6ea', borderRadius: 14, padding: '12px 14px', marginBottom: 8,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{w.label}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#2e9a78', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{w.value}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#aeaeb2', padding: '2px 2px 0' }}>
            {T('Real numbers from their account, counted after the work went live.')}
          </div>
        </section>
      )}

      <section style={{ background: '#eaf7f3', border: '1px solid rgba(74,189,152,0.30)', borderRadius: 18, padding: '16px 18px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1c6b52' }}>
          {code ? T('Start with {amount} off', { amount }) : T('Start with Apnosh')}
        </div>
        <p style={{ fontSize: 13.5, color: '#1c6b52', lineHeight: 1.5, margin: '6px 0 12px' }}>
          {code
            ? T('{name} sent you. Your first order starts with {amount} off.', { name: owner.name, amount })
            : T('{name} works with Apnosh.', { name: owner.name })}
        </p>
        <a
          href={code ? `/r/${code}` : '/signup'}
          style={{
            display: 'inline-block', background: '#2e9a78', color: '#fff', textDecoration: 'none',
            borderRadius: 999, padding: '10px 18px', fontSize: 14, fontWeight: 700,
          }}
        >
          {T('Start with Apnosh')}
        </a>
      </section>
    </main>
  )
}
