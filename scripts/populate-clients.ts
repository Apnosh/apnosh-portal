/**
 * One-shot populate of 8 client records with Drive folders, profile,
 * brand, and top-level clients row. Aggregated from Drive docs + website
 * scrapes + Chrome CSS probes done in-chat.
 *
 * Run via: npx tsx scripts/populate-clients.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/* -----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------*/

async function getClientId(name: string): Promise<string> {
  const { data } = await s.from('clients').select('id').eq('name', name).single()
  if (!data) throw new Error(`Client not found: ${name}`)
  return (data as { id: string }).id
}

async function linkFolders(
  clientId: string,
  folders: Array<{ id: string; label: string }>,
): Promise<void> {
  for (let i = 0; i < folders.length; i++) {
    const f = folders[i]
    await s.from('client_drive_folders').upsert(
      {
        client_id: clientId,
        folder_id: f.id,
        folder_url: `https://drive.google.com/drive/folders/${f.id}`,
        label: f.label,
        sort_order: i,
      },
      { onConflict: 'client_id, folder_id' },
    )
  }
}

async function upsertBrand(clientId: string, brand: Record<string, unknown>): Promise<void> {
  const { data: existing } = await s
    .from('client_brands')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (existing) {
    await s.from('client_brands').update(brand).eq('client_id', clientId)
  } else {
    await s.from('client_brands').insert({ client_id: clientId, ...brand })
  }
}

type ClientPopulate = {
  name: string
  clientsRow: Record<string, unknown>
  folders: Array<{ id: string; label: string }>
  profile: Record<string, unknown>
  brand: Record<string, unknown>
}

/* -----------------------------------------------------------------
 * 1. Boba After Hours
 * ---------------------------------------------------------------*/
const bobaAfterHours: ClientPopulate = {
  name: 'Boba After Hours',
  clientsRow: {
    website: 'https://www.sipbobaafterhours.com',
    email: null,
    billing_email: null,
    phone: null,
    location: 'Seattle + online',
    industry: 'CPG · Alcoholic boba / milk tea',
    socials: { instagram: '@boba_afterhours' },
  },
  folders: [
    { id: '1_x4jZBjhzzTk5LRqdm_', label: 'Content delivery' },
    { id: '1uW3dsqgc1ZcCEr1qoQT', label: 'Strategy & onboarding' },
    { id: '1oteTF69x3h1zJQ-DLK6', label: 'Marketing Assets' },
  ],
  profile: {
    primary_goal: 'Turn Boba After Hours into the defining premium ready-to-drink alcoholic milk tea brand — start with Seattle + UW community, expand through retail and bars.',
    goal_detail: 'Built out of University of Washington with craft positioning (real dairy, redistilled spirits, no fake creamer). Voice is heritage-meets-nightlife: "inspired by the boba shops we grew up in." Primary growth vectors: boba-shop + Asian-grocery retail placement, college/nightlife social proof, DTC for mailing list + loyalty.',
    timeline: null,
    success_signs: [
      'Retail placement in major Asian grocery chains (already in Hong Kong Market)',
      'Organic social traction with UW + college nightlife audience',
      'Positive press in PNW food + drink media',
      'DTC conversion rate lifts with each product drop',
    ],
    customer_types: [
      'UW students / college nightlife',
      'Asian-American diaspora (nostalgia + craft)',
      'Craft beverage enthusiasts',
      'Asian grocery shoppers',
      'Bar / late-night boba buyers',
    ],
    why_choose: [
      'Real NY farm dairy (no fake creamer)',
      'Redistilled grain spirit for smooth drink',
      'Founder story from UW + boba-shop heritage',
      'First-mover in alcoholic ready-to-drink boba',
    ],
    business_type: 'Ready-to-drink alcoholic beverage (CPG)',
    cuisine: null,
    service_styles: ['Retail (grocery)', 'DTC', 'Bar / on-premise'],
    business_description: 'Premium alcoholic milk tea brand born out of University of Washington. Uses Assam black tea brewed fresh, dairy liqueur from local NY farms, and redistilled grain spirit. Positioned as an adult take on boba — "inspired by the boba shops we grew up in." Consumed as a shot or over ice. Parent company: Blind Tiger LLC. Sold via retail (including Hong Kong Market) and direct-to-consumer.',
    unique_differentiator: 'First-mover in alcoholic ready-to-drink boba with a genuine craft story. Real dairy, real distillation, not flavored vodka pretending to be boba. The UW origin + "boba shops we grew up in" voice gives the brand legitimacy competitors will find hard to replicate.',
    competitors: null,
    main_offerings: 'Assam black tea + dairy liqueur + redistilled grain spirit. Served as a shot or on ice. Currently available in Asian grocery retail (Hong Kong Market) and DTC online.',
    tone_tags: ['Heritage-focused', 'Craft', 'Conversational', 'Nightlife-ready', 'Community', 'Proud'],
    custom_tone: 'Voice draws on the "boba shops we grew up in" — warm, community, craft pride. Don\'t lean into party-booze tropes. Think: craft distillery voice meets Asian-American boba shop voice. Founder-led.',
    content_type_tags: ['Founder story', 'Craft / distillation process', 'Retail unboxing', 'Nightlife moment', 'UW / college'],
    full_address: null,
    city: 'Seattle',
    state: 'WA',
    zip: null,
    website_url: 'https://www.sipbobaafterhours.com',
    business_phone: null,
    location_count: null,
    hours: null,
    brand_color_primary: '#000000',
    brand_color_secondary: '#FEE2D5',
    logo_url: 'https://images.squarespace-cdn.com/content/v1/660a38aab15a30095f6d8c6a/813baf46-2195-435c-9a32-f0e6b3a11b0f/Asset+1.png?format=1500w',
  },
  brand: {
    primary_color: '#000000',
    secondary_color: '#FEE2D5',
    accent_color: '#FFFFFF',
    font_display: 'Poppins',
    font_body: 'Poppins',
    logo_url: 'https://images.squarespace-cdn.com/content/v1/660a38aab15a30095f6d8c6a/813baf46-2195-435c-9a32-f0e6b3a11b0f/Asset+1.png?format=1500w',
    visual_style: 'clean_minimal',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Heritage-meets-nightlife. "Inspired by the boba shops we grew up in." Founder-led voice from UW origins. Craft pride over party tropes.',
    photo_style: 'Product-forward shots in low light / nightlife context. Craft-distillery aesthetic — bottles, pours, ice. Asian-American community moments. Campus / UW context shots for local tie-in.',
  },
}

/* -----------------------------------------------------------------
 * 2. Do Si KBBQ
 * ---------------------------------------------------------------*/
const doSi: ClientPopulate = {
  name: 'Do Si KBBQ',
  clientsRow: {
    website: 'https://dosikbbq.com',
    email: 'dosikbbq@outlook.com',
    billing_email: 'dosikbbq@outlook.com',
    phone: '(206) 806-8422',
    location: 'Alki Beach Seattle + Kent, WA',
    industry: 'Restaurant · Korean BBQ',
    socials: {
      instagram: '@dosikbbq',
      tiktok: '@dosikbbq',
      facebook: 'dosikbbq',
    },
  },
  folders: [
    { id: '1DJcAEBxHMBjlUfBjKP2', label: 'Content delivery' },
    { id: '1CSfnfoqAKJRuRQpc8AH', label: 'Strategy & onboarding' },
    { id: '16C35KkonXHWGbYrdef9', label: 'Food photography' },
    { id: '1gSLGdmf9lozTQPbmhKs', label: 'Alki location assets' },
  ],
  profile: {
    primary_goal: 'Make Do Si Korean BBQ the defining Seattle-area Korean BBQ experience — Alki Beach as a waterfront scene destination, Kent as the dependable neighborhood AYCE.',
    goal_detail: 'Alki just opened in the former Duke\'s Seafood space — the waterfront location is a major brand moment. Kent has the AYCE Premium + Supreme programs. Voice is "every visit is more than a meal, it\'s an experience" — shared, celebratory. Two content modes: Alki for aspirational scene content, Kent for dependable execution.',
    timeline: null,
    success_signs: [
      'Alki fully establishes as a waterfront scene destination',
      'AYCE Supreme drives repeat family + group bookings',
      'Social proof from ep-style content (the "$20,000 Door" episode)',
      'Weekend reservations consistently booked',
    ],
    customer_types: [
      'Group diners / celebrations (birthdays, graduations)',
      'Date-night couples (Alki waterfront)',
      'Korean-American community',
      'AYCE enthusiasts',
      'Alki Beach foot traffic',
      'Kent-area families',
    ],
    why_choose: [
      'Waterfront Alki location (ex-Duke\'s space)',
      'AYCE Premium + Supreme options (full spread)',
      'Shared-dining + celebration atmosphere',
      'High-quality marinated + unmarinated cuts',
      'Two locations (waterfront + Kent)',
    ],
    business_type: 'Restaurant',
    cuisine: 'Korean',
    service_styles: ['Dine-in', 'Table grill', 'AYCE', 'Group celebrations', 'Reservations + walk-ins'],
    business_description: 'Korean BBQ with two Washington locations — Alki Beach (Seattle waterfront, the former Duke\'s Seafood space) and Kent (Kent-Kangley Rd). Table-grill dining with both marinated and unmarinated high-quality cuts, banchan, soups, and Korean entrees. AYCE Premium (28 meats + 11 sides/stews) and AYCE Supreme (32 meats + 11) drive the core repeat business. Brand framing: "every visit is more than a meal. It\'s an experience."',
    unique_differentiator: 'The Alki Beach location is unique — waterfront Korean BBQ in Seattle is a niche of one. Combined with a serious AYCE program in Kent, Do Si owns the "Korean BBQ + scene" intersection that pure-play AYCE operators can\'t match.',
    competitors: null,
    main_offerings: 'AYCE Premium (28 meats + 11 sides/stews) and AYCE Supreme (32 meats + 11). Table-grill Korean BBQ with marinated + unmarinated cuts. Appetizers, entrees, banchan, stews, cocktails + mocktails. Content series evidence: "$20,000 Door" episode 7 (high-ticket content format). Walk-ins welcome + reservations + ample parking.',
    tone_tags: ['Warm', 'Celebratory', 'Shared', 'Confident', 'Waterfront-modern', 'Authentic'],
    custom_tone: 'Brand quotes: "Every visit is more than a meal. It\'s an experience." / "We believe Korean BBQ is meant to be shared." Voice is communal and celebratory — not instructional. Content should feel like being invited into a great group dinner.',
    content_type_tags: ['Reel', 'AYCE spread reveal', 'Alki waterfront', 'Grill close-up', 'Group celebration', 'Episode series', 'Banchan feature'],
    full_address: '2516 Alki Ave SW',
    city: 'Seattle',
    state: 'WA',
    zip: '98116',
    website_url: 'https://dosikbbq.com',
    business_phone: '(206) 806-8422',
    location_count: '2',
    hours: { note: 'Hours not published on site — check Yelp or Google profile' },
    brand_color_primary: '#CC0A0A',
    brand_color_secondary: '#000000',
    logo_url: 'https://dosikbbq.com/wp-content/uploads/2025/04/dosi-logo-scaled.png',
  },
  brand: {
    primary_color: '#CC0A0A',
    secondary_color: '#000000',
    accent_color: '#FFFFFF',
    font_display: 'Anton',
    font_body: 'DM Sans',
    logo_url: 'https://dosikbbq.com/wp-content/uploads/2025/04/dosi-logo-scaled.png',
    visual_style: 'bold_colorful',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Communal + celebratory. "Every visit is more than a meal. It\'s an experience." "Korean BBQ is meant to be shared." Chef/grill-as-character works. Multi-location: Alki = aspirational waterfront, Kent = dependable AYCE.',
    photo_style: 'Tabletop grill close-ups with sizzle + steam. Group dining wide shots — hands, laughter, clinked glasses. Alki exterior + waterfront establishing shots. Banchan array overhead. Meat cut-level detail.',
  },
}

/* -----------------------------------------------------------------
 * 3. Hong Kong Bistro (no Drive folders; own website down)
 * ---------------------------------------------------------------*/
const hkBistro: ClientPopulate = {
  name: 'Hong Kong Bistro',
  clientsRow: {
    website: 'http://www.hongkongbistroseattle.com',
    email: null,
    billing_email: null,
    phone: '(206) 682-1922',
    location: 'Seattle International District',
    industry: 'Restaurant · Cantonese · Dim sum',
    socials: {},
  },
  folders: [],
  profile: {
    primary_goal: 'Secure Hong Kong Bistro\'s place as Seattle International District\'s go-to Cantonese + dim sum + hot pot destination for groups.',
    goal_detail: 'Established 2015. Group-friendly Cantonese kitchen — dim sum, pan-fried noodles, and hot pots in low-key surrounds. Content strategy should lean into group dining, family-style, weekend dim sum, and the ID neighborhood energy. Brand doesn\'t need to reinvent itself — just show up consistently online.',
    timeline: null,
    success_signs: [
      'Weekend dim sum always booked',
      'Group reservations lifting',
      'Rising presence in Seattle food media',
      'Steady repeat family customers',
    ],
    customer_types: [
      'Cantonese-Chinese community',
      'Weekend dim sum groups',
      'ID neighborhood + tourist traffic',
      'Hot pot seekers',
      'Families / multi-generation tables',
    ],
    why_choose: [
      'Dim sum + hot pots + noodles — range',
      'Group-friendly / big-table setup',
      'ID neighborhood authenticity',
      'Established 2015 — known entity',
    ],
    business_type: 'Restaurant',
    cuisine: 'Cantonese',
    service_styles: ['Dine-in', 'Dim sum', 'Hot pot', 'Group dining', 'Lunch + dinner'],
    business_description: 'Cantonese restaurant in Seattle\'s International District since 2015. Group-friendly kitchen with three core offerings: dim sum, pan-fried noodles, and hot pots. Low-key surroundings designed for casual group meals and extended family dining.',
    unique_differentiator: 'The combination of dim sum, pan-fried noodles, AND hot pot under one roof is unusual — most dim sum spots don\'t do hot pot; most hot pot spots don\'t do dim sum. Ten-year history in the ID adds authenticity.',
    competitors: null,
    main_offerings: 'Dim sum (weekend + daily), pan-fried noodles, hot pots. Group dining formats. Full Cantonese menu with classic dishes.',
    tone_tags: ['Welcoming', 'Authentic', 'Group-ready', 'Neighborhood', 'Unpretentious'],
    custom_tone: 'Low-key + welcoming. Don\'t over-design the voice. Food-forward — the dishes should do the talking. Celebrate the multi-generation + group aspect of Cantonese dining.',
    content_type_tags: ['Dim sum spread', 'Hot pot boil', 'Noodle toss / wok', 'Group moment', 'Family-style'],
    full_address: '507 Maynard Ave S',
    city: 'Seattle',
    state: 'WA',
    zip: '98104',
    website_url: 'http://www.hongkongbistroseattle.com',
    business_phone: '(206) 682-1922',
    location_count: '1',
    hours: null,
    brand_color_primary: '#C8102E',
    brand_color_secondary: '#FFD700',
    logo_url: null,
  },
  brand: {
    primary_color: '#C8102E',
    secondary_color: '#FFD700',
    accent_color: '#FFFFFF',
    font_display: null,
    font_body: null,
    logo_url: null,
    visual_style: 'photo_forward',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Low-key, group-friendly, authentic. No brand guidelines were available — colors inferred from category conventions (Chinese restaurant red + gold). Update if a brand guide surfaces.',
    photo_style: 'Dim sum carts + bamboo steamers. Wok fire. Hot pot boil steam. Family-style table spreads. ID street context shots.',
  },
}

/* -----------------------------------------------------------------
 * 4. Hong Kong Market
 * ---------------------------------------------------------------*/
const hkMarket: ClientPopulate = {
  name: 'Hong Kong Market',
  clientsRow: {
    website: 'https://www.hkmstores.com',
    email: null,
    billing_email: null,
    phone: '(206) 420-3239',
    location: 'Burien / Federal Way / Kent (+ Puyallup 2026)',
    industry: 'Asian grocery · Supermarket',
    socials: {
      instagram: '@hong.kong.market',
      facebook: 'HongKongMarket',
      tiktok: '@hongkongmarket',
    },
  },
  folders: [
    { id: '1RA_EuVCso9E80AXVhox', label: 'Content delivery' },
    { id: '1r5I29mc_4k4amNAwocG', label: 'Strategy & onboarding' },
    { id: '1ceMhzysfoMmLW90aFTL', label: 'General' },
  ],
  profile: {
    primary_goal: 'Establish Hong Kong Market as the PNW\'s leading Asian grocery destination — not a store you stop at, a place you plan to visit.',
    goal_detail: 'Four locations (Burien, Federal Way, Kent, Puyallup opening 2026). Expanding into fresh food services, food court (Asian + Mexican fusion), and hosting partner brands (Boba After Hours is one of them). Rewards program + career portal + vendor program all exist. Content should amplify: (a) scale + convenience, (b) food court variety, (c) community / diaspora pride.',
    timeline: 'Puyallup location opening Summer 2026',
    success_signs: [
      'Puyallup opens successfully and hits revenue targets',
      'Food court becomes a destination on its own',
      'Loyalty program drives measurable repeat',
      'Featured in PNW food + grocery media as category leader',
    ],
    customer_types: [
      'Asian diaspora across PNW',
      'Home cooks seeking hard-to-find ingredients',
      'Fusion food court customers',
      'Banh mi / BBQ / boba lunch traffic',
      'Partner vendors (Boba After Hours etc.)',
    ],
    why_choose: [
      'Four PNW locations (expanding to five in 2026)',
      'Online deli ordering — skip the line',
      'Multi-cuisine fusion food court',
      'Loyalty rewards program',
      'Partner brand ecosystem (Boba After Hours etc.)',
      'Fresh fish, seafood, BBQ, banh mi, boba under one roof',
    ],
    business_type: 'Grocery · Supermarket',
    cuisine: null,
    service_styles: ['Grocery', 'Deli / hot foods', 'Food court', 'Online ordering', 'Catering', 'Vendor host'],
    business_description: 'Leading international Asian supermarket with 4 Puget Sound locations (Burien, Federal Way, Kent, + Puyallup opening Summer 2026). Beyond grocery: deli with online ordering (skip-the-line), multi-cuisine food court (Asian + Mexican fusion), fresh fish + seafood, Chinese BBQ roast pork + duck, fresh banh mi, and in-house boba. Also hosts partner brands like Boba After Hours. Loyalty rewards program + career training portal + vendor opportunities.',
    unique_differentiator: 'Hong Kong Market operates less like a grocery store and more like a community hub — groceries + online deli + food court + boba + partner brands + jobs program all under one roof. Few Asian grocery chains integrate all these layers at this scale in the PNW.',
    competitors: null,
    main_offerings: 'Asian groceries (primary), fresh seafood + fish, Chinese BBQ (roast pork + duck), banh mi, multi-cuisine food court (Asian + Mexican fusion), in-house boba + partnership with Boba After Hours, online deli ordering, loyalty rewards, catering.',
    tone_tags: ['Welcoming', 'Community-first', 'Convenient', 'Modern', 'Proud', 'Practical'],
    custom_tone: 'Tagline: "Time is precious, and we know that." Voice is practical + welcoming — the working-person\'s Asian grocery. Content should lean into the convenience + variety, not just the grocery angle.',
    content_type_tags: ['Food court feature', 'Online deli ordering', 'Fresh arrival / seafood', 'Boba partnership', 'Banh mi preparation', 'Rewards program', 'New location (Puyallup) teaser'],
    full_address: '129 SW 148th St B',
    city: 'Burien',
    state: 'WA',
    zip: '98166',
    website_url: 'https://www.hkmstores.com',
    business_phone: '(206) 420-3239',
    location_count: '4',
    hours: { note: 'Hours vary by location — check each store page' },
    brand_color_primary: '#FFF704',
    brand_color_secondary: '#000000',
    logo_url: 'https://static.wixstatic.com/media/a335d4_2b0ab0c7b81b4ada90f2842fb8cada68~mv2.png/v1/crop/x_183,y_136,w_1602,h_1500/fill/w_134,h_123,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/a335d4_2b0ab0c7b81b4ada90f2842fb8cada68~mv2.png',
  },
  brand: {
    primary_color: '#FFF704',
    secondary_color: '#000000',
    accent_color: '#FFFFFF',
    font_display: 'Proxima Nova',
    font_body: 'Arial',
    logo_url: 'https://static.wixstatic.com/media/a335d4_2b0ab0c7b81b4ada90f2842fb8cada68~mv2.png/v1/crop/x_183,y_136,w_1602,h_1500/fill/w_134,h_123,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/a335d4_2b0ab0c7b81b4ada90f2842fb8cada68~mv2.png',
    visual_style: 'bold_colorful',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Tagline: "Time is precious, and we know that." Welcoming, practical, modern. Value-forward — brand wants you to know it\'s both the best AND the easiest option.',
    photo_style: 'Overhead produce + seafood arrays. Food court plate shots. Community portraits (families shopping, staff interactions). Big + bright — yellow-forward aesthetic.',
  },
}

/* -----------------------------------------------------------------
 * 5. IJ Sushi Burrito
 * ---------------------------------------------------------------*/
const ijSushi: ClientPopulate = {
  name: 'IJ Sushi Burrito',
  clientsRow: {
    website: 'https://www.ijsushiburrito.com',
    email: null,
    billing_email: null,
    phone: '(425) 244-0337',
    location: '7 PNW locations',
    industry: 'Restaurant · Japanese-Hawaiian fusion',
    socials: {
      instagram: '@ij_sushiburrito',
      tiktok: '@ijsushiburrito',
      facebook: 'IJSushiBurritoHQ',
    },
  },
  folders: [
    { id: '1YX7ZCl4VWf4Q9ErCUsr', label: 'Content delivery' },
  ],
  profile: {
    primary_goal: 'Grow IJ Sushi Burrito from a 7-location PNW chain into the region\'s dominant customizable Japanese-Hawaiian fusion brand.',
    goal_detail: 'Menu tagline: "Roll Your Own Way." Strong customization hook + multi-location scale. Catering is a secondary channel. Voice is casual + inviting (recruiting copy: "Want to roll with us?"). Content should showcase the customization ritual, the format novelty, and the multi-location accessibility.',
    timeline: null,
    success_signs: [
      'Higher per-location AUV from customization upsells',
      'Catering funnel fills organically from content',
      'Social following rises with Gen Z / college audience',
      'New-location expansion gains local earned media',
    ],
    customer_types: [
      'Gen Z + college students (UW, etc.)',
      'Mall food-court lunch crowd',
      'Customization-seekers (bowl + burrito culture)',
      'Catering buyers (offices, parties)',
      'Japanese-Hawaiian fusion enthusiasts',
    ],
    why_choose: [
      '"Roll Your Own Way" customization',
      'Seven PNW locations — accessible + ubiquitous',
      'Japanese-Hawaiian fusion (category of one in the area)',
      'Online ordering + delivery + catering',
      'Digital gift cards',
    ],
    business_type: 'Restaurant',
    cuisine: 'Japanese-Hawaiian fusion',
    service_styles: ['Fast casual', 'Customizable', 'Online ordering', 'Delivery', 'Catering'],
    business_description: 'Seven-location PNW fast-casual Japanese-Hawaiian fusion brand. Core offering: sushi burritos + bowls, built "your way" via a customization ritual. Additional menu includes poke-style bowls. Operates in Seattle Pine St, UW University Way, Tukwila / Southcenter + four other locations. Full online ordering + delivery + catering + digital gift cards.',
    unique_differentiator: '"Roll Your Own Way" is the clearest customization hook in a category that\'s otherwise generic. The sushi burrito format itself is Japanese-Hawaiian fusion — few PNW operators do this specific cross-cuisine. Seven locations gives them scale competitors can\'t match quickly.',
    competitors: null,
    main_offerings: 'Sushi burritos + bowls with full customization. Japanese-Hawaiian fusion menu. Online ordering, pickup + delivery, catering, digital gift cards.',
    tone_tags: ['Casual', 'Inviting', 'Customizable', 'Gen-Z friendly', 'Playful', 'Accessible'],
    custom_tone: 'Brand hook: "Roll Your Own Way." Recruiting copy style: "Want to roll with us?" Voice is casual, puns acceptable, Gen-Z-native. Customization is the central ritual — lead with it in everything.',
    content_type_tags: ['Reel', 'Customization ritual', 'Build-a-burrito POV', 'Location feature', 'Catering hero', 'Campus / UW'],
    full_address: '2800 Southcenter Blvd, Space #FC13',
    city: 'Seattle',
    state: 'WA',
    zip: '98188',
    website_url: 'https://www.ijsushiburrito.com',
    business_phone: '(425) 244-0337',
    location_count: '7',
    hours: { note: 'Hours vary by location — check ijsushiburrito.com/hours-and-location' },
    brand_color_primary: '#73BF20',
    brand_color_secondary: '#0E2D52',
    logo_url: 'https://www.ijsushiburrito.com/images/97397LOGO.png',
  },
  brand: {
    primary_color: '#73BF20',
    secondary_color: '#0E2D52',
    accent_color: '#FFFFFF',
    font_display: 'Montserrat',
    font_body: 'Montserrat',
    logo_url: 'https://www.ijsushiburrito.com/images/97397LOGO.png',
    visual_style: 'bold_colorful',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Central brand line: "Roll Your Own Way." Casual + inviting + Gen-Z-native. Customization is the hero of the brand — everything points to it.',
    photo_style: 'Over-the-shoulder build POV. Hands rolling + cross-sections showing fillings. Bright + bold — green-forward, high-contrast. Customer-hand moments (picking proteins, sauces).',
  },
}

/* -----------------------------------------------------------------
 * 6. Mr Dim Sum
 * ---------------------------------------------------------------*/
const mrDimSum: ClientPopulate = {
  name: 'Mr Dim Sum',
  clientsRow: {
    website: 'https://eat-mds.com',
    email: null,
    billing_email: null,
    phone: '(206) 566-5923',
    location: 'Southcenter Mall, Tukwila WA',
    industry: 'Restaurant · Cantonese · Dim sum',
    socials: {
      instagram: '@mrdimsumusa',
    },
  },
  folders: [
    { id: '1ygc5sT0YFQ4zhu3FjEu', label: 'Content delivery' },
    { id: '1wo7Mzkpfc8dY0wVx9bJ', label: 'Strategy & onboarding' },
    { id: '18hYdO0qMVe0Y1ptzSzk', label: 'General' },
  ],
  profile: {
    primary_goal: 'Establish Mr. Dim Sum as Southcenter Mall\'s definitive Cantonese dim sum destination — a new-gen dim sum house that earns respect from traditional audiences AND draws mall-first customers.',
    goal_detail: 'Brand narrative: "born from a passion for sharing authentic Cantonese flavors in a modern way." Founders have roots in both traditional dim sum kitchens and fast-paced restaurant ops. Seat 151 — accommodates dine-in AND grab-and-go. Voice is warm + heart-forward ("Touch the Heart With Every Bite"). Strong content thread: hands making dumplings, the steaming cart, and the new-gen take on a traditional cuisine.',
    timeline: null,
    success_signs: [
      'Weekend lunch lines out the door',
      'Grab-and-go becomes a serious revenue stream',
      'Recognized as Tukwila\'s dim sum authority',
      'Featured in PNW food media for modern-Cantonese angle',
    ],
    customer_types: [
      'Southcenter mall foot traffic',
      'Cantonese-Chinese community',
      'Weekend dim sum families',
      'Quick-lunch office crowd (grab-and-go)',
      'Tukwila + Kent residents',
    ],
    why_choose: [
      'Authentic Cantonese dim sum, modern presentation',
      '151-seat capacity — no long waits',
      'Dine-in + grab-and-go hybrid model',
      'Founders with traditional kitchen lineage',
      '"Touch the Heart With Every Bite" ethos',
    ],
    business_type: 'Restaurant',
    cuisine: 'Cantonese',
    service_styles: ['Dine-in', 'Dim sum', 'Grab-and-go', 'Online ordering'],
    business_description: 'Cantonese dim sum restaurant at Southcenter Mall in Tukwila. 151-seat capacity handles dine-in families + grab-and-go office traffic. Menu centers on handmade dumplings, fluffy buns, entrees, sides, and beverages — all made fresh daily. Founders blend traditional dim sum kitchen expertise with modern restaurant operations. Hours: Mon-Sat 10am-9pm, Sun 10am-8pm.',
    unique_differentiator: 'A modern dim sum operation with traditional credentials — the founder story "from traditional dim sum kitchens + fast-paced ops" gives Mr. Dim Sum permission to serve both the respect-demanding Cantonese audience AND the casual mall-foot-traffic customer. Brand voice ("Freshly Steamed, Always Shared" / "Touch the Heart With Every Bite") hits emotional notes most dim sum chains don\'t reach.',
    competitors: null,
    main_offerings: 'Handmade dumplings, fluffy buns, entrees, bean dishes, sides, beverages. All fresh-made daily. Dine-in + grab-and-go + online ordering (Toast).',
    tone_tags: ['Warm', 'Heart-forward', 'Traditional', 'Modern', 'Community', 'Craft'],
    custom_tone: 'Brand quotes: "Freshly Steamed, Always Shared" / "More than dim sum — it\'s a way of life" / "Touch the Heart With Every Bite." Voice is emotional and tradition-honoring without being precious. Lean into the hands-making-dumplings ritual and the multi-generational aspect of dim sum.',
    content_type_tags: ['Dumpling process', 'Steaming cart reveal', 'Bun fluff close-up', 'Family-style table', 'Founders feature', 'Grab-and-go moment'],
    full_address: '973 Southcenter Mall',
    city: 'Tukwila',
    state: 'WA',
    zip: '98188',
    website_url: 'https://eat-mds.com',
    business_phone: '(206) 566-5923',
    location_count: '1',
    hours: {
      monday: '10am-9pm', tuesday: '10am-9pm', wednesday: '10am-9pm', thursday: '10am-9pm',
      friday: '10am-9pm', saturday: '10am-9pm', sunday: '10am-8pm',
    },
    brand_color_primary: '#9D2718',
    brand_color_secondary: '#FFFCF3',
    logo_url: 'https://eat-mds.com/wp-content/uploads/2025/07/mrdimsum-logo.png',
  },
  brand: {
    primary_color: '#9D2718',
    secondary_color: '#FFFCF3',
    accent_color: '#D4B483',
    font_display: 'Italianno',
    font_body: 'Gowun Batang',
    logo_url: 'https://eat-mds.com/wp-content/uploads/2025/07/mrdimsum-logo.png',
    visual_style: 'clean_minimal',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Heart-forward + tradition-honoring. "Touch the Heart With Every Bite." "More than dim sum — it\'s a way of life." Italianno script font signals craft + care. Lead with hands + process in content.',
    photo_style: 'Hands forming dumplings — flour, folding, precision. Steam from bamboo baskets. Overhead dim sum cart spreads. Warm cream + deep-red aesthetic matching brand palette. Family-meal moments.',
  },
}

/* -----------------------------------------------------------------
 * 7. Yellowbee Market & Cafe
 * ---------------------------------------------------------------*/
const yellowbee: ClientPopulate = {
  name: 'Yellowbee Market & Cafe',
  clientsRow: {
    website: 'https://www.shopyellowbee.com',
    email: null,
    billing_email: null,
    phone: null,
    location: 'Yesler Seattle + Mountlake Terrace',
    industry: 'Market · Banh mi · Coffee · Boba',
    socials: {
      instagram: '@shopyellowbee',
      facebook: 'shopyellowbee',
    },
  },
  folders: [
    { id: '12MuTIqULqP9KU9D0-ll', label: 'Content delivery' },
    { id: '1nzUlJLLUXZQ_vwCr59q', label: 'Strategy & onboarding' },
    { id: '1MBUxl2-0Sc5VrIDHSoA', label: 'General' },
  ],
  profile: {
    primary_goal: 'Grow Yellowbee Market & Banh Mi from a Yesler + Mountlake Terrace hybrid cafe into a recognized PNW name for fresh Vietnamese + quick-serve fusion.',
    goal_detail: 'Hybrid market + café format: banh mi + boba + coffee + groceries + snacks. The "bagel banh mi" fusion item is unique. Yesler location targets Yesler Terrace commuters + residents — quick-serve, grab-and-go. Content should show the fusion creativity (bagel banh mi, fusion protein options, boba + coffee pairing).',
    timeline: null,
    success_signs: [
      'Bagel banh mi becomes a local signature',
      'Boba + coffee attach rate grows with lunch orders',
      'Mountlake Terrace location gains ID-equivalent traffic',
      'Featured in PNW food media for fusion angle',
    ],
    customer_types: [
      'Yesler Terrace commuters + residents',
      'Mountlake Terrace lunch crowd',
      'Vegan / GF banh mi seekers',
      'Fusion food enthusiasts',
      'Coffee + boba customers',
    ],
    why_choose: [
      'Bagel banh mi — signature fusion (plain, everything, jalapeño cheddar, cheddar)',
      'Vegan options built in (fried tofu, spring mix avocado, vegan ham)',
      'Full coffee program (americano, latte, mocha, espresso slush, etc.)',
      'Boba + milk tea options',
      'Grocery + grab-and-go',
    ],
    business_type: 'Market · Cafe',
    cuisine: 'Vietnamese · Fusion',
    service_styles: ['Grab-and-go', 'Cafe', 'Market / groceries', 'Banh mi', 'Boba', 'Coffee'],
    business_description: 'Hybrid Vietnamese market + café with 2 locations (Yesler Seattle primary, Mountlake Terrace). Signature item: the Bagel Banh Mi (plain, everything, jalapeño cheddar, cheddar) — a Vietnamese-Western fusion item. Traditional banh mi proteins (grilled pork, beef brisket, beef short rib, grilled chicken) plus vegan options (fried tofu, spring mix avocado, vegan ham). Full boba program (brown sugar, Thai tea, taro, classic) with $0.75 toppings. Coffee bar (americano, latte, macchiato, white drip, mocha, espresso slush). Also serves smoothies and carries groceries. Yesler hours: Mon-Fri 7am-8pm, Sat-Sun 8am-8pm.',
    unique_differentiator: 'The Bagel Banh Mi is the category-defining fusion item — nobody else in Seattle is doing this cross-cultural sandwich at scale. Combined with the market-meets-café format (groceries + hot food + boba + coffee all under one roof) and the Yesler Terrace commuter angle, Yellowbee has a genuine "only place like it" story.',
    competitors: null,
    main_offerings: 'Bagel banh mi (4 bagel types × multiple proteins). Traditional banh mi (grilled pork, beef brisket + short rib, grilled chicken, vegan options). Boba / milk tea. Coffee bar (full espresso program). Smoothies (strawberry, mango, lychee, avocado). Groceries + grab-and-go snacks.',
    tone_tags: ['Quick', 'Friendly', 'Local', 'Fusion-forward', 'Welcoming', 'Modern'],
    custom_tone: 'Tagline: "Quick, convenient, and delicious." Voice is neighborhood-friendly — think deli vibes, not fancy-restaurant vibes. Lean into the bagel banh mi as the breakout creative. Show the range — groceries + hot food + boba + coffee all in one place.',
    content_type_tags: ['Bagel banh mi build', 'Boba preparation', 'Coffee pour', 'Grocery feature', 'Vegan option highlight', 'Yesler neighborhood'],
    full_address: '922 East Yesler Way',
    city: 'Seattle',
    state: 'WA',
    zip: '98122',
    website_url: 'https://www.shopyellowbee.com',
    business_phone: null,
    location_count: '2',
    hours: {
      monday: '7am-8pm', tuesday: '7am-8pm', wednesday: '7am-8pm', thursday: '7am-8pm',
      friday: '7am-8pm', saturday: '8am-8pm', sunday: '8am-8pm',
      note: 'Yesler hours shown. Mountlake Terrace hours not published.',
    },
    brand_color_primary: '#FDD427',
    brand_color_secondary: '#2A6049',
    logo_url: 'https://static.wixstatic.com/media/5761ee_9192fe2bacfb4faea4018ad077ee71e9~mv2.png/v1/fill/w_170,h_56,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/HORIZONTAL%20YELLOW%20BEE%20OFFICIAL%20LOGO%201.png',
  },
  brand: {
    primary_color: '#FDD427',
    secondary_color: '#2A6049',
    accent_color: '#FFFFFF',
    font_display: 'Helvetica Bold',
    font_body: 'Arial',
    logo_url: 'https://static.wixstatic.com/media/5761ee_9192fe2bacfb4faea4018ad077ee71e9~mv2.png/v1/fill/w_170,h_56,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/HORIZONTAL%20YELLOW%20BEE%20OFFICIAL%20LOGO%201.png',
    visual_style: 'bold_colorful',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Quick + friendly + neighborhood. "Quick, convenient, and delicious." Bagel banh mi is the creative breakout — lean on it. Deli-voice, not fancy-restaurant voice.',
    photo_style: 'Bagel banh mi cross-sections — bread + protein + herbs layered. Counter + menu board shots. Boba pour + coffee pour. Grab-and-go moments, bagged orders. Bright yellow-forward palette matching brand.',
  },
}

/* -----------------------------------------------------------------
 * 8. Apnosh (internal — agency's own record)
 * ---------------------------------------------------------------*/
const apnosh: ClientPopulate = {
  name: 'Apnosh',
  clientsRow: {
    website: null,
    email: 'admin@apnosh.com',
    billing_email: 'admin@apnosh.com',
    phone: null,
    location: 'Seattle, WA',
    industry: 'Internal · Apnosh agency',
    socials: {},
  },
  folders: [
    { id: '1G5ShEcUSyH8__UCv1up', label: 'Content delivery (internal)' },
    { id: '1rz8IQ-_ck8dDdVmLZ0P', label: 'Apnosh Resources' },
    { id: '1A6wKtFeARStKqCdcpLP', label: 'Apnosh (main)' },
    { id: '1xyHzY5JsWRX3VGEezPV', label: 'Apnosh Documents' },
    { id: '1gj-piD6F03JwAeP83CY', label: 'Apnosh BTS' },
    { id: '1aJfDTMpXNLIMFMNNoJi', label: 'Apnosh Photoshoot' },
    { id: '148T_2OWdnJzoiETZsif', label: 'Apnosh (Internal) Website' },
  ],
  profile: {
    primary_goal: 'Apnosh itself — internal record. Track agency\'s own marketing efforts alongside client records so the portal stays coherent.',
    goal_detail: 'This is the agency\'s own entry. Use it to prototype features, run the same content/performance/billing workflows on ourselves, and eat our own dog food as the portal matures.',
    timeline: null,
    success_signs: ['Portal fully dogfooded by Apnosh team first'],
    customer_types: ['Apnosh team'],
    why_choose: [],
    business_type: 'Agency',
    cuisine: null,
    service_styles: ['Content production', 'Social strategy', 'Website', 'Local SEO / GBP'],
    business_description: 'Apnosh is a Seattle-based content + social agency for restaurants. This is the agency\'s own client record — used to test flows, host internal resources, and dogfood the portal as it\'s built.',
    unique_differentiator: null,
    competitors: null,
    main_offerings: 'Content production (video + graphics), social media management, website + SEO, local SEO / Google Business Profile.',
    tone_tags: ['Internal'],
    custom_tone: null,
    content_type_tags: [],
    full_address: null,
    city: 'Seattle',
    state: 'WA',
    zip: null,
    website_url: null,
    business_phone: null,
    location_count: null,
    hours: null,
    brand_color_primary: null,
    brand_color_secondary: null,
    logo_url: null,
  },
  brand: {
    primary_color: null,
    secondary_color: null,
    accent_color: null,
    font_display: null,
    font_body: null,
    logo_url: null,
    visual_style: 'clean_minimal',
    depth_style: 'flat',
    edge_treatment: 'clean',
    texture_overlay: 'none',
    voice_notes: 'Internal record — Apnosh itself. Brand guidelines for the agency live elsewhere.',
    photo_style: null,
  },
}

/* -----------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------*/

async function populate(entry: ClientPopulate): Promise<void> {
  try {
    const id = await getClientId(entry.name)
    console.log(`\n━━━ ${entry.name} (${id.slice(0, 8)}) ━━━`)

    // 1) clients row
    const { data: c } = await s.from('clients').select('socials').eq('id', id).single()
    const merged = { ...entry.clientsRow, socials: { ...(c?.socials ?? {}), ...(entry.clientsRow.socials as object ?? {}) } }
    await s.from('clients').update(merged).eq('id', id)
    console.log('  ✅ clients row')

    // 2) folders
    if (entry.folders.length > 0) {
      await linkFolders(id, entry.folders)
      console.log(`  ✅ ${entry.folders.length} folder(s) linked`)
    } else {
      console.log('  — no Drive folders to link')
    }

    // 3) profile
    await s.from('client_profiles').upsert({ client_id: id, ...entry.profile }, { onConflict: 'client_id' })
    console.log('  ✅ client_profiles')

    // 4) brand
    await upsertBrand(id, entry.brand)
    console.log('  ✅ client_brands')
  } catch (e) {
    console.error(`  ❌ ${entry.name}:`, (e as Error).message)
  }
}

async function main() {
  const all: ClientPopulate[] = [
    bobaAfterHours, doSi, hkBistro, hkMarket,
    ijSushi, mrDimSum, yellowbee, apnosh,
  ]
  for (const entry of all) await populate(entry)
  console.log('\n🎉 All 8 clients populated.')
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
