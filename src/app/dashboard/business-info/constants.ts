/**
 * Shared business-info constants.
 *
 * Kept out of actions.ts because that file is a "use server" module,
 * and Next.js only allows async function exports from server files.
 * Value exports (like this default) must live in a plain module.
 */

import type { BusinessLinks } from './actions'

export const EMPTY_LINKS: BusinessLinks = { ordering: [], reservations: [], social: {} }
