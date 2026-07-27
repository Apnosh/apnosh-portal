/**
 * /client-agreement — the Client Agreement, in public, in plain words.
 *
 * Distinct from /terms, which is the portal's Terms of Service (who may use the software). This is
 * the SERVICE agreement: what happens to your money, your photos and your data when Apnosh does paid
 * work for you. Named to mirror /creator-terms, which does the same job on the supply side.
 *
 * NOT LAWYER-REVIEWED. See the note in src/lib/agreements/client-agreement.ts. It is written to
 * answer the questions owners actually asked rather than to be maximally defensible, and it must be
 * reviewed before anyone relies on it.
 *
 * Public and unauthenticated on purpose: someone deciding whether to spend money must be able to
 * read what they would agree to without first having an account. Rendered from the same module the
 * accept control reads, so the version shown here and the version recorded against an order cannot
 * drift apart.
 */

import {
  CLIENT_AGREEMENT,
  CLIENT_AGREEMENT_VERSION,
  CLIENT_AGREEMENT_EFFECTIVE,
} from '@/lib/agreements/client-agreement'

export const metadata = {
  title: 'Client Agreement | Apnosh',
  description: 'What Apnosh commits to when it does paid marketing work for your restaurant.',
}

export default function ClientAgreementPage() {
  return (
    <main
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '48px 22px 90px',
        fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
        color: '#1d1d1f',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 8px' }}>
        Client Agreement
      </h1>
      <p style={{ fontSize: 13.5, color: '#6e6e73', margin: '0 0 20px' }}>
        Effective {CLIENT_AGREEMENT_EFFECTIVE} &middot; Version {CLIENT_AGREEMENT_VERSION}
      </p>
      <p style={{ fontSize: 15.5, color: '#424245', margin: '0 0 38px' }}>
        These are the standing terms between you and Apnosh when we do paid work for you. They are
        written to be read, not to be got past. Every section below exists because a restaurant owner
        asked the question.
      </p>

      {CLIENT_AGREEMENT.map((c) => (
        <section key={c.q} style={{ marginBottom: 34 }}>
          <h2 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 10px' }}>
            {c.q}
          </h2>
          {c.a.map((para, i) => (
            <p key={i} style={{ fontSize: 15.5, color: '#424245', margin: '0 0 11px' }}>
              {para}
            </p>
          ))}
        </section>
      ))}

      <hr style={{ border: 0, borderTop: '1px solid #e6e6ea', margin: '42px 0 20px' }} />
      <p style={{ fontSize: 13, color: '#86868b', margin: '0 0 10px' }}>
        When you start a plan we record which version of this agreement you accepted, and exactly
        what the plan contained and cost at that moment. You can ask us for that record at any time.
      </p>
      <p style={{ fontSize: 13, color: '#86868b', margin: 0 }}>
        Your use of the portal software itself is covered separately by our{' '}
        <a href="/terms" style={{ color: '#2e9a78' }}>
          Terms of Service
        </a>
        .
      </p>
    </main>
  )
}
