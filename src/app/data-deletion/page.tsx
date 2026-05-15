import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Deletion | Apnosh',
  description: 'How to request deletion of your Apnosh portal data, including data from connected Instagram, Facebook, TikTok, and LinkedIn accounts.',
}

/**
 * Data deletion explainer. Meta App Review specifically requires a
 * public-facing URL describing how a user can remove their data, plus
 * a programmatic callback that Meta hits when a user removes the app.
 *
 * This page is the human-readable side; the callback endpoints live at
 * /api/meta/deauthorize and /api/meta/data-deletion.
 */

export default function DataDeletion() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-bold mb-2">Data Deletion</h1>
      <p className="text-sm text-ink-3 mb-10">Last updated: May 14, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6">
        <p>
          You control the data Apnosh holds about you. This page explains the
          three ways to have your data removed, what gets deleted, and how long
          deletion takes.
        </p>

        <Section title="Option 1 — Disconnect an account from the portal">
          <p>
            The fastest path. Open <Link href="/dashboard/connected-accounts">portal.apnosh.com/dashboard/connected-accounts</Link>,
            find the platform you want to remove (Instagram, Facebook, TikTok, or LinkedIn),
            and click <strong>Disconnect</strong>.
          </p>
          <p>
            Apnosh immediately deletes the stored access token and removes the connection.
            Aggregated metrics already collected from that account are retained for up to
            90 days unless you also ask for a full account deletion (Option 3).
          </p>
        </Section>

        <Section title="Option 2 — Remove Apnosh from your social platform">
          <p>
            If you remove the Apnosh app from your Instagram, Facebook, TikTok, or LinkedIn
            settings, those platforms notify us automatically and we delete the matching
            connection from our system within 24 hours.
          </p>
          <ul>
            <li>
              <strong>Facebook / Instagram:</strong> Settings → Business Integrations → Apnosh → Remove
            </li>
            <li>
              <strong>TikTok:</strong> Settings → Security and Login → Manage Apps → Apnosh → Disconnect
            </li>
            <li>
              <strong>LinkedIn:</strong> Settings → Data Privacy → Permitted Services → Apnosh → Remove
            </li>
          </ul>
          <p>
            We do not retain credentials or tokens after removal. Aggregated metrics follow
            the same 90-day retention policy as Option 1.
          </p>
        </Section>

        <Section title="Option 3 — Full account deletion request">
          <p>
            To have <em>all</em> data Apnosh holds about you deleted (connections,
            cached metrics, posts, drafts, comments, and account profile), email{' '}
            <a href="mailto:apnosh@gmail.com" className="text-emerald-700 underline">
              apnosh@gmail.com
            </a>{' '}
            from the address on your Apnosh account with the subject line
            &ldquo;Data deletion request&rdquo;.
          </p>
          <p>
            We confirm the request within 2 business days and complete deletion within 30
            days. You will receive a confirmation email when the deletion is complete.
          </p>
        </Section>

        <Section title="What data we delete">
          <ul>
            <li>OAuth tokens for connected platforms</li>
            <li>Account identifiers (Instagram username, Facebook Page ID, etc.)</li>
            <li>Cached post content, captions, and media URLs</li>
            <li>Comment and message threads we pulled from connected accounts</li>
            <li>Aggregated reach, engagement, and follower counts</li>
            <li>Approval history and feedback you submitted in the portal</li>
          </ul>
        </Section>

        <Section title="What we may retain">
          <p>
            We retain a minimal audit log of deletion requests (when, who, what was deleted)
            for legal and compliance purposes. This log does not contain any content from
            your connected accounts.
          </p>
          <p>
            Billing records are retained for 7 years to satisfy tax and accounting
            requirements (US law).
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Email{' '}
            <a href="mailto:apnosh@gmail.com" className="text-emerald-700 underline">
              apnosh@gmail.com
            </a>{' '}
            and a real person will respond within 2 business days.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink mb-2">{title}</h2>
      <div className="space-y-3 text-ink-2 leading-relaxed">{children}</div>
    </section>
  )
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-emerald-700 underline">{children}</a>
  )
}
