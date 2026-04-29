/**
 * Sentry init for the browser bundle.
 *
 * No-ops when NEXT_PUBLIC_SENTRY_DSN isn't set so dev/preview keeps working
 * without a Sentry project hooked up. Production reads the DSN from Vercel
 * env vars.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Keep the bundle light: no replay/profiling for now. Add later when we
    // know what we want to investigate.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Filter known noise (e.g. browser extensions injecting errors).
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
    // Tag every event with the env so Sentry's UI separates production from
    // preview/dev cleanly.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Only send errors that happen on apnosh.com domains; ignore third-party
    // scripts (e.g. injected analytics) erroring out on our pages.
    allowUrls: [/portal\.apnosh\.com/, /apnosh\.com/, /localhost/],
  })
}
