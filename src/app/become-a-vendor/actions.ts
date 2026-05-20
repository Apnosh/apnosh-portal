'use server'

/**
 * Public vendor/freelancer application handler. No auth required —
 * anyone can submit. Goes into vendor_applications for admin review.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ApplicationInput {
  applicantType: 'individual' | 'company'
  displayName: string
  email: string
  phone?: string
  categories: string[]
  serviceArea: string[]
  portfolioUrl?: string
  socialHandle?: string
  sampleWorkUrls: string[]
  pitch: string
  typicalRate?: string
  restaurantExperienceYears?: number
}

const ALLOWED_CATEGORIES = new Set([
  'food_influencer','photographer','videographer','graphic_designer',
  'web_designer','social_manager','local_seo','email_marketer',
  'pr_specialist','strategist','full_service_agency','other',
])

export async function submitVendorApplication(
  input: ApplicationInput,
): Promise<{ ok: boolean; error?: string }> {
  /* Basic validation. Keep error messages friendly. */
  if (!input.displayName?.trim()) return { ok: false, error: 'Please tell us your name' }
  if (!input.email?.includes('@')) return { ok: false, error: 'Please enter a valid email' }
  if (!input.pitch?.trim() || input.pitch.length < 20) {
    return { ok: false, error: 'Please tell us a bit more about what you do (20+ characters)' }
  }
  if (input.categories.length === 0) {
    return { ok: false, error: 'Pick at least one service category' }
  }
  const invalidCat = input.categories.find(c => !ALLOWED_CATEGORIES.has(c))
  if (invalidCat) return { ok: false, error: `Unknown category: ${invalidCat}` }

  const admin = createAdminClient()
  const { error } = await admin.from('vendor_applications').insert({
    applicant_type: input.applicantType,
    display_name: input.displayName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    categories: input.categories,
    service_area: input.serviceArea.length > 0 ? input.serviceArea : ['WA'],
    portfolio_url: input.portfolioUrl?.trim() || null,
    social_handle: input.socialHandle?.trim() || null,
    sample_work_urls: input.sampleWorkUrls.filter(u => u.trim().length > 0),
    pitch: input.pitch.trim(),
    typical_rate: input.typicalRate?.trim() || null,
    restaurant_experience_years: input.restaurantExperienceYears ?? null,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
