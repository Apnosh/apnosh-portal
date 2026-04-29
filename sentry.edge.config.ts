/**
 * Sentry init for the edge runtime (middleware + edge route handlers).
 * No-ops without SENTRY_DSN.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  })
}
