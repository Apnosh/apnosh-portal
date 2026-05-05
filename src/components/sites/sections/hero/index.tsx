/**
 * Hero variants — composable section blocks.
 *
 * Each variant has its own visual DNA. The composed renderer picks one
 * via layout.hero. Adding a new variant = add a function here, register
 * in HERO_VARIANTS, update prompts.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import s from './hero-variants.module.css'

export interface HeroProps {
  site: RestaurantSite
  reservationUrl: string
}

// ============================================================
// SPLIT — text left, photo right (Bold default)
// ============================================================
export function HeroSplit({ site, reservationUrl }: HeroProps) {
  const { hero } = site
  return (
    <section className={s.split}>
      <div className={`${s.splitInner}`}>
        <div className={s.splitCopy}>
          {hero.eyebrow && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>{hero.eyebrow}</span>}
          <h1 className={s.splitH1}>{hero.headline || site.identity.displayName}</h1>
          {hero.subhead && <p className={s.splitLede}>{hero.subhead}</p>}
          <div className={s.splitCta}>
            <a href={hero.primaryCta?.url || reservationUrl} style={{ background: 'var(--c-brand)', color: 'var(--c-cream)', padding: '18px 28px', fontSize: '0.94rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: 6 }}>
              {hero.primaryCta?.label || 'Reserve'}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.url} style={{ border: '1px solid rgba(245,239,230,0.4)', color: 'var(--c-cream)', padding: '18px 28px', fontSize: '0.94rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: 6 }}>
                {hero.secondaryCta.label}
              </a>
            )}
          </div>
        </div>
        <div className={s.splitMedia}>
          {hero.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.photoUrl} alt="" />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, color-mix(in oklab, var(--c-brand) 55%, transparent), rgba(11,11,11,0.85))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--c-cream)', textAlign: 'center', padding: 32,
              fontFamily: 'var(--c-font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {site.identity.displayName}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FULL-BLEED OVERLAY — 100vh photo with overlay text
// ============================================================
export function HeroFullbleed({ site, reservationUrl }: HeroProps) {
  const { hero } = site
  return (
    <section className={s.fullbleed}>
      <div className={s.fullbleedBg}>
        {hero.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.photoUrl} alt="" />
        ) : (
          <div className={s.fullbleedFallback} />
        )}
      </div>
      <div className={`${s.fullbleedContent}`} style={{ maxWidth: 1280, margin: '0 auto', padding: '80px clamp(20px, 4vw, 56px)' }}>
        {hero.eyebrow && (
          <span style={{ fontSize: '0.74rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>
            ✦  {hero.eyebrow}  ✦
          </span>
        )}
        <h1 className={s.fullbleedH1}>{hero.headline || site.identity.displayName}</h1>
        {hero.subhead && <p className={s.fullbleedLede}>{hero.subhead}</p>}
        <div className={s.fullbleedCta}>
          <a href={hero.primaryCta?.url || reservationUrl} style={{ background: 'var(--c-brand)', color: 'var(--c-cream)', padding: '18px 36px', fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none' }}>
            {hero.primaryCta?.label || 'Reserve'}
          </a>
          {hero.secondaryCta && (
            <a href={hero.secondaryCta.url} style={{ borderBottom: '1px solid rgba(255,255,255,0.4)', padding: '0 0 4px', fontSize: '0.86rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--c-cream)', textDecoration: 'none', alignSelf: 'center' }}>
              {hero.secondaryCta.label}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// CENTERED MANIFESTO — typographic, no photo
// ============================================================
export function HeroManifesto({ site, reservationUrl }: HeroProps) {
  const { hero } = site
  return (
    <section className={s.manifesto}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        {hero.eyebrow && <span className={s.manifestoEyebrow}>{hero.eyebrow}</span>}
        <h1 className={s.manifestoH1}>{hero.headline || site.identity.displayName}</h1>
        {hero.subhead && <p className={s.manifestoLede}>{hero.subhead}</p>}
        <div className={s.manifestoCta}>
          <a href={hero.primaryCta?.url || reservationUrl} style={{ background: 'var(--c-ink)', color: 'var(--c-cream)', padding: '18px 36px', fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: 6 }}>
            {hero.primaryCta?.label || 'Reserve'}
          </a>
          {hero.secondaryCta && (
            <a href={hero.secondaryCta.url} style={{ borderBottom: '1px solid var(--c-ink)', color: 'var(--c-ink)', padding: '0 0 4px', fontSize: '0.86rem', letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', alignSelf: 'center' }}>
              {hero.secondaryCta.label}
            </a>
          )}
        </div>
        <div className={s.manifestoMark}>✦ ✦ ✦</div>
      </div>
    </section>
  )
}

// ============================================================
// MAGAZINE — oversized italic + full-bleed photo + caption
// ============================================================
export function HeroMagazine({ site, reservationUrl }: HeroProps) {
  const { hero } = site
  return (
    <section className={s.magazine}>
      <div className={s.magazineHeader} style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        {hero.eyebrow && <span className={s.magazineEyebrow}>{hero.eyebrow}</span>}
        <h1 className={s.magazineH1}>{hero.headline || site.identity.displayName}</h1>
        {hero.subhead && <p className={s.magazineLede}>{hero.subhead}</p>}
        <div>
          <a href={hero.primaryCta?.url || reservationUrl} className={s.magazineCtaLink}>
            {hero.primaryCta?.label || 'Reserve'}
          </a>
          {hero.secondaryCta && (
            <a href={hero.secondaryCta.url} className={s.magazineCtaSecondary}>{hero.secondaryCta.label}</a>
          )}
        </div>
      </div>

      <div className={s.magazinePhoto}>
        {hero.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.photoUrl} alt="" />
        ) : (
          <div className={s.magazineFallback}>{site.identity.tagline || 'Now serving'}</div>
        )}
      </div>

      {site.locations.length > 0 && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
          <div className={s.magazineCaption}>
            <span>{site.locations.map(l => l.city).filter(Boolean).join(' · ')}</span>
            <span>{site.identity.tagline || ''}</span>
          </div>
        </div>
      )}
    </section>
  )
}

// ============================================================
// SENSORY — type stack + multi-photo grid
// ============================================================
export function HeroSensory({ site, reservationUrl }: HeroProps) {
  const { hero } = site
  // Pull up to 3 gallery photos to fill the grid; fall back to photo + placeholders
  const gallery = (site.gallery?.photos ?? []).map(p => p.url).filter(Boolean)
  const photos = [
    hero.photoUrl,
    gallery[0] ?? null,
    gallery[1] ?? null,
  ]

  // Sensory words pulled from voice notes / tone tags if present
  const words = (site.brand.voiceNotes || '')
    .split(/[,\.\n]/)
    .map(w => w.trim())
    .filter(w => w.length > 0 && w.length < 24)
    .slice(0, 5)

  return (
    <section className={s.sensory}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div className={s.sensoryGrid}>
          <div className={s.sensoryCopy}>
            {hero.eyebrow && <span className={s.sensoryEyebrow}>{hero.eyebrow}</span>}
            <h1 className={s.sensoryH1}>{hero.headline || site.identity.displayName}</h1>
            {hero.subhead && <p className={s.sensoryLede}>{hero.subhead}</p>}
            {words.length > 0 && (
              <div className={s.sensoryWords}>
                {words.map((w, i) => <span key={i} className={s.sensoryWord}>{w}</span>)}
              </div>
            )}
            <a href={hero.primaryCta?.url || reservationUrl} style={{ display: 'inline-block', background: 'var(--c-brand)', color: 'var(--c-cream)', padding: '14px 24px', fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: 6 }}>
              {hero.primaryCta?.label || 'Reserve'}
            </a>
          </div>
          <div className={s.sensoryGalleryPhotos}>
            {photos.map((src, i) => (
              <div key={i} className={s.sensoryPhoto}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" />
                ) : (
                  <div className={s.sensoryFallback} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Registry
// ============================================================
export const HERO_VARIANTS = {
  'split': HeroSplit,
  'fullbleed': HeroFullbleed,
  'manifesto': HeroManifesto,
  'magazine': HeroMagazine,
  'sensory': HeroSensory,
} as const

export type HeroVariantId = keyof typeof HERO_VARIANTS

export const HERO_VARIANT_DESCRIPTIONS: Record<HeroVariantId, string> = {
  'split':       'Text left + photo right. High-energy, bold display type. KBBQ / steakhouse / loud-group default.',
  'fullbleed':   '100vh edge-to-edge photo with overlay text. Dark luxe / occasion-night / cinematic.',
  'manifesto':   'Centered typographic, no photo. Cream surface, oversized type, no decoration. Minimal modern / boutique.',
  'magazine':    'Oversized italic serif headline, full-bleed photo below with caption strip. Editorial / fine dining / hotel.',
  'sensory':     'Headline + voice-note word chips + multi-photo grid (3 photos). Tactile, food-forward, social-first.',
}
