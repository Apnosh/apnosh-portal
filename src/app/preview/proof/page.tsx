'use client'

/**
 * /preview/proof — the proof card, viewable without an account. Renders the
 * REAL component with labeled sample data so the design can be judged before
 * a live week qualifies. Nothing here saves or reads real numbers.
 */

import ProofCard from '@/components/mvp/proof-card'

const SAMPLES = [
  {
    id: 'sample-gbp', label: 'This week on Google',
    big: '9 calls · 31 direction taps',
    context: 'Up from 4 calls and 12 taps the week before.',
    attribution: 'Since your menu photos went live, Aug 21.',
    spark: [9, 12, 10, 13, 17, 22, 31],
  },
  {
    id: 'sample-post', label: 'Your galbi reel',
    big: '2,418 people saw it',
    context: '86 saved or shared it.',
    attribution: 'You approved it Monday. It published Tuesday at 5 pm.',
  },
  {
    id: 'sample-reviews', label: 'August reviews',
    big: '6 new reviews · 4.7 average',
    context: 'Every one got a reply within a day.',
    attribution: 'Since the review kit went up by your register, Aug 2.',
  },
  {
    id: 'sample-down', label: 'Quieter week on Google',
    big: '3 calls · 14 direction taps',
    context: 'Down from 7 calls and 24 taps the week before. A push this week turns it around.',
    tone: 'heads_up' as const,
    cta: { label: 'Plan the push', href: '/campaigns/new' },
  },
]

export default function ProofPreviewPage() {
  return (
    <div style={{ minHeight: '100dvh', background: '#ececef', display: 'flex', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'radial-gradient(120% 34% at 50% 0%, rgba(74,189,152,0.10), rgba(255,255,255,0) 62%), #fbfbfd', padding: '20px 18px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f6e56', background: '#f0faf6', border: '1px solid rgba(74,189,152,0.3)', borderRadius: 7, padding: '3px 8px' }}>Preview</span>
          <span style={{ fontSize: 12, color: '#6e6e73' }}>Sample numbers. Nothing saves.</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#8e8e93', margin: '0 0 18px' }}>
          Cards land in the results deck on your Insights screen, right under the histogram, and in your inbox. These are the four types.
        </p>
        {SAMPLES.map((c) => (
          <ProofCard key={c.id} card={c} defaultOpen onDismiss={() => { /* preview: stays */ }} onSee={() => { /* preview: noop */ }} />
        ))}
        <p style={{ fontSize: 11.5, color: '#aeaeb2', marginTop: 14 }}>
          Green numbers are wins. The gray one is the quieter-week card: it only fires on a real drop, at most every two weeks, and always carries the move. Until a client{'\u2019'}s first real card fires, the deck shows labeled examples like these.
        </p>
      </div>
    </div>
  )
}
