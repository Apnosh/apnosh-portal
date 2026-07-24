/**
 * /creator-terms — the Creator Agreement a creator accepts at signup. Plain-language, covers the real
 * bases for paying an independent contractor through a marketplace. This is a DRAFT starting point:
 * it must be reviewed by a lawyer before it is relied on. Bump CREATOR_AGREEMENT_VERSION when the text
 * changes materially.
 */

import { CREATOR_AGREEMENT_VERSION, CREATOR_AGREEMENT_EFFECTIVE } from '@/lib/marketplace/creator-agreement'

export const metadata = {
  title: 'Creator Agreement — Apnosh',
  description: 'The agreement between creators and Apnosh: how you work, how you get paid, and who can use your work.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-ink mb-2">{title}</h2>
      <div className="space-y-2 text-[14px] text-ink-2 leading-relaxed">{children}</div>
    </section>
  )
}

export default function CreatorTermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-dark">Apnosh for creators</p>
      <h1 className="text-3xl font-bold text-ink mt-2">Creator Agreement</h1>
      <p className="text-ink-3 text-sm mt-2">Effective {CREATOR_AGREEMENT_EFFECTIVE} · Version {CREATOR_AGREEMENT_VERSION}</p>

      <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-[13px] font-semibold text-amber-900">Draft for review</p>
        <p className="text-[12.5px] text-amber-800 mt-1 leading-relaxed">
          This is a plain-language starting draft. Have a lawyer review it before creators rely on it. It is not legal advice.
        </p>
      </div>

      <p className="mt-6 text-[14px] text-ink-2 leading-relaxed">
        This agreement is between you (the creator) and Apnosh. When you join as a creator, you agree to it.
        It explains how you work with restaurants through Apnosh, how you get paid, and who can use your work.
      </p>

      <Section title="1. You run your own business">
        <p>You are an independent contractor, not an Apnosh employee. You choose your own prices, your own hours, and which jobs you take. You use your own gear and cover your own business costs. Nothing here makes you a partner, agent, or employee of Apnosh.</p>
      </Section>

      <Section title="2. How you get paid">
        <p>You set your price. Apnosh keeps a platform fee and you keep the rest. The fee depends on your tier: 20% on the free tier, 15% when verified, and 12% for top-rated creators.</p>
        <p>You are paid after the restaurant approves your finished work and their payment clears. Money goes to your bank through Stripe. Apnosh never sees your bank or tax details. You connect your bank and give that information to Stripe directly.</p>
        <p>No one is charged, and no money moves, until a real booking is delivered and approved.</p>
      </Section>

      <Section title="3. Taxes">
        <p>You are responsible for your own taxes. You are not an employee, so nothing is withheld for you. If you earn enough in a year, you will receive a 1099 tax form, handled through Stripe. Keep your tax information current in Stripe so your payouts are not held.</p>
      </Section>

      <Section title="4. Your work, and who can use it">
        <p><b>You keep the copyright</b> to what you create. The restaurant that hires you gets a wide, worldwide, forever license to use your finished work in their own marketing. That includes their website, menus, social media, and paid ads. You can also show the work in your own portfolio.</p>
        <p><b>Influencer and creator posts are different.</b> A post you make lives on your own channels and stays yours. The restaurant gets the right to reshare and boost it, not to own it.</p>
        <p>You promise the work you deliver is your own, that you have the rights to everything in it, and that it does not copy or infringe anyone else. If you include music, fonts, or footage from someone else, you must have the right to use them.</p>
      </Section>

      <Section title="5. Do great work">
        <p>Deliver what you promised, on time, and to a professional standard. If a booking changes or you hit a problem, tell the restaurant as early as you can. Redo requests within the agreed scope are part of the job.</p>
      </Section>

      <Section title="6. Bookings and cancellations">
        <p>Honor the bookings you accept. If you truly must cancel, do it as early as possible so the restaurant can plan. Repeated late cancellations or no-shows can get your account paused or removed.</p>
      </Section>

      <Section title="7. Be professional">
        <p>Be honest, respectful, and safe on every job. No harassment, no discrimination, no illegal activity, and no false or misleading claims about your work or results. Follow the law wherever you work.</p>
      </Section>

      <Section title="8. Your profile and reviews">
        <p>Keep your profile true: your work samples, prices, and what you offer. Restaurants can rate and review your work after a job. Fake reviews, paid reviews, and misleading claims are not allowed.</p>
      </Section>

      <Section title="9. Apnosh's role">
        <p>Apnosh is the marketplace that connects you with restaurants and handles scheduling, approvals, and payment. Apnosh is not your employer and is not the buyer of your work. Apnosh can pause or remove any account that breaks these rules, and can update the store, fees, or features over time.</p>
      </Section>

      <Section title="10. Your responsibility">
        <p>You are responsible for your own work, your conduct, and any harm or loss you cause while doing a job. You agree to cover Apnosh for claims that come from your work or your actions. We strongly recommend you carry your own liability insurance.</p>
        <p>Apnosh provides the marketplace &quot;as is&quot; and is not liable for a restaurant&apos;s conduct, a canceled booking, or lost business.</p>
      </Section>

      <Section title="11. Ending this">
        <p>You or Apnosh can end this agreement at any time. If you have already committed to a booking, finish it or hand it off fairly. Any payment you have earned for approved work is still paid.</p>
      </Section>

      <Section title="12. Changes and the law">
        <p>Apnosh may update this agreement. If we make a material change, we will tell you and ask you to accept the new version. This agreement is governed by the laws of the state where Apnosh operates. Any dispute will be handled there.</p>
      </Section>

      <p className="mt-10 text-[12px] text-ink-4">
        By joining as a creator, you confirm you have read and agree to this Creator Agreement and the Privacy Policy.
      </p>
    </div>
  )
}
