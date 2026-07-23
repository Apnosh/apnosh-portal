/**
 * Creator area shell: a slim top bar over the creator's two surfaces.
 *   Work        the jobs assigned to them (existing)
 *   Storefront  the packages they publish and price (new)
 *
 * Kept intentionally minimal. The creator experience is its own thing, separate from the owner
 * dashboard and the admin console, so it gets its own light chrome rather than borrowing either.
 */

import Link from 'next/link'

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="border-b border-neutral-100 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto px-5 h-12 flex items-center gap-5">
          <span className="text-sm font-bold text-neutral-900">Apnosh for creators</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/creator/work" className="text-neutral-500 hover:text-neutral-900">Work</Link>
            <Link href="/creator/storefront" className="text-neutral-500 hover:text-neutral-900">Storefront</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
