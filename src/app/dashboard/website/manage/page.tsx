/**
 * Manage site — consolidated.
 *
 * Previously: hub of 4 tiles linking out to 4 sub-pages (Menu,
 * Specials, Copy, Photos). Owners had to click in/out for each
 * area.
 *
 * Now: one page with collapsible sections. Each section shows the
 * same preview info that was on the tile (counts, badges), and
 * expands inline to the full editor. The dedicated sub-routes now
 * just redirect here for any old bookmarks.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, UtensilsCrossed, Tag, Type, Image as ImageIcon, ChevronDown,
} from 'lucide-react'
import { getMySiteOverview, getMyLocations } from '@/lib/dashboard/my-site-actions'
import { getMyContentFields, getMyDashboardConfig } from '@/lib/dashboard/content-actions'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { listMySpecials } from '@/lib/dashboard/specials-actions'
import SiteManager from '@/components/dashboard/website/site-manager'
import MenuEditor from '@/components/dashboard/website/menu-editor'
import SpecialsEditor from '@/components/dashboard/website/specials-editor'
import ContentEditor from '@/components/dashboard/website/content-editor'

export default async function MySitePage() {
  const [overviewRes, locationsRes, configRes, contentRes, menuRes, specialsRes] = await Promise.all([
    getMySiteOverview(),
    getMyLocations(),
    getMyDashboardConfig(),
    getMyContentFields(),
    listMyMenuItems(),
    listMySpecials(),
  ])

  if (!overviewRes.success) {
    redirect('/dashboard/website')
  }
  const locations = locationsRes.success ? locationsRes.data : []
  const allFields = contentRes.success ? contentRes.data.fields : []
  const hasContentSchema = contentRes.success ? contentRes.data.hasSchema : false
  const menuItems = menuRes.success ? menuRes.data : []
  const specials = specialsRes.success ? specialsRes.data : []
  const enabled = new Set(configRes.success ? configRes.data.features : ['menu', 'specials', 'copy', 'photos'])

  const copyFields = allFields.filter(f => f.type !== 'asset')
  const photoFields = allFields.filter(f => f.type === 'asset')
  const copyEdited = copyFields.filter(f => f.hasOverride).length
  const photoEdited = photoFields.filter(f => f.hasOverride).length
  const menuCategories = new Set(menuItems.map(i => i.category)).size
  const menuFeatured = menuItems.filter(i => i.isFeatured).length
  const specialsActive = specials.filter(s => s.isActive).length
  const specialsWithPhotos = specials.filter(s => !!s.photoUrl).length

  return (
    <div className="max-w-[1000px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4 pt-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to overview
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Your site</h1>
        <p className="text-sm text-ink-3">
          Quick changes here — bigger asks via Request a change.
        </p>
      </div>

      {/* Site status + quick operational actions + recent activity feed. */}
      <SiteManager overview={overviewRes.data} locations={locations} />

      {/* Content area — collapsible sections with full editors inline. */}
      <section className="mt-10">
        <h2 className="text-[15px] font-bold text-ink mb-1">Update your content</h2>
        <p className="text-xs text-ink-3 mb-4">
          Expand a section to edit it.
        </p>
        <div className="space-y-3">
          {enabled.has('menu') && (
            <ManageSection
              icon={UtensilsCrossed}
              title="Menu"
              summary="Prices, items, modifiers, featured picks."
              badges={
                menuItems.length > 0
                  ? [
                      `${menuItems.length} item${menuItems.length === 1 ? '' : 's'}`,
                      `${menuCategories} ${menuCategories === 1 ? 'category' : 'categories'}`,
                      ...(menuFeatured > 0 ? [`${menuFeatured} featured`] : []),
                    ]
                  : ['No items yet']
              }
            >
              <MenuEditor initialItems={menuItems} />
            </ManageSection>
          )}

          {enabled.has('specials') && (
            <ManageSection
              icon={Tag}
              title="Daily specials"
              summary="Recurring deals and combos. Hides on the site when empty."
              badges={
                specials.length > 0
                  ? [
                      `${specialsActive} active`,
                      ...(specialsWithPhotos > 0 ? [`${specialsWithPhotos} with photo${specialsWithPhotos === 1 ? '' : 's'}`] : []),
                    ]
                  : ['None yet']
              }
            >
              <SpecialsEditor initialItems={specials} />
            </ManageSection>
          )}

          {enabled.has('copy') && (
            <ManageSection
              icon={Type}
              title="Pages & copy"
              summary="Wording, taglines, section visibility."
              badges={
                hasContentSchema
                  ? copyFields.length > 0
                    ? [
                        `${copyFields.length} field${copyFields.length === 1 ? '' : 's'}`,
                        ...(copyEdited > 0 ? [`${copyEdited} edited`] : []),
                      ]
                    : ['No copy fields']
                  : ['Site has no schema']
              }
              disabled={!hasContentSchema || copyFields.length === 0}
            >
              {hasContentSchema && copyFields.length > 0 && <ContentEditor fields={copyFields} />}
            </ManageSection>
          )}

          {enabled.has('photos') && (
            <ManageSection
              icon={ImageIcon}
              title="Photos"
              summary="Logo, hero photo, about photo, etc."
              badges={
                hasContentSchema
                  ? photoFields.length > 0
                    ? [
                        `${photoFields.length} slot${photoFields.length === 1 ? '' : 's'}`,
                        ...(photoEdited > 0 ? [`${photoEdited} replaced`] : []),
                      ]
                    : ['No photo slots']
                  : ['Site has no schema']
              }
              disabled={!hasContentSchema || photoFields.length === 0}
            >
              {hasContentSchema && photoFields.length > 0 && <ContentEditor fields={photoFields} />}
            </ManageSection>
          )}
        </div>
        {enabled.size === 0 && (
          <div className="rounded-xl border border-dashed border-ink-6 bg-white p-6 text-center text-sm text-ink-3">
            Your site hasn&apos;t declared any editable content yet. Send us a request to get set up.
          </div>
        )}
      </section>
    </div>
  )
}

/* Collapsible section with the same tile-style preview header.
   Closed by default so opening the page isn't a wall of editors. */
function ManageSection({
  icon: Icon, title, summary, badges, children, disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  summary: string
  badges: string[]
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <details className="rounded-2xl border border-ink-6 bg-white overflow-hidden group">
      <summary className={`px-5 py-4 cursor-pointer hover:bg-bg-2/40 flex items-start gap-3 list-none ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      }`}>
        <div className="w-9 h-9 rounded-lg bg-brand-tint flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-brand-dark" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
            <ChevronDown className="w-3.5 h-3.5 text-ink-4 transition-transform group-open:rotate-180" />
          </div>
          <p className="text-[11.5px] text-ink-3 mt-0.5">{summary}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {badges.map((b, i) => (
              <span key={i} className="inline-flex text-[10.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-7 text-ink-3">
                {b}
              </span>
            ))}
          </div>
        </div>
      </summary>
      {!disabled && (
        <div className="border-t border-ink-6 p-4 lg:p-5">
          {children}
        </div>
      )}
    </details>
  )
}
