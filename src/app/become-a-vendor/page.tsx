/**
 * Public vendor + freelancer application landing page.
 * No auth required — anyone can apply.
 */

import ApplicationForm from './application-form'

export const metadata = {
  title: 'Become a Vendor — Apnosh',
  description: 'Photographers, designers, social managers, agencies, and other restaurant pros — join the Apnosh marketplace.',
}

export default function BecomeVendorPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-12 pb-20 space-y-8">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-dark">Apnosh Marketplace</p>
        <h1 className="text-[36px] font-semibold text-ink mt-2">Become a vendor or freelancer</h1>
        <p className="text-ink-2 text-[15px] mt-3 leading-relaxed">
          Apnosh is where restaurants find marketing help. Photographers, designers,
          social managers, agencies, and other restaurant pros use our platform to
          reach owners actively shopping for services. Apply below.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Bullet title="Get discovered" body="Restaurants find you when they need your specialty." />
        <Bullet title="Bookings handled" body="We manage scheduling, payment, and paperwork." />
        <Bullet title="Keep most of it" body="Free tier: 20% platform fee. Pro tier: 15%. Verified: 12%." />
      </div>

      <ApplicationForm />
    </div>
  )
}

function Bullet({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-4">
      <p className="text-[13px] font-semibold text-ink mb-1">{title}</p>
      <p className="text-[12px] text-ink-3 leading-relaxed">{body}</p>
    </div>
  )
}
