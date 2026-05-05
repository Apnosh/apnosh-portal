/**
 * Restaurant Cinematic — full-screen, dark luxe template.
 *
 * Layout DNA: 100vh hero with edge-to-edge photography + overlay text,
 * dark surfaces with gold accents, full-bleed image breakers between
 * sections, centered narrative composition. For occasion-night
 * brands — cocktail bars, omakase, steakhouses, hotel restaurants.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import s from './styles.module.css'

export default function RestaurantCinematic({ site }: { site: RestaurantSite }) {
  const brand = site.brand
  const reservationUrl = site.reservation?.url || site.hero?.primaryCta?.url || '#'

  const cssVars: React.CSSProperties = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ['--rc-brand-color' as any]: brand.secondaryColor || brand.primaryColor || '#C9A96E',
    ['--rc-secondary-color' as any]: brand.primaryColor || '#0A0A12',
    ['--rc-accent-color' as any]: brand.accentColor || '#FAF6EF',
    ['--rc-font-display' as any]: brand.fontDisplay,
    ['--rc-font-body' as any]: brand.fontBody,
  }

  return (
    <div className={s.root} style={cssVars}>
      <Nav site={site} reservationUrl={reservationUrl} />
      <Hero site={site} reservationUrl={reservationUrl} />
      {site.identity?.tagline && <Intro tagline={site.identity.tagline} subhead={site.hero?.subhead} />}
      <Offerings site={site} />
      <ImageBreak photoUrl={site.about?.photoUrl} caption={site.about?.headline} />
      <About site={site} />
      <Locations site={site} reservationUrl={reservationUrl} />
      {site.testimonials?.enabled && (site.testimonials.items?.length ?? 0) > 0 && (
        <Testimonials testimonials={site.testimonials} />
      )}
      {(site.contact?.faqs?.length ?? 0) > 0 && <Faq site={site} />}
      <Footer site={site} />
    </div>
  )
}

function Nav({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  return (
    <header className={s.nav}>
      <div className={`${s.container} ${s.navInner}`}>
        <a href="#" className={s.navBrand}>{site.identity.displayName}</a>
        <nav className={s.navLinks}>
          <a href="#menu">Menu</a>
          <a href="#about">Story</a>
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
      <div className={s.heroPhoto}>
        {hero.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.photoUrl} alt="" />
        ) : (
          <div className={s.heroPhotoPlaceholder} />
        )}
      </div>
      <div className={s.heroOverlay} />

      <div className={`${s.container} ${s.heroContent}`}>
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

      <div className={s.heroScrollHint}>Scroll</div>
    </section>
  )
}

function Intro({ tagline, subhead }: { tagline: string; subhead?: string }) {
  return (
    <section className={s.intro}>
      <div className={s.containerNarrow}>
        <div className={s.introMark}>The Apnosh Standard</div>
        <h2 className={s.introHeadline}>{tagline}</h2>
        {subhead && <p className={s.introBody}>{subhead}</p>}
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
      <div className={s.offeringsHeader}>
        <div className={s.offeringsLabel}>Two Programs</div>
        <h2>Choose your night.</h2>
      </div>
      <div className={s.container}>
        <div className={s.ayceSplit}>
          {premium?.enabled && <AyceCol program={premium} label="Premium" />}
          {supreme?.enabled && <AyceCol program={supreme} label="Supreme" />}
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
        <div className={s.ayceFigure}><strong>{program.meatCount}</strong><span>Cuts</span></div>
        <div className={s.ayceFigure}><strong>{program.sideCount}</strong><span>Sides</span></div>
      </div>
      <ul className={s.ayceList}>
        {program.highlights?.map((h, i) => <li key={i}>{h}</li>)}
      </ul>
    </div>
  )
}

function ImageBreak({ photoUrl, caption }: { photoUrl?: string | null; caption?: string }) {
  return (
    <section className={s.imageBreak}>
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" />
      )}
      <div className={s.imageBreakOverlay} />
      {caption && <div className={s.imageBreakCaption}>{caption}</div>}
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
        <h2>{about.headline}</h2>
        <div className={s.aboutBody}>
          {paras.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {values.length > 0 && (
          <div className={s.aboutValues}>
            {values.map((v, i) => (
              <div key={i} className={s.aboutValue}>
                <div className={s.aboutValueOrnament}>✦</div>
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

function Locations({ site, reservationUrl }: { site: RestaurantSite; reservationUrl: string }) {
  if (site.locations.length === 0) return null
  return (
    <section id="locations" className={s.locations}>
      <div className={s.locationsHeader}>
        <h2>Where we&apos;re open.</h2>
      </div>
      <div className={s.container}>
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
                  {loc.googleMapsUrl ? 'Get Directions' : 'Reserve'}
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
      <div className={s.containerNarrow}>
        <div className={s.testimonialsLabel}>{testimonials.heading || 'On the Record'}</div>
        {items.slice(0, 1).map((t, i) => (
          <div key={i}>
            <p className={s.testimonialQuote}>&ldquo;{t.quote}&rdquo;</p>
            <div className={s.testimonialAuthor}>
              <strong>{t.author}</strong>{t.role ? ` · ${t.role}` : ''}
            </div>
          </div>
        ))}
        {items.length > 1 && (
          <>
            {items.slice(1, 3).map((t, i) => (
              <div key={`b-${i}`}>
                <p className={s.testimonialQuote}>&ldquo;{t.quote}&rdquo;</p>
                <div className={s.testimonialAuthor}>
                  <strong>{t.author}</strong>{t.role ? ` · ${t.role}` : ''}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}

function Faq({ site }: { site: RestaurantSite }) {
  const faqs = Array.isArray(site.contact?.faqs) ? site.contact.faqs : []
  return (
    <section id="contact" className={s.faqSection}>
      <div className={s.faqHeader}>
        <h2>Common questions.</h2>
      </div>
      <div className={s.container}>
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
            {social.instagram && <a href={social.instagram} target="_blank" rel="noopener">IG</a>}
            {social.tiktok && <a href={social.tiktok} target="_blank" rel="noopener">TT</a>}
            {social.facebook && <a href={social.facebook} target="_blank" rel="noopener">FB</a>}
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
            <li><a href="#menu">Menu</a></li>
            <li><a href="#about">Story</a></li>
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
