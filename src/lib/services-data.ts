// ---------------------------------------------------------------------------
// Services data — sourced from the website's services-data.json
// This is the single source of truth shared with apnosh.com
// To update: replace src/data/services-data.json with the latest from the website
// ---------------------------------------------------------------------------

import websiteData from '@/data/services-data.json'
import packagesData from '@/data/packages-data.json'

// ── Types ──────────────────────────────────────────────────────────────

export type PriceUnit = 'per_month' | 'per_item' | 'per_hour' | 'one_time'

export type ServiceCategory =
  | 'Marketing'
  | 'Video & Photo'
  | 'Websites & SEO'
  | 'Email & SMS'
  | 'Creative'
  | 'Automations'
  | 'Strategy'

export interface Service {
  id: string
  name: string
  category: ServiceCategory
  description: string
  shortDescription: string
  price: number
  priceUnit: PriceUnit
  features: string[]
  includes: string[]
  isSubscription: boolean
  popular: boolean
  /** Annual price (for subscription services) */
  annualPrice?: number
  /** Setup timeline (for one-time services) */
  timeline?: string
  /** What the client receives */
  finalDeliverable?: string
  /** Parent service id from the website JSON */
  parentServiceId: string
  /** Tier id from the website JSON */
  tierId?: string
}

export interface IndustryPackage {
  name: string
  stage: string
  popular: boolean
  monthly: number
  setup: number
  services: string[]
  content: string[]
}

export interface Industry {
  id: string
  name: string
  icon: string
  packages: IndustryPackage[]
}

// ── Category mapping ───────────────────────────────────────────────────

const categoryMap: Record<string, ServiceCategory> = {
  marketing: 'Marketing',
  websites: 'Websites & SEO',
  seo: 'Websites & SEO',
  creative: 'Creative',
  automation: 'Automations',
  strategy: 'Strategy',
}

function mapCategory(websiteCategoryId: string, serviceType: string, serviceName: string): ServiceCategory {
  // Video and photo items from creative or marketing go into Video & Photo
  const isVideoPhoto =
    serviceName.toLowerCase().includes('video') ||
    serviceName.toLowerCase().includes('photo') ||
    serviceName.toLowerCase().includes('reel') ||
    serviceName.toLowerCase().includes('videography')

  if (isVideoPhoto && (websiteCategoryId === 'creative' || websiteCategoryId === 'marketing')) {
    // Only individual per-unit items, not subscription packages that include video
    if (serviceType === 'per-unit') return 'Video & Photo'
  }

  // Email & SMS from marketing
  if (serviceName.toLowerCase().includes('email') || serviceName.toLowerCase().includes('sms')) {
    return 'Email & SMS'
  }

  return categoryMap[websiteCategoryId] || 'Marketing'
}

function mapPriceUnit(type: string, unit?: string): PriceUnit {
  if (type === 'recurring') return 'per_month'
  if (type === 'one-time') return 'one_time'
  if (unit === 'hour') return 'per_hour'
  return 'per_item'
}

// ── Transform website JSON → portal services ───────────────────────────

function buildServices(): Service[] {
  const result: Service[] = []

  for (const svc of websiteData.services) {
    // Services with tiers (recurring or one-time)
    if (svc.tiers && svc.tiers.length > 0) {
      for (const tier of svc.tiers) {
        // Skip enterprise / custom-priced tiers
        if ((tier as Record<string, unknown>).isCustom) continue

        const isRecurring = svc.type === 'recurring'
        const monthly = (tier as Record<string, unknown>).monthly as number | undefined
        const annual = (tier as Record<string, unknown>).annual as number | undefined
        const oneTimePrice = (tier as Record<string, unknown>).oneTimePrice as number | undefined
        const price = isRecurring ? monthly : oneTimePrice

        if (!price) continue

        const category = mapCategory(svc.category, svc.type, svc.name)
        const tierFeatures = (tier as Record<string, unknown>).features as string[] | undefined
        const tierIncludes = (tier as Record<string, unknown>).includes as string[] | undefined
        const timeline = (tier as Record<string, unknown>).timeline as string | undefined
        const finalDeliverable = (tier as Record<string, unknown>).finalDeliverable as string | undefined

        result.push({
          id: tier.id,
          name: `${svc.name} ${tier.name}`,
          category,
          description: tierIncludes ? tierIncludes.join('. ') + '.' : svc.shortDesc,
          shortDescription: svc.shortDesc,
          price,
          priceUnit: isRecurring ? 'per_month' : 'one_time',
          features: tierFeatures || [],
          includes: tierIncludes || [],
          isSubscription: isRecurring,
          popular: tier.popular ?? false,
          annualPrice: annual,
          timeline,
          finalDeliverable,
          parentServiceId: svc.id,
          tierId: tier.id,
        })
      }
    }

    // Per-unit items (photography, video, graphic design, copywriting, consulting)
    if ((svc as Record<string, unknown>).items) {
      const items = (svc as Record<string, unknown>).items as Record<string, unknown>[]
      for (const item of items) {
        const pricePerUnit = item.pricePerUnit as number
        const unit = item.unit as string
        const itemIncludes = item.includes as string[] | undefined
        const finalDeliverable = item.finalDeliverable as string | undefined

        if (!pricePerUnit) continue

        const category = mapCategory(svc.category, 'per-unit', item.name as string)

        result.push({
          id: item.id as string,
          name: item.name as string,
          category,
          description: itemIncludes ? itemIncludes.join('. ') + '.' : (item.description as string) || svc.shortDesc,
          shortDescription: (item.description as string) || svc.shortDesc,
          price: pricePerUnit,
          priceUnit: mapPriceUnit('per-unit', unit),
          features: itemIncludes || [(item.description as string) || ''],
          includes: itemIncludes || [],
          isSubscription: false,
          popular: false,
          finalDeliverable,
          parentServiceId: svc.id,
        })
      }
    }
  }

  return result
}

// ── Exports ────────────────────────────────────────────────────────────

export const categories: ServiceCategory[] = [
  'Marketing',
  'Video & Photo',
  'Websites & SEO',
  'Email & SMS',
  'Creative',
  'Automations',
  'Strategy',
]

/** All individual services derived from the website JSON */
export const services: Service[] = buildServices()

/** Industry packages from the website */
export const industries: Industry[] = packagesData.industries as Industry[]

/** Annual discount label */
export const annualDiscount: string = packagesData.annualDiscount

/** Metadata */
export const dataVersion = websiteData.version
export const lastUpdated = websiteData.lastUpdated
