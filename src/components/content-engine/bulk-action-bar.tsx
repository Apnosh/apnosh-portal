'use client'

import { X, Calendar, Globe, Layers, Trash2, Check } from 'lucide-react'
import { useState } from 'react'

interface BulkActionBarProps {
  count: number
  onMoveToDate: (date: string) => void
  onChangePlatform: (platform: string) => void
  onChangeType: (type: string) => void
  onDelete: () => void
  onApprove: () => void
  onClear: () => void
}

export default function BulkActionBar({
  count, onMoveToDate, onChangePlatform, onChangeType, onDelete, onApprove, onClear,
}: BulkActionBarProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPlatformPicker, setShowPlatformPicker] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)

  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-ink text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200">
      <span className="text-sm font-semibold">{count} selected</span>
      <div className="w-px h-5 bg-white/20" />

      {/* Move to date */}
      <div className="relative">
        <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
          <Calendar className="w-3 h-3" /> Move
        </button>
        {showDatePicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDatePicker(false)} />
            <div className="absolute bottom-full mb-2 left-0 bg-white rounded-lg border border-ink-6 shadow-lg z-20 p-2">
              <input type="date" className="text-sm text-ink" onChange={(e) => { onMoveToDate(e.target.value); setShowDatePicker(false) }} />
            </div>
          </>
        )}
      </div>

      {/* Change platform */}
      <div className="relative">
        <button onClick={() => setShowPlatformPicker(!showPlatformPicker)} className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
          <Globe className="w-3 h-3" /> Platform
        </button>
        {showPlatformPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPlatformPicker(false)} />
            <div className="absolute bottom-full mb-2 left-0 bg-white rounded-lg border border-ink-6 shadow-lg z-20 py-1 min-w-[120px]">
              {['instagram', 'facebook', 'tiktok', 'linkedin'].map((p) => (
                <button key={p} onClick={() => { onChangePlatform(p); setShowPlatformPicker(false) }} className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-bg-2 capitalize">{p}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Change type */}
      <div className="relative">
        <button onClick={() => setShowTypePicker(!showTypePicker)} className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
          <Layers className="w-3 h-3" /> Type
        </button>
        {showTypePicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowTypePicker(false)} />
            <div className="absolute bottom-full mb-2 left-0 bg-white rounded-lg border border-ink-6 shadow-lg z-20 py-1 min-w-[120px]">
              {['reel', 'feed_post', 'carousel', 'story'].map((t) => (
                <button key={t} onClick={() => { onChangeType(t); setShowTypePicker(false) }} className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-bg-2 capitalize">{t.replace('_', ' ')}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Approve */}
      <button onClick={onApprove} className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
        <Check className="w-3 h-3" /> Approve
      </button>

      {/* Delete */}
      <button onClick={onDelete} className="flex items-center gap-1 text-xs font-medium text-red-300 hover:text-red-200 px-2 py-1 rounded hover:bg-red-500/20 transition-colors">
        <Trash2 className="w-3 h-3" /> Delete
      </button>

      <div className="w-px h-5 bg-white/20" />
      <button onClick={onClear} className="p-1 text-white/50 hover:text-white transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
