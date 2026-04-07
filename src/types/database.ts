// ============================================================
// Apnosh Client Portal — Database Types
// ============================================================

// --- Enums ---

export type UserRole = 'client' | 'admin' | 'team_member'

export type OrderType = 'subscription' | 'one_time' | 'a_la_carte'
export type OrderStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'

export type DeliverableType = 'graphic' | 'video' | 'caption' | 'email' | 'website_page' | 'seo' | 'branding' | 'photography' | 'other'
export type DeliverableStatus = 'draft' | 'internal_review' | 'client_review' | 'revision_requested' | 'approved' | 'scheduled' | 'published'

export type BriefStatus = 'pending' | 'assigned' | 'in_progress' | 'completed'

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing'

export type AssetType = 'logo' | 'photo' | 'video' | 'font' | 'guideline' | 'color_palette' | 'other'

export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'twitter' | 'youtube' | 'google_business' | 'website'

export type NotificationType = 'approval_needed' | 'deliverable_ready' | 'order_confirmed' | 'message' | 'report_ready' | 'payment' | 'system'

// --- User Profile (extends Supabase Auth user) ---

export interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  created_at: string
  updated_at: string
}

// --- Business ---

export interface Business {
  id: string
  owner_id: string
  name: string
  industry: string
  description?: string
  website_url?: string
  phone?: string
  locations: BusinessLocation[]
  hours?: string
  // Legal / Entity (migration 002)
  legal_business_name?: string
  dba_name?: string
  entity_type?: EntityType
  primary_contact_name?: string
  primary_contact_email?: string
  primary_contact_phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  client_status?: ClientStatus
  // Brand Identity
  brand_voice_words: string[] // 3 adjectives
  brand_tone?: string
  brand_do_nots?: string
  brand_colors: { primary?: string; secondary?: string; [key: string]: string | undefined }
  fonts?: string
  style_notes?: string
  // Target Audience
  target_audience?: string
  target_age_range?: string
  target_location?: string
  target_problem?: string
  // Competitors
  competitors: Competitor[]
  competitor_strengths?: string
  differentiator?: string
  // Marketing Context
  current_platforms: string[]
  posting_frequency?: string
  has_google_business?: boolean
  monthly_budget?: number
  past_marketing_wins?: string
  past_marketing_fails?: string
  // Goals & Preferences
  marketing_goals: string[]
  content_topics?: string
  content_avoid_topics?: string
  additional_notes?: string
  // Seasonal
  seasonal_calendar?: SeasonalEvent[]
  // Metadata
  onboarding_completed: boolean
  onboarding_step: number
  created_at: string
  updated_at: string
}

export interface BusinessLocation {
  address: string
  city: string
  state: string
  zip: string
  is_primary: boolean
}

export interface Competitor {
  name: string
  website_url?: string
}

export interface SeasonalEvent {
  name: string
  month: number
  description?: string
}

// --- Brand Assets ---

export interface BrandAsset {
  id: string
  business_id: string
  type: AssetType
  file_url: string
  thumbnail_url?: string
  file_name: string
  file_size: number
  tags: string[]
  uploaded_at: string
}

// --- Platform Connections ---

export interface PlatformConnection {
  id: string
  business_id: string
  platform: Platform
  profile_url?: string
  username?: string
  access_token?: string // encrypted
  refresh_token?: string // encrypted
  connected_at: string
  expires_at?: string
}

// --- Subscriptions ---

export interface Subscription {
  id: string
  business_id: string
  plan_id: string
  plan_name: string
  plan_price: number
  billing_interval: 'monthly' | 'annually'
  status: SubscriptionStatus
  stripe_subscription_id?: string
  stripe_customer_id?: string
  started_at: string
  current_period_start: string
  current_period_end: string
  cancelled_at?: string
}

// --- Orders ---

export interface Order {
  id: string
  business_id: string
  type: OrderType
  service_id?: string
  service_name: string
  quantity: number
  unit_price: number
  total_price: number
  status: OrderStatus
  special_instructions?: string
  deadline?: string
  stripe_payment_intent_id?: string
  created_at: string
  updated_at: string
}

// --- Work Briefs (auto-generated) ---

export interface WorkBrief {
  id: string
  order_id: string
  business_id: string
  brief_content: BriefContent
  assigned_to?: string // team member user ID
  assigned_to_name?: string
  status: BriefStatus
  created_at: string
  updated_at: string
}

export interface BriefContent {
  // Business context (auto-populated from Business profile)
  business_name: string
  industry: string
  brand_voice: string[]
  brand_tone?: string
  brand_do_nots?: string
  target_audience?: string
  // Order specifics
  service_type: string
  deliverable_description: string
  quantity: number
  // Content direction
  content_topics?: string
  caption_preferences?: string
  hashtag_guidelines?: string
  cta_preferences?: string
  // Platform specs
  platforms: string[]
  dimensions?: string
  format_requirements?: string
  // Reference
  past_top_content?: string[]
  competitor_examples?: string[]
  // Logistics
  deadline?: string
  special_instructions?: string
  standing_instructions?: string
}

// --- Deliverables ---

export interface Deliverable {
  id: string
  work_brief_id: string
  business_id: string
  type: DeliverableType
  title: string
  description?: string
  content: DeliverableContent
  file_urls: string[]
  preview_urls: string[]
  version: number
  status: DeliverableStatus
  client_feedback?: string
  revision_notes?: string
  approved_at?: string
  approved_by?: string
  created_at: string
  updated_at: string
}

export interface DeliverableContent {
  caption?: string
  hashtags?: string[]
  platform?: Platform
  dimensions?: string
  alt_text?: string
  scheduled_time?: string
  [key: string]: unknown
}

// --- Content Calendar ---

export interface ContentCalendarEntry {
  id: string
  business_id: string
  deliverable_id?: string
  platform: Platform
  title: string
  caption?: string
  scheduled_at: string
  published_at?: string
  post_url?: string
  engagement_metrics?: EngagementMetrics
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  created_at: string
}

export interface EngagementMetrics {
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  reach?: number
  impressions?: number
  clicks?: number
}

// --- Messages ---

export interface Message {
  id: string
  business_id: string
  thread_id: string
  sender_id: string
  sender_name: string
  sender_role: UserRole
  content: string
  attachments: MessageAttachment[]
  read_at?: string
  created_at: string
}

export interface MessageAttachment {
  file_url: string
  file_name: string
  file_type: string
  file_size: number
}

export interface MessageThread {
  id: string
  business_id: string
  subject: string
  order_id?: string
  last_message_at: string
  created_at: string
}

// --- Analytics Snapshots ---

export interface AnalyticsSnapshot {
  id: string
  business_id: string
  platform: Platform
  date: string
  metrics: PlatformMetrics
  created_at: string
}

export interface PlatformMetrics {
  followers?: number
  followers_change?: number
  reach?: number
  impressions?: number
  engagement_rate?: number
  posts_count?: number
  top_post_url?: string
  website_clicks?: number
  profile_visits?: number
  [key: string]: unknown
}

// --- Notifications ---

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  link?: string
  read_at?: string
  created_at: string
}

// --- Service Catalog ---

export interface ServiceCatalog {
  id: string
  name: string
  category: 'marketing' | 'websites_seo' | 'creative' | 'strategy'
  description: string
  short_description: string
  price: number
  price_unit: 'per_month' | 'per_item' | 'per_hour' | 'one_time'
  features: string[]
  is_subscription: boolean
  is_active: boolean
  sort_order: number
}

// --- Entity Types ---

export type EntityType = 'llc' | 'corp' | 's_corp' | 'sole_prop' | 'partnership' | 'nonprofit' | 'other'
export type ClientStatus = 'pending_agreement' | 'agreement_sent' | 'agreement_signed' | 'active' | 'paused' | 'offboarded'
export type AgreementType = 'master_service_agreement' | 'scope_amendment' | 'addendum'
export type AgreementStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
export type ActivityActionType =
  | 'agreement_sent' | 'agreement_viewed' | 'agreement_signed'
  | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue'
  | 'scope_change' | 'note_added' | 'status_change'
  | 'client_created' | 'onboarding_completed'

// --- Agreement Templates ---

export interface AgreementTemplate {
  id: string
  name: string
  type: AgreementType
  version: number
  content: string
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

// --- Agreements ---

export interface Agreement {
  id: string
  business_id: string
  agreement_type: AgreementType
  version_number: number
  status: AgreementStatus
  template_id?: string
  custom_fields: Record<string, string>
  rendered_content?: string
  sent_at?: string
  viewed_at?: string
  signed_at?: string
  signed_by_name?: string
  signed_by_email?: string
  signed_by_ip?: string
  expires_at?: string
  pdf_url?: string
  docusign_envelope_id?: string
  created_at: string
  updated_at: string
  // Joined fields
  business?: Business
}

// --- Client Activity Log ---

export interface ClientActivityEntry {
  id: string
  business_id: string
  action_type: ActivityActionType
  description: string
  performed_by?: string
  metadata: Record<string, unknown>
  created_at: string
}

// --- Client Notes ---

export interface ClientNote {
  id: string
  business_id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
  updated_at: string
}

// --- Client Documents ---

export interface ClientDocument {
  id: string
  business_id: string
  name: string
  file_url: string
  file_type?: string
  file_size?: number
  uploaded_by?: string
  created_at: string
}

// --- Enhanced Invoice (with line items) ---

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface EnhancedInvoice {
  id: string
  business_id: string
  agreement_id?: string
  stripe_invoice_id?: string
  invoice_number?: string
  amount: number
  tax_amount: number
  total?: number
  status: string
  description?: string
  invoice_url?: string
  invoice_pdf?: string
  due_date?: string
  paid_at?: string
  payment_method?: string
  line_items: InvoiceLineItem[]
  notes?: string
  created_at: string
  // Joined
  business?: Business
}

// --- GBP Analytics ---

export type GBPMetricField =
  | 'search_mobile' | 'search_desktop'
  | 'maps_mobile' | 'maps_desktop'
  | 'calls' | 'messages' | 'bookings' | 'directions'
  | 'website_clicks' | 'food_orders' | 'food_menu_clicks'
  | 'hotel_bookings'

export const GBP_METRIC_LABELS: Record<GBPMetricField, string> = {
  search_mobile: 'Search (Mobile)',
  search_desktop: 'Search (Desktop)',
  maps_mobile: 'Maps (Mobile)',
  maps_desktop: 'Maps (Desktop)',
  calls: 'Phone Calls',
  messages: 'Messages',
  bookings: 'Bookings',
  directions: 'Direction Requests',
  website_clicks: 'Website Clicks',
  food_orders: 'Food Orders',
  food_menu_clicks: 'Menu Clicks',
  hotel_bookings: 'Hotel Bookings',
}

export const GBP_METRIC_ICONS: Record<GBPMetricField, string> = {
  search_mobile: '🔍',
  search_desktop: '🖥️',
  maps_mobile: '📱',
  maps_desktop: '🗺️',
  calls: '📞',
  messages: '💬',
  bookings: '📅',
  directions: '📍',
  website_clicks: '🌐',
  food_orders: '🍽️',
  food_menu_clicks: '📋',
  hotel_bookings: '🏨',
}

export interface GBPMonthlyData {
  id: string
  business_id: string
  month: number
  year: number
  search_mobile: number
  search_desktop: number
  maps_mobile: number
  maps_desktop: number
  calls: number
  messages: number
  bookings: number
  directions: number
  website_clicks: number
  food_orders: number
  food_menu_clicks: number
  hotel_bookings: number
  created_at: string
}

export interface AgencySettings {
  id: string
  agency_name: string
  logo_url: string | null
  contact_name: string | null
  contact_email: string | null
  website_url: string | null
  report_defaults: {
    showPerformanceHighlights: boolean
    showAreasOfAttention: boolean
    showNextSteps: boolean
    showSeoRecommendations: boolean
    showCharts: boolean
  }
  preferences: {
    activeMetrics: GBPMetricField[]
    defaultPeriod: number
  }
  created_at: string
  updated_at: string
}

export interface AiAnalysis {
  summary: string
  whatsWorking: { metric: string; insight: string; action: string }[]
  areasOfConcern: { metric: string; observation: string; possibleReasons: string; action: string }[]
  nextSteps: { priority: string; action: string; why: string; expectedImpact: string }[]
  anomalies: { metric: string; observation: string; likelyCause: string; recommendation: string }[]
  benchmarkContext: string
  seoRecommendations?: {
    summary: string
    items: { title: string; description: string; priority: string }[]
  }
}

export interface GBPColumnMapping {
  [excelColumn: string]: GBPMetricField | '__skip'
}

// --- Brand Guidelines ---

export type GuidelineStatus = 'current' | 'draft' | 'archived'
export type GuidelineSource = 'auto' | 'uploaded' | 'manual' | 'revised'

export interface BrandOverviewSection {
  mission?: string
  story?: string
  what_we_do?: string
  tagline?: string
}

export interface VisualIdentitySection {
  primary_color?: string
  secondary_color?: string
  accent_colors?: string[]
  fonts?: { primary?: string; secondary?: string; body?: string }
  logo_usage_notes?: string
  imagery_style?: string
}

export interface VoiceAndToneSection {
  voice_words?: { word: string; description: string; examples: string[] }[]
  tone_description?: string
  sample_phrases?: string[]
  sample_ctas?: string[]
  do_nots?: string[]
}

export interface AudienceProfileSection {
  persona?: string
  age_range?: string
  location?: string
  pain_points?: string[]
  motivations?: string[]
  where_they_hang_out?: string
}

export interface CompetitivePositioningSection {
  positioning_statement?: string
  differentiators?: string[]
  competitor_awareness?: string
  unique_value?: string
}

export interface ContentGuidelinesSection {
  topics?: string[]
  avoid_topics?: string[]
  posting_frequency?: string
  best_platforms?: string[]
  content_pillars?: string[]
}

export interface CustomSection {
  id: string
  title: string
  content: string
}

export interface BrandGuideline {
  id: string
  business_id: string
  version: number
  status: GuidelineStatus
  source: GuidelineSource
  uploaded_file_url?: string | null
  brand_overview: BrandOverviewSection
  visual_identity: VisualIdentitySection
  voice_and_tone: VoiceAndToneSection
  audience_profile: AudienceProfileSection
  competitive_positioning: CompetitivePositioningSection
  content_guidelines: ContentGuidelinesSection
  seasonal_calendar: Record<string, unknown>
  custom_sections: CustomSection[]
  ai_generated_sections: string[]
  created_at: string
  updated_at: string
}
