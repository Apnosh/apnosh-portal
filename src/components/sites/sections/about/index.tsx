/**
 * About variants. Each picks a different storytelling structure.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface Props { site: RestaurantSite }

// 2-COL with drop cap (Editorial-style)
export function AboutTwoColDropcap({ site }: Props) {
  const about = site.about
  if (!about?.headline && !about?.body) return null
  const paras = (about.body || '').split('\n\n').filter(Boolean)
  const values = Array.isArray(about.values) ? about.values : []

  return (
    <section id="about" style={{
      padding: 'clamp(80px, 10vw, 140px) 0',
      background: 'var(--c-paper)',
      borderTop: '1px solid var(--c-rule)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'clamp(40px, 6vw, 100px)', alignItems: 'start' }}>
          <h2 style={{ fontSize: 'clamp(2rem, 3.5vw, 3.4rem)', fontStyle: 'italic', position: 'sticky', top: 100 }}>
            {about.headline}
          </h2>
          <div style={{ fontSize: '1.15rem', lineHeight: 1.7, color: 'var(--c-ink-3)' }}>
            {paras.map((p, i) => (
              <p key={i} style={i === 0 ? { } : { marginTop: '1.4em' }}>
                {i === 0 && <span style={{
                  fontFamily: 'var(--c-font-display)',
                  fontSize: '5rem',
                  float: 'left',
                  lineHeight: '0.85',
                  margin: '8px 12px 0 0',
                  color: 'var(--c-brand)',
                  fontStyle: 'italic',
                }}>{p[0]}</span>}
                {i === 0 ? p.slice(1) : p}
              </p>
            ))}
          </div>
        </div>

        {values.length > 0 && (
          <div style={{
            marginTop: 'clamp(60px, 8vw, 100px)',
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(3, values.length)}, 1fr)`,
            gap: 0,
          }}>
            {values.map((v, i) => (
              <div key={i} style={{
                padding: '32px 28px 32px 0',
                borderTop: '1px solid var(--c-rule)',
                borderRight: i < values.length - 1 ? '1px solid var(--c-rule)' : 'none',
              }}>
                <h4 style={{ fontFamily: 'var(--c-font-display)', fontSize: '1.4rem', fontStyle: 'italic', marginBottom: 10 }}>{v.title}</h4>
                <p style={{ color: 'var(--c-ink-3)', margin: 0, fontSize: '0.98rem' }}>{v.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// CENTERED narrative — single column, ornament marks
export function AboutCenteredNarrative({ site }: Props) {
  const about = site.about
  if (!about?.headline && !about?.body) return null
  const paras = (about.body || '').split('\n\n').filter(Boolean)
  const values = Array.isArray(about.values) ? about.values : []

  return (
    <section id="about" style={{
      padding: 'clamp(100px, 14vw, 180px) 0',
      background: 'var(--c-cream)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <span style={{
          display: 'inline-block', fontSize: '0.74rem', letterSpacing: '0.32em',
          textTransform: 'uppercase', color: 'var(--c-brand)', marginBottom: 36,
        }}>The Story</span>
        <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 4.4rem)', maxWidth: '16ch', margin: '0 auto 40px' }}>
          {about.headline}
        </h2>
        <div style={{ fontSize: '1.15rem', lineHeight: 1.75, color: 'var(--c-ink-3)' }}>
          {paras.map((p, i) => <p key={i} style={{ margin: '0 0 1.5em' }}>{p}</p>)}
        </div>
        <div style={{ fontFamily: 'var(--c-font-display)', color: 'var(--c-brand)', fontSize: '1.6rem', letterSpacing: '0.4em', marginTop: 60 }}>
          ✦ ✦ ✦
        </div>
      </div>
      {values.length > 0 && (
        <div style={{
          maxWidth: 1080, margin: '80px auto 0',
          padding: '0 clamp(20px, 4vw, 56px)',
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(3, values.length)}, 1fr)`,
          gap: 'clamp(40px, 6vw, 80px)',
        }}>
          {values.map((v, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--c-brand)', fontSize: '1.4rem', marginBottom: 16 }}>✦</div>
              <h4 style={{ fontFamily: 'var(--c-font-display)', fontSize: '1.5rem', fontStyle: 'italic', marginBottom: 12 }}>{v.title}</h4>
              <p style={{ color: 'var(--c-ink-3)', fontSize: '0.98rem', margin: 0, lineHeight: 1.6 }}>{v.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// MANIFESTO — large quote-style block, no values
export function AboutManifesto({ site }: Props) {
  const about = site.about
  if (!about?.body) return null
  return (
    <section id="about" style={{
      padding: 'clamp(120px, 16vw, 200px) 0',
      background: 'var(--c-ink)', color: 'var(--c-cream)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <span style={{
          fontSize: '0.74rem', letterSpacing: '0.32em', textTransform: 'uppercase',
          color: 'var(--c-brand)', marginBottom: 40, display: 'inline-block',
        }}>Our Manifesto</span>
        <p style={{
          fontFamily: 'var(--c-font-display)', fontStyle: 'italic',
          fontSize: 'clamp(1.6rem, 3.4vw, 2.8rem)', lineHeight: 1.35,
          color: 'var(--c-cream)',
          margin: 0,
        }}>
          &ldquo;{(about.body || '').split('\n\n')[0]}&rdquo;
        </p>
        {about.headline && (
          <p style={{
            marginTop: 48,
            fontSize: '0.78rem', letterSpacing: '0.24em', textTransform: 'uppercase',
            color: 'var(--c-brand)',
          }}>
            — {about.headline}
          </p>
        )}
      </div>
    </section>
  )
}

export const ABOUT_VARIANTS = {
  'two-col-dropcap': AboutTwoColDropcap,
  'centered-narrative': AboutCenteredNarrative,
  'manifesto': AboutManifesto,
} as const

export type AboutVariantId = keyof typeof ABOUT_VARIANTS

export const ABOUT_VARIANT_DESCRIPTIONS: Record<AboutVariantId, string> = {
  'two-col-dropcap':    'Editorial. Headline left, prose right with a brand-color drop cap. Hairline-divided values row below. Best for fine dining + magazine moods.',
  'centered-narrative': 'Centered narrow column. Ornament marks bookend. Values as a centered three-up. Best for warm artisan + minimal modern.',
  'manifesto':          'Dark surface. Single oversized italic quote. No values shown. Best for occasion-night / cocktail bar / theatrical brands.',
}
