/**
 * Hero section for a restaurant site.
 * Pulls restaurant name, tagline, hero photo from the Apnosh source.
 * If the restaurant has an active promotion, surfaces a small badge.
 */

interface HeroProps {
  name: string
  tagline?: string
  heroPhotoUrl?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  activePromoName?: string
}

export default function Hero({
  name, tagline, heroPhotoUrl, primaryCta, secondaryCta, activePromoName,
}: HeroProps) {
  return (
    <section className="relative w-full min-h-[70vh] flex items-center justify-center overflow-hidden">
      {heroPhotoUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroPhotoUrl})` }}
          />
          <div className="absolute inset-0 bg-black/45" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-stone-900 to-stone-700" />
      )}

      <div className="relative z-10 text-center text-white px-6 max-w-3xl">
        {activePromoName && (
          <div className="inline-block mb-4 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-medium tracking-wide">
            🎉 {activePromoName}
          </div>
        )}
        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">{name}</h1>
        {tagline && (
          <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">{tagline}</p>
        )}
        <div className="flex gap-3 justify-center flex-wrap">
          {primaryCta && (
            <a
              href={primaryCta.href}
              className="px-6 py-3 bg-white text-stone-900 font-semibold rounded-lg hover:bg-stone-100 transition-colors"
            >
              {primaryCta.label}
            </a>
          )}
          {secondaryCta && (
            <a
              href={secondaryCta.href}
              className="px-6 py-3 bg-white/10 backdrop-blur text-white font-semibold rounded-lg border border-white/30 hover:bg-white/20 transition-colors"
            >
              {secondaryCta.label}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
