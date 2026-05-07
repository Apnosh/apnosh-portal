/**
 * Generic page loading skeleton — used for any /dashboard sub-route
 * that doesn't have its own loading.tsx. Renders instantly during
 * client-side navigation so users get visual feedback the click
 * registered.
 */
export default function PageLoading() {
  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pt-4 pb-20"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      <div className="animate-pulse space-y-4">
        <div className="h-7 bg-ink-6 rounded w-64" />
        <div className="h-4 bg-ink-6 rounded w-96" />
        <div className="space-y-3 mt-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-ink-6 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
