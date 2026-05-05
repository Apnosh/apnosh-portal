/**
 * AYCE variants. Different ways to present the AYCE Premium / Supreme programs.
 */

import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface Props { site: RestaurantSite }

function getPrograms(site: RestaurantSite) {
  const ayceRaw = site.offerings?.ayce as unknown
  let premium: NonNullable<RestaurantSite['offerings']['ayce']['premium']> | undefined
  let supreme: NonNullable<RestaurantSite['offerings']['ayce']['supreme']> | undefined
  if (ayceRaw && typeof ayceRaw === 'object' && !Array.isArray(ayceRaw)) {
    const obj = ayceRaw as { premium?: typeof premium; supreme?: typeof supreme }
    premium = obj.premium
    supreme = obj.supreme
  } else if (Array.isArray(ayceRaw)) {
    const arr = ayceRaw as Array<{ name?: string; subtitle?: string; description?: string; meatCount?: number; sideCount?: number; highlights?: string[] }>
    const find = (kw: string) => arr.find(a => (a.name ?? '').toLowerCase().includes(kw))
    const toProg = (a: typeof arr[number] | undefined) => a ? {
      enabled: true, name: a.name ?? 'AYCE',
      subtitle: a.subtitle ?? a.description ?? '',
      meatCount: a.meatCount ?? 0, sideCount: a.sideCount ?? 0,
      highlights: a.highlights ?? [],
    } : undefined
    premium = toProg(find('premium')) ?? toProg(arr[0])
    supreme = toProg(find('supreme')) ?? toProg(arr[1])
  }
  return { premium, supreme }
}

// SIDE-BY-SIDE — current Bold style with bordered cards
export function AyceSideBySide({ site }: Props) {
  const { premium, supreme } = getPrograms(site)
  if (!premium?.enabled && !supreme?.enabled) return null
  return (
    <section id="menu" style={{ padding: 'clamp(80px, 10vw, 140px) 0', background: 'var(--c-cream-2)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ maxWidth: 720, marginBottom: 56 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>All-You-Can-Eat</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2rem, 4.6vw, 3.4rem)' }}>Two programs. <span style={{ color: 'var(--c-brand)' }}>One long table.</span></h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {premium?.enabled && <Card program={premium} variant="premium" />}
          {supreme?.enabled && <Card program={supreme} variant="supreme" />}
        </div>
      </div>
    </section>
  )
}

function Card({ program, variant }: { program: NonNullable<RestaurantSite['offerings']['ayce']['premium']>; variant: 'premium' | 'supreme' }) {
  const isSupreme = variant === 'supreme'
  return (
    <div style={{
      background: isSupreme ? 'var(--c-ink)' : 'var(--c-paper)',
      color: isSupreme ? 'var(--c-cream)' : 'var(--c-ink)',
      border: `1px solid ${isSupreme ? 'var(--c-gold)' : 'var(--c-rule)'}`,
      borderRadius: 18, padding: 40, position: 'relative',
    }}>
      {isSupreme && (
        <span style={{
          position: 'absolute', top: 22, right: 22,
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
          background: 'var(--c-gold)', color: 'var(--c-ink)', padding: '6px 10px', borderRadius: 6,
        }}>Supreme</span>
      )}
      <h3 style={{ fontSize: 'clamp(2rem, 3.6vw, 2.8rem)', textTransform: 'uppercase', marginBottom: 6 }}>{program.name}</h3>
      {program.subtitle && <p style={{ fontSize: '0.95rem', color: isSupreme ? 'rgba(250,246,239,0.75)' : 'var(--c-ink-3)', marginBottom: 24 }}>{program.subtitle}</p>}
      <div style={{ display: 'flex', gap: 18, marginBottom: 22 }}>
        <div style={{ flex: 1, borderTop: `2px solid ${isSupreme ? 'var(--c-gold)' : 'var(--c-brand)'}`, paddingTop: 8 }}>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '2.2rem', display: 'block', lineHeight: 1, color: isSupreme ? 'var(--c-gold)' : 'inherit' }}>{program.meatCount}</strong>
          <span style={{ fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: isSupreme ? 'rgba(250,246,239,0.7)' : 'var(--c-ink-3)' }}>Meats</span>
        </div>
        <div style={{ flex: 1, borderTop: `2px solid ${isSupreme ? 'var(--c-gold)' : 'var(--c-brand)'}`, paddingTop: 8 }}>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '2.2rem', display: 'block', lineHeight: 1, color: isSupreme ? 'var(--c-gold)' : 'inherit' }}>{program.sideCount}</strong>
          <span style={{ fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: isSupreme ? 'rgba(250,246,239,0.7)' : 'var(--c-ink-3)' }}>Sides + Stews</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {program.highlights?.map((h, i) => (
          <li key={i} style={{ paddingLeft: 22, position: 'relative', fontSize: '0.95rem' }}>
            <span style={{ position: 'absolute', left: 0, top: 8, width: 12, height: 2, background: isSupreme ? 'var(--c-gold)' : 'var(--c-brand)' }} />
            {h}
          </li>
        ))}
      </ul>
    </div>
  )
}

// PROGRAM TABLE — typographic table comparing the two programs
export function AyceTable({ site }: Props) {
  const { premium, supreme } = getPrograms(site)
  if (!premium?.enabled && !supreme?.enabled) return null
  return (
    <section id="menu" style={{ padding: 'clamp(80px, 10vw, 140px) 0', background: 'var(--c-paper)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(60px, 8vw, 100px)' }}>
          <span style={{ fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-brand)' }}>The Programs</span>
          <h2 style={{ marginTop: 14, fontSize: 'clamp(2.4rem, 5vw, 4rem)', fontStyle: 'italic' }}>Two ways to dine.</h2>
        </div>
        <div style={{
          maxWidth: 920, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0,
        }}>
          <TableCol program={premium} label="Premium" />
          <div style={{ background: 'var(--c-rule)' }} />
          <TableCol program={supreme} label="Supreme" />
        </div>
      </div>
    </section>
  )
}

function TableCol({ program, label }: { program: NonNullable<RestaurantSite['offerings']['ayce']['premium']> | undefined; label: string }) {
  if (!program?.enabled) return <div />
  return (
    <div style={{ padding: '0 clamp(24px, 4vw, 48px)' }}>
      <div style={{ fontSize: '0.74rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-brand)', marginBottom: 14 }}>
        AYCE — {label}
      </div>
      <h3 style={{ fontFamily: 'var(--c-font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', marginBottom: 8 }}>{program.name}</h3>
      {program.subtitle && <p style={{ color: 'var(--c-ink-3)', marginBottom: 28 }}>{program.subtitle}</p>}
      <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
        <div>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '2.4rem', fontStyle: 'italic', display: 'block', lineHeight: 1 }}>{program.meatCount}</strong>
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--c-ink-4)' }}>Cuts</span>
        </div>
        <div>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '2.4rem', fontStyle: 'italic', display: 'block', lineHeight: 1 }}>{program.sideCount}</strong>
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--c-ink-4)' }}>Sides + Stews</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {program.highlights?.map((h, i) => (
          <li key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--c-rule)', fontSize: '0.95rem' }}>{h}</li>
        ))}
      </ul>
    </div>
  )
}

// CINEMATIC — dark surface, gold accents, dramatic split
export function AyceCinematic({ site }: Props) {
  const { premium, supreme } = getPrograms(site)
  if (!premium?.enabled && !supreme?.enabled) return null
  return (
    <section id="menu" style={{ padding: 'clamp(100px, 14vw, 180px) 0', background: 'var(--c-ink)', color: 'var(--c-cream)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'clamp(80px, 10vw, 120px)' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--c-gold)', marginBottom: 24 }}>Two Programs</div>
        <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontStyle: 'italic' }}>Choose your night.</h2>
      </div>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(20px, 4vw, 56px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {premium?.enabled && <CinematicCol program={premium} label="Premium" hasRight />}
          {supreme?.enabled && <CinematicCol program={supreme} label="Supreme" />}
        </div>
      </div>
    </section>
  )
}

function CinematicCol({ program, label, hasRight }: { program: NonNullable<RestaurantSite['offerings']['ayce']['premium']>; label: string; hasRight?: boolean }) {
  return (
    <div style={{
      padding: 'clamp(40px, 6vw, 80px)',
      borderRight: hasRight ? '1px solid rgba(255,255,255,0.12)' : 'none',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
    }}>
      <div style={{ fontSize: '0.68rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--c-gold)', marginBottom: 18 }}>{label}</div>
      <h3 style={{ fontFamily: 'var(--c-font-display)', fontStyle: 'italic', fontSize: 'clamp(2rem, 3vw, 2.6rem)', marginBottom: 12, color: 'var(--c-cream)' }}>{program.name}</h3>
      {program.subtitle && <p style={{ color: 'rgba(250,246,239,0.7)', marginBottom: 32 }}>{program.subtitle}</p>}
      <div style={{ display: 'flex', gap: 40, marginBottom: 32 }}>
        <div>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '3.4rem', fontStyle: 'italic', lineHeight: 1, color: 'var(--c-gold)', display: 'block' }}>{program.meatCount}</strong>
          <span style={{ fontSize: '0.68rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(250,246,239,0.6)' }}>Cuts</span>
        </div>
        <div>
          <strong style={{ fontFamily: 'var(--c-font-display)', fontSize: '3.4rem', fontStyle: 'italic', lineHeight: 1, color: 'var(--c-gold)', display: 'block' }}>{program.sideCount}</strong>
          <span style={{ fontSize: '0.68rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(250,246,239,0.6)' }}>Sides</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {program.highlights?.map((h, i) => (
          <li key={i} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.12)', fontSize: '0.95rem', color: 'rgba(250,246,239,0.82)' }}>{h}</li>
        ))}
      </ul>
    </div>
  )
}

export const AYCE_VARIANTS = {
  'side-by-side': AyceSideBySide,
  'table': AyceTable,
  'cinematic': AyceCinematic,
} as const

export type AyceVariantId = keyof typeof AYCE_VARIANTS

export const AYCE_VARIANT_DESCRIPTIONS: Record<AyceVariantId, string> = {
  'side-by-side': 'Two bordered cards side-by-side. Supreme card flips to dark+gold. Bold default.',
  'table':        'Editorial table with thin divider, italic display, hairline rules. Magazine vibe.',
  'cinematic':    'Dark surface, gold accents, dramatic split with oversized italic numbers. Occasion-night vibe.',
}
