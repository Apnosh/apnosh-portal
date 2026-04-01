// ============================================================
// Apnosh Client Portal — Shared Loading Components
// ============================================================

// ---------------------------------------------------------------------------
// LoadingSpinner — small animated spinner in brand color
// ---------------------------------------------------------------------------

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

  return (
    <svg
      className={`animate-spin text-brand ${sizeMap[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// LoadingPage — full page loading state with Apnosh branding + spinner
// ---------------------------------------------------------------------------

export function LoadingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="font-[family-name:var(--font-display)] text-2xl text-brand-dark tracking-tight">
        apnosh
      </div>
      <LoadingSpinner size="lg" />
      <p className="text-sm text-ink-4">Loading&hellip;</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — rectangular skeleton pulse (takes width / height props)
// ---------------------------------------------------------------------------

interface LoadingSkeletonProps {
  width?: string
  height?: string
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full' | 'xl'
}

export function LoadingSkeleton({
  width = '100%',
  height = '1rem',
  className = '',
  rounded = 'md',
}: LoadingSkeletonProps) {
  const roundedMap = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full', xl: 'rounded-xl' }

  return (
    <div
      className={`animate-pulse bg-ink-6 ${roundedMap[rounded]} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// LoadingCard — card-shaped skeleton matching the dashboard card pattern
// ---------------------------------------------------------------------------

interface LoadingCardProps {
  className?: string
}

export function LoadingCard({ className = '' }: LoadingCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-ink-6 p-4 space-y-3 ${className}`} aria-hidden="true">
      {/* Icon placeholder */}
      <LoadingSkeleton width="2rem" height="2rem" rounded="lg" />
      {/* Value */}
      <LoadingSkeleton width="3.5rem" height="1.75rem" rounded="md" />
      {/* Label */}
      <LoadingSkeleton width="6rem" height="0.75rem" rounded="md" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoadingTable — table skeleton with header row + N body rows
// ---------------------------------------------------------------------------

interface LoadingTableProps {
  rows?: number
  columns?: number
  className?: string
}

export function LoadingTable({ rows = 5, columns = 4, className = '' }: LoadingTableProps) {
  return (
    <div className={`bg-white rounded-xl border border-ink-6 overflow-hidden ${className}`} aria-hidden="true">
      {/* Header */}
      <div className="flex gap-4 px-5 py-3 border-b border-ink-6 bg-bg-2">
        {Array.from({ length: columns }).map((_, c) => (
          <LoadingSkeleton key={`h-${c}`} width={c === 0 ? '30%' : '15%'} height="0.75rem" />
        ))}
      </div>

      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-4 px-5 py-3 border-b border-ink-6 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <LoadingSkeleton key={`r-${r}-c-${c}`} width={c === 0 ? '30%' : '15%'} height="0.75rem" />
          ))}
        </div>
      ))}
    </div>
  )
}
