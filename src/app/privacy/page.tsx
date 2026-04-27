import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Apnosh',
  description: 'How Apnosh handles client data, including Google Business Profile insights, in the Apnosh portal at portal.apnosh.com.',
}

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-ink-3 mb-10">Last updated: April 27, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6">
        <p>
          Apnosh (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates portal.apnosh.com,
          a private dashboard used by our restaurant marketing clients to view performance
          across the channels Apnosh manages on their behalf. This policy describes what data
          we collect, how we use it, who can see it, and how it is protected.
        </p>

        <Section title="Who this applies to">
          <p>
            This policy applies to two groups: (1) businesses that have engaged Apnosh as
            their marketing agency and use the portal to view their data, and (2) Apnosh
            staff who operate the portal on behalf of those clients.
          </p>
        </Section>

        <Section title="Data we collect">
          <h3 className="font-semibold mt-4 mb-1">From the businesses we manage</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Business profile information you authorize us to access (name, address, hours, services)</li>
            <li>Performance metrics from Google Business Profile (impressions, calls, direction requests, website clicks, photo views, search queries) — read-only, only for locations where Apnosh holds a Manager role</li>
            <li>Social media performance metrics from Instagram, Facebook, TikTok, and LinkedIn for connected accounts</li>
            <li>Website analytics from Google Analytics and Search Console for connected properties</li>
            <li>Reviews and ratings from Google Business Profile</li>
            <li>Content, briefs, and assets you provide to us</li>
            <li>Communications between you and your account manager</li>
          </ul>
          <h3 className="font-semibold mt-4 mb-1">From portal users (logging in)</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Email address (for authentication)</li>
            <li>Login timestamps and IP address (for security audit)</li>
          </ul>
        </Section>

        <Section title="How we use Google Business Profile data specifically">
          <p>
            For clients who have added Apnosh as a Manager on their Google Business Profile,
            we read performance data through the Google Business Profile Performance API for
            the sole purpose of presenting that client&rsquo;s own metrics back to them in the
            portal. Specifically:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>We never write to, modify, delete, or moderate Google Business Profile content via the API. Read-only scopes only.</li>
            <li>We never aggregate one client&rsquo;s GBP data with another client&rsquo;s data.</li>
            <li>We never share, sell, or expose one client&rsquo;s data to other portal users — strict per-client row-level security in our database enforces this.</li>
            <li>We never use GBP data to train machine learning models or for any purpose other than reporting to that specific client.</li>
            <li>We delete GBP data on request within 7 days of a client offboarding from Apnosh.</li>
          </ul>
        </Section>

        <Section title="How we use your data overall">
          <ul className="list-disc pl-5 space-y-1">
            <li>To render dashboards in the portal showing your performance across channels</li>
            <li>To generate monthly reports your account manager reviews with you</li>
            <li>To inform the content, ads, and SEO work we do on your behalf</li>
            <li>To bill you for the services you have agreed to</li>
          </ul>
          <p>
            We do not use your data for advertising. We do not sell your data. We do not
            share your data with anyone outside Apnosh and the sub-processors listed below.
          </p>
        </Section>

        <Section title="Where data is stored and how it is protected">
          <p>
            Your data is stored in a private Supabase Postgres database hosted in AWS
            us-west-2. Access is gated by row-level security policies — each client&rsquo;s
            login can only see rows tied to their own organization. Connections to the
            portal use HTTPS exclusively. OAuth tokens for connected platforms (Google,
            Meta, etc.) are stored encrypted at rest and never exposed in client-side
            JavaScript. Apnosh staff access is limited to the specific account manager
            assigned to your account and the company owner.
          </p>
        </Section>

        <Section title="Sub-processors">
          <p>
            We use the following third-party services to operate the portal. Each receives
            only the minimum data needed to perform its function:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — database, authentication, file storage</li>
            <li><strong>Vercel</strong> — application hosting</li>
            <li><strong>Stripe</strong> — billing and invoicing (only billing-related data is shared)</li>
            <li><strong>Anthropic</strong> — AI-assisted content suggestions (only content you explicitly send to AI features)</li>
            <li><strong>Google Cloud</strong> — for Google API access (Drive, Business Profile, Analytics, Search Console)</li>
            <li><strong>Resend / SendGrid</strong> — transactional email</li>
          </ul>
        </Section>

        <Section title="Your rights">
          <p>
            You can request a copy of all data we hold about your business at any time.
            You can request deletion of your data at any time. You can revoke API access we
            have to your connected platforms at any time through the platform&rsquo;s own
            settings (e.g., removing Apnosh as a Manager on your Google Business Profile).
            We will respond to data requests within 30 days.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use a single first-party session cookie to keep you logged in. We do not use
            third-party advertising cookies, tracking pixels, or analytics cookies on the
            portal.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The portal is a B2B service. We do not knowingly collect data from anyone under 18.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We will notify you by email of any material change to this policy at least 14
            days before the change takes effect. The current version is always at
            portal.apnosh.com/privacy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data: <a href="mailto:apnosh@gmail.com" className="text-brand underline">apnosh@gmail.com</a>.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold mt-8 mb-3">{title}</h2>
      {children}
    </section>
  )
}
