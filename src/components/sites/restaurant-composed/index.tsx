/**
 * Restaurant Composed — the premium template.
 *
 * No fixed layout. Reads `site.layout` to compose a unique site from
 * section variants. Effectively thousands of unique combinations from
 * the curated section-variant kit.
 *
 * Falls back to sensible defaults when layout is missing — so the
 * template still renders if Claude or the operator hasn't filled in
 * a composition.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { HERO_VARIANTS, type HeroVariantId } from '../sections/hero'
import { ABOUT_VARIANTS, type AboutVariantId } from '../sections/about'
import { LOCATIONS_VARIANTS, type LocationsVariantId } from '../sections/locations'
import { AYCE_VARIANTS, type AyceVariantId } from '../sections/ayce'
import s from '../sections/shared.module.css'

export default function RestaurantComposed({ site }: { site: RestaurantSite }) {
  const brand = site.brand
  const reservationUrl = site.reservation?.url || site.hero?.primaryCta?.url || '#'

  const cssVars: React.CSSProperties = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['--c-brand-color' as any]: brand.secondaryColor || brand.primaryColor,
    ['--c-secondary-color' as any]: brand.primaryColor,
    ['--c-accent-color' as any]: brand.accentColor || '#FAF6EF',
    ['--c-font-display' as any]: brand.fontDisplay,
    ['--c-font-body' as any]: brand.fontBody,
  }

  // Resolve variants with fallbacks
  const heroId = (site.layout?.hero as HeroVariantId) ?? 'split'
  const aboutId = (site.layout?.about as AboutVariantId) ?? 'two-col-dropcap'
  const locationsId = (site.layout?.locations as LocationsVariantId) ?? 'cards'
  const ayceId = (site.layout?.ayce as AyceVariantId) ?? 'side-by-side'

  const HeroComp = HERO_VARIANTS[heroId] ?? HERO_VARIANTS['split']
  const AboutComp = ABOUT_VARIANTS[aboutId] ?? ABOUT_VARIANTS['two-col-dropcap']
  const LocationsComp = LOCATIONS_VARIANTS[locationsId] ?? LOCATIONS_VARIANTS['cards']
  const AyceComp = AYCE_VARIANTS[ayceId] ?? AYCE_VARIANTS['side-by-side']

  const customCss = site.customCss

  return (
    <div className={s.root} style={cssVars}>
      {/* Per-section CSS overrides for the bespoke tier */}
      {customCss && Object.keys(customCss).length > 0 && (
        <style dangerouslySetInnerHTML={{ __html: Object.values(customCss).join('\n') }} />
      )}

      {/* Nav */}
      <Nav site={site} reservationUrl={reservationUrl} />

      {/* Composed sections */}
      <HeroComp site={site} reservationUrl={reservationUrl} />
      <AyceComp site={site} />
      <LocationsComp site={site} reservationUrl={reservationUrl} />
      <AboutComp site={site} />

      {(site.contact?.faqs?.length ?? 0) > 0 && <Faq site={site} />}

      <Footer site={site} />
    </div>
  )
}

function Nav({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  const name = site.identity.displayName || 'Restaurant'
  const parts = name.split(' ')
  return (
    <header className={s.nav}>
      <div className={`${s.container} ${s.navInner}`}>
        <a href="#" className={s.navBrand}>
          {parts[0]} {parts.slice(1).length > 0 && <span>{parts.slice(1).join(' ')}</span>}
        </a>
        <nav className={s.navLinks}>
          <a href="#menu">Menu</a>
          <a href="#locations">Locations</a>
          <a href="#about">About</a>
          {(site.contact?.faqs?.length ?? 0) > 0 && <a href="#contact">Contact</a>}
          <a href={reservationUrl} className={s.navCta}>{site.reservation?.ctaLabel || 'Reserve'}</a>
        </nav>
      </div>
    </header>
  )
}

function Faq({ site }: { site: RestaurantSite }) {
  const faqs = Array.isArray(site.contact?.faqs) ? site.contact.faqs : []
  return (
    <section id="contact" style={{ padding: 'clamp(80px, 10vw, 140px) 0', background: 'var(--c-cream-2)' }}>
      <div className={s.containerNarrow}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span className={s.eyebrow}>Common Questions</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.2rem)' }}>Contact.</h2>
          {site.contact?.intro && <p style={{ color: 'var(--c-ink-3)', marginTop: 18 }}>{site.contact.intro}</p>}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ background: 'var(--c-paper)', borderRadius: 12, padding: '22px 24px', border: '1px solid var(--c-rule)' }}>
              <p style={{ fontFamily: 'var(--c-font-display)', fontSize: '1.2rem', marginBottom: 6 }}>{f.q}</p>
              <p style={{ color: 'var(--c-ink-3)', margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer({ site }: { site: RestaurantSite }) {
  const name = site.identity.displayName || 'Restaurant'
  const parts = name.split(' ')
  const locations = Array.isArray(site.locations) ? site.locations : []
  const social = site.social ?? { instagram: null, tiktok: null, facebook: null, twitter: null, youtube: null, linkedin: null }
  const faqs = Array.isArray(site.contact?.faqs) ? site.contact.faqs : []
  return (
    <footer className={s.footer}>
      <div className={`${s.container} ${s.footerInner}`}>
        <div>
          <div className={s.footerBrand}>{parts[0]} {parts.slice(1).length > 0 && <span>{parts.slice(1).join(' ')}</span>}</div>
          {site.footer?.tagline && <p className={s.footerTagline}>{site.footer.tagline}</p>}
          <div className={s.footerSocials}>
            {social.instagram && <a href={social.instagram} target="_blank" rel="noopener" aria-label="Instagram">IG</a>}
            {social.tiktok && <a href={social.tiktok} target="_blank" rel="noopener" aria-label="TikTok">TT</a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noopener" aria-label="Facebook">FB</a>}
          </div>
        </div>
        <div className={s.footerCol}>
          <h5>Visit</h5>
          <ul>{locations.map((l, i) => <li key={l.id ?? i}><a href={`#${l.id ?? ''}`}>{l.name}</a></li>)}</ul>
        </div>
        <div className={s.footerCol}>
          <h5>Explore</h5>
          <ul>
            <li><a href="#menu">Menu</a></li>
            <li><a href="#about">About</a></li>
            {faqs.length > 0 && <li><a href="#contact">Contact</a></li>}
          </ul>
        </div>
        <div className={s.footerCol}>
          <h5>Reach Us</h5>
          <ul>{locations.map((l, i) => l.phone && <li key={l.id ?? i}><a href={`tel:${l.phoneHref || l.phone}`}>{l.phone}</a></li>)}</ul>
        </div>
      </div>
      <div className={`${s.container} ${s.footerBottom}`}>
        <span>{site.footer?.copyright || `© ${new Date().getFullYear()} ${name}`}</span>
        <span>Site by Apnosh</span>
      </div>
    </footer>
  )
}
