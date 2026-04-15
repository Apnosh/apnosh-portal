'use client'

import { useState } from 'react'
import { MessageCircle, LayoutGrid, SlidersHorizontal } from 'lucide-react'
import RequestQuick from '@/components/dashboard/request-quick'
import RequestTemplates from '@/components/dashboard/request-templates'
import RequestDetailed from '@/components/dashboard/request-detailed'

type Mode = 'pick' | 'quick' | 'template' | 'detailed'

export default function NewRequestPage() {
  const [mode, setMode] = useState<Mode>('pick')

  if (mode === 'quick') return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <RequestQuick onBack={() => setMode('pick')} />
    </div>
  )

  if (mode === 'template') return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <RequestTemplates onBack={() => setMode('pick')} />
    </div>
  )

  if (mode === 'detailed') return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <RequestDetailed onBack={() => setMode('pick')} />
    </div>
  )

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold mb-1" style={{ color: 'var(--ink, #111)' }}>
        New content request
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--ink-3, #888)' }}>
        How much detail do you want to give?
      </p>

      <div className="space-y-3">
        <button
          onClick={() => setMode('quick')}
          className="w-full text-left rounded-xl border border-ink-6 p-5 hover:border-brand hover:bg-brand-tint/30 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(74, 189, 152, 0.1)' }}>
              <MessageCircle className="w-5 h-5" style={{ color: '#4abd98' }} />
            </div>
            <div>
              <div className="text-[15px] font-semibold mb-0.5" style={{ color: 'var(--ink, #111)' }}>Just tell us</div>
              <div className="text-sm" style={{ color: 'var(--ink-3, #888)' }}>
                Type what you want and we'll handle the rest. Best if you're short on time.
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode('template')}
          className="w-full text-left rounded-xl border border-ink-6 p-5 hover:border-brand hover:bg-brand-tint/30 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(74, 189, 152, 0.1)' }}>
              <LayoutGrid className="w-5 h-5" style={{ color: '#4abd98' }} />
            </div>
            <div>
              <div className="text-[15px] font-semibold mb-0.5" style={{ color: 'var(--ink, #111)' }}>Pick a type</div>
              <div className="text-sm" style={{ color: 'var(--ink-3, #888)' }}>
                Choose what kind of post you need and answer a few quick questions.
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode('detailed')}
          className="w-full text-left rounded-xl border border-ink-6 p-5 hover:border-brand hover:bg-brand-tint/30 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(74, 189, 152, 0.1)' }}>
              <SlidersHorizontal className="w-5 h-5" style={{ color: '#4abd98' }} />
            </div>
            <div>
              <div className="text-[15px] font-semibold mb-0.5" style={{ color: 'var(--ink, #111)' }}>Get specific</div>
              <div className="text-sm" style={{ color: 'var(--ink-3, #888)' }}>
                Fill in the details yourself. Good if you know exactly what you want.
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
