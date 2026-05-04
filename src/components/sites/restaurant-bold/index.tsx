/**
 * Restaurant Bold — canonical React template for the restaurant vertical.
 *
 * Renders a full single-page restaurant site from a RestaurantSite config.
 * The same data shape powers Eleventy templates for production hosting; this
 * is the in-portal preview + future server-rendered hosting target.
 *
 * No server-only APIs used — safe to render on the server or in client.
 * Brand colors + fonts are passed via inline CSS variables on the root.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import s from './styles.module.css'

export interface RestaurantBoldProps {
  site: RestaurantSite
}

export default function RestaurantBold({ site }: RestaurantBoldProps) {
  const brand = site.brand
  const reservationUrl = site.reservation.url || site.hero.primaryCta.url || '#'

  const cssVars: React.CSSProperties = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['--rb-brand-color' as any]: brand.secondaryColor || brand.primaryColor,
    ['--rb-secondary-color' as any]: brand.primaryColor,
    ['--rb-font-display' as any]: brand.fontDisplay,
    ['--rb-font-body' as any]: brand.fontBody,
  }

  return (
    <div className={s.root} style={cssVars}>
      <NavBar site={site} />
      <Hero site={site} />
      <AyceSection site={site} />
      <LocationsSection site={site} reservationUrl={reservationUrl} />
      {site.statBand?.enabled && site.statBand.stats.length > 0 && <StatBandSection statBand={site.statBand} />}
      <AboutSection site={site} />
      {site.testimonials?.enabled && site.testimonials.items.length > 0 && (
        <TestimonialsSection testimonials={site.testimonials} />
      )}
      {site.gallery?.enabled && site.gallery.photos.length > 0 && (
        <GallerySection gallery={site.gallery} />
      )}
      {site.contact.faqs.length > 0 && <FaqSection site={site} />}
      <CtaBand site={site} reservationUrl={reservationUrl} />
      <Footer site={site} />
    </div>
  )
}

// ============================================================================
// Components
// ============================================================================

function NavBar({ site }: { site: RestaurantSite }) {
  const name = site.identity.displayName || 'Restaurant'
  // Split first word for the colored accent
  const parts = name.split(' ')
  const first = parts[0] ?? name
  const rest = parts.slice(1).join(' ')
  const reservationUrl = site.reservation.url || site.hero.primaryCta.url || '#'

  return (
    <header className={s.nav}>
      <div className={`${s.container} ${s.navInner}`}>
        <a href="#" className={s.navBrand}>
          {first} {rest && <span>{rest}</span>}
        </a>
        <nav className={s.navLinks}>
          <a href="#menu">Menu</a>
          <a href="#locations">Locations</a>
          <a href="#about">About</a>
          {site.contact.faqs.length > 0 && <a href="#contact">Contact</a>}
          <a href={reservationUrl} className={s.navCta}>{site.reservation.ctaLabel || 'Reserve'}</a>
        </nav>
      </div>
    </header>
  )
}

function Hero({ site }: { site: RestaurantSite }) {
  const { hero } = site
  return (
    <section className={s.hero}>
      <div className={`${s.container} ${s.heroInner}`}>
        <div className={s.heroCopy}>
          {hero.eyebrow && <span className={s.eyebrow}>{hero.eyebrow}</span>}
          <h1>{hero.headline || site.identity.displayName || 'Your headline goes here'}</h1>
          {hero.subhead && <p className={s.heroLede}>{hero.subhead}</p>}
          <div className={s.heroCta}>
            <a href={hero.primaryCta.url || '#'} className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
              {hero.primaryCta.label || 'Reserve'}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.url || '#'} className={`${s.btn} ${s.btnGhost} ${s.btnLg}`} style={{ color: 'var(--rb-cream)', borderColor: 'rgba(245,239,230,0.4)' }}>
                {hero.secondaryCta.label}
              </a>
            )}
          </div>
        </div>
        <div className={s.heroMedia}>
          {hero.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.photoUrl} alt="" />
          ) : (
            <div className={s.meshPlaceholder}>
              <div className={s.meshPlaceholderLabel}>
                {site.identity.displayName || 'Your Brand'}
                <small>Add a hero photo to make this yours</small>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AyceSection({ site }: { site: RestaurantSite }) {
  const premium = site.offerings.ayce?.premium
  const supreme = site.offerings.ayce?.supreme
  const anyEnabled = (premium?.enabled || supreme?.enabled)
  if (!anyEnabled) return null

  return (
    <section id="menu" className={`${s.section} ${s.sectionCream}`}>
      <div className={s.container}>
        <div style={{ maxWidth: 720, margin: '0 0 48px' }}>
          <span className={s.eyebrow}>All-You-Can-Eat</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.6rem)' }}>
            Two Programs. <span style={{ color: 'var(--rb-brand)' }}>One Long Table.</span>
          </h2>
        </div>

        <div className={s.ayce}>
          {premium?.enabled && <AyceCard program={premium} variant="premium" />}
          {supreme?.enabled && <AyceCard program={supreme} variant="supreme" />}
        </div>
      </div>
    </section>
  )
}

function AyceCard({ program, variant }: { program: NonNullable<RestaurantSite['offerings']['ayce']['premium']>; variant: 'premium' | 'supreme' }) {
  return (
    <div className={`${s.ayceCard} ${variant === 'supreme' ? s.ayceCardSupreme : ''}`}>
      {variant === 'supreme' && <span className={s.ayceBadge}>Supreme</span>}
      <h3 className={s.ayceTitle} style={variant === 'supreme' ? { color: 'var(--rb-cream)' } : undefined}>{program.name}</h3>
      {program.subtitle && <p className={s.ayceSubtitle}>{program.subtitle}</p>}
      <div className={s.ayceCounts}>
        <div className={s.ayceCount}><strong style={variant === 'supreme' ? { color: 'var(--rb-gold)' } : undefined}>{program.meatCount}</strong><span>Meats</span></div>
        <div className={s.ayceCount}><strong style={variant === 'supreme' ? { color: 'var(--rb-gold)' } : undefined}>{program.sideCount}</strong><span>Sides + Stews</span></div>
      </div>
      <ul className={s.ayceList}>
        {program.highlights.map((h, i) => <li key={i}>{h}</li>)}
      </ul>
    </div>
  )
}

function LocationsSection({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  if (site.locations.length === 0) {
    return (
      <section id="locations" className={`${s.section} ${s.sectionPaper}`}>
        <div className={s.container}>
          <div className={s.empty}>Add a location in the Site Builder to populate this section.</div>
        </div>
      </section>
    )
  }
  return (
    <section id="locations" className={`${s.section} ${s.sectionPaper}`}>
      <div className={s.container}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
          <span className={s.eyebrow}>Visit</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.6rem)' }}>
            {site.locations.length === 1 ? 'Find Us.' : `${countLabel(site.locations.length)} Locations. ${site.locations.length === 2 ? 'Two Stories.' : ''}`}
          </h2>
        </div>

        <div className={s.locationsGrid} style={site.locations.length === 1 ? { gridTemplateColumns: 'minmax(0, 700px)', justifyContent: 'center' } : undefined}>
          {site.locations.map(loc => (
            <article key={loc.id} className={s.locationCard}>
              <div className={s.locationMedia}>
                {loc.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={s.locationMediaImg} src={loc.photoUrl} alt="" />
                ) : (
                  <>
                    <div className={s.mapPlaceholder}>
                      <span className={s.mapPin} aria-hidden="true" />
                    </div>
                    <div className={s.locationLabel}>
                      {loc.name}
                      {loc.tagline && <small>{loc.tagline}</small>}
                    </div>
                  </>
                )}
              </div>
              <div className={s.locationBody}>
                <p className={s.locationAddress}>{loc.address} · {loc.city}, {loc.state} {loc.zip}</p>
                {loc.phone && <a href={`tel:${loc.phoneHref || loc.phone}`} className={s.locationPhone}>{loc.phone}</a>}
                {loc.hours.length > 0 && (
                  <ul className={s.locationHours}>
                    {loc.hours.map((h, i) => <li key={i}><span>{h.label}</span><span>{h.value}</span></li>)}
                  </ul>
                )}
                {loc.features.length > 0 && (
                  <ul className={s.locationFeatures}>
                    {loc.features.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                <div className={s.locationCta}>
                  {loc.googleMapsUrl && <a href={loc.googleMapsUrl} target="_blank" rel="noopener" className={`${s.btn} ${s.btnGhost}`}>Directions</a>}
                  <a href={reservationUrl} className={`${s.btn} ${s.btnPrimary}`}>Reserve</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatBandSection({ statBand }: { statBand: NonNullable<RestaurantSite['statBand']> }) {
  return (
    <section className={s.statBand}>
      <div className={`${s.container} ${s.statInner}`}>
        {statBand.stats.map((stat, i) => (
          <div key={i}>
            <div className={s.statValue}>{stat.value}</div>
            <div className={s.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AboutSection({ site }: { site: RestaurantSite }) {
  const { about } = site
  if (!about.headline && !about.body && about.values.length === 0) return null
  const paragraphs = (about.body || '').split('\n\n').filter(p => p.trim().length > 0)

  return (
    <section id="about" className={`${s.section} ${s.sectionPaper}`}>
      <div className={s.container}>
        <div className={s.aboutGrid}>
          <div>
            <span className={s.eyebrow}>Our Story</span>
            <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.6rem)' }}>{about.headline || 'About'}</h2>
            <div style={{ marginTop: 22 }}>
              {paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: '1.05rem', lineHeight: 1.65, marginBottom: '1em' }}>{p}</p>
              ))}
            </div>
          </div>
          <div className={s.aboutMedia}>
            {about.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={s.aboutMediaImg} src={about.photoUrl} alt="" />
            ) : (
              <div className={s.meshPlaceholder}>
                <div className={s.meshPlaceholderLabel}>
                  {site.identity.displayName?.split(' ')[0] || ''}
                  <small>Add an about photo</small>
                </div>
              </div>
            )}
          </div>
        </div>

        {about.values.length > 0 && (
          <div className={s.aboutValues}>
            {about.values.map((v, i) => (
              <div key={i} className={s.aboutValue}>
                <h4>{v.title}</h4>
                <p>{v.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function FaqSection({ site }: { site: RestaurantSite }) {
  return (
    <section id="contact" className={`${s.section} ${s.sectionCream}`}>
      <div className={`${s.container} ${s.containerTight}`}>
        <span className={s.eyebrow}>Common Questions</span>
        <h2 style={{ marginTop: 14, marginBottom: 28, fontSize: 'clamp(2rem, 4.6vw, 3.2rem)' }}>Contact.</h2>
        {site.contact.intro && <p style={{ color: 'var(--rb-ink-3)', fontSize: '1.05rem', marginBottom: 32 }}>{site.contact.intro}</p>}
        <div className={s.faq}>
          {site.contact.faqs.map((f, i) => (
            <div key={i} className={s.faqItem}>
              <p className={s.faqQ}>{f.q}</p>
              <p className={s.faqA}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaBand({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  if (!site.reservation.enabled) return null
  return (
    <section className={s.ctaBand}>
      <div className={s.container}>
        <span className={`${s.eyebrow} ${s.eyebrowOnDark}`}>Tonight</span>
        <h2 style={{ marginTop: 14 }}>Bring everyone.</h2>
        <p>Walk-ins welcome. Reservations recommended for groups. Either way, the grill is hot.</p>
        <a href={reservationUrl} className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>{site.reservation.ctaLabel || 'Reserve a Table'}</a>
      </div>
    </section>
  )
}

function Footer({ site }: { site: RestaurantSite }) {
  const name = site.identity.displayName || 'Restaurant'
  const parts = name.split(' ')
  const first = parts[0] ?? name
  const rest = parts.slice(1).join(' ')

  return (
    <footer className={s.footer}>
      <div className={`${s.container} ${s.footerInner}`}>
        <div>
          <div className={s.footerBrand}>{first} {rest && <span>{rest}</span>}</div>
          {site.footer?.tagline && <p className={s.footerTagline}>{site.footer.tagline}</p>}
          <div className={s.footerSocials}>
            {site.social.instagram && <a href={site.social.instagram} aria-label="Instagram" target="_blank" rel="noopener">IG</a>}
            {site.social.tiktok && <a href={site.social.tiktok} aria-label="TikTok" target="_blank" rel="noopener">TT</a>}
            {site.social.facebook && <a href={site.social.facebook} aria-label="Facebook" target="_blank" rel="noopener">FB</a>}
            {site.social.youtube && <a href={site.social.youtube} aria-label="YouTube" target="_blank" rel="noopener">YT</a>}
          </div>
        </div>

        <div>
          <h5>Visit</h5>
          <ul className={s.footerList}>
            {site.locations.map(loc => <li key={loc.id}><a href={`#${loc.id}`}>{loc.name}</a></li>)}
          </ul>
        </div>

        <div>
          <h5>Explore</h5>
          <ul className={s.footerList}>
            <li><a href="#menu">Menu</a></li>
            <li><a href="#about">About</a></li>
            {site.contact.faqs.length > 0 && <li><a href="#contact">Contact</a></li>}
            {site.reservation.enabled && site.reservation.url && (
              <li><a href={site.reservation.url}>Reserve</a></li>
            )}
          </ul>
        </div>

        <div>
          <h5>Reach us</h5>
          <ul className={s.footerList}>
            {site.locations.map(loc => loc.phone && (
              <li key={loc.id}>{loc.name} · <a href={`tel:${loc.phoneHref || loc.phone}`}>{loc.phone}</a></li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${s.container} ${s.footerBottom}`}>
        <span>{site.footer?.copyright || `© ${new Date().getFullYear()} ${site.identity.displayName}`}</span>
        <span>Site by Apnosh</span>
      </div>
    </footer>
  )
}

function countLabel(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n)
}

// ============================================================================
// Testimonials
// ============================================================================

function TestimonialsSection({ testimonials }: { testimonials: NonNullable<RestaurantSite['testimonials']> }) {
  return (
    <section className={s.testimonials}>
      <div className={s.container}>
        <div className={s.testimonialsHeader}>
          <span className={s.eyebrow}>Loved By</span>
          <h2>{testimonials.heading || 'What guests are saying'}</h2>
        </div>
        <div className={s.testimonialsGrid}>
          {testimonials.items.map((t, i) => (
            <article key={i} className={`${s.testimonialCard} ${s.fadeUp}`}>
              {t.rating && t.rating > 0 && (
                <div className={s.testimonialStars}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <span key={j} className={j < t.rating! ? s.testimonialStar : s.testimonialStarMuted}>★</span>
                  ))}
                </div>
              )}
              <div className={s.testimonialQuote} />
              <p className={s.testimonialBody}>{t.quote}</p>
              <div className={s.testimonialAuthor}>
                <div className={s.testimonialAvatar}>
                  {t.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photoUrl} alt="" />
                  ) : (
                    initials(t.author)
                  )}
                </div>
                <div className={s.testimonialAuthorMeta}>
                  <strong>{t.author}</strong>
                  {t.role && <span>{t.role}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

// ============================================================================
// Gallery
// ============================================================================

function GallerySection({ gallery }: { gallery: NonNullable<RestaurantSite['gallery']> }) {
  return (
    <section className={s.gallery}>
      <div className={s.container}>
        <div className={s.galleryHeader}>
          <span className={s.eyebrow}>Photos</span>
          <h2>{gallery.heading || 'Inside the room'}</h2>
          {gallery.description && <p>{gallery.description}</p>}
        </div>
        <div className={s.galleryGrid}>
          {gallery.photos.map((p, i) => (
            <div key={i} className={s.galleryItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt || ''} />
              {p.caption && <div className={s.galleryCaption}>{p.caption}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
