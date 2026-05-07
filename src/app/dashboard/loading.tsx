/**
 * Dashboard loading state — Next.js renders this instantly when the
 * user navigates to any /dashboard route, while the new page fetches
 * data in the background. Without this file, navigation feels broken
 * because the OLD page stays visible until the new one is fully ready.
 *
 * Skeleton mirrors the structure of the dashboard so the layout
 * doesn't shift when real content arrives.
 */

export default function DashboardLoading() {
  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pt-4 pb-20"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* Brief skeleton */}
      <div
        className="rounded-xl p-5 mb-4 border bg-white animate-pulse"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="h-3 bg-ink-6 rounded w-24 mb-3" />
        <div className="space-y-2">
          <div className="h-4 bg-ink-6 rounded w-full" />
          <div className="h-4 bg-ink-6 rounded w-5/6" />
          <div className="h-4 bg-ink-6 rounded w-3/4" />
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 rounded-lg border bg-white animate-pulse"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          />
        ))}
      </div>

      {/* Pulse cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl p-4 border bg-white animate-pulse"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          >
            <div className="h-3 bg-ink-6 rounded w-24 mb-2" />
            <div className="h-7 bg-ink-6 rounded w-20 mb-2" />
            <div className="h-3 bg-ink-6 rounded w-32" />
          </div>
        ))}
      </div>

      {/* Reviews skeleton */}
      <div
        className="rounded-xl p-5 mb-4 border bg-white animate-pulse"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="h-3 bg-ink-6 rounded w-32 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-ink-6 rounded w-full" />
          <div className="h-3 bg-ink-6 rounded w-4/5" />
          <div className="h-3 bg-ink-6 rounded w-5/6" />
        </div>
      </div>
    </div>
  )
}
