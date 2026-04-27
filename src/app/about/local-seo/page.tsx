import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, Phone, MapPin, Globe, Search, ShieldCheck, Lock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Local SEO Reporting | Apnosh',
  description: 'How Apnosh uses Google Business Profile data to give restaurant clients clear, actionable Local SEO dashboards in their private portal.',
}

export default function AboutLocalSeoPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-ink">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-3">Apnosh Portal · Local SEO</p>
        <h1 className="text-4xl font-bold mb-3">Local SEO reporting for restaurant clients</h1>
        <p className="text-lg text-ink-3 max-w-2xl">
          Every Apnosh restaurant client gets a private Local SEO tab in their portal showing how
          their Google Business Profile is performing across Search and Maps. This page explains
          what we use, why, and how that data is handled.
        </p>
      </div>

      {/* What we show */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">What clients see</h2>
        <p className="text-ink-3 mb-6">
          One scrollable Local SEO tab per location. Updated daily.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card icon={Eye} label="Impressions" sub="Search + Maps, Mobile + Desktop" />
          <Card icon={Globe} label="Website clicks" sub="Daily totals, 30d vs prior 30d" />
          <Card icon={Phone} label="Phone calls" sub="Tap-to-call from listing" />
          <Card icon={MapPin} label="Directions" sub="Maps direction requests" />
        </div>
        <p className="text-ink-3">
          Plus an engagement-funnel view (impressions → actions), top search queries that surfaced
          the business, photo views, and a 90-day trend sparkline.
        </p>
      </section>

      {/* The data we read */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">The data we read from Google</h2>
        <p className="text-ink-3 mb-6">
          For every location where Apnosh is added as a Manager on the client&rsquo;s Google
          Business Profile, we read the following metrics through the Google Business Profile
          Performance API:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-ink mb-6">
          <li><strong>Profile impressions</strong> on Google Search and Google Maps, split by Mobile vs Desktop</li>
          <li><strong>Customer actions</strong>: phone calls, direction requests, website clicks, message conversations, bookings</li>
          <li><strong>Photo views</strong> and photo count</li>
          <li><strong>Top search queries</strong> that surfaced the business that day</li>
        </ul>
        <p className="text-ink-3">
          We use <strong>read-only scopes only</strong>. We never write, modify, or delete
          anything on the client&rsquo;s Business Profile through the API. Edits to the profile
          are made by the client or by Apnosh staff through the standard Business Profile Manager
          interface.
        </p>
      </section>

      {/* Why API vs CSV */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">Why we use the API</h2>
        <p className="text-ink-3 mb-4">
          Today, our only option is to manually export aggregate CSV files from Business Profile
          Manager once a month. That works but it gives us a single number per month per
          location — too coarse to spot a campaign that took off mid-month, or a sudden drop in
          calls that needs investigation.
        </p>
        <p className="text-ink-3">
          With API access, we can pull <strong>daily granularity</strong> automatically each
          morning, render trend charts that actually capture day-of-week patterns, and surface
          alerts when a metric drops outside its normal range. The result is faster, more
          actionable insight for the restaurant operator.
        </p>
      </section>

      {/* Estimated usage */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">Estimated API usage</h2>
        <div className="rounded-xl border border-ink-6 bg-bg-2 p-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-3">Locations under management</dt>
              <dd className="font-bold text-base">21 verified locations</dd>
            </div>
            <div>
              <dt className="text-ink-3">Pulls per day per location</dt>
              <dd className="font-bold text-base">~6 endpoints</dd>
            </div>
            <div>
              <dt className="text-ink-3">Daily call volume</dt>
              <dd className="font-bold text-base">~125 calls/day</dd>
            </div>
            <div>
              <dt className="text-ink-3">Quota requested</dt>
              <dd className="font-bold text-base">1,000 calls/day (headroom)</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Data handling */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">How we handle the data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Pillar
            icon={ShieldCheck}
            title="Strict per-client isolation"
            body="Every row of GBP data is tied to a single client_id. Row-level security in our database guarantees one client's login can never see another client's data. Apnosh never aggregates GBP data across clients."
          />
          <Pillar
            icon={Lock}
            title="Encrypted in transit and at rest"
            body="All API traffic is HTTPS. OAuth tokens are encrypted at rest in our database and never exposed to client-side JavaScript. Database access is gated by Supabase row-level security."
          />
          <Pillar
            icon={Eye}
            title="Read-only, narrow scope"
            body="We request only the business.manage scope, used in read-only mode. We do not write to, modify, or delete anything on Google Business Profile through the API."
          />
          <Pillar
            icon={Search}
            title="Used only to operate this portal"
            body="GBP data is used solely to render the client's own Local SEO dashboard. We do not train ML models on it, do not sell or share it, and do not use it for advertising."
          />
        </div>
      </section>

      {/* Compliance */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-2">Policies and compliance</h2>
        <p className="text-ink-3 mb-4">
          Apnosh complies with the Google API Services User Data Policy, including the Limited Use
          requirements where they apply. Specifically: GBP data is used only to provide
          user-facing features in the portal, is never transferred to others except as needed for
          the operation of those features, is never used for advertising, and is never read by
          humans except as required for support or compliance reasons that the user has been
          notified of.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/privacy" className="px-4 py-2 border border-ink-5 rounded-lg text-sm font-medium hover:bg-bg-2">Privacy Policy</Link>
          <Link href="/terms" className="px-4 py-2 border border-ink-5 rounded-lg text-sm font-medium hover:bg-bg-2">Terms of Service</Link>
          <a href="mailto:apnosh@gmail.com" className="px-4 py-2 border border-ink-5 rounded-lg text-sm font-medium hover:bg-bg-2">Contact: apnosh@gmail.com</a>
        </div>
      </section>

      <footer className="border-t border-ink-6 pt-6 text-xs text-ink-3">
        Apnosh · Seattle, WA · portal.apnosh.com
      </footer>
    </main>
  )
}

function Card({ icon: Icon, label, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-4">
      <Icon className="w-4 h-4 text-ink-3 mb-3" />
      <div className="font-bold text-sm">{label}</div>
      <div className="text-xs text-ink-3 mt-1">{sub}</div>
    </div>
  )
}

function Pillar({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5">
      <Icon className="w-5 h-5 text-brand mb-3" />
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-ink-3">{body}</div>
    </div>
  )
}
