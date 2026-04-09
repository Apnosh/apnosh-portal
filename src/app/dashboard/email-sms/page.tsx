'use client'

import Link from 'next/link'
import { Mail, Plus, Send, Users, Zap } from 'lucide-react'

export default function EmailSmsComingSoonPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-3">
          <Mail className="w-7 h-7 text-ink-4" />
          Email & SMS
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Email campaigns, drip sequences, newsletters, and SMS blasts.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-6 h-6 text-ink-4" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Coming Soon</h2>
        <p className="text-sm text-ink-3 mt-1 max-w-md mx-auto">
          Email and SMS campaigns will be manageable here soon. For now, reach out through Messages.
        </p>
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-2 mt-4 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Request Campaign
        </Link>
      </div>

      {/* What's coming */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">What will be here</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Send, label: 'Campaigns', desc: 'One-off blasts and newsletters' },
            { icon: Zap, label: 'Automations', desc: 'Welcome, abandoned cart, re-engage' },
            { icon: Users, label: 'Lists & segments', desc: 'Build targeted audiences' },
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
