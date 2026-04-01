export type PriceUnit = 'per_month' | 'per_item' | 'per_hour' | 'one_time'

export type ServiceCategory =
  | 'Marketing'
  | 'Video'
  | 'Websites & SEO'
  | 'Email & SMS'
  | 'Creative'
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
  isSubscription: boolean
  popular: boolean
}

export const categories: ServiceCategory[] = [
  'Marketing',
  'Video',
  'Websites & SEO',
  'Email & SMS',
  'Creative',
  'Strategy',
]

export const services: Service[] = [
  // ── Marketing ──────────────────────────────────────────────────────
  {
    id: 'social-media-essentials',
    name: 'Social Media Essentials',
    category: 'Marketing',
    description:
      'A solid foundation for brands just getting started on social media. Includes scheduled posts across two platforms, basic copywriting, and monthly performance snapshots.',
    shortDescription: 'Foundational social presence across 2 platforms with scheduled posts.',
    price: 199,
    priceUnit: 'per_month',
    features: [
      '8 feed posts per month',
      '2 platforms managed',
      'Basic caption copywriting',
      'Monthly performance snapshot',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'social-media-starter',
    name: 'Social Media Starter',
    category: 'Marketing',
    description:
      'Step up your social game with more content volume, story creation, and hashtag strategy. Perfect for growing brands that want consistent posting and community engagement.',
    shortDescription: 'More volume, stories, and hashtag strategy across 3 platforms.',
    price: 299,
    priceUnit: 'per_month',
    features: [
      '12 feed posts per month',
      '3 platforms managed',
      'Story creation (8/mo)',
      'Hashtag strategy',
      'Community engagement',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'social-media-growth',
    name: 'Social Media Growth',
    category: 'Marketing',
    description:
      'Our most popular package for brands serious about growth. Includes high-volume posting, Reels and carousels, influencer coordination, and detailed analytics with a dedicated strategist.',
    shortDescription: 'High-volume posting, Reels, carousels, and a dedicated strategist.',
    price: 449,
    priceUnit: 'per_month',
    features: [
      '20 feed posts per month',
      'Reels & carousels included',
      '4 platforms managed',
      'Influencer coordination',
      'Detailed analytics reporting',
      'Dedicated strategist',
    ],
    isSubscription: true,
    popular: true,
  },
  {
    id: 'single-feed-posts',
    name: 'Single Feed Posts',
    category: 'Marketing',
    description:
      'Need a quick, on-brand graphic for your feed? Order individual posts designed to match your brand identity with custom copy and optimized sizing.',
    shortDescription: 'Individual on-brand feed graphics with custom copy.',
    price: 35,
    priceUnit: 'per_item',
    features: [
      'Custom branded design',
      'Optimized sizing per platform',
      'Caption copywriting',
      '1 round of revisions',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'story-graphics',
    name: 'Story Graphics',
    category: 'Marketing',
    description:
      'Eye-catching story-format graphics built for Instagram and Facebook Stories. Includes animated elements and swipe-up CTA integration where applicable.',
    shortDescription: 'Vertical story graphics with animated elements.',
    price: 25,
    priceUnit: 'per_item',
    features: [
      'Vertical story format',
      'Animated elements',
      'Swipe-up CTA integration',
      'Brand-consistent design',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'carousel-posts',
    name: 'Carousel Posts',
    category: 'Marketing',
    description:
      'Multi-slide carousel posts designed to boost engagement and dwell time. Perfect for educational content, product showcases, or storytelling sequences.',
    shortDescription: 'Multi-slide carousels for education, showcases, or storytelling.',
    price: 95,
    priceUnit: 'per_item',
    features: [
      'Up to 10 slides',
      'Cohesive design flow',
      'Caption & CTA copywriting',
      '1 round of revisions',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'infographics',
    name: 'Infographics',
    category: 'Marketing',
    description:
      'Data-driven infographics that simplify complex information into shareable visual stories. Great for reports, how-tos, and thought leadership content.',
    shortDescription: 'Shareable visual stories from data and complex info.',
    price: 120,
    priceUnit: 'per_item',
    features: [
      'Custom data visualization',
      'Brand-styled layout',
      'Print & digital formats',
      '2 rounds of revisions',
    ],
    isSubscription: false,
    popular: false,
  },

  // ── Video ──────────────────────────────────────────────────────────
  {
    id: 'basic-product-video',
    name: 'Basic Product Video',
    category: 'Video',
    description:
      'A clean, professional product video using stock footage, product imagery, and motion graphics. Ideal for showcasing features without a full production shoot.',
    shortDescription: 'Clean product showcase with motion graphics and stock footage.',
    price: 100,
    priceUnit: 'per_item',
    features: [
      'Up to 30 seconds',
      'Stock footage & imagery',
      'Motion graphics',
      'Background music',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'trend-video-no-people',
    name: 'Trend Video No People',
    category: 'Video',
    description:
      'Trending-format short videos built without on-camera talent. Uses product shots, text overlays, and trending audio to capture attention on Reels and TikTok.',
    shortDescription: 'Trending short-form video with text overlays and product shots.',
    price: 125,
    priceUnit: 'per_item',
    features: [
      'Up to 60 seconds',
      'Trending format & audio',
      'Text overlays',
      'Product B-roll',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'trend-video-with-people',
    name: 'Trend Video With People',
    category: 'Video',
    description:
      'Short-form trend videos featuring on-camera talent for authentic, scroll-stopping content. Scripted for maximum engagement on social platforms.',
    shortDescription: 'Trend-style video with on-camera talent for authentic content.',
    price: 175,
    priceUnit: 'per_item',
    features: [
      'Up to 60 seconds',
      'On-camera talent',
      'Script & direction',
      'Trending format',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'ad-creative-video',
    name: 'Ad Creative Video',
    category: 'Video',
    description:
      'Performance-driven video ads optimized for Meta, YouTube, and TikTok. Includes hook variations, CTA overlays, and platform-specific sizing.',
    shortDescription: 'Performance-optimized video ads with hook variations and CTAs.',
    price: 250,
    priceUnit: 'per_item',
    features: [
      'Up to 60 seconds',
      'Hook variations (3)',
      'CTA overlays',
      'Multi-platform sizing',
      'Performance-optimized',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'polished-reel',
    name: 'Polished Reel',
    category: 'Video',
    description:
      'A high-quality short-form video with professional editing, color grading, custom graphics, and sound design. Ideal for brand storytelling and premium social content.',
    shortDescription: 'Professionally edited reel with color grading and sound design.',
    price: 350,
    priceUnit: 'per_item',
    features: [
      'Up to 90 seconds',
      'Professional editing',
      'Color grading',
      'Custom graphics',
      'Sound design',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'cinematic-reel',
    name: 'Cinematic Reel',
    category: 'Video',
    description:
      'Full cinematic production including scripting, professional shoot, advanced editing, color grading, and original music. Your brand at its visual best.',
    shortDescription: 'Full cinematic production with scripting, shoot, and original music.',
    price: 899,
    priceUnit: 'per_item',
    features: [
      'Up to 3 minutes',
      'Full scripting & storyboard',
      'Professional shoot',
      'Advanced editing & VFX',
      'Color grading',
      'Original music / licensed audio',
    ],
    isSubscription: false,
    popular: false,
  },

  // ── Websites & SEO ─────────────────────────────────────────────────
  {
    id: 'basic-website',
    name: 'Basic Website',
    category: 'Websites & SEO',
    description:
      'A clean, mobile-responsive website with up to 5 pages. Includes basic on-page SEO, contact form, and Google Analytics setup. Perfect for new businesses.',
    shortDescription: 'Clean 5-page responsive site with basic SEO and analytics.',
    price: 699,
    priceUnit: 'one_time',
    features: [
      'Up to 5 pages',
      'Mobile responsive',
      'Basic on-page SEO',
      'Contact form',
      'Google Analytics setup',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'standard-website',
    name: 'Standard Website',
    category: 'Websites & SEO',
    description:
      'A comprehensive website with up to 10 pages, custom design, CMS integration, SEO optimization, and speed performance tuning. Our most popular web package.',
    shortDescription: '10-page custom site with CMS, SEO, and speed optimization.',
    price: 1299,
    priceUnit: 'one_time',
    features: [
      'Up to 10 pages',
      'Custom design',
      'CMS integration',
      'SEO optimization',
      'Speed performance tuning',
      'Social media integration',
    ],
    isSubscription: false,
    popular: true,
  },
  {
    id: 'advanced-website',
    name: 'Advanced Website',
    category: 'Websites & SEO',
    description:
      'A fully custom website with unlimited pages, e-commerce capabilities, advanced animations, API integrations, and a dedicated project manager.',
    shortDescription: 'Fully custom site with e-commerce, animations, and API integrations.',
    price: 1999,
    priceUnit: 'one_time',
    features: [
      'Unlimited pages',
      'E-commerce ready',
      'Advanced animations',
      'API integrations',
      'Dedicated project manager',
      'Priority support (90 days)',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'local-seo-starter',
    name: 'Local SEO Starter',
    category: 'Websites & SEO',
    description:
      'Get found locally with Google Business Profile optimization, citation building, and basic local keyword targeting. Ideal for single-location businesses.',
    shortDescription: 'Google Business Profile optimization and local keyword targeting.',
    price: 149,
    priceUnit: 'per_month',
    features: [
      'Google Business Profile optimization',
      'Citation building (20/mo)',
      'Local keyword targeting',
      'Monthly ranking report',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'local-seo-growth',
    name: 'Local SEO Growth',
    category: 'Websites & SEO',
    description:
      'Accelerate your local visibility with review management, content creation, competitor analysis, and link building on top of core local SEO tactics.',
    shortDescription: 'Review management, content creation, and competitor analysis.',
    price: 299,
    priceUnit: 'per_month',
    features: [
      'Everything in Starter',
      'Review management',
      'Blog content (2 posts/mo)',
      'Competitor analysis',
      'Link building',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'local-seo-authority',
    name: 'Local SEO Authority',
    category: 'Websites & SEO',
    description:
      'Dominate your local market with comprehensive SEO including advanced link building, content marketing, technical audits, and multi-location support.',
    shortDescription: 'Full-service local SEO with advanced links and technical audits.',
    price: 499,
    priceUnit: 'per_month',
    features: [
      'Everything in Growth',
      'Advanced link building',
      'Technical SEO audits',
      'Content marketing (4 posts/mo)',
      'Multi-location support',
      'Dedicated SEO strategist',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'hosting-basic',
    name: 'Hosting Basic',
    category: 'Websites & SEO',
    description:
      'Reliable managed hosting with SSL, daily backups, uptime monitoring, and basic support. Keeps your site secure and running smoothly.',
    shortDescription: 'Managed hosting with SSL, backups, and uptime monitoring.',
    price: 49,
    priceUnit: 'per_month',
    features: [
      'SSL certificate',
      'Daily backups',
      'Uptime monitoring',
      'Basic support',
      '99.9% uptime SLA',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'hosting-growth',
    name: 'Hosting Growth',
    category: 'Websites & SEO',
    description:
      'High-performance hosting with CDN, staging environments, priority support, and performance optimization. Built for growing traffic.',
    shortDescription: 'High-performance hosting with CDN, staging, and priority support.',
    price: 125,
    priceUnit: 'per_month',
    features: [
      'Everything in Basic',
      'CDN integration',
      'Staging environment',
      'Performance optimization',
      'Priority support',
      'Malware scanning',
    ],
    isSubscription: true,
    popular: false,
  },

  // ── Email & SMS ────────────────────────────────────────────────────
  {
    id: 'email-starter',
    name: 'Email Starter',
    category: 'Email & SMS',
    description:
      'Get started with email marketing including template design, campaign creation, list management, and basic automations like welcome sequences.',
    shortDescription: 'Email templates, campaigns, and basic welcome automations.',
    price: 199,
    priceUnit: 'per_month',
    features: [
      '4 email campaigns/mo',
      'Template design',
      'List management',
      'Welcome sequence',
      'Basic analytics',
    ],
    isSubscription: true,
    popular: false,
  },
  {
    id: 'email-sms-growth',
    name: 'Email & SMS Growth',
    category: 'Email & SMS',
    description:
      'Combine email and SMS for maximum reach. Includes advanced automations, A/B testing, segmentation, and abandoned cart recovery flows.',
    shortDescription: 'Email + SMS with advanced automations and A/B testing.',
    price: 299,
    priceUnit: 'per_month',
    features: [
      '8 email campaigns/mo',
      'SMS campaigns (4/mo)',
      'Advanced automations',
      'A/B testing',
      'Segmentation',
      'Abandoned cart recovery',
    ],
    isSubscription: true,
    popular: true,
  },
  {
    id: 'full-retention-suite',
    name: 'Full Retention Suite',
    category: 'Email & SMS',
    description:
      'A complete retention engine spanning email, SMS, push notifications, and loyalty programs. Includes a dedicated retention strategist and custom reporting.',
    shortDescription: 'Email, SMS, push, and loyalty with a dedicated strategist.',
    price: 599,
    priceUnit: 'per_month',
    features: [
      'Unlimited email campaigns',
      'SMS campaigns (12/mo)',
      'Push notifications',
      'Loyalty program management',
      'Custom reporting',
      'Dedicated retention strategist',
    ],
    isSubscription: true,
    popular: false,
  },

  // ── Creative ───────────────────────────────────────────────────────
  {
    id: 'logo-visual-identity',
    name: 'Logo & Visual Identity',
    category: 'Creative',
    description:
      'A custom logo package including primary logo, alternate marks, color palette, and typography selection. Delivered with files for print and digital use.',
    shortDescription: 'Custom logo with alternate marks, colors, and typography.',
    price: 499,
    priceUnit: 'one_time',
    features: [
      'Primary logo design',
      'Alternate logo marks',
      'Color palette',
      'Typography selection',
      'Print & digital file formats',
      '3 rounds of revisions',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'brand-guidelines',
    name: 'Brand Guidelines',
    category: 'Creative',
    description:
      'A comprehensive brand guidelines document covering logo usage, color systems, typography, imagery direction, tone of voice, and application examples.',
    shortDescription: 'Comprehensive guidelines for logo, color, type, and voice.',
    price: 999,
    priceUnit: 'one_time',
    features: [
      'Logo usage rules',
      'Color system documentation',
      'Typography guidelines',
      'Imagery direction',
      'Tone of voice guide',
      'Application examples',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'brand-strategy-identity',
    name: 'Brand Strategy & Identity',
    category: 'Creative',
    description:
      'End-to-end brand development including market research, positioning, full visual identity, brand guidelines, and launch collateral. Our most comprehensive brand package.',
    shortDescription: 'Full brand development from research to launch collateral.',
    price: 1499,
    priceUnit: 'one_time',
    features: [
      'Market research & positioning',
      'Full visual identity',
      'Brand guidelines document',
      'Launch collateral design',
      'Social media templates',
      'Brand strategy workshop',
    ],
    isSubscription: false,
    popular: true,
  },
  {
    id: 'product-photography',
    name: 'Product Photography',
    category: 'Creative',
    description:
      'Professional product photography with studio lighting, styling, and retouching. Delivered in high-resolution formats for web and print.',
    shortDescription: 'Studio product photography with professional styling and retouching.',
    price: 115,
    priceUnit: 'per_hour',
    features: [
      'Studio lighting setup',
      'Product styling',
      'High-resolution delivery',
      'Color correction & retouching',
      'Web & print formats',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'lifestyle-photography',
    name: 'Lifestyle Photography',
    category: 'Creative',
    description:
      'On-location lifestyle photography capturing your brand in real-world settings. Includes planning, direction, editing, and high-resolution delivery.',
    shortDescription: 'On-location shoots capturing your brand in real-world settings.',
    price: 130,
    priceUnit: 'per_hour',
    features: [
      'On-location shooting',
      'Scene planning & direction',
      'Professional editing',
      'High-resolution delivery',
      'Usage rights included',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'brand-videography',
    name: 'Brand Videography',
    category: 'Creative',
    description:
      'Professional on-location videography for brand storytelling, interviews, behind-the-scenes, and promotional content. Full production and post-production included.',
    shortDescription: 'On-location videography for storytelling and promotional content.',
    price: 160,
    priceUnit: 'per_hour',
    features: [
      'On-location filming',
      'Professional equipment',
      'Full post-production',
      'Color grading',
      'Licensed music',
      'Multiple format delivery',
    ],
    isSubscription: false,
    popular: false,
  },

  // ── Strategy ───────────────────────────────────────────────────────
  {
    id: 'marketing-strategy-session',
    name: 'Marketing Strategy Session',
    category: 'Strategy',
    description:
      'One-on-one strategy sessions covering campaign planning, channel selection, budget allocation, and performance optimization with an experienced marketing strategist.',
    shortDescription: 'One-on-one campaign planning and channel optimization.',
    price: 120,
    priceUnit: 'per_hour',
    features: [
      'Campaign planning',
      'Channel selection',
      'Budget allocation',
      'Performance review',
      'Action plan deliverable',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'content-planning',
    name: 'Content Planning',
    category: 'Strategy',
    description:
      'Develop a content strategy with editorial calendars, topic ideation, platform-specific plans, and content pillars aligned to your business goals.',
    shortDescription: 'Editorial calendars, topic ideation, and content pillars.',
    price: 100,
    priceUnit: 'per_hour',
    features: [
      'Editorial calendar',
      'Topic ideation',
      'Platform-specific plans',
      'Content pillars',
      'Competitor content analysis',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'brand-consulting',
    name: 'Brand Consulting',
    category: 'Strategy',
    description:
      'Expert guidance on brand positioning, messaging, target audience definition, and competitive differentiation. Ideal for brands undergoing a refresh or launch.',
    shortDescription: 'Brand positioning, messaging, and competitive differentiation.',
    price: 120,
    priceUnit: 'per_hour',
    features: [
      'Brand positioning',
      'Messaging framework',
      'Target audience definition',
      'Competitive analysis',
      'Brand refresh guidance',
    ],
    isSubscription: false,
    popular: false,
  },
  {
    id: 'executive-strategy',
    name: 'Executive Strategy',
    category: 'Strategy',
    description:
      'C-suite advisory sessions covering growth strategy, market expansion, investor-ready branding, and executive communications. White-glove strategic partnership.',
    shortDescription: 'C-suite advisory for growth, expansion, and executive comms.',
    price: 299,
    priceUnit: 'per_hour',
    features: [
      'Growth strategy',
      'Market expansion planning',
      'Investor-ready branding',
      'Executive communications',
      'Quarterly strategic reviews',
      'Priority access',
    ],
    isSubscription: false,
    popular: false,
  },
]
