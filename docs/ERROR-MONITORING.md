# Error monitoring (Sentry)

Why this exists: with paying clients on the platform, every uncaught
error is a signal that something broke for someone. Sentry is the eyes.

## What's wired up

- `@sentry/nextjs` SDK installed (client + server + edge runtimes)
- `instrumentation.ts` registers Sentry on server start
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`
  initialize per runtime
- `next.config.ts` is wrapped with `withSentryConfig` for source maps + tunnel route
- `app/global-error.tsx` catches uncaught React errors, reports them, and
  shows a friendly fallback
- `components/sentry-user-context.tsx` sets `user` and `client_id` tags on
  every event so triage tells us WHO hit the error

Every piece **no-ops when env vars are missing** so dev / preview deploys
keep working without Sentry credentials.

## To turn it on (one-time)

1. Create a free Sentry account at https://sentry.io/signup/
2. Create a project: type "Next.js"
3. Sentry shows a DSN like `https://<key>@o<org>.ingest.us.sentry.io/<project>`
4. In Vercel project settings → Environment Variables, add for **all environments**:

   | Variable | Value | Source |
   |---|---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | the DSN from step 3 | client errors |
   | `SENTRY_DSN` | same DSN | server errors |
   | `SENTRY_ORG` | your org slug | source maps |
   | `SENTRY_PROJECT` | your project slug | source maps |
   | `SENTRY_AUTH_TOKEN` | from Sentry → Settings → Auth Tokens | source maps |

5. Redeploy. From that point, every error gets reported.

## When an error fires

Sentry will show you:

- The stack trace (with original source thanks to source maps)
- Which user (`user.id`, `user.email`)
- Which client (`client_id`, `client_slug`, `client_name` tags)
- Browser / runtime / URL / breadcrumbs

Triage flow:

1. Look at the `client_id` tag — is this one client or many?
2. Look at the URL — is this a single page or systemic?
3. Check the timestamp — is this a regression from a recent deploy?
4. Fix the bug. Sentry auto-resolves when no new occurrences for 7 days.

## What to ignore

The client config already filters known browser-extension noise
(`ResizeObserver loop limit exceeded` and similar). When new noise
appears, add it to the `ignoreErrors` array in `sentry.client.config.ts`.

## What's NOT captured (yet)

- Performance traces (we set `tracesSampleRate: 0.1` in production but
  haven't built dashboards around it yet)
- Session replay (would help debug client-side issues but adds bundle
  weight; revisit when needed)
- Release tracking (auto-created when source maps upload but no release
  notes wired up)
