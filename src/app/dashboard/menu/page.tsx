/**
 * /dashboard/menu — Mobile-first navigation hub.
 *
 * Replaces the slide-in sidebar drawer on mobile. Lays out every
 * destination as a grouped, scannable card list — each row is a 60px+
 * touch target with icon, label, and chevron.
 *
 * Groupings mirror the desktop sidebar conceptually but with simpler
 * one-level structure (no expandable nested children — those drill in
 * naturally on their own pages).
 *
 * The page is responsive, so it also works on desktop, but its primary
 * audience is the mobile owner tapping the "Menu" tab in the bottom
 * bar.
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Search, ChevronRight,
  Target, CheckSquare, MessageSquare, Calendar,
  Sparkles, MapPin, Mail, Globe, ShoppingBag, Newspaper,
  Building2, Users, Palette, Link2, BarChart3,
  CreditCard, FileText, Settings, HelpCircle,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import SignOutButton from './sign-out-button'

export const dynamic = 'force-dynamic'

interface NavCard {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /* Optional one-line description shown below the label on mobile. */
  description?: string
  /* Optional badge count (filled by parent). */
  badge?: number
}

interface NavGroup {
  label: string
  description?: string
  items: NavCard[]
}

/* Sections tuned for mobile browsing. Each card is one tap to a real
   destination — no expandable accordions. Sub-pages (Calendar, Inbox,
   etc.) live inside their parent channel's own page. */
const SECTIONS: NavGroup[] = [
  {
    label: 'Every day',
    description: 'Your most common destinations',
    items: [
      { label: 'Today',       href: '/dashboard',           icon: Target,        description: 'Your daily briefing' },
      { label: 'Audit',       href: '/dashboard/audit',     icon: BarChart3,     description: 'Score + what to fix' },
      { label: 'Inbox',       href: '/dashboard/inbox',     icon: CheckSquare,   description: 'Approvals + reviews + tasks' },
      { label: 'Messages',    href: '/dashboard/messages',  icon: MessageSquare, description: 'Talk to your team' },
      { label: 'Calendar',    href: '/dashboard/calendar',  icon: Calendar,      description: 'Content schedule' },
    ],
  },
  {
    label: 'Get found',
    description: 'How customers discover you',
    items: [
      { label: 'Local SEO',   href: '/dashboard/local-seo',          icon: MapPin,      description: 'Google search + Maps' },
      { label: 'Reviews',     href: '/dashboard/local-seo/reviews',  icon: Sparkles,    description: 'Respond + monitor' },
      { label: 'Your listing', href: '/dashboard/local-seo/listing', icon: Building2,   description: 'GBP hours, photos, info' },
    ],
  },
  {
    label: 'Look engaged',
    description: 'Active social and web presence',
    items: [
      { label: 'Social media', href: '/dashboard/social',    icon: Sparkles, description: 'Instagram, Facebook, TikTok' },
      { label: 'Website',      href: '/dashboard/website',   icon: Globe,    description: 'Pages + traffic + forms' },
      { label: 'Email & SMS',  href: '/dashboard/email-sms', icon: Mail,     description: 'Campaigns + list' },
    ],
  },
  {
    label: 'Grow with help',
    description: 'Find experts to handle the work',
    items: [
      { label: 'Marketplace',  href: '/dashboard/marketplace', icon: ShoppingBag, description: 'Photographers, designers, agencies' },
      { label: 'Team',         href: '/dashboard/team',        icon: Users,       description: 'Strategists assigned to you' },
      { label: 'Weekly briefs', href: '/dashboard/briefs',     icon: Newspaper,   description: 'Strategy memos + recaps' },
    ],
  },
  {
    label: 'Your business',
    description: 'Identity, content, integrations',
    items: [
      { label: 'Restaurant info',  href: '/dashboard/restaurant',                icon: Building2, description: 'Cuisine, hours, location' },
      { label: 'Brand & assets',   href: '/dashboard/assets',                    icon: Palette,   description: 'Logo, photos, style guide' },
      { label: 'Connections',      href: '/dashboard/connected-accounts',        icon: Link2,     description: 'Social + Google integrations' },
      { label: 'Business profile', href: '/dashboard/profile',                   icon: Building2, description: 'Story + reservations' },
    ],
  },
  {
    label: 'Account',
    description: 'Settings, billing, and help',
    items: [
      { label: 'Services',   href: '/dashboard/services',   icon: ShoppingBag, description: 'Active subscriptions' },
      { label: 'Billing',    href: '/dashboard/billing',    icon: CreditCard,  description: 'Invoices + payment method' },
      { label: 'Agreements', href: '/dashboard/agreements', icon: FileText,    description: 'Contracts on file' },
      { label: 'Settings',   href: '/dashboard/settings',   icon: Settings,    description: 'Profile, security, preferences' },
      { label: 'Help',       href: '/dashboard/help',       icon: HelpCircle,  description: 'Docs + contact support' },
    ],
  },
]

export default async function MenuPage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  let restaurantName = 'Apnosh'
  let userName = user.email ?? 'Account'
  let userEmail = user.email ?? ''
  let userInitials = 'AP'

  if (clientId) {
    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle() as { data: { name: string } | null }
    if (client?.name) restaurantName = client.name

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle() as { data: { full_name: string | null; email: string | null } | null }
    if (profile?.full_name) {
      userName = profile.full_name
      userInitials = profile.full_name.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2)
    } else {
      userInitials = (user.email ?? 'AP').slice(0, 2).toUpperCase()
    }
    if (profile?.email) userEmail = profile.email
  }

  return (
    <div className="max-w-2xl mx-auto pb-tabbar lg:pb-0 -mx-4 lg:mx-0 -mt-4 lg:mt-0">
      {/* Account card */}
      <div className="bg-gradient-to-br from-brand-tint/60 to-white px-5 pt-5 pb-4 lg:rounded-2xl lg:border lg:border-ink-6 mb-3">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-brand text-white text-[16px] font-bold flex items-center justify-center flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-semibold text-ink truncate">{restaurantName}</p>
            <p className="text-[12px] text-ink-3 truncate">{userName}</p>
            {userEmail && userEmail !== userName && (
              <p className="text-[11px] text-ink-4 truncate">{userEmail}</p>
            )}
          </div>
        </div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 bg-white border border-ink-6 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-2 active:bg-ink-7"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage account
        </Link>
      </div>

      {/* Search hint (UI only for v1 — drives to global search later) */}
      <div className="px-4 lg:px-0 mb-3">
        <Link
          href="/dashboard/help"
          className="flex items-center gap-2 bg-white border border-ink-6 rounded-full px-3.5 h-11 text-[13.5px] text-ink-3 active:bg-ink-7"
        >
          <Search className="w-4 h-4 text-ink-4 flex-shrink-0" />
          <span>Find something specific...</span>
        </Link>
      </div>

      {/* Sections */}
      <div className="space-y-5">
        {SECTIONS.map(section => (
          <section key={section.label}>
            <div className="px-4 lg:px-0 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
                {section.label}
              </p>
              {section.description && (
                <p className="text-[12px] text-ink-4 mt-0.5">{section.description}</p>
              )}
            </div>
            <ul className="bg-white lg:rounded-2xl border-y lg:border border-ink-6 divide-y divide-ink-7">
              {section.items.map(item => {
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      className="flex items-center gap-3 px-4 lg:px-5 py-3 min-h-[60px] active:bg-ink-7 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-ink-7 text-ink-2 flex-shrink-0">
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14.5px] font-semibold text-ink leading-tight">{item.label}</p>
                        {item.description && (
                          <p className="text-[11.5px] text-ink-3 mt-0.5 leading-snug">{item.description}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Sign out */}
      <div className="px-4 lg:px-0 mt-6 mb-4">
        <Suspense fallback={null}>
          <SignOutButton />
        </Suspense>
      </div>

      {/* App version footer */}
      <p className="text-center text-[11px] text-ink-4 pb-6">
        Apnosh · v0.1
      </p>
    </div>
  )
}
