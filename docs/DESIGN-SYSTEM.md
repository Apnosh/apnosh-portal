# Design system primitives

Reusable UI building blocks. Use these instead of rolling your own. The
goal is consistency: every empty state looks the same, every loading
state looks the same, every error state looks the same.

## Why this matters

When 30 pages each implement their own "no data" empty state, fixing one
thing means fixing it 30 places. When they all use `<EmptyState>`, fixing
one thing fixes everywhere. Same for loading skeletons, error fallbacks,
and section headers.

## The four primitives

### `<EmptyState>` — for when a list / page has no data yet

```tsx
import EmptyState from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

<EmptyState
  icon={Inbox}
  title="No briefs yet"
  description="Your first weekly brief will land Monday."
  action={
    <button>...</button>  // optional CTA
  }
/>
```

When to use: any time you'd write "if (data.length === 0) return <something
saying empty>". Wrap in a card with `bg-white rounded-xl border border-ink-6`
when it sits inline with other cards.

### `<ErrorState>` — for when a fetch fails

```tsx
import ErrorState from '@/components/ui/error-state'

<ErrorState
  title="Couldn't load your reviews"
  description="We hit an error. Try again or send us a message."
  onRetry={() => refetch()}
  details={errorMessage}  // optional, shown behind a "show details" toggle
/>
```

Always include either `onRetry` or a custom `action`. Never leave a user
stuck on an error page with no path forward.

### `<LoadingState>` family — for data in flight

```tsx
import { LoadingPage, LoadingSpinner, LoadingSkeleton, LoadingCard, LoadingTable } from '@/components/ui/loading'

// Whole page (e.g. server component while data resolves)
<LoadingPage />

// Inline spinner
<LoadingSpinner size="sm" />

// Specific shape (matches what's about to render)
<LoadingSkeleton width="60%" height="2rem" />
<LoadingCard />
<LoadingTable rows={5} columns={4} />
```

Prefer skeleton over spinner whenever the user is waiting for content
they can predict the shape of (charts, lists, cards). Spinner only when
the action is opaque (a request submitting).

### `<SectionHeader>` — page or section titles

```tsx
import SectionHeader from '@/components/ui/section-header'

<SectionHeader
  title="Daily specials"
  subtitle="Recurring deals like 'Happy Hour 3-5pm.'"
  backHref="/dashboard/website/manage"   // optional back link
  action={<button>Add</button>}          // optional right-side action
/>
```

Use this at the top of every page instead of bespoke `<h1>` patterns.
Standardizes spacing, typography, and the action-slot pattern.

## When to NOT use a primitive

- One-off interactions (e.g. a payment confirmation modal) where the
  context is too unique
- Inside a tightly-designed surface like the dashboard hero (the
  primitive's neutral styling would clash)

The rule of thumb: if you find yourself building something more than
once, promote it to a primitive. Don't pre-emptively abstract things
you've only built once.

## Adoption status

As of last check, only ~5 of 60+ dashboard pages use these primitives.
The migration to primitives should happen opportunistically (when you
touch a page for another reason) rather than as a Big Refactor. Over
time, every page converges on the standard look.

## Related

- `src/components/ui/empty-state.tsx`
- `src/components/ui/error-state.tsx`
- `src/components/ui/loading.tsx`
- `src/components/ui/section-header.tsx`
- `docs/CLIENT-DASHBOARD-AUDIT.md` — list of pages that need empty-state polish
