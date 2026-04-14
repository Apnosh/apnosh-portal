'use client'

import { useState } from 'react'
import { Plus, Sparkles, Loader2, X } from 'lucide-react'

interface QuickAddFormProps {
  date: string
  onAdd: (item: { date: string; time: string; platform: string; type: string; title: string; description: string }) => Promise<void>
  onCancel: () => void
}

export default function QuickAddForm({ date, onAdd, onCancel }: QuickAddFormProps) {
  const [time, setTime] = useState('10:00')
  const [platform, setPlatform] = useState('instagram')
  const [type, setType] = useState('feed_post')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onAdd({ date, time, platform, type, title: title.trim(), description: '' })
    setSaving(false)
  }

  const d = new Date(date + 'T12:00:00')
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="bg-white border border-brand/30 rounded-xl p-4 mt-3 shadow-sm animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ink">Add to {label}</h3>
        <button onClick={onCancel} className="p-1 text-ink-4 hover:text-ink rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-ink-4 block mb-0.5">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div>
          <label className="text-[10px] text-ink-4 block mb-0.5">Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-ink-4 block mb-0.5">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full text-sm border border-ink-6 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
            <option value="reel">Reel</option>
            <option value="feed_post">Feed Post</option>
            <option value="carousel">Carousel</option>
            <option value="story">Story</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[10px] text-ink-4 block mb-0.5">&nbsp;</label>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || saving}
            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="What's this post about?"
        className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        autoFocus
      />
    </div>
  )
}
