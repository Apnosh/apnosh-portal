/**
 * Restaurant Editorial — magazine-style template.
 *
 * Layout DNA: oversized italic serif headlines, full-bleed photography
 * with caption strips, asymmetric two-column long-form prose, drop caps,
 * hairline rules, ample whitespace. Reads like a New Yorker dining piece.
 *
 * Same RestaurantSite data, totally different visual structure than
 * restaurant-bold. Use for fine dining, occasion restaurants, hotels.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import s from './styles.module.css'

export default function RestaurantEditorial({ site }: { site: RestaurantSite }) {
  const brand = site.brand
  const reservationUrl = site.reservation?.url || site.hero?.primaryCta?.url || '#'

  const cssVars: React.CSSProperties = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['--re-brand-color' as any]: brand.secondaryColor || brand.primaryColor,
    ['--re-secondary-color' as any]: brand.primaryColor,
    ['--re-accent-color' as any]: brand.accentColor || '#FAF6EF',
    ['--re-font-display' as any]: brand.fontDisplay,
    ['--re-font-body' as any]: brand.fontBody,
  }

  return (
    <div className={s.root} style={cssVars}>
      <Nav site={site} reservationUrl={reservationUrl} />
      <Hero site={site} reservationUrl={reservationUrl} />
      <About site={site} />
      <Offerings site={site} />
      <Locations site={site} reservationUrl={reservationUrl} />
      {site.testimonials?.enabled && (site.testimonials.items?.length ?? 0) > 0 && (
        <Testimonials testimonials={site.testimonials} />
      )}
      {(site.contact?.faqs?.length ?? 0) > 0 && <Faq site={site} />}
      <CtaBand site={site} reservationUrl={reservationUrl} />
      <Footer site={site} />
    </div>
  )
}

function Nav({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  return (
    <header className={s.nav}>
      <div className={`${s.container} ${s.navInner}`}>
        <a href="#" className={s.navBrand}>{site.identity.displayName || 'Restaurant'}</a>
        <nav className={s.navLinks}>
          <a href="#about">The Story</a>
          <a href="#menu">Menu</a>
          <a href="#locations">Visit</a>
          <a href={reservationUrl} className={s.navCta}>{site.reservation?.ctaLabel || 'Reserve'}</a>
        </nav>
      </div>
    </header>
  )
}

function Hero({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  const { hero } = site
  return (
    <section className={s.hero}>
      <div className={s.containerNarrow}>
        {hero.eyebrow && <span className={s.heroEyebrow}>{hero.eyebrow}</span>}
        <h1 className={s.heroHeadline}>{hero.headline || site.identity.displayName}</h1>
        {hero.subhead && <p className={s.heroLede}>{hero.subhead}</p>}
        <div>
          <a href={hero.primaryCta?.url || reservationUrl} className={s.heroCta}>
            {hero.primaryCta?.label || 'Reserve'}
          </a>
          {hero.secondaryCta && (
            <a href={hero.secondaryCta.url} className={s.heroSecondaryCta}>{hero.secondaryCta.label}</a>
          )}
        </div>
      </div>

      <div className={s.heroPhoto}>
        {hero.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.photoUrl} alt="" />
        ) : (
          <div className={s.heroPhotoPlaceholder}>
            {site.identity.tagline || 'Add a hero photograph'}
          </div>
        )}
      </div>

      {site.locations.length > 0 && (
        <div className={s.container}>
          <div className={s.heroCaption}>
            <span>{site.locations.map(l => l.city).filter(Boolean).join(' · ')}</span>
            <span>{site.identity.tagline || 'Now serving'}</span>
          </div>
        </div>
      )}
    </section>
  )
}

function About({ site }: { site: RestaurantSite }) {
  const { about } = site
  if (!about?.headline && !about?.body) return null
  const paras = (about.body || '').split('\n\n').filter(p => p.trim().length > 0)
  const values = Array.isArray(about?.values) ? about.values : []

  return (
    <section id="about" className={s.about}>
      <div className={s.container}>
        <div className={s.aboutLayout}>
          <h2>{about.headline}</h2>
          <div className={s.aboutBody}>
            {paras.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>

        {values.length > 0 && (
          <div className={s.values}>
            {values.map((v, i) => (
              <div key={i} className={s.value}>
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

function Offerings({ site }: { site: RestaurantSite }) {
  const ayceRaw = site.offerings?.ayce as unknown
  let premium: NonNullable<RestaurantSite['offerings']['ayce']['premium']> | undefined
  let supreme: NonNullable<RestaurantSite['offerings']['ayce']['supreme']> | undefined
  if (ayceRaw && typeof ayceRaw === 'object' && !Array.isArray(ayceRaw)) {
    const obj = ayceRaw as { premium?: typeof premium; supreme?: typeof supreme }
    premium = obj.premium
    supreme = obj.supreme
  }
  if (!premium?.enabled && !supreme?.enabled) return null

  return (
    <section id="menu" className={s.offerings}>
      <div className={s.container}>
        <div className={s.offeringsHeader}>
          <h2>Two ways to dine.</h2>
        </div>

        <div className={s.ayceTable}>
          {premium?.enabled && <AyceCol program={premium} label="All-You-Can-Eat — Premium" />}
          {premium?.enabled && supreme?.enabled && <div className={s.ayceColDivider} />}
          {supreme?.enabled && <AyceCol program={supreme} label="All-You-Can-Eat — Supreme" />}
        </div>
      </div>
    </section>
  )
}

function AyceCol({ program, label }: { program: NonNullable<RestaurantSite['offerings']['ayce']['premium']>; label: string }) {
  return (
    <div className={s.ayceCol}>
      <div className={s.ayceLabel}>{label}</div>
      <h3 className={s.ayceTitle}>{program.name}</h3>
      {program.subtitle && <p className={s.ayceSubtitle}>{program.subtitle}</p>}
      <div className={s.ayceFigures}>
        <div className={s.ayceFigure}><strong>{program.meatCount}</strong><span>Cuts of Meat</span></div>
        <div className={s.ayceFigure}><strong>{program.sideCount}</strong><span>Sides + Stews</span></div>
      </div>
      <ul className={s.ayceList}>
        {program.highlights?.map((h, i) => <li key={i}>{h}</li>)}
      </ul>
    </div>
  )
}

function Locations({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  if (site.locations.length === 0) return null
  return (
    <section id="locations" className={s.locations}>
      <div className={s.container}>
        <div className={s.locationsHeader}>
          <h2>{site.locations.length === 1 ? 'Visit us.' : 'Two rooms.'}</h2>
        </div>
        <div className={s.locationGrid}>
          {site.locations.map((loc, idx) => {
            const hours = Array.isArray(loc.hours) ? loc.hours : []
            return (
              <article key={loc.id ?? idx} className={s.locationCard}>
                <div className={s.locationLabel}>{loc.tagline || `Location ${idx + 1}`}</div>
                <h3 className={s.locationName}>{loc.name}</h3>
                <p className={s.locationAddress}>{loc.address}<br />{loc.city}, {loc.state} {loc.zip}</p>
                {loc.phone && <a href={`tel:${loc.phoneHref || loc.phone}`} className={s.locationPhone}>{loc.phone}</a>}
                {hours.length > 0 && (
                  <ul className={s.locationHours}>
                    {hours.map((h, i) => <li key={i}><span>{h.label}</span><span>{h.value}</span></li>)}
                  </ul>
                )}
                <a href={loc.googleMapsUrl || reservationUrl} className={s.locationCta}>
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

function Testimonials({ testimonials }: { testimonials: NonNullable<RestaurantSite['testimonials']> }) {
  const items = Array.isArray(testimonials.items) ? testimonials.items : []
  return (
    <section className={s.testimonials}>
      <div className={s.container}>
        <div className={s.testimonialsHeader}>
          <h2>{testimonials.heading || 'On the record'}</h2>
        </div>
        <div className={s.testimonialsList}>
          {items.map((t, i) => (
            <article key={i} className={s.testimonial}>
              <p className={s.testimonialQuote}>{t.quote}</p>
              <div className={s.testimonialAttribution}>
                <strong>{t.author}</strong>{t.role ? ` · ${t.role}` : ''}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Faq({ site }: { site: RestaurantSite }) {
  const faqs = Array.isArray(site.contact?.faqs) ? site.contact.faqs : []
  return (
    <section id="contact" className={s.faqSection}>
      <div className={s.container}>
        <div className={s.faqHeader}>
          <h2>Common questions.</h2>
          {site.contact?.intro && <p style={{ color: 'var(--re-ink-3)', marginTop: 18 }}>{site.contact.intro}</p>}
        </div>
        <div className={s.faqList}>
          {faqs.map((f, i) => (
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
  if (!site.reservation?.enabled) return null
  return (
    <section className={s.ctaBand}>
      <div className={s.containerNarrow}>
        <span className={s.ctaEyebrow}>—  Tonight</span>
        <h2>The room is set.</h2>
        <p>The grill is hot. The first cuts are on. Reservations recommended.</p>
        <a href={reservationUrl} className={s.ctaBandLink}>{site.reservation.ctaLabel || 'Reserve a Table'}</a>
      </div>
    </section>
  )
}

function Footer({ site }: { site: RestaurantSite }) {
  const locations = Array.isArray(site.locations) ? site.locations : []
  const social = site.social ?? { instagram: null, tiktok: null, facebook: null, twitter: null, youtube: null, linkedin: null }
  return (
    <footer className={s.footer}>
      <div className={`${s.container} ${s.footerInner}`}>
        <div>
          <div className={s.footerBrand}>{site.identity.displayName}</div>
          {site.footer?.tagline && <p className={s.footerTagline}>{site.footer.tagline}</p>}
          <div className={s.footerSocials}>
            {social.instagram && <a href={social.instagram} target="_blank" rel="noopener">Instagram</a>}
            {social.tiktok && <a href={social.tiktok} target="_blank" rel="noopener">TikTok</a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noopener">Facebook</a>}
          </div>
        </div>
        <div className={s.footerCol}>
          <h5>Visit</h5>
          <ul>
            {locations.map((l, i) => <li key={l.id ?? i}><a href={`#${l.id ?? ''}`}>{l.name}</a></li>)}
          </ul>
        </div>
        <div className={s.footerCol}>
          <h5>Explore</h5>
          <ul>
            <li><a href="#about">The Story</a></li>
            <li><a href="#menu">Menu</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
        <div className={s.footerCol}>
          <h5>Reach</h5>
          <ul>
            {locations.map((l, i) => l.phone && <li key={l.id ?? i}><a href={`tel:${l.phoneHref || l.phone}`}>{l.phone}</a></li>)}
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
