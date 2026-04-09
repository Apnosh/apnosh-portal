import type { ServiceArea } from '@/types/database'

/**
 * Maps friendly service names stored in clients.services_active
 * to the ServiceArea enum used by the dashboard nav + content_queue.
 *
 * Admin can add any of these names to a client's services_active array.
 * Comparison is case-insensitive.
 */
const SERVICE_NAME_TO_AREA: Record<string, ServiceArea> = {
  // Social Media
  'social media': 'social',
  'social': 'social',
  'social media management': 'social',
  'content': 'social', // legacy "Content" from seed data implies social content
  'social content': 'social',
  // Website
  'website': 'website',
  'website management': 'website',
  'web': 'website',
  // Local SEO / GBP
  'local seo': 'local_seo',
  'local business': 'local_seo',
  'local business & seo': 'local_seo',
  'google business profile': 'local_seo',
  'gbp': 'local_seo',
  'seo': 'local_seo',
  // Email / SMS
  'email': 'email_sms',
  'email marketing': 'email_sms',
  'email & sms': 'email_sms',
  'sms': 'email_sms',
  'email sms': 'email_sms',
}

/**
 * Determine which service areas a client is enrolled in based on services_active.
 * Returns a Set<ServiceArea> for fast lookup.
 *
 * If services_active is empty, returns ALL services (default open for legacy clients
 * that haven't had their services configured yet).
 */
export function resolveEnrolledServices(servicesActive: string[] | null | undefined): Set<ServiceArea> {
  if (!servicesActive || servicesActive.length === 0) {
    return new Set<ServiceArea>(['social', 'website', 'local_seo', 'email_sms'])
  }

  const enrolled = new Set<ServiceArea>()
  for (const name of servicesActive) {
    const key = name.trim().toLowerCase()
    const area = SERVICE_NAME_TO_AREA[key]
    if (area) enrolled.add(area)
  }

  // If nothing matched (client has services set but none map), fall back to open
  // so the portal is still usable. Admin can fix by updating services_active.
  if (enrolled.size === 0) {
    return new Set<ServiceArea>(['social', 'website', 'local_seo', 'email_sms'])
  }

  return enrolled
}

/**
 * Check if a specific service area is enrolled for the given client.
 */
export function hasService(
  servicesActive: string[] | null | undefined,
  area: ServiceArea,
): boolean {
  return resolveEnrolledServices(servicesActive).has(area)
}

/**
 * Human-friendly names for service areas.
 */
export const SERVICE_AREA_LABELS: Record<ServiceArea, string> = {
  social: 'Social Media',
  website: 'Website',
  local_seo: 'Local Business & SEO',
  email_sms: 'Email & SMS',
}
