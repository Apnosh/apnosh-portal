'use client'

import Link from 'next/link'
import { ArrowLeft, LayoutDashboard } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-brand-tint via-white to-bg-2">
      {/* Logo */}
      <Link href="/" className="font-[family-name:var(--font-display)] text-xl text-ink mb-12">
        Apn<em className="text-brand-dark italic">osh</em>
      </Link>

      {/* 404 number */}
      <div className="font-[family-name:var(--font-display)] text-[120px] sm:text-[160px] leading-none font-bold text-brand/15 select-none">
        404
      </div>

      {/* Text */}
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-ink -mt-4 text-center">
        Page not found
      </h1>
      <p className="text-ink-3 text-sm sm:text-base mt-3 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-ink-2 bg-white border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Home
        </Link>
      </div>
    </div>
  )
}
