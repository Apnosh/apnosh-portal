/**
 * Manage-site hub.
 *
 * Architecture: hub-and-spoke.
 *  - This page shows site status, quick operational actions (hours, promo,
 *    event, closure), and a tile-grid that links into focused editor pages
 *    for each content area (menu, specials, copy, photos).
 *  - Each tile shows a compact preview (counts, recent edits) so the
 *    business owner can see the state of their site at a glance.
 *
 * Why not one long scrolling page (the previous design):
 *  - Mental model mismatch: owners think in tasks ("update my menu"), not
 *    data tables. Tiles match tasks.
 *  - Scaling: each new content type added another scroll section. Tiles
 *    scale flat -- new types just add a tile.
 *  - Mobile: a wall of editors is unusable on a phone; a 2-col tile grid
 *    is fine.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, UtensilsCrossed, Tag, Type, Image as ImageIcon,
} from 'lucide-react'
import { getMySiteOverview, getMyLocations } from '@/lib/dashboard/my-site-actions'
import { getMyContentFields } from '@/lib/dashboard/content-actions'
import { listMyMenuItems } from '@/lib/dashboard/menu-actions'
import { listMySpecials } from '@/lib/dashboard/specials-actions'
import SiteManager from '@/components/dashboard/website/site-manager'
import ContentTile from '@/components/dashboard/website/hub/content-tile'

export default async function MySitePage() {
  // All four loads run in parallel, then we render the hub with previews.
  const [overviewRes, locationsRes, contentRes, menuRes, specialsRes] = await Promise.all([
    getMySiteOverview(),
    getMyLocations(),
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

  // ── Tile previews (cheap derivations off the loaded data) ──────────
  const copyFields = allFields.filter(f => f.type !== 'asset')
  const photoFields = allFields.filter(f => f.type === 'asset')
  const copyEdited = copyFields.filter(f => f.hasOverride).length
  const photoEdited = photoFields.filter(f => f.hasOverride).length

  const menuCategories = new Set(menuItems.map(i => i.category)).size
  const menuFeatured = menuItems.filter(i => i.isFeatured).length

  const specialsActive = specials.filter(s => s.isActive).length
  const specialsWithPhotos = specials.filter(s => !!s.photoUrl).length

  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">My website</h1>
        <p className="text-sm text-ink-3">
          See your site status and push quick updates. Bigger changes? Send us a request.
        </p>
      </div>

      {/* Site status + quick operational actions + recent activity feed.
          This stays as the single "what's happening right now" surface. */}
      <SiteManager overview={overviewRes.data} locations={locations} />

      {/* Content area — tile grid linking into focused editor pages. */}
      <section className="mt-10">
        <h2 className="text-[15px] font-bold text-ink mb-1">Update your content</h2>
        <p className="text-xs text-ink-3 mb-4">
          Click a tile to focus on one area at a time.
        </p>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <ContentTile
            href="/dashboard/website/manage/menu"
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
          />
          <ContentTile
            href="/dashboard/website/manage/specials"
            icon={Tag}
            title="Daily specials"
            summary="Recurring deals and combos. Hides when empty."
            badges={
              specials.length > 0
                ? [
                    `${specialsActive} active`,
                    ...(specialsWithPhotos > 0 ? [`${specialsWithPhotos} with photo${specialsWithPhotos === 1 ? '' : 's'}`] : []),
                  ]
                : ['None yet']
            }
          />
          <ContentTile
            href="/dashboard/website/manage/copy"
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
          />
          <ContentTile
            href="/dashboard/website/manage/photos"
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
          />
        </div>
      </section>
    </div>
  )
}
