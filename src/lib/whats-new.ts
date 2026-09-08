/**
 * What changed, newest first. Kept by hand: add a line when something owners can see ships.
 * Plain words only.
 *
 * It lives here rather than inside /dashboard/whats-new so the More hub can read the newest date
 * without importing a page. That row used to be a bare noun; now it says when the last change
 * landed, which is the only thing an owner wants to know before deciding to tap it.
 */
import type { HueKey } from '@/components/mvp/hues'

export interface NewsItem { date: string; title: string; body: string; hue: HueKey }

export const NEWS: NewsItem[] = [
  { date: 'Sep 8', title: 'A More tab that reads like the rest', body: 'Same rows, same colours and same shape as your business info. Every row now says what is inside it, and everything you can reach from here has a door.', hue: 'mint' },
  { date: 'Sep 5', title: 'A simpler More tab', body: 'Your logo, hours and goals on top. Fewer rows. Your settings and the people you have worked with each have their own page.', hue: 'mint' },
  { date: 'Sep 4', title: 'Messages look like a chat app', body: 'People you can message across the top. Only real conversations in the list. Search finds people and messages.', hue: 'event' },
  { date: 'Sep 4', title: 'Cleaner screens', body: 'No boxes behind lists. No circles around icons. More of the screen is yours.', hue: 'brand' },
  { date: 'Sep 4', title: 'Every campaign has a colour', body: 'Campaign cards, the calendar and the home graph all use the same colours, so you can tell things apart at a glance.', hue: 'newfaces' },
  { date: 'Sep 4', title: 'Alerts that mean it', body: 'The bell turns amber when something needs you. Results cards swipe.', hue: 'amber' },
]

/** The date on the newest line, or null when there is nothing to say. */
export const newestNewsDate = (): string | null => NEWS[0]?.date ?? null
