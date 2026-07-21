/**
 * THE DIRECTORY REGISTRY AND PLAN — pure, no I/O, so it can be checked against real rows.
 *
 * "Get listed everywhere" is a different shape from the other owner-run setup cards, and the
 * difference is the whole design:
 *
 *   the Google cards   we read the setting, we change the setting, we read it back to prove it
 *   this card          we can read ONE directory automatically (Yelp, via its API) and we can
 *                      write NONE of them
 *
 * So this lane cannot end in a write, and it must not pretend to. What it ends in is the part
 * that is actually hard for an owner: knowing the exact right values, knowing which directories
 * are wrong, and knowing where to go to fix each one. We hand them that, one at a time, with
 * the correct text ready to copy and a direct link to the page that edits it.
 *
 * The honesty rule this file exists to enforce: a directory we have never looked at is
 * reported as UNCHECKED, never as fine. Silence is not a clean bill of health, and an owner
 * told "all good" about a listing nobody opened is worse off than one told nothing.
 */

/** Matches the `platform` values in citation_audits. That column is free text (see migration
 *  129), so this list is the real definition and adding to it needs no migration. */
export type DirectoryKey =
  | 'yelp' | 'apple_maps' | 'facebook' | 'bing' | 'tripadvisor' | 'foursquare'

export interface Directory {
  key: DirectoryKey
  label: string
  /** Why an owner should care, in plain words. No invented statistics. */
  why: string
  /** Where they actually go to claim or correct it. */
  actionUrl: string
  /** What the button should say, because "claim" and "edit" are different jobs. */
  actionLabel: string
  /** True only where we have a real API read. Everything else needs human eyes. */
  autoCheck: boolean
}

/** Ordered by what moves the needle for a restaurant, not alphabetically. Yelp first because
 *  it is both the highest traffic for food and the one we can check ourselves; Apple Maps
 *  second because it is the default map on every iPhone and owners routinely forget it. */
export const DIRECTORIES: readonly Directory[] = [
  {
    key: 'yelp', label: 'Yelp',
    why: 'Where a lot of people still look up a restaurant before deciding.',
    actionUrl: 'https://biz.yelp.com/', actionLabel: 'Open Yelp for Business', autoCheck: true,
  },
  {
    key: 'apple_maps', label: 'Apple Maps',
    why: 'The map that opens by default on every iPhone.',
    actionUrl: 'https://businessconnect.apple.com/', actionLabel: 'Open Apple Business Connect', autoCheck: false,
  },
  {
    key: 'facebook', label: 'Facebook',
    why: 'People check your page for hours before they drive over.',
    actionUrl: 'https://www.facebook.com/pages/', actionLabel: 'Open your Facebook page', autoCheck: false,
  },
  {
    key: 'bing', label: 'Bing Places',
    why: 'Feeds Bing and some voice assistants. Quick to fix, easy to forget.',
    actionUrl: 'https://www.bingplaces.com/', actionLabel: 'Open Bing Places', autoCheck: false,
  },
  {
    key: 'tripadvisor', label: 'TripAdvisor',
    why: 'Matters most if visitors and tourists find you.',
    actionUrl: 'https://www.tripadvisor.com/Owners', actionLabel: 'Open TripAdvisor for Owners', autoCheck: false,
  },
  {
    key: 'foursquare', label: 'Foursquare',
    why: 'Quietly feeds other apps and maps with your details.',
    actionUrl: 'https://business.foursquare.com/', actionLabel: 'Open Foursquare for Business', autoCheck: false,
  },
] as const

/** The truth every directory is compared against: what Google has. */
export interface SourceNap { name: string; address: string; phone: string }

/** One audit row, narrowed to what the plan reasons about. */
export interface AuditRow {
  platform: string
  listingUrl: string | null
  nameFound: string | null
  addressFound: string | null
  phoneFound: string | null
  consistent: boolean | null
  inconsistencies: string[]
  checkedAt: string
  source: 'manual' | 'api' | 'scrape'
  notes: string | null
}

export type DirectoryStatus =
  /** Checked, and it matches Google. */
  | 'match'
  /** Checked, and one or more of name, address, phone is different. */
  | 'differs'
  /** Checked, and no listing was found at all. */
  | 'missing'
  /** Nobody has looked. NOT the same as fine. */
  | 'unchecked'

export interface PlannedDirectory extends Directory {
  status: DirectoryStatus
  /** Which of name / address / phone differ. Empty unless status is 'differs'. */
  differs: string[]
  found: { name: string | null; address: string | null; phone: string | null } | null
  listingUrl: string | null
  checkedAt: string | null
  notes: string | null
}

export interface CitationPlan {
  source: SourceNap
  /** Which of name / address / phone Google itself is missing. Fixing directories against an
   *  incomplete source would spread the gap, so the walkthrough stops on this. */
  sourceMissing: string[]
  sourceReady: boolean
  directories: PlannedDirectory[]
  counts: { differs: number; missing: number; unchecked: number; match: number }
  /** Everything we know is wrong: a mismatch or an absent listing. */
  needsWork: number
  headline: string
}

/** Rank for the working order: real problems first, then gaps, then unknowns, then the ones
 *  already fine. An owner with ten minutes should spend it where something is actually wrong. */
const RANK: Record<DirectoryStatus, number> = { differs: 0, missing: 1, unchecked: 2, match: 3 }

export function buildCitationPlan(source: SourceNap, audits: AuditRow[]): CitationPlan {
  const byPlatform = new Map(audits.map((a) => [a.platform, a]))

  const directories: PlannedDirectory[] = DIRECTORIES.map((d) => {
    const a = byPlatform.get(d.key)
    if (!a) {
      return { ...d, status: 'unchecked' as const, differs: [], found: null, listingUrl: null, checkedAt: null, notes: null }
    }
    // A row with no name found is a row that says "we looked and there was nothing there".
    const nothingFound = !a.nameFound && !a.addressFound && !a.phoneFound
    const status: DirectoryStatus = nothingFound ? 'missing' : a.inconsistencies.length > 0 ? 'differs' : 'match'
    return {
      ...d,
      status,
      differs: status === 'differs' ? a.inconsistencies : [],
      found: nothingFound ? null : { name: a.nameFound, address: a.addressFound, phone: a.phoneFound },
      listingUrl: a.listingUrl,
      checkedAt: a.checkedAt,
      notes: a.notes,
    }
  }).sort((x, y) => RANK[x.status] - RANK[y.status])

  const counts = {
    differs: directories.filter((d) => d.status === 'differs').length,
    missing: directories.filter((d) => d.status === 'missing').length,
    unchecked: directories.filter((d) => d.status === 'unchecked').length,
    match: directories.filter((d) => d.status === 'match').length,
  }

  const sourceMissing = [
    !source.name.trim() && 'name',
    !source.address.trim() && 'address',
    !source.phone.trim() && 'phone',
  ].filter(Boolean) as string[]

  const needsWork = counts.differs + counts.missing

  return {
    source,
    sourceMissing,
    sourceReady: sourceMissing.length === 0,
    directories,
    counts,
    needsWork,
    headline: headlineFor(counts, sourceMissing),
  }
}

/** Counted, never guessed, and never quiet about what we did not look at. */
export function headlineFor(
  counts: CitationPlan['counts'],
  sourceMissing: string[],
): string {
  if (sourceMissing.length > 0) {
    return `Google is missing your ${joinWords(sourceMissing)}, so there is nothing to match the others against yet.`
  }
  const wrong = counts.differs + counts.missing
  const checked = counts.match + wrong
  if (wrong === 0 && counts.unchecked === 0) return 'Every directory we track matches your Google listing.'
  // Nothing checked at all is its own sentence. The general form below produced "Nothing is
  // wrong on the 0 we checked", which is both awkward and reads as reassurance about work
  // that never happened.
  if (checked === 0) return `None of the ${counts.unchecked} directories we track have been checked yet.`
  if (wrong === 0) return `Nothing is wrong on the ${counts.match} we checked. ${counts.unchecked} still ${counts.unchecked === 1 ? 'needs' : 'need'} a look.`
  const head = `${wrong} ${wrong === 1 ? 'directory does' : 'directories do'} not match your Google listing`
  return counts.unchecked > 0 ? `${head}, and ${counts.unchecked} more ${counts.unchecked === 1 ? 'has' : 'have'} not been checked.` : `${head}.`
}

/** "name and phone", "name, address and phone". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** What the owner should paste into whichever directory they are fixing. Built from the
 *  source, so it is always the same three lines everywhere, which is the entire point. */
export function correctValues(source: SourceNap): { label: string; value: string }[] {
  return [
    { label: 'Name', value: source.name },
    { label: 'Address', value: source.address },
    { label: 'Phone', value: source.phone },
  ].filter((r) => r.value.trim())
}
