/**
 * THE DIRECTORY LIST — pure, no I/O.
 *
 * "Get listed everywhere" is the one setup card with no API behind it, by decision, not by
 * accident. An earlier version tried to auto-check Yelp through its API, which bought one
 * directory out of six and cost the whole screen its clarity: five entries reading "not
 * checked" next to one reading "matches" makes an owner wonder what we actually know. The
 * answer was "almost nothing", and a screen that says so in six different ways is worse than
 * one that never claimed to look.
 *
 * So this card does not inspect anything. It does the part that is genuinely hard for an
 * owner and needs no API at all:
 *
 *   - one place holding the exact right name, address and phone, taken from their Google
 *     listing, ready to copy. Retyping an address into six sites is HOW they end up different
 *   - the list of directories worth having, in the order worth doing them
 *   - a direct link to the page that edits each one
 *
 * Whether each is now correct is the owner's word. That is the honest state of it, and the
 * three lanes are priced on exactly that: do it yourself, be walked through it, or hand it over.
 *
 * The strategist's own audit tool (`src/lib/citation-audit.ts`, the admin SEO toolkit) is
 * unrelated and still live. It records what a person actually verified. Keep the two apart:
 * an owner's "I sorted it" must never be filed as evidence that we checked.
 */

export type DirectoryKey =
  | 'yelp' | 'apple_maps' | 'facebook' | 'bing' | 'tripadvisor' | 'foursquare'

export interface Directory {
  key: DirectoryKey
  label: string
  /** Why an owner should care, in plain words. No invented statistics. */
  why: string
  /** Where they actually go to claim or correct it. */
  actionUrl: string
  /** What the button says, because "claim" and "edit" are different jobs. */
  actionLabel: string
  /** The one thing that trips people up on this particular site. */
  tip: string
}

/** Ordered by what moves the needle for a restaurant, not alphabetically. */
export const DIRECTORIES: readonly Directory[] = [
  {
    key: 'yelp', label: 'Yelp',
    why: 'Where a lot of people still look up a restaurant before deciding.',
    actionUrl: 'https://biz.yelp.com/', actionLabel: 'Open Yelp for Business',
    tip: 'If someone else already claimed it, Yelp will ask you to verify by phone at the restaurant.',
  },
  {
    key: 'apple_maps', label: 'Apple Maps',
    why: 'The map that opens by default on every iPhone.',
    actionUrl: 'https://businessconnect.apple.com/', actionLabel: 'Open Apple Business Connect',
    tip: 'You need an Apple ID. Use one that is not tied to a staff member who might leave.',
  },
  {
    key: 'facebook', label: 'Facebook',
    why: 'People check your page for hours before they drive over.',
    actionUrl: 'https://www.facebook.com/pages/', actionLabel: 'Open your Facebook page',
    tip: 'Check the About tab, not just the header. Hours and address live in different places.',
  },
  {
    key: 'bing', label: 'Bing Places',
    why: 'Feeds Bing and some voice assistants. Quick to fix, easy to forget.',
    actionUrl: 'https://www.bingplaces.com/', actionLabel: 'Open Bing Places',
    tip: 'It can import straight from your Google listing, which is the fastest way to match.',
  },
  {
    key: 'tripadvisor', label: 'TripAdvisor',
    why: 'Matters most if visitors and tourists find you.',
    actionUrl: 'https://www.tripadvisor.com/Owners', actionLabel: 'Open TripAdvisor for Owners',
    tip: 'Skip this one if you mostly serve locals. It is not worth the time for every place.',
  },
  {
    key: 'foursquare', label: 'Foursquare',
    why: 'Quietly feeds other apps and maps with your details.',
    actionUrl: 'https://business.foursquare.com/', actionLabel: 'Open Foursquare for Business',
    tip: 'Often has an old auto-created entry with a former address. Worth a look even if you never signed up.',
  },
] as const

/** The truth every directory should be made to match: what Google has. */
export interface SourceNap { name: string; address: string; phone: string }

export interface PlannedDirectory extends Directory {
  /** The owner said they handled this one. Their word, not our check. */
  done: boolean
}

export interface CitationPlan {
  source: SourceNap
  /** Which of name / address / phone Google itself is missing. Copying an incomplete source
   *  into six other places spreads the gap instead of closing it, so the card stops on this. */
  sourceMissing: string[]
  sourceReady: boolean
  directories: PlannedDirectory[]
  doneCount: number
  total: number
  headline: string
}

export function buildCitationPlan(source: SourceNap, fixed: string[] = []): CitationPlan {
  const done = new Set(fixed)
  // Not-yet-done first, so the list opens on what is left rather than on past work.
  const directories: PlannedDirectory[] = DIRECTORIES
    .map((d) => ({ ...d, done: done.has(d.key) }))
    .sort((a, b) => Number(a.done) - Number(b.done))

  const sourceMissing = [
    !source.name.trim() && 'name',
    !source.address.trim() && 'address',
    !source.phone.trim() && 'phone',
  ].filter(Boolean) as string[]

  const doneCount = directories.filter((d) => d.done).length

  return {
    source,
    sourceMissing,
    sourceReady: sourceMissing.length === 0,
    directories,
    doneCount,
    total: DIRECTORIES.length,
    headline: headlineFor(doneCount, DIRECTORIES.length, sourceMissing),
  }
}

/**
 * Counted from what the owner told us, and worded so it never sounds like we looked.
 * "You have sorted 2 of 6" is true. "2 of 6 are correct" would not be.
 */
export function headlineFor(doneCount: number, total: number, sourceMissing: string[]): string {
  if (sourceMissing.length > 0) {
    return `Google is missing your ${joinWords(sourceMissing)}, so there is nothing for the others to copy yet.`
  }
  if (doneCount === 0) return `${total} places worth having your details right, and the exact text to use.`
  if (doneCount >= total) return 'You have been through all of them.'
  return `You have sorted ${doneCount} of ${total}.`
}

/** "name and phone", "name, address and phone". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The three lines that go into every directory, from the one source. */
export function correctValues(source: SourceNap): { label: string; value: string }[] {
  return [
    { label: 'Name', value: source.name },
    { label: 'Address', value: source.address },
    { label: 'Phone', value: source.phone },
  ].filter((r) => r.value.trim())
}
