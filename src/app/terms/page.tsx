import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Apnosh',
  description: 'Terms of Service for the Apnosh client portal at portal.apnosh.com.',
}

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-ink-3 mb-10">Last updated: April 27, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6">
        <p>
          These terms govern your use of the Apnosh client portal at portal.apnosh.com
          (the &ldquo;Service&rdquo;). By logging in or using the Service, you agree to these
          terms. If you do not agree, do not use the Service.
        </p>

        <Section title="Who we are">
          <p>
            Apnosh is a Seattle-based marketing agency operating the Service to give our
            restaurant clients real-time visibility into the work we do on their behalf
            across content, paid advertising, local SEO, and reputation management.
          </p>
        </Section>

        <Section title="Eligibility">
          <p>
            The Service is a private B2B platform. Access is granted to businesses that have
            entered an active service agreement with Apnosh and to staff Apnosh authorizes.
            You confirm you are at least 18 years old and authorized to bind your business
            to these terms.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for keeping your login credentials confidential and for any
            activity under your account. Notify us immediately at apnosh@gmail.com if you
            believe your account has been compromised. We may suspend access if we detect
            unauthorized activity.
          </p>
        </Section>

        <Section title="Connected platforms">
          <p>
            The Service can connect to third-party platforms (Google Business Profile,
            Google Analytics, Meta, TikTok, LinkedIn, etc.) through OAuth or by you adding
            Apnosh as a Manager on those platforms. When you connect a platform:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You authorize Apnosh to read data from that platform on your behalf, only for the purpose of operating the Service for you.</li>
            <li>You can revoke this authorization at any time through the source platform&rsquo;s own settings.</li>
            <li>Apnosh agrees to respect each platform&rsquo;s API terms (notably Google API Services User Data Policy and the Limited Use requirements where applicable).</li>
            <li>Apnosh agrees not to use connected-platform data for any purpose other than what you have engaged us for.</li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to access another client&rsquo;s data</li>
            <li>Reverse-engineer, decompile, or scrape the Service</li>
            <li>Upload malware or content that violates third-party rights</li>
            <li>Resell or sublicense the Service</li>
          </ul>
        </Section>

        <Section title="Fees">
          <p>
            Service usage is included in your active service agreement with Apnosh. Specific
            services (retainers, one-time projects) are billed under the agreement&rsquo;s terms
            via Stripe invoices and subscriptions.
          </p>
        </Section>

        <Section title="Data ownership">
          <p>
            You own all data you provide to the Service and all data Apnosh ingests on your
            behalf from your connected platforms. Apnosh holds a limited license to use that
            data only as needed to operate the Service for you. You can request a copy or
            deletion of your data at any time per our Privacy Policy.
          </p>
        </Section>

        <Section title="Service changes">
          <p>
            We may add, change, or remove features at any time. We will give reasonable
            notice of material changes that reduce functionality you actively rely on.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            Either party may terminate this agreement by ending the underlying service
            relationship with Apnosh. On termination, your portal access ends and your data
            is deleted within 90 days unless you request earlier deletion.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            The Service is provided &ldquo;as is.&rdquo; We do our best to keep it secure and
            accurate, but we make no warranty of uninterrupted availability or that the
            third-party data we display is error-free. Always verify business-critical
            decisions against source-of-truth platforms.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Apnosh&rsquo;s aggregate liability arising
            from or related to the Service is limited to the fees you paid to Apnosh in the
            three months preceding the claim. We are not liable for indirect, incidental, or
            consequential damages.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the State of Washington, USA. Any
            dispute will be resolved in state or federal court located in King County,
            Washington.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We will notify you by email of any material change at least 14 days before it
            takes effect. The current version is always at portal.apnosh.com/terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions: <a href="mailto:apnosh@gmail.com" className="text-brand underline">apnosh@gmail.com</a>.
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
