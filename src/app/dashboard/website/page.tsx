'use client'

import Link from 'next/link'
import { Globe, Plus, Code, Bug, Palette } from 'lucide-react'

export default function WebsiteComingSoonPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-3">
          <Globe className="w-7 h-7 text-ink-4" />
          Website
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Content updates, bug fixes, design changes, and new pages.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
          <Globe className="w-6 h-6 text-ink-4" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Coming Soon</h2>
        <p className="text-sm text-ink-3 mt-1 max-w-md mx-auto">
          Website requests will be available here. For now, reach out through Messages to request changes.
        </p>
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-2 mt-4 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Request a Change
        </Link>
      </div>

      {/* What's coming */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">What will be here</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Palette, label: 'Design updates', desc: 'Change colors, fonts, layout' },
            { icon: Code, label: 'Content edits', desc: 'Update pages, publish blog posts' },
            { icon: Bug, label: 'Bug fixes', desc: 'Report issues, request fixes' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center mb-2">
                <item.icon className="w-4 h-4 text-ink-4" />
              </div>
              <div className="text-sm font-medium text-ink">{item.label}</div>
              <div className="text-xs text-ink-3 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
