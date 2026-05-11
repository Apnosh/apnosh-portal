/**
 * Skeleton shown instantly while /dashboard/social loads its data.
 * Matches the hub view shape so the visual transition is smooth and
 * the layout doesn't shift when real content arrives.
 */

export default function SocialHubLoading() {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-6">
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-ink-6/40" />
          <div className="h-3 w-24 bg-ink-6/40 rounded" />
        </div>
        <div className="h-8 w-72 bg-ink-6/40 rounded mb-3" />
        <div className="h-4 w-96 bg-ink-6/40 rounded mb-5" />
        <div className="grid grid-cols-3 gap-3 max-w-xl mb-7">
          <div className="h-20 bg-ink-6/30 rounded-2xl" />
          <div className="h-20 bg-ink-6/30 rounded-2xl" />
          <div className="h-20 bg-ink-6/30 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
          <div className="h-32 bg-ink-6/30 rounded-2xl" />
          <div className="h-32 bg-ink-6/30 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square bg-ink-6/30 rounded-lg" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-ink-6/30 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
