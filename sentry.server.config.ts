/**
 * Sentry init for the Node.js (App Router server) runtime.
 *
 * Captures: server-action errors, route-handler crashes, unhandled rejections
 * inside server components. No-ops without SENTRY_DSN.
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
