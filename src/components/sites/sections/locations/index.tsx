/**
 * Locations variants. Same RestaurantSite.locations data, different layouts.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface Props { site: RestaurantSite; reservationUrl: string }

// CARDS GRID — 2-up on bg-paper (current Bold default)
export function LocationsCards({ site, reservationUrl }: Props) {
  if (site.locations.length === 0) return null
  return (
    <section id="locations" style={{ padding: 'clamp(80px, 10vw, 140px) 0', background: 'var(--c-paper)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
          <span style={{ display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>Visit</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.4rem)' }}>
            {site.locations.length === 1 ? 'Find Us.' : 'Two Locations.'}
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(2, site.locations.length)}, 1fr)`,
          gap: 24,
        }}>
          {site.locations.map((loc, idx) => {
            const hours = Array.isArray(loc.hours) ? loc.hours : []
            const features = Array.isArray(loc.features) ? loc.features : []
            return (
              <article key={loc.id ?? idx} style={{
                background: 'var(--c-cream)',
                borderRadius: 18, padding: 28,
                display: 'flex', flexDirection: 'column',
                border: '1px solid var(--c-rule)',
              }}>
                <div style={{ fontSize: '0.74rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--c-brand)', marginBottom: 8 }}>
                  {loc.tagline || `Location ${idx + 1}`}
                </div>
                <h3 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', marginBottom: 8 }}>{loc.name}</h3>
                <p style={{ color: 'var(--c-ink-3)', marginBottom: 12 }}>{loc.address}, {loc.city}, {loc.state} {loc.zip}</p>
                {loc.phone && (
                  <a href={`tel:${loc.phoneHref || loc.phone}`} style={{
                    fontFamily: 'var(--c-font-display)',
                    fontSize: '1.5rem', color: 'var(--c-brand)',
                    textDecoration: 'none', marginBottom: 18,
                  }}>{loc.phone}</a>
                )}
                {hours.length > 0 && (
                  <ul style={{
                    listStyle: 'none', padding: '12px 0', margin: '0 0 18px',
                    borderTop: '1px solid var(--c-rule)', borderBottom: '1px solid var(--c-rule)',
                  }}>
                    {hours.map((h, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.92rem' }}>
                        <span style={{ color: 'var(--c-ink-3)' }}>{h.label}</span><span>{h.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {features.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {features.map((f, i) => (
                      <li key={i} style={{
                        fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                        background: 'var(--c-paper)', border: '1px solid var(--c-rule)',
                        padding: '6px 10px', borderRadius: 6, color: 'var(--c-ink-3)',
                      }}>{f}</li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
                  {loc.googleMapsUrl && <a href={loc.googleMapsUrl} target="_blank" rel="noopener" style={{ border: '1px solid var(--c-ink)', color: 'var(--c-ink)', padding: '12px 18px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 6, textDecoration: 'none' }}>Directions</a>}
                  <a href={reservationUrl} style={{ background: 'var(--c-brand)', color: 'var(--c-cream)', padding: '12px 18px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 6, textDecoration: 'none' }}>Reserve</a>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// FULL-BLEED EACH — alternating dark + cream sections per location, photo full width
export function LocationsFullBleedEach({ site, reservationUrl }: Props) {
  if (site.locations.length === 0) return null
  return (
    <section id="locations">
      {site.locations.map((loc, idx) => {
        const hours = Array.isArray(loc.hours) ? loc.hours : []
        const isDark = idx % 2 === 0
        return (
          <div key={loc.id ?? idx} style={{
            background: isDark ? 'var(--c-ink)' : 'var(--c-cream)',
            color: isDark ? 'var(--c-cream)' : 'var(--c-ink)',
            padding: 'clamp(80px, 10vw, 140px) 0',
          }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(40px, 6vw, 100px)',
                alignItems: 'center',
              }}>
                <div style={{ aspectRatio: '4/5', borderRadius: 18, overflow: 'hidden', background: 'var(--c-rule)' }}>
                  {loc.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={loc.photoUrl} alt={loc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: `linear-gradient(135deg, color-mix(in oklab, var(--c-brand) 30%, var(--c-ink)), var(--c-ink))`,
                      display: 'flex', alignItems: 'flex-end', padding: 32,
                      color: 'var(--c-cream)',
                      fontFamily: 'var(--c-font-display)',
                      fontSize: '2rem', letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{loc.name}</div>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>
                    {loc.tagline || `Location ${idx + 1}`}
                  </span>
                  <h3 style={{ fontSize: 'clamp(2.4rem, 5vw, 4rem)', margin: '12px 0 16px' }}>{loc.name}</h3>
                  <p style={{ fontSize: '1.1rem', color: isDark ? 'rgba(250,246,239,0.75)' : 'var(--c-ink-3)', maxWidth: 460, marginBottom: 24 }}>
                    {loc.vibe || `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`}
                  </p>
                  {loc.phone && <a href={`tel:${loc.phoneHref || loc.phone}`} style={{ fontFamily: 'var(--c-font-display)', fontSize: '1.8rem', color: 'var(--c-brand)', textDecoration: 'none', display: 'block', marginBottom: 24 }}>{loc.phone}</a>}
                  {hours.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', maxWidth: 360 }}>
                      {hours.map((h, i) => (
                        <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i === 0 ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'var(--c-rule)'}`, fontSize: '0.95rem' }}>
                          <span style={{ opacity: 0.7 }}>{h.label}</span><span>{h.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {loc.googleMapsUrl && <a href={loc.googleMapsUrl} target="_blank" rel="noopener" style={{ border: `1px solid ${isDark ? 'var(--c-cream)' : 'var(--c-ink)'}`, color: isDark ? 'var(--c-cream)' : 'var(--c-ink)', padding: '14px 22px', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 6, textDecoration: 'none' }}>Directions</a>}
                    <a href={reservationUrl} style={{ background: 'var(--c-brand)', color: 'var(--c-cream)', padding: '14px 22px', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 6, textDecoration: 'none' }}>Reserve</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

// LIST TYPOGRAPHIC — magazine-style list, address typography
export function LocationsListTypographic({ site, reservationUrl }: Props) {
  if (site.locations.length === 0) return null
  return (
    <section id="locations" style={{ padding: 'clamp(80px, 10vw, 140px) 0', background: 'var(--c-cream)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(60px, 8vw, 100px)' }}>
          <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontStyle: 'italic' }}>
            {site.locations.length === 1 ? 'Visit us.' : 'Two rooms.'}
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(2, site.locations.length)}, 1fr)`,
          gap: 0,
        }}>
          {site.locations.map((loc, idx) => {
            const hours = Array.isArray(loc.hours) ? loc.hours : []
            return (
              <article key={loc.id ?? idx} style={{
                padding: 'clamp(32px, 5vw, 64px)',
                borderTop: '1px solid var(--c-rule)',
                borderRight: idx < site.locations.length - 1 ? '1px solid var(--c-rule)' : 'none',
              }}>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-brand)', marginBottom: 10 }}>
                  {loc.tagline || `Location ${idx + 1}`}
                </div>
                <h3 style={{ fontFamily: 'var(--c-font-display)', fontStyle: 'italic', fontSize: 'clamp(2rem, 3.5vw, 3rem)', marginBottom: 16 }}>
                  {loc.name}
                </h3>
                <p style={{ color: 'var(--c-ink-3)', marginBottom: 24 }}>{loc.address}<br />{loc.city}, {loc.state} {loc.zip}</p>
                {loc.phone && <a href={`tel:${loc.phoneHref || loc.phone}`} style={{ fontFamily: 'var(--c-font-display)', fontStyle: 'italic', fontSize: '1.6rem', color: 'var(--c-brand)', textDecoration: 'none', display: 'inline-block', marginBottom: 28 }}>{loc.phone}</a>}
                {hours.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
                    {hours.map((h, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? 'none' : '1px dashed var(--c-rule)', fontSize: '0.92rem' }}>
                        <span>{h.label}</span><span>{h.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <a href={loc.googleMapsUrl || reservationUrl} style={{ display: 'inline-block', fontSize: '0.74rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-ink)', borderBottom: '1px solid var(--c-ink)', paddingBottom: 4, textDecoration: 'none' }}>
                  {loc.googleMapsUrl ? 'Directions' : 'Reserve'}
                </a>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const LOCATIONS_VARIANTS = {
  'cards': LocationsCards,
  'full-bleed-each': LocationsFullBleedEach,
  'list-typographic': LocationsListTypographic,
} as const

export type LocationsVariantId = keyof typeof LOCATIONS_VARIANTS

export const LOCATIONS_VARIANT_DESCRIPTIONS: Record<LocationsVariantId, string> = {
  'cards':            'Standard 2-up cards with hours, features chips, and CTAs.',
  'full-bleed-each':  'Each location gets its own full-bleed section with photo + description, alternating dark/cream backgrounds. Best for evocative occasion-night locations.',
  'list-typographic': 'Editorial typographic list with hairline rules. Italic display type. Best for fine-dining + magazine moods.',
}
