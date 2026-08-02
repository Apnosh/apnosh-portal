/**
 * /preview/campaign/browse — the store browse with no login, for arguing about its looks.
 *
 * Same contract as the rest of /preview/campaign: fixture props, zero reads. The raw builder
 * component mounts with defaults, so this is the real browse surface (shelves, cards, hero,
 * lens chips) rendering the real catalog. Buying is not wired here on purpose.
 */

import BrowsePreviewView from './view'

export const metadata = { title: 'Store browse, no login' }

export default function PreviewBrowsePage() {
  return <BrowsePreviewView />
}
