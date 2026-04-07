/**
 * Seed Script — Populates Supabase with sample data for testing
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Creates:
 * - 1 admin user (admin@apnosh.com)
 * - 3 client users with businesses (restaurant, boutique, fitness)
 * - Sample orders, deliverables, and content calendar entries per business
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aW9tY3dmY2l4Zm94YmxrYWp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTAyMjAyNSwiZXhwIjoyMDkwNTk4MDI1fQ.g3TvlLeYoayV96rrV0ZGWlOCOw5PDF0iFXA5AueRkfU'

if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Helpers ──

async function upsertUser(email: string, password: string, fullName: string, role: 'admin' | 'client') {
  // Check if user exists
  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing?.users?.find(u => u.email === email)

  let userId: string
  if (found) {
    userId = found.id
    console.log(`  User exists: ${email} (${userId})`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) { console.error(`  Failed to create ${email}:`, error.message); return null }
    userId = data.user.id
    console.log(`  Created user: ${email} (${userId})`)
  }

  // Update profile role
  await supabase.from('profiles').upsert({
    id: userId, email, full_name: fullName, role,
  }, { onConflict: 'id' })

  return userId
}

async function upsertBusiness(ownerId: string, biz: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', ownerId)
    .single()

  if (existing) {
    console.log(`  Business exists for owner ${ownerId}`)
    return existing.id
  }

  const { data, error } = await supabase
    .from('businesses')
    .insert({ ...biz, owner_id: ownerId })
    .select('id')
    .single()

  if (error) { console.error('  Failed to create business:', error.message); return null }
  console.log(`  Created business: ${biz.name} (${data.id})`)
  return data.id
}

// ── Main ──

async function seed() {
  console.log('\n🌱 Seeding Apnosh Portal...\n')

  // ── 1. Admin user ──
  console.log('1. Admin user')
  await upsertUser('admin@apnosh.com', 'passwordtest', 'Mark Butler', 'admin')

  // ── 2. Client users + businesses ──
  console.log('\n2. Client users & businesses')

  const clients = [
    {
      email: 'bella@bellasbistro.com', password: 'testpass123', name: 'Bella Romano',
      business: {
        name: "Bella's Bistro",
        industry: 'restaurant',
        description: 'Italian-American neighborhood bistro known for handmade pasta and wood-fired pizza. Family-owned since 2019.',
        website_url: 'https://bellasbistro.com',
        phone: '(312) 555-0101',
        locations: 1,
        brand_voice_words: 'Warm, inviting, family-oriented. Think Sunday dinner at Nonna\'s house.',
        brand_tone: 'Casual but polished. Friendly, never corporate.',
        brand_colors: JSON.stringify(['#8B4513', '#F5DEB3', '#2F4F2F']),
        target_age_range: '25-55',
        target_location: 'Lincoln Park, Chicago',
        current_platforms: JSON.stringify(['instagram', 'facebook', 'google_business']),
        monthly_budget: 500,
        marketing_goals: JSON.stringify(['Increase weekend reservations', 'Grow Instagram following', 'Improve Google Maps ranking']),
        onboarding_completed: true,
        onboarding_step: 6,
      }
    },
    {
      email: 'sarah@threadandneedle.com', password: 'testpass123', name: 'Sarah Kim',
      business: {
        name: 'Thread & Needle',
        industry: 'retail',
        description: 'Modern boutique offering curated sustainable fashion and accessories. Focus on local and independent designers.',
        website_url: 'https://threadandneedle.com',
        phone: '(312) 555-0202',
        locations: 2,
        brand_voice_words: 'Sophisticated, conscious, trend-aware. Sustainable fashion without compromise.',
        brand_tone: 'Elegant and approachable. Never preachy about sustainability.',
        brand_colors: JSON.stringify(['#2C2C2C', '#E8D5B7', '#7B9E87']),
        target_age_range: '22-40',
        target_location: 'Wicker Park & Bucktown, Chicago',
        current_platforms: JSON.stringify(['instagram', 'tiktok', 'facebook']),
        monthly_budget: 800,
        marketing_goals: JSON.stringify(['Drive online sales', 'Build brand awareness', 'Grow email list to 5000']),
        onboarding_completed: true,
        onboarding_step: 6,
      }
    },
    {
      email: 'marcus@peakfit.com', password: 'testpass123', name: 'Marcus Chen',
      business: {
        name: 'Peak Fitness Studio',
        industry: 'fitness',
        description: 'Boutique fitness studio offering HIIT, yoga, and strength classes. Focused on community and personal transformation.',
        website_url: 'https://peakfitstudio.com',
        phone: '(312) 555-0303',
        locations: 1,
        brand_voice_words: 'Energetic, motivating, inclusive. Strong but not intimidating.',
        brand_tone: 'High energy, encouraging. Celebrates effort over perfection.',
        brand_colors: JSON.stringify(['#FF6B35', '#1A1A2E', '#E8E8E8']),
        target_age_range: '25-45',
        target_location: 'River North, Chicago',
        current_platforms: JSON.stringify(['instagram', 'tiktok', 'youtube']),
        monthly_budget: 600,
        marketing_goals: JSON.stringify(['Fill morning class slots', 'Reduce membership churn', 'Launch online classes']),
        onboarding_completed: true,
        onboarding_step: 6,
      }
    },
  ]

  const businessIds: string[] = []

  for (const c of clients) {
    const userId = await upsertUser(c.email, c.password, c.name, 'client')
    if (!userId) continue
    const bizId = await upsertBusiness(userId, c.business)
    if (bizId) businessIds.push(bizId)
  }

  // ── 3. Sample orders per business ──
  console.log('\n3. Sample orders')

  const orderTemplates = [
    { service_name: 'Social Media Essentials', type: 'subscription', status: 'confirmed', unit_price: 199 },
    { service_name: 'Local SEO Starter', type: 'subscription', status: 'confirmed', unit_price: 149 },
    { service_name: 'Website Design (Standard)', type: 'one_time', status: 'completed', unit_price: 1299 },
  ]

  for (const bizId of businessIds) {
    for (const tmpl of orderTemplates) {
      const { error } = await supabase.from('orders').insert({
        business_id: bizId,
        service_name: tmpl.service_name,
        type: tmpl.type,
        status: tmpl.status,
        unit_price: tmpl.unit_price,
        total_price: tmpl.unit_price,
      })
      if (error) console.error(`  Order error (${tmpl.service_name}):`, error.message)
    }
    console.log(`  Created 3 orders for business ${bizId}`)
  }

  // ── 4. Sample deliverables per business ──
  console.log('\n4. Sample deliverables')

  const deliverableTemplates = [
    { title: 'March Instagram Post #1', type: 'graphic', status: 'published' },
    { title: 'March Instagram Post #2', type: 'graphic', status: 'approved' },
    { title: 'Weekly Email Newsletter', type: 'email', status: 'client_review' },
    { title: 'Google Business Profile Update', type: 'seo', status: 'internal_review' },
    { title: 'April Content Calendar', type: 'other', status: 'draft' },
  ]

  for (const bizId of businessIds) {
    for (const tmpl of deliverableTemplates) {
      const { error } = await supabase.from('deliverables').insert({
        business_id: bizId,
        title: tmpl.title,
        type: tmpl.type,
        status: tmpl.status,
      })
      if (error) console.error(`  Deliverable error (${tmpl.title}):`, error.message)
    }
    console.log(`  Created 5 deliverables for business ${bizId}`)
  }

  // ── 5. Sample content calendar entries ──
  console.log('\n5. Content calendar')

  const now = new Date()
  const calendarTemplates = [
    { title: 'Behind the Scenes Reel', platform: 'instagram', status: 'scheduled' },
    { title: 'Customer Spotlight Post', platform: 'instagram', status: 'scheduled' },
    { title: 'Weekly Promo Story', platform: 'instagram', status: 'draft' },
    { title: 'Google Business Post', platform: 'google_business', status: 'published' },
    { title: 'Email Campaign: Spring Special', platform: 'website', status: 'scheduled' },
    { title: 'Facebook Event Promo', platform: 'facebook', status: 'draft' },
  ]

  for (const bizId of businessIds) {
    for (let i = 0; i < calendarTemplates.length; i++) {
      const tmpl = calendarTemplates[i]
      const date = new Date(now)
      date.setDate(date.getDate() + i * 2)
      const { error } = await supabase.from('content_calendar').insert({
        business_id: bizId,
        title: tmpl.title,
        platform: tmpl.platform,
        status: tmpl.status,
        scheduled_at: date.toISOString(),
      })
      if (error) console.error(`  Calendar error (${tmpl.title}):`, error.message)
    }
    console.log(`  Created 6 calendar entries for business ${bizId}`)
  }

  // ── 6. Sample GBP data for first business ──
  console.log('\n6. GBP analytics data')
  if (businessIds[0]) {
    const months = [
      { month: 10, year: 2025, search_mobile: 1200, search_desktop: 800, maps_mobile: 950, maps_desktop: 400, calls: 45, messages: 12, bookings: 28, directions: 67, website_clicks: 134, food_orders: 23, food_menu_clicks: 89, hotel_bookings: 0 },
      { month: 11, year: 2025, search_mobile: 1350, search_desktop: 870, maps_mobile: 1100, maps_desktop: 450, calls: 52, messages: 18, bookings: 35, directions: 78, website_clicks: 156, food_orders: 31, food_menu_clicks: 102, hotel_bookings: 0 },
      { month: 12, year: 2025, search_mobile: 1580, search_desktop: 920, maps_mobile: 1250, maps_desktop: 520, calls: 61, messages: 22, bookings: 42, directions: 91, website_clicks: 178, food_orders: 38, food_menu_clicks: 118, hotel_bookings: 0 },
      { month: 1, year: 2026, search_mobile: 1100, search_desktop: 750, maps_mobile: 880, maps_desktop: 380, calls: 38, messages: 14, bookings: 25, directions: 58, website_clicks: 121, food_orders: 19, food_menu_clicks: 76, hotel_bookings: 0 },
      { month: 2, year: 2026, search_mobile: 1280, search_desktop: 840, maps_mobile: 1020, maps_desktop: 430, calls: 48, messages: 16, bookings: 32, directions: 72, website_clicks: 145, food_orders: 27, food_menu_clicks: 94, hotel_bookings: 0 },
      { month: 3, year: 2026, search_mobile: 1450, search_desktop: 910, maps_mobile: 1180, maps_desktop: 490, calls: 55, messages: 20, bookings: 38, directions: 85, website_clicks: 167, food_orders: 34, food_menu_clicks: 108, hotel_bookings: 0 },
    ]

    for (const m of months) {
      const { error } = await supabase.from('gbp_monthly_data').upsert({
        business_id: businessIds[0], ...m,
      }, { onConflict: 'business_id,month,year' })
      if (error) console.error(`  GBP error (${m.month}/${m.year}):`, error.message)
    }
    console.log(`  Created 6 months of GBP data for Bella's Bistro`)
  }

  console.log('\n✅ Seed complete!\n')
  console.log('Test accounts:')
  console.log('  Admin:  admin@apnosh.com / passwordtest')
  console.log('  Client: bella@bellasbistro.com / testpass123')
  console.log('  Client: sarah@threadandneedle.com / testpass123')
  console.log('  Client: marcus@peakfit.com / testpass123')
  console.log('')
}

seed().catch(console.error)
