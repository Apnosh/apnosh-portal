import { Camera, Globe, Video, Mail } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DeliverableStatus = 'pending' | 'approved' | 'changes_requested' | 'scheduled'
export type ContentType = 'Feed Post' | 'Story' | 'Reel' | 'Carousel' | 'Email' | 'Event Banner' | 'Story Templates'
export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'email'

export interface PlatformVariant {
  platform: Platform
  contentType: ContentType
  caption?: string
  hashtags?: string[]
  scheduledFor: string | null
  dimensions?: string
  notes?: string
}

export interface Deliverable {
  id: string
  title: string
  platform: Platform
  platforms: PlatformVariant[]
  contentType: ContentType
  caption: string
  hashtags: string[]
  submittedDate: string
  deadline: string | null
  deadlineLabel: string
  deadlineUrgency: 'overdue' | 'today' | 'soon' | 'normal' | 'none'
  overdueImpact?: string
  scheduledFor: string | null
  version: number
  versionNote?: string
  status: DeliverableStatus
  strategyNote?: string
  slides?: number
  previewColor: string
  approvedAt?: string
  feedbackSummary?: string
  createdBy: string
  createdByRole: string
  contentPillar?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function platformIcon(p: Platform) {
  switch (p) {
    case 'instagram': return Camera
    case 'facebook':  return Globe
    case 'tiktok':    return Video
    case 'email':     return Mail
  }
}

export function platformLabel(p: Platform) {
  switch (p) {
    case 'instagram': return 'Instagram'
    case 'facebook':  return 'Facebook'
    case 'tiktok':    return 'TikTok'
    case 'email':     return 'Email'
  }
}

export function platformColor(p: Platform) {
  switch (p) {
    case 'instagram': return 'text-pink-600'
    case 'facebook':  return 'text-blue-600'
    case 'tiktok':    return 'text-ink'
    case 'email':     return 'text-indigo-600'
  }
}

export function statusColor(s: DeliverableStatus) {
  switch (s) {
    case 'pending':           return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'approved':          return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'changes_requested': return 'bg-red-50 text-red-700 border-red-200'
    case 'scheduled':         return 'bg-blue-50 text-blue-700 border-blue-200'
  }
}

export function urgencyColor(u: string) {
  switch (u) {
    case 'overdue': return 'border-t-red-500'
    case 'today':   return 'border-t-amber-500'
    case 'soon':    return 'border-t-blue-500'
    case 'normal':  return 'border-t-ink-5'
    case 'none':    return 'border-t-emerald-400'
    default:        return 'border-t-ink-5'
  }
}

export function urgencyBadge(u: string) {
  switch (u) {
    case 'overdue': return 'bg-red-50 text-red-700'
    case 'today':   return 'bg-amber-50 text-amber-700'
    case 'soon':    return 'bg-blue-50 text-blue-600'
    case 'normal':  return 'bg-ink-6 text-ink-3'
    case 'none':    return 'bg-ink-6 text-ink-4'
    default:        return 'bg-ink-6 text-ink-4'
  }
}

/* ------------------------------------------------------------------ */
/*  Mock data — 10 deliverables                                        */
/* ------------------------------------------------------------------ */

export const initialDeliverables: Deliverable[] = [
  {
    id: 'del-001',
    title: 'Spring Menu Launch',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Carousel', scheduledFor: 'Thursday, Mar 26 at 10:00 AM', dimensions: '1080x1080', notes: '5-slide carousel showcasing each dish' },
      { platform: 'facebook', contentType: 'Feed Post', caption: 'Spring has arrived at Apnosh! Our refreshed seasonal menu features locally sourced ingredients, lighter plates, and vibrant new cocktails. Come taste the season!', scheduledFor: 'Thursday, Mar 26 at 11:00 AM', dimensions: '1200x630', notes: 'Single image with link to reservation' },
      { platform: 'tiktok', contentType: 'Reel', caption: 'Our new spring menu just dropped! Which dish are you trying first? #SpringMenu #FoodTok #NewMenu', hashtags: ['SpringMenu', 'FoodTok', 'NewMenu', 'RestaurantLife'], scheduledFor: 'Thursday, Mar 26 at 2:00 PM', dimensions: '1080x1920', notes: '15-sec dish reveal reel with trending audio' },
    ],
    contentType: 'Carousel',
    caption: 'Spring has arrived at Apnosh! Explore our refreshed seasonal menu featuring locally sourced ingredients, lighter plates, and vibrant new cocktails crafted by our team. Swipe through to see every dish — which one are you trying first?',
    hashtags: ['SpringMenu', 'FreshEats', 'SeasonalDining', 'ApnoshKitchen', 'FarmToTable'],
    submittedDate: 'Mar 22, 2026',
    deadline: '2026-03-24T14:00:00',
    deadlineLabel: 'Due today by 2:00 PM',
    deadlineUrgency: 'today',
    scheduledFor: 'Thursday, Mar 26 at 10:00 AM',
    version: 1,
    status: 'pending',
    strategyNote: 'Carousels perform 2.3x better for your audience on weekdays. Cross-posting to all 3 platforms maximizes reach.',
    slides: 5,
    previewColor: 'bg-emerald-50',
    createdBy: 'Sarah K.',
    createdByRole: 'Designer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-002',
    title: 'Customer Spotlight — Maria & Family',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Feed Post', scheduledFor: 'Friday, Mar 27 at 11:30 AM', dimensions: '1080x1080' },
      { platform: 'facebook', contentType: 'Feed Post', caption: 'Meet the Garcias! Maria has been dining with us every Sunday for 3 years. We love our regulars! Tag someone you always bring to Apnosh.', scheduledFor: 'Friday, Mar 27 at 12:00 PM', dimensions: '1200x630', notes: 'Adapted caption for Facebook audience' },
    ],
    contentType: 'Feed Post',
    caption: 'Meet the Garcias! Maria has been dining with us every Sunday for 3 years. "Apnosh feels like a second home for our family." We love our regulars — tag someone you always bring here!',
    hashtags: ['CustomerSpotlight', 'ApnoshFamily', 'SundayBrunch', 'RegularVibes'],
    submittedDate: 'Mar 23, 2026',
    deadline: '2026-03-26T12:00:00',
    deadlineLabel: 'Due in 2 days',
    deadlineUrgency: 'normal',
    scheduledFor: 'Friday, Mar 27 at 11:30 AM',
    version: 1,
    status: 'pending',
    previewColor: 'bg-pink-50',
    createdBy: 'Mike R.',
    createdByRole: 'Writer',
    contentPillar: 'Engagement',
  },
  {
    id: 'del-003',
    title: 'Daily Specials Templates',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Story Templates', scheduledFor: null, dimensions: '1080x1920', notes: '5 reusable story templates' },
      { platform: 'facebook', contentType: 'Story', scheduledFor: null, dimensions: '1080x1920', notes: 'Same templates adapted for Facebook Stories' },
    ],
    contentType: 'Story Templates',
    caption: '5 branded story templates for daily specials, happy hour, events, quotes, and polls. Ready to customize each week with fresh content.',
    hashtags: ['Stories', 'Templates', 'DailySpecials'],
    submittedDate: 'Mar 21, 2026',
    deadline: '2026-03-27T17:00:00',
    deadlineLabel: 'Due in 3 days',
    deadlineUrgency: 'normal',
    scheduledFor: null,
    version: 1,
    status: 'pending',
    slides: 5,
    previewColor: 'bg-violet-50',
    createdBy: 'Sarah K.',
    createdByRole: 'Designer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-004',
    title: 'Jazz Night — Event Banner',
    platform: 'facebook',
    platforms: [
      { platform: 'facebook', contentType: 'Event Banner', scheduledFor: 'Wednesday, Mar 25 at 12:00 PM', dimensions: '1200x628', notes: 'Facebook Event cover + feed post' },
      { platform: 'instagram', contentType: 'Feed Post', scheduledFor: 'Wednesday, Mar 25 at 12:30 PM', dimensions: '1080x1080', notes: 'Square adaptation with event details overlay' },
      { platform: 'instagram', contentType: 'Story', scheduledFor: 'Wednesday, Mar 25 at 5:00 PM', dimensions: '1080x1920', notes: 'Countdown sticker story for event reminder' },
    ],
    contentType: 'Event Banner',
    caption: 'Live Jazz Night at Apnosh! Join us this Friday for smooth jazz, craft cocktails, and a special 3-course tasting menu. Doors open at 7 PM. Reserve your table now — limited seating.',
    hashtags: ['JazzNight', 'LiveMusic', 'FridayVibes', 'ApnoshEvents'],
    submittedDate: 'Mar 22, 2026',
    deadline: '2026-03-25T10:00:00',
    deadlineLabel: 'Due tomorrow',
    deadlineUrgency: 'soon',
    scheduledFor: 'Wednesday, Mar 25 at 12:00 PM',
    version: 2,
    versionNote: 'Updated copy per your feedback — changed date and added reservation CTA',
    status: 'pending',
    previewColor: 'bg-indigo-50',
    createdBy: 'Sarah K.',
    createdByRole: 'Designer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-005',
    title: 'Kitchen Behind the Scenes',
    platform: 'tiktok',
    platforms: [
      { platform: 'tiktok', contentType: 'Reel', scheduledFor: null, dimensions: '1080x1920', notes: 'Full-length BTS reel with trending audio' },
      { platform: 'instagram', contentType: 'Reel', scheduledFor: null, dimensions: '1080x1920', notes: 'Same reel cross-posted to IG Reels' },
    ],
    contentType: 'Reel',
    caption: "POV: You walk into our kitchen at 6 AM prep. Watch Chef Daniel transform raw ingredients into today's specials. The energy is unmatched.",
    hashtags: ['BTS', 'KitchenLife', 'ChefLife', 'FoodTok', 'RestaurantBTS'],
    submittedDate: 'Mar 20, 2026',
    deadline: '2026-03-23T09:00:00',
    deadlineLabel: 'Overdue — was due yesterday',
    deadlineUrgency: 'overdue',
    overdueImpact: 'Post was scheduled for Monday — approving now will shift to the next available slot',
    scheduledFor: null,
    version: 1,
    status: 'pending',
    strategyNote: 'BTS kitchen content gets 3x more saves than other reels. This is trending on TikTok right now.',
    previewColor: 'bg-red-50',
    createdBy: 'Jordan L.',
    createdByRole: 'Video Producer',
    contentPillar: 'Behind the Scenes',
  },
  {
    id: 'del-006',
    title: 'Email Newsletter #13 — Spring Edition',
    platform: 'email',
    platforms: [
      { platform: 'email', contentType: 'Email', scheduledFor: 'Monday, Mar 30 at 9:00 AM', notes: 'Sent to 2,100 subscribers' },
    ],
    contentType: 'Email',
    caption: "Subject: Your spring dining guide is here! Inside: new menu highlights, upcoming events, a 15% loyalty reward, and a spotlight on our pastry chef's latest creation.",
    hashtags: ['Newsletter', 'SpringEdition', 'EmailMarketing'],
    submittedDate: 'Mar 22, 2026',
    deadline: null,
    deadlineLabel: 'Approved 2h ago',
    deadlineUrgency: 'none',
    scheduledFor: 'Monday, Mar 30 at 9:00 AM',
    version: 1,
    status: 'approved',
    approvedAt: '2 hours ago',
    previewColor: 'bg-blue-50',
    createdBy: 'Mike R.',
    createdByRole: 'Writer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-007',
    title: 'Recipe Tuesday — Pesto Pasta',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Carousel', scheduledFor: 'Tuesday, Mar 25 at 12:00 PM', dimensions: '1080x1080', notes: '5-step recipe carousel' },
      { platform: 'facebook', contentType: 'Feed Post', scheduledFor: 'Tuesday, Mar 25 at 12:30 PM', dimensions: '1200x630', notes: 'Single image with recipe link' },
      { platform: 'tiktok', contentType: 'Reel', caption: 'Our famous pesto pasta in 5 steps! Save this! #RecipeTuesday #PestoPasta #CookingTok', scheduledFor: 'Tuesday, Mar 25 at 3:00 PM', dimensions: '1080x1920', notes: '30-sec step-by-step cooking reel' },
    ],
    contentType: 'Feed Post',
    caption: 'Recipe Tuesday! Our famous house-made pesto pasta in 5 simple steps. Save this post and try it at home this weekend. Pro tip: toast the pine nuts for extra flavor.',
    hashtags: ['RecipeTuesday', 'PestoPasta', 'HomeCooking', 'ApnoshRecipes'],
    submittedDate: 'Mar 19, 2026',
    deadline: '2026-03-25T10:00:00',
    deadlineLabel: 'Due tomorrow',
    deadlineUrgency: 'soon',
    scheduledFor: 'Tuesday, Mar 25 at 12:00 PM',
    version: 1,
    status: 'changes_requested',
    feedbackSummary: 'Caption needs shorter intro. Replace stock photo with actual kitchen shot. Add "link in bio" CTA.',
    previewColor: 'bg-amber-50',
    createdBy: 'Sarah K.',
    createdByRole: 'Designer',
    contentPillar: 'Educational',
  },
  {
    id: 'del-008',
    title: 'Weekend Brunch Promo',
    platform: 'facebook',
    platforms: [
      { platform: 'facebook', contentType: 'Feed Post', scheduledFor: 'Saturday, Mar 28 at 8:00 AM', dimensions: '1200x630' },
      { platform: 'instagram', contentType: 'Feed Post', scheduledFor: 'Saturday, Mar 28 at 8:30 AM', dimensions: '1080x1080' },
      { platform: 'instagram', contentType: 'Story', scheduledFor: 'Saturday, Mar 28 at 9:00 AM', dimensions: '1080x1920', notes: 'Countdown story with swipe-up to reserve' },
    ],
    contentType: 'Feed Post',
    caption: 'This Saturday: bottomless brunch is BACK. $35 per person includes your choice of entree + unlimited mimosas from 10 AM - 2 PM. Tag your brunch crew!',
    hashtags: ['BrunchTime', 'WeekendVibes', 'BottomlessBrunch', 'SaturdayPlans'],
    submittedDate: 'Mar 21, 2026',
    deadline: null,
    deadlineLabel: 'Scheduled',
    deadlineUrgency: 'none',
    scheduledFor: 'Saturday, Mar 28 at 8:00 AM',
    version: 1,
    status: 'scheduled',
    approvedAt: 'yesterday',
    previewColor: 'bg-sky-50',
    createdBy: 'Mike R.',
    createdByRole: 'Writer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-009',
    title: 'Happy Hour Announcement',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Feed Post', scheduledFor: 'Friday, Mar 28 at 3:00 PM', dimensions: '1080x1080' },
      { platform: 'facebook', contentType: 'Feed Post', scheduledFor: 'Friday, Mar 28 at 3:30 PM', dimensions: '1200x630' },
      { platform: 'email', contentType: 'Email', scheduledFor: 'Friday, Mar 28 at 12:00 PM', notes: 'Targeted to 850 local subscribers' },
    ],
    contentType: 'Feed Post',
    caption: 'New happy hour menu alert! Every weekday 4-7 PM: $8 cocktails, $5 wines, and half-price appetizers. Bring your crew after work — you deserve it.',
    hashtags: ['HappyHour', 'AfterWork', 'CocktailHour', 'ApnoshDeals'],
    submittedDate: 'Mar 23, 2026',
    deadline: '2026-03-28T10:00:00',
    deadlineLabel: 'Due in 4 days',
    deadlineUrgency: 'normal',
    scheduledFor: 'Friday, Mar 28 at 3:00 PM',
    version: 1,
    status: 'pending',
    previewColor: 'bg-orange-50',
    createdBy: 'Mike R.',
    createdByRole: 'Writer',
    contentPillar: 'Promotional',
  },
  {
    id: 'del-010',
    title: 'Easter Menu Preview',
    platform: 'instagram',
    platforms: [
      { platform: 'instagram', contentType: 'Carousel', scheduledFor: 'Monday, Mar 30 at 10:00 AM', dimensions: '1080x1080', notes: '4-slide carousel with dish previews' },
      { platform: 'tiktok', contentType: 'Reel', caption: 'Easter brunch is coming! Sneak peek at what Chef Daniel has planned. #EasterBrunch #FoodTok', scheduledFor: 'Monday, Mar 30 at 12:00 PM', dimensions: '1080x1920', notes: '20-sec teaser reel' },
      { platform: 'facebook', contentType: 'Feed Post', scheduledFor: 'Monday, Mar 30 at 10:30 AM', dimensions: '1200x630', notes: 'Single image + reservation link' },
    ],
    contentType: 'Carousel',
    caption: 'Easter brunch is coming to Apnosh! Get a sneak peek at Chef Daniel\'s special holiday menu featuring honey-glazed ham, spring vegetable frittata, and our famous hot cross buns. Reservations open now.',
    hashtags: ['EasterBrunch', 'HolidayMenu', 'SpringDining', 'ApnoshEaster'],
    submittedDate: 'Mar 23, 2026',
    deadline: '2026-03-29T12:00:00',
    deadlineLabel: 'Due in 5 days',
    deadlineUrgency: 'normal',
    scheduledFor: 'Monday, Mar 30 at 10:00 AM',
    version: 1,
    status: 'pending',
    strategyNote: 'Holiday content historically gets 40% higher engagement. Posting Monday gives a full week before Easter.',
    slides: 4,
    previewColor: 'bg-rose-50',
    createdBy: 'Sarah K.',
    createdByRole: 'Designer',
    contentPillar: 'Promotional',
  },
]
