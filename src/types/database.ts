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
export type QueueStatus = 'new' | 'drafting' | 'in_review' | 'approved' | 'scheduled' | 'posted'
export type QueueRequestType = 'client_request' | 'internal'
export type FeedbackType = 'approval' | 'revision' | 'comment'
export type StyleLibraryStatus = 'approved' | 'archived'
export type ClientAssetType = 'logo' | 'photo' | 'graphic' | 'social_proof' | 'other'

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
  approved_at: string
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
  template_type: TemplateType | null
  platform: PostPlatform | null
  size: PostSize
  drafts: ContentQueueDraft[]
  selected_draft: number | null
  designer_notes: string | null
  status: QueueStatus
  scheduled_for: string | null
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
