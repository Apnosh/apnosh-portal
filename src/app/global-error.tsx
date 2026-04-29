'use client'

/**
 * Global error boundary -- catches uncaught React errors anywhere in the app.
 *
 * Two jobs:
 *   1. Report the error to Sentry with whatever context we have so we know
 *      something broke for a real user (not just for me running the dev
 *      server).
 *   2. Show a friendly fallback so the client doesn't see a blank page.
 *
 * App Router calls this whenever an error escapes a route's own error.tsx,
 * so it's the last line of defense. Should be rare; when it fires, it's
 * always worth investigating.
 */

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 2rem', maxWidth: 560, margin: '0 auto', color: '#1a1a1a' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong.</h1>
        <p style={{ color: '#555', marginBottom: '1.5rem' }}>
          We&apos;ve been notified and we&apos;re looking into it. Try reloading the page; if it keeps happening, send us a quick message.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem', borderRadius: 6,
              background: '#1a1a1a', color: 'white', border: 'none',
              cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            Reload
          </button>
          <a
            href="/dashboard/website/requests/new"
            style={{
              padding: '0.5rem 1rem', borderRadius: 6,
              background: 'transparent', color: '#1a1a1a',
              border: '1px solid #ddd', textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Send a message
          </a>
        </div>
        {error.digest && (
          <p style={{ marginTop: '1.5rem', color: '#888', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            Reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
