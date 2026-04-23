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

// --- Monthly Reports ---

export type ReportStatus = 'draft' | 'published'

export interface GBPHighlight {
  metric: string
  current: number
  previous: number
  change_pct: number
  insight: string
}

export interface ContentStats {
  delivered: number
  approved: number
  published: number
  revision_rate: number
  avg_turnaround_days: number
}

export interface TopPerformingContent {
  title: string
  platform: string
  metric_label: string
  metric_value: number
}

export interface ReportRecommendation {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

export interface MonthlyReport {
  id: string
  business_id: string
  month: number
  year: number
  title: string
  status: ReportStatus
  summary: string | null
  gbp_highlights: GBPHighlight[]
  content_stats: ContentStats
  top_performing: TopPerformingContent[]
  recommendations: ReportRecommendation[]
  custom_notes: string | null
  generated_by: string | null
  published_at: string | null
  viewed_at: string | null
  created_at: string
  updated_at: string
  // Joined
  business?: Business
}

// --- Content Production Pipeline ---

export type ContentType =
  | 'reel_storytelling' | 'reel_showcase' | 'reel_promo' | 'reel_general_ad'
  | 'carousel_premium' | 'carousel_standard' | 'carousel_basic'
  | 'static_post' | 'story' | 'blog' | 'email' | 'gbp_post'

export type ConceptStatus = 'idea' | 'selected' | 'briefed' | 'archived'
export type ConceptSource = 'ai' | 'manual' | 'client'
export type BriefPipelineStatus = 'draft' | 'approved' | 'in_production' | 'completed'
export type ShootStatus = 'planned' | 'confirmed' | 'completed' | 'cancelled'
export type PerformanceTier = 'top' | 'average' | 'below'

export interface ClientIntelligence {
  id: string
  business_id: string
  week_start: string
  trending_content: { topic: string; platform: string; relevance: string }[]
  competitor_activity: { competitor: string; action: string; notes: string }[]
  performance_insights: { metric: string; observation: string; suggestion: string }[]
  audience_signals: { signal: string; source: string; implication: string }[]
  generated_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface ContentPillar {
  id: string
  business_id: string
  name: string
  description: string | null
  example_topics: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ContentConcept {
  id: string
  business_id: string
  pillar_id: string | null
  title: string
  description: string | null
  content_type: ContentType
  platform: string | null
  status: ConceptStatus
  source: ConceptSource
  score: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  pillar?: ContentPillar
}

export interface ContentBrief {
  id: string
  business_id: string
  concept_id: string | null
  deliverable_id: string | null
  content_type: string
  title: string
  objective: string | null
  target_audience: string | null
  key_message: string | null
  hook: string | null
  call_to_action: string | null
  visual_direction: string | null
  copy_direction: string | null
  hashtags: string[]
  references: { url: string; description: string }[]
  technical_specs: Record<string, unknown>
  status: BriefPipelineStatus
  assigned_to: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface ShootPlan {
  id: string
  business_id: string
  shoot_date: string
  location: string | null
  duration_minutes: number
  shots: { brief_id: string; description: string; type: string; setup_notes: string }[]
  equipment_notes: string | null
  talent_notes: string | null
  status: ShootStatus
  created_at: string
  updated_at: string
}

export interface ContentPerformance {
  id: string
  business_id: string
  deliverable_id: string | null
  calendar_entry_id: string | null
  platform: string
  impressions: number
  reach: number
  engagement: number
  saves: number
  shares: number
  comments: number
  clicks: number
  engagement_rate: number | null
  performance_tier: PerformanceTier | null
  insights: string | null
  recorded_at: string
  created_at: string
}

export interface QAChecklist {
  id: string
  deliverable_id: string
  brand_voice_pass: boolean | null
  brand_voice_notes: string | null
  technical_specs_pass: boolean | null
  technical_specs_notes: string | null
  strategic_alignment_pass: boolean | null
  strategic_alignment_notes: string | null
  copy_accuracy_pass: boolean | null
  copy_accuracy_notes: string | null
  visual_quality_pass: boolean | null
  visual_quality_notes: string | null
  overall_pass: boolean | null
  reviewer_id: string | null
  reviewed_at: string | null
  created_at: string
}

// ============================================================
// Client Management + Social Post Generator
// ============================================================

export type ClientTier = 'Basic' | 'Standard' | 'Pro' | 'Internal'
export type ClientBillingStatus = 'active' | 'paused' | 'cancelled' | 'past_due'
export type ClientUserRole = 'owner' | 'manager' | 'contributor'
export type ClientUserStatus = 'invited' | 'active' | 'disabled'
export type AssetUploadedBy = 'admin' | 'client'
export type AssetQuality = 'hero' | 'good' | 'filler'
export type AssetOrientation = 'landscape' | 'portrait' | 'square'
export type AssetMood = 'moody_warm' | 'bright_airy' | 'dramatic' | 'casual' | 'minimal'
export type VisualStyle = 'glass_morphism' | 'clean_minimal' | 'bold_colorful' | 'photo_forward' | 'custom'
export type TextureOverlay = 'none' | 'grain' | 'paper' | 'noise'
export type DepthStyle = 'flat' | 'glass_morphism' | 'layered_shadows' | '3d_inspired'
export type EdgeTreatment = 'clean' | 'iridescent' | 'gradient_border' | 'none'
export type TemplateType = 'insight' | 'stat' | 'tip' | 'compare' | 'result' | 'photo' | 'custom'
export type PostPlatform = 'instagram' | 'tiktok' | 'linkedin'
export type PostSize = 'feed' | 'square' | 'story'
export type QueueStatus =
  | 'new'         // Client submitted, awaiting admin confirmation
  | 'confirmed'   // Admin confirmed; queued to start drafting
  | 'drafting'    // Admin actively working on it
  | 'in_review'   // Sent back to client for review
  | 'approved'    // Client approved
  | 'scheduled'   // Scheduled to post
  | 'posted'      // Posted live
  | 'cancelled'   // Cancelled (rejected / withdrawn)
export type QueueRequestType = 'client_request' | 'internal'
export type FeedbackType = 'approval' | 'revision' | 'comment'
export type StyleLibraryStatus = 'approved' | 'archived'
export type ClientAssetType = 'logo' | 'photo' | 'graphic' | 'social_proof' | 'other'

export type LeadSource =
  | 'referral' | 'inbound_web' | 'outbound' | 'event' | 'partnership' | 'other'

export type ContractTerm =
  | 'month_to_month' | 'quarterly' | 'annual' | 'custom'

export type ChurnReason =
  | 'price' | 'outcome' | 'consolidation' | 'closed_business' | 'paused' | 'other'

export interface Client {
  id: string
  name: string
  slug: string
  industry: string | null
  location: string | null
  website: string | null
  primary_contact: string | null
  email: string | null
  phone: string | null
  socials: {
    instagram?: string
    tiktok?: string
    linkedin?: string
    facebook?: string
    gbp?: string
  }
  services_active: string[]
  tier: ClientTier | null
  monthly_rate: number | null
  billing_status: ClientBillingStatus
  onboarding_date: string | null
  notes: string | null
  allotments: ClientAllotments
  goals: string[]
  // Acquisition + lifecycle (migration 064)
  lead_source: LeadSource | null
  lead_source_detail: string | null
  referred_by_client_id: string | null
  acquisition_cost_cents: number | null
  contract_term: ContractTerm | null
  contract_renewal_date: string | null
  contract_auto_renew: boolean
  churn_date: string | null
  churn_reason: ChurnReason | null
  churn_notes: string | null
  created_at: string
  updated_at: string
}

export type LifecycleEventType =
  | 'acquired' | 'upgraded' | 'downgraded' | 'paused' | 'reactivated' | 'churned'

export interface ClientLifecycleEvent {
  id: string
  client_id: string
  event_type: LifecycleEventType
  event_date: string
  mrr_delta_cents: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface BusinessMetrics {
  active_client_count: number
  mrr_cents: number
  arr_cents: number
  acquired_30d_count: number
  churned_30d_count: number
  renewals_next_60d: number
  top3_share_pct: number
  avg_cac_cents_90d: number
}

export type ServiceArea = 'social' | 'website' | 'local_seo' | 'email_sms'

export interface ClientAllotments {
  social_posts_per_month?: number
  website_changes_per_month?: number
  seo_updates_per_month?: number
  email_campaigns_per_month?: number
}

export type ContentFormat =
  | 'feed_post' | 'reel' | 'carousel' | 'story'
  | 'graphic' | 'short_form_video'
  | 'blog_post' | 'page_update' | 'bug_fix'
  | 'gbp_post' | 'review_response' | 'citation_update'
  | 'email_campaign' | 'sms_blast' | 'newsletter'
  | 'custom'

// ─── Video request wizard types ────────────────────────────
export type VideoContentType =
  | 'promo' | 'product' | 'event' | 'seasonal'
  | 'educational' | 'testimonial' | 'bts' | 'brand' | 'other'

export type VideoLengthPreference = 'under_15' | '15_30' | '30_60' | '60_90' | 'apnosh_decides'
export type VideoScriptOwner = 'apnosh' | 'client' | 'collab'
export type VideoScriptStyle = 'voiceover' | 'on_screen' | 'both' | 'apnosh_decides'
export type VideoVoiceoverTone = 'energetic' | 'calm' | 'professional' | 'fun' | 'apnosh_decides'
export type VideoFootageSource = 'client_clips' | 'animated' | 'stock' | 'apnosh_films' | 'mix'
export type VideoWhoOnCamera = 'just_me' | 'two_three' | 'full_team' | 'no_people' | 'apnosh_decides'
export type VideoMusicOwner = 'apnosh' | 'client' | 'none'
export type VideoMusicFeel = 'hype' | 'chill' | 'emotional' | 'trending' | 'corporate' | 'apnosh_decides'
export type VideoEditingStyle = 'cinematic' | 'trendy' | 'documentary' | 'clean' | 'ugc' | 'motion' | 'slideshow' | 'apnosh_decides'
export type VideoUrgency = 'flexible' | 'standard' | 'urgent'

export interface VideoRequest {
  id: string
  content_queue_id: string
  client_id: string
  submitted_by_user_id: string | null
  submitted_at: string

  content_type: VideoContentType

  is_series: boolean
  series_episode_count: number | null

  main_message: string | null
  hook: string | null
  call_to_action: string[]
  length_preference: VideoLengthPreference | null
  script_owner: VideoScriptOwner | null
  script_style: VideoScriptStyle | null
  voiceover_tone: VideoVoiceoverTone | null
  footage_source: VideoFootageSource | null

  shoot_location: string | null
  shoot_date: string | null
  shoot_flexible: boolean | null
  shoot_subject: string | null
  shoot_who_on_camera: VideoWhoOnCamera | null

  music_owner: VideoMusicOwner | null
  music_feel: VideoMusicFeel | null
  mood_tags: string[]
  editing_style: VideoEditingStyle | null
  reference_link: string | null
  avoid_text: string | null
  platforms: string[]

  publish_date: string | null
  urgency: VideoUrgency | null

  reference_asset_urls: string[]
  internal_note: string | null

  created_at: string
  updated_at: string
}

// ─── Graphic request wizard types ──────────────────────────
export type GraphicContentType =
  | 'promo' | 'product' | 'event' | 'seasonal'
  | 'educational' | 'testimonial' | 'bts' | 'brand' | 'other'

export type GraphicPlacement =
  | 'feed' | 'story' | 'reel-cover' | 'carousel' | 'banner' | 'custom'

export type GraphicUrgency = 'flexible' | 'standard' | 'urgent'

export type GraphicCustomDimMode = 'ratio' | 'px' | 'in' | 'cm'

export interface GraphicRequest {
  id: string
  content_queue_id: string
  client_id: string
  submitted_by_user_id: string | null
  submitted_at: string

  content_type: GraphicContentType

  // Promo
  offer_text?: string | null
  promo_code?: string | null
  offer_expiry?: string | null
  price_display?: string | null

  // Product
  product_name?: string | null
  product_desc?: string | null
  product_price?: string | null
  product_status?: string | null

  // Event
  event_name?: string | null
  event_date?: string | null
  event_time?: string | null
  event_location?: string | null
  event_ticket_info?: string | null

  // Seasonal
  season_name?: string | null
  season_message?: string | null
  season_offer?: string | null

  // Educational
  edu_topic?: string | null
  edu_key_points?: string | null

  // Testimonial
  testimonial_quote?: string | null
  testimonial_name?: string | null
  testimonial_source?: string | null

  // Placement
  placement?: GraphicPlacement | null
  carousel_slide_count?: number | null
  custom_dim_mode?: GraphicCustomDimMode | null
  custom_ratio?: string | null
  custom_width?: number | null
  custom_height?: number | null
  custom_unit?: string | null
  custom_dpi?: number | null

  // Timing
  publish_date?: string | null
  urgency?: GraphicUrgency | null

  // Message
  main_message?: string | null
  headline_text?: string | null
  call_to_action?: string[] | null
  post_caption?: string | null

  // Visuals
  uploaded_asset_urls: string[]
  source_stock_photo: boolean
  include_logo: boolean

  // Style
  mood_tags: string[]
  color_preference?: string | null
  reference_link?: string | null
  reference_asset_urls: string[]

  // Avoid
  avoid_colors?: string | null
  avoid_styles?: string | null
  designer_notes?: string | null
  internal_note?: string | null

  created_at: string
  updated_at: string
}

export interface ClientUser {
  id: string
  client_id: string
  email: string
  name: string | null
  role: ClientUserRole
  invited_at: string
  last_login: string | null
  status: ClientUserStatus
  auth_user_id: string | null
}

export interface ClientBrand {
  id: string
  client_id: string
  brand_md: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  font_display: string | null
  font_body: string | null
  logo_url: string | null
  voice_notes: string | null
  photo_style: string | null
  visual_style: VisualStyle | null
  texture_overlay: TextureOverlay
  depth_style: DepthStyle | null
  edge_treatment: EdgeTreatment | null
  client_editable_fields: string[]
  style_guide_html: string | null
  reference_images: ReferenceImage[]
  updated_at: string
}

export interface ClientPattern {
  id: string
  client_id: string
  patterns_md: string | null
  updated_at: string
}

export interface ClientAssetRow {
  id: string
  client_id: string
  type: ClientAssetType
  file_url: string
  thumbnail_url: string | null
  filename: string | null
  folder: string | null
  tags: string[]
  description: string | null
  quality_rating: AssetQuality | null
  orientation: AssetOrientation | null
  mood: AssetMood | null
  usage_history: string[]
  uploaded_by: AssetUploadedBy
  uploaded_by_user_id: string | null
  uploaded_at: string
}

export interface StyleLibraryEntry {
  id: string
  client_id: string
  post_code: string
  image_url: string | null
  html_source: string | null
  template_type: TemplateType | null
  platform: PostPlatform | null
  size: PostSize | null
  caption: string | null
  hashtags: string | null
  alt_text: string | null
  performance_notes: string | null
  style_notes: string | null
  client_visible: boolean
  status: StyleLibraryStatus
  is_golden: boolean
  approved_at: string
}

export interface ReferenceImage {
  url: string
  description: string
  template_type: TemplateType | null
}

export interface ContentQueueDraft {
  image_url: string
  html_source: string
  caption: string
  hashtags: string
}

export interface ContentQueueItem {
  id: string
  client_id: string
  request_type: QueueRequestType
  submitted_by: AssetUploadedBy
  submitted_by_user_id: string | null
  input_text: string | null
  input_photo_url: string | null
  service_area: ServiceArea
  content_format: ContentFormat | null
  template_type: TemplateType | null
  platform: PostPlatform | null
  size: PostSize
  drafts: ContentQueueDraft[]
  selected_draft: number | null
  designer_notes: string | null
  status: QueueStatus
  scheduled_for: string | null
  confirmed_at: string | null
  cancelled_at: string | null
  cancelled_reason: string | null
  failed_reason: string | null
  post_type: PostType | null
  platform_post_id: string | null
  revision_count: number
  revision_limit: number
  created_at: string
  updated_at: string
  // Joined
  client?: Client
}

export interface ClientFeedbackEntry {
  id: string
  content_queue_id: string
  user_id: string | null
  feedback_type: FeedbackType
  message: string | null
  created_at: string
}

// ============================================================
// Priority 1: Social metrics, Reviews, Notifications, Onboarding
// ============================================================

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'google_business' | 'youtube' | 'twitter'

export interface SocialMetricsRow {
  id: string
  client_id: string
  platform: SocialPlatform
  month: number
  year: number
  posts_published: number
  posts_planned: number
  total_reach: number
  total_impressions: number
  total_engagement: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers_count: number
  followers_change: number
  top_post_url: string | null
  top_post_caption: string | null
  top_post_engagement: number | null
  top_post_image_url: string | null
  notes: string | null
  demographics: SocialDemographics | null
  recorded_at: string
  created_at: string
  updated_at: string
}

export interface SocialDemographics {
  cities?: { name: string; count: number }[]
  countries?: { name: string; count: number }[]
  ages?: { range: string; count: number }[]
  gender?: { type: string; count: number }[]
}

export type ReviewSource = 'google' | 'yelp' | 'facebook' | 'tripadvisor' | 'other'

export interface Review {
  id: string
  client_id: string
  source: ReviewSource
  external_id: string | null
  rating: number
  author_name: string | null
  author_avatar_url: string | null
  review_text: string | null
  review_url: string | null
  response_text: string | null
  responded_at: string | null
  responded_by: string | null
  flagged: boolean
  flag_reason: string | null
  posted_at: string
  created_at: string
  updated_at: string
}

export type EmailDigestFrequency = 'immediate' | 'daily' | 'weekly' | 'off'

export interface NotificationPreferences {
  user_id: string
  email_enabled: boolean
  email_digest_frequency: EmailDigestFrequency
  notify_approvals: boolean
  notify_content_ready: boolean
  notify_reviews: boolean
  notify_messages: boolean
  notify_reports: boolean
  notify_billing: boolean
  notify_system: boolean
  updated_at: string
}

export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export interface OnboardingStep {
  id: string
  client_id: string
  step_key: string
  step_label: string
  step_description: string | null
  sort_order: number
  status: OnboardingStepStatus
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NotificationRow {
  id: string
  user_id: string
  type: string
  category: string | null
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

// ============================================================
// Website + Email tables
// ============================================================

export type UptimeStatus = 'up' | 'down' | 'degraded' | 'unknown'

export interface WebsiteHealth {
  client_id: string
  uptime_status: UptimeStatus
  uptime_pct_30d: number | null
  pagespeed_mobile: number | null
  pagespeed_desktop: number | null
  ssl_valid: boolean | null
  ssl_expires_at: string | null
  last_content_update_at: string | null
  notes: string | null
  updated_at: string
}

export interface TrafficSources {
  direct?: number
  search?: number
  social?: number
  referral?: number
  email?: number
  paid?: number
  [key: string]: number | undefined
}

export interface TopPage {
  path: string
  title?: string
  pageviews: number
}

export interface WebsiteTraffic {
  id: string
  client_id: string
  month: number
  year: number
  visitors: number
  pageviews: number
  sessions: number
  bounce_rate: number | null
  avg_session_seconds: number | null
  traffic_sources: TrafficSources
  top_pages: TopPage[]
  notes: string | null
  created_at: string
  updated_at: string
}

export type EmailCampaignStatus =
  | 'draft' | 'in_review' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'cancelled'

export interface EmailCampaign {
  id: string
  client_id: string
  name: string
  subject: string
  preview_text: string | null
  preview_url: string | null
  preview_image_url: string | null
  body_html: string | null
  status: EmailCampaignStatus
  scheduled_for: string | null
  sent_at: string | null
  recipient_count: number
  segment_name: string | null
  opens: number
  clicks: number
  unsubscribes: number
  bounces: number
  revenue: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmailListSegment {
  name: string
  count: number
}

export interface EmailListSnapshot {
  id: string
  client_id: string
  month: number
  year: number
  total_subscribers: number
  active_subscribers: number
  new_subscribers: number
  unsubscribes: number
  segments: EmailListSegment[]
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Social Final Build types (migration 020) ─────────────

export type TeamMemberRole = 'account_manager' | 'designer' | 'editor' | 'admin'

export interface TeamMember {
  id: string
  auth_user_id: string | null
  name: string
  email: string
  avatar_url: string | null
  role: TeamMemberRole
  is_active: boolean
  created_at: string
}

export interface AmClientNote {
  id: string
  client_id: string
  note_text: string
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  team_member?: TeamMember
}

export interface CalendarNote {
  id: string
  client_id: string
  note_date: string
  note_text: string
  created_by: string | null
  created_at: string
  // Joined
  team_member?: TeamMember
}

export interface CampaignTag {
  id: string
  client_id: string
  name: string
  color: string
  is_active: boolean
  created_at: string
}

export interface OptimalSendTime {
  id: string
  client_id: string
  platform: string
  day_of_week: number
  hour_of_day: number
  confidence: number
  calculated_at: string
}

export interface CalendarShareLink {
  id: string
  client_id: string
  token: string
  created_by_user: string | null
  revoked: boolean
  created_at: string
}

export interface AssetFolder {
  id: string
  client_id: string
  name: string
  parent_folder_id: string | null
  created_by_client: boolean
  created_at: string
}

export type GlobalAssetType = 'image' | 'video' | 'text' | 'document'

export interface Asset {
  id: string
  client_id: string
  name: string
  type: GlobalAssetType
  file_url: string | null
  file_size: number | null
  mime_type: string | null
  dimensions: string | null
  content: string | null
  folder_id: string | null
  tags: string[]
  uploaded_by_client: boolean
  uploaded_by_client_user: string | null
  uploaded_by_team_member: string | null
  created_at: string
  // Joined
  folder?: AssetFolder
}

export type PostType = 'graphic' | 'reel' | 'carousel' | 'story' | 'text'

// ─── Scheduled posts for multi-platform publishing ─────────

export type ScheduledPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_failed' | 'failed'

export interface PlatformPublishResult {
  status: 'published' | 'failed' | 'pending' | 'not_connected'
  post_id?: string
  published_at?: string
  error?: string
}

export interface ScheduledPost {
  id: string
  client_id: string
  created_by: string | null
  text: string
  media_urls: string[]
  media_type: 'image' | 'video' | 'carousel' | null
  link_url: string | null
  platforms: string[]
  scheduled_for: string | null
  status: ScheduledPostStatus
  platform_results: Record<string, PlatformPublishResult>
  content_queue_id: string | null
  campaign_tag_id: string | null
  created_at: string
  updated_at: string
}

// Per-client health signals (migration 060). View, not a table. Each
// signal is one of four levels; we deliberately don't roll them into a
// composite number — admins synthesize from the breakdown.
export type HealthLevel = 'good' | 'warning' | 'bad' | 'unknown'

export interface ClientHealth {
  client_id: string
  name: string
  slug: string
  // Cadence
  cadence_level: HealthLevel
  last_contact_at: string | null
  days_since_contact: number | null
  cadence_median_days: number | null
  interaction_count: number | null
  // Billing
  billing_level: HealthLevel
  billing_overdue_count: number | null
  billing_max_overdue_days: number | null
  billing_has_active_sub: boolean | null
  billing_failed_count: number | null
  // Sentiment
  sentiment_level: HealthLevel
  negatives_last_5: number | null
  positives_last_5: number | null
  sentiment_count: number | null
}

// The worst-of-the-three rollup. Computed client-side so we don't bake
// a priority order into the view and have to migrate if we change it.
export type OverallHealth = 'healthy' | 'stable' | 'needs_attention' | 'at_risk' | 'unknown'

export function rollupHealth(h: Pick<ClientHealth, 'cadence_level' | 'billing_level' | 'sentiment_level'>): OverallHealth {
  const levels = [h.cadence_level, h.billing_level, h.sentiment_level]
  if (levels.some(l => l === 'bad')) return 'at_risk'
  if (levels.some(l => l === 'warning')) return 'needs_attention'
  if (levels.every(l => l === 'unknown')) return 'unknown'
  // At least one 'good' and the rest 'good' or 'unknown'
  if (levels.some(l => l === 'unknown')) return 'stable'
  return 'healthy'
}

// Tasks / work-items (migration 058). One table, two audiences — admin
// tasks and client-facing asks share the same row but are filtered by
// `assignee_type` + `visible_to_client`.
export type ClientTaskStatus = 'todo' | 'doing' | 'done' | 'canceled'
export type ClientTaskSource = 'manual' | 'auto_nlp' | 'auto_invoice' | 'template'
export type ClientTaskAssigneeType = 'admin' | 'client'

export interface ClientTask {
  id: string
  client_id: string
  title: string
  body: string | null
  status: ClientTaskStatus
  snoozed_until: string | null
  due_at: string | null
  assignee_type: ClientTaskAssigneeType | null
  assignee_id: string | null
  visible_to_client: boolean
  interaction_id: string | null
  invoice_id: string | null
  content_id: string | null
  source: ClientTaskSource
  created_by: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

// Extended monthly report with client-portal fields (migration 020 additions)
export interface ClientMonthlyReport {
  id: string
  business_id: string | null
  client_id: string | null
  month: number
  year: number
  title: string | null
  status: 'draft' | 'published'
  summary: string | null
  what_worked: string[] | null
  next_month_plan: string[] | null
  metrics_snapshot: Record<string, unknown> | null
  top_post_data: Record<string, unknown> | null
  pdf_url: string | null
  created_by_team_member: string | null
  published_at: string | null
  created_at: string
  // Joined
  team_member?: TeamMember
}

