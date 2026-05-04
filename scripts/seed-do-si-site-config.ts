/**
 * Pre-fill Do Si KBBQ's site_configs.draft_data with everything we already
 * know. After running this, the Site Builder admin form opens with Do Si
 * fully populated and ready to publish.
 *
 * Idempotent: safe to re-run; will overwrite the draft each time.
 *
 * Run: npx tsx scripts/seed-do-si-site-config.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { RESTAURANT_DEFAULTS } from '../src/lib/site-schemas'
import type { RestaurantSite } from '../src/lib/site-schemas/restaurant'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const DO_SI_ID = '2535fe50-0d78-411f-a59f-cfffbbd239b5'

const DO_SI_SITE: RestaurantSite = {
  ...RESTAURANT_DEFAULTS,
  identity: {
    displayName: 'Do Si Korean BBQ',
    vertical: 'restaurant',
    templateId: 'restaurant-bold',
    tagline: 'Korean BBQ, meant to be shared.',
  },
  brand: {
    primaryColor: '#0B0B0B',
    secondaryColor: '#CC0A0A',
    accentColor: '#FFFFFF',
    fontDisplay: 'Anton',
    fontBody: 'DM Sans',
    logoUrl: 'https://dosikbbq.com/wp-content/uploads/2025/04/dosi-logo-scaled.png',
    voiceNotes: 'Communal + celebratory. "Every visit is more than a meal. It\'s an experience." "Korean BBQ is meant to be shared." Multi-location: Alki = aspirational waterfront, Kent = dependable AYCE.',
  },
  hero: {
    eyebrow: 'Alki Beach + Kent',
    headline: 'Korean BBQ, Meant to Be Shared.',
    subhead: 'Two locations, table-grill dining, premium AYCE — and a waterfront view in West Seattle.',
    photoUrl: null,
    primaryCta: { label: 'Reserve a Table', url: 'https://dosikbbq.com/reserve/' },
    secondaryCta: { label: 'View Menu', url: '/menu/' },
  },
  locations: [
    {
      id: 'alki',
      name: 'Alki Beach',
      tagline: 'Waterfront West Seattle',
      address: '2516 Alki Ave SW',
      city: 'Seattle',
      state: 'WA',
      zip: '98116',
      phone: '(206) 806-8422',
      phoneHref: '+12068068422',
      email: 'dosikbbq@outlook.com',
      googleMapsUrl: 'https://maps.google.com/?q=2516+Alki+Ave+SW+Seattle+WA+98116',
      vibe: 'Waterfront seating, sunset dinners, and a room built for occasions. The former Duke\'s Seafood space, reimagined for table-grill Korean BBQ.',
      hours: [
        { label: 'Mon–Thu', value: '4 – 10pm' },
        { label: 'Fri',     value: '4 – 11pm' },
        { label: 'Sat',     value: '12 – 11pm' },
        { label: 'Sun',     value: '12 – 10pm' },
      ],
      features: ['Waterfront views', 'Walk-ins welcome', 'Reservations available', 'Private events'],
      isPrimary: true,
      photoUrl: null,
    },
    {
      id: 'kent',
      name: 'Kent',
      tagline: 'AYCE Premium + Supreme',
      address: '12912 SE Kent-Kangley Rd',
      city: 'Kent',
      state: 'WA',
      zip: '98030',
      phone: '(253) 981-4277',
      phoneHref: '+12539814277',
      email: 'dosikbbq@outlook.com',
      googleMapsUrl: 'https://maps.google.com/?q=12912+SE+Kent-Kangley+Rd+Kent+WA+98030',
      vibe: 'Our flagship AYCE program. Bigger groups, bigger spreads, dependable execution.',
      hours: [
        { label: 'Mon–Thu', value: '11:30am – 10pm' },
        { label: 'Fri–Sat', value: '11:30am – 11pm' },
        { label: 'Sun',     value: '11:30am – 10pm' },
      ],
      features: ['AYCE Premium + Supreme', 'Lunch specials', 'Ample parking', 'Walk-ins welcome'],
      isPrimary: false,
      photoUrl: null,
    },
  ],
  offerings: {
    ayce: {
      premium: {
        enabled: true,
        name: 'AYCE Premium',
        subtitle: 'All-You-Can-Eat — the full table-grill experience',
        meatCount: 28,
        sideCount: 11,
        highlights: [
          'Marinated bulgogi, galbi, spicy pork',
          'Unmarinated brisket, pork belly, beef tongue',
          '11 stews + sides + the full banchan spread',
          'Time-limited per group',
        ],
      },
      supreme: {
        enabled: true,
        name: 'AYCE Supreme',
        subtitle: 'Premium cuts unlocked — for the full feast',
        meatCount: 32,
        sideCount: 11,
        highlights: [
          'Everything in Premium plus four upgraded meats',
          'Premium short rib + wagyu cuts',
          'Same 11 stews + sides + full banchan',
          'Best for groups of 4+',
        ],
      },
    },
    categories: [
      { id: 'appetizers', name: 'Appetizers', description: 'Small plates to share before the grill heats up.' },
      { id: 'entrees', name: 'Entrées', description: 'Korean classics served with rice and side accompaniments.' },
      { id: 'drinks', name: 'Drinks', description: 'Korean beers, sojus, cocktails, and zero-proof options.' },
    ],
  },
  about: {
    headline: 'Every visit is more than a meal.',
    body: `Do Si is built on a simple idea: Korean BBQ is best shared. Around the table, with the grill between you, surrounded by banchan and stews and someone telling a story you'll remember for years.

We run two locations in Washington — Kent for the dependable AYCE Premium and Supreme programs, and Alki Beach for the waterfront, the sunset, and the room that turns every dinner into an occasion.

Walk in. Reserve a table. Bring everyone.`,
    photoUrl: null,
    values: [
      { title: 'Around the Table', body: 'Korean BBQ is meant to be shared. Our rooms are built for it — wide tables, hot grills, hands reaching across.' },
      { title: 'Quality on the Grill', body: 'Marinated and unmarinated cuts, sourced for flavor and the way they char. Premium cuts unlocked at Supreme.' },
      { title: 'Two Settings, One Voice', body: 'Kent for the dependable AYCE program. Alki Beach for the waterfront and the occasion. Same hospitality, two stories.' },
    ],
  },
  contact: {
    intro: 'Reservations, group bookings, and private events. The fastest path is calling the location directly.',
    faqs: [
      { q: 'Do you take walk-ins?', a: 'Yes — both locations welcome walk-ins, though weekends fill quickly. Reservations are recommended for groups of four or more.' },
      { q: 'How long is AYCE?', a: 'AYCE is a time-limited service — typically 90 minutes per table. Your server will set the timer when you order.' },
      { q: 'Can you host private events?', a: 'Both locations host private parties and group celebrations. Email dosikbbq@outlook.com or call the location for details.' },
      { q: 'Is there parking?', a: 'Kent has ample on-site parking. Alki Beach has limited street parking — plan extra time on weekends.' },
    ],
  },
  reservation: {
    enabled: true,
    provider: 'custom',
    url: 'https://dosikbbq.com/reserve/',
    ctaLabel: 'Reserve a Table',
  },
  social: {
    instagram: 'https://instagram.com/dosikbbq',
    tiktok: 'https://tiktok.com/@dosikbbq',
    facebook: 'https://facebook.com/dosikbbq',
    twitter: null,
    youtube: null,
    linkedin: null,
  },
  seo: {
    title: 'Do Si Korean BBQ — Alki Beach + Kent',
    description: 'Korean BBQ, meant to be shared. AYCE Premium and Supreme programs in Kent. Waterfront table-grill dining on Alki Beach.',
    ogImageUrl: null,
  },
  statBand: {
    enabled: true,
    stats: [
      { value: '2',  label: 'Locations' },
      { value: '32', label: 'AYCE cuts at Supreme' },
      { value: '11', label: 'Sides + stews' },
    ],
  },
  footer: {
    tagline: 'Korean BBQ, meant to be shared. Alki Beach + Kent, Washington.',
    copyright: '© 2026 Do Si Korean BBQ',
  },
}

async function main() {
  console.log('Seeding Do Si site_config…')

  // Probe table existence first so we give a clear error if migration not applied
  const { error: probeErr } = await s.from('site_configs').select('client_id').limit(1)
  if (probeErr) {
    console.error('❌ site_configs table not found:', probeErr.message)
    console.error('   Apply migration 079_site_configs.sql first via Supabase Studio.')
    process.exit(1)
  }

  const { data: existing } = await s
    .from('site_configs')
    .select('client_id')
    .eq('client_id', DO_SI_ID)
    .maybeSingle()

  if (existing) {
    const { error } = await s
      .from('site_configs')
      .update({
        vertical: 'restaurant',
        template_id: 'restaurant-bold',
        draft_data: DO_SI_SITE,
      })
      .eq('client_id', DO_SI_ID)
    if (error) { console.error(error.message); process.exit(1) }
    console.log('✅ Updated existing draft')
  } else {
    const { error } = await s
      .from('site_configs')
      .insert({
        client_id: DO_SI_ID,
        vertical: 'restaurant',
        template_id: 'restaurant-bold',
        draft_data: DO_SI_SITE,
      })
    if (error) { console.error(error.message); process.exit(1) }
    console.log('✅ Inserted new draft')
  }

  console.log('\nNext: open /admin/clients/do-si-kbbq/site-builder/ to edit + publish.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
