/**
 * Link shortening + click tracking.
 *
 * Creates short codes that redirect through our API.
 * Tracks click counts per link.
 */

import crypto from 'crypto'

/**
 * Generate a short code for a URL.
 */
export function generateShortCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6)
}

/**
 * Build the short URL from a code.
 */
export function buildShortUrl(code: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/r/${code}`
}
