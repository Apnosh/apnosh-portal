'use client'

import { useState } from 'react'
import { Tag, ShoppingBag, CalendarDays, Star, Clapperboard, Snowflake, Lightbulb, Sparkles, Loader2, CheckCircle } from 'lucide-react'
import { submitContentRequest } from '@/lib/request-actions'

const TEMPLATES = [
  { id: 'promo', icon: Tag, label: 'Promote a deal', desc: 'Sales, discounts, or special offers', fields: ['deal', 'end_date', 'promo_code'] },
  { id: 'product', icon: ShoppingBag, label: 'Show off a product', desc: 'A dish, item, or service you want to highlight', fields: ['product_name', 'description', 'price'] },
  { id: 'event', icon: CalendarDays, label: 'Announce an event', desc: 'Grand opening, live music, pop-up, etc.', fields: ['event_name', 'date', 'details'] },
  { id: 'review', icon: Star, label: 'Share a review', desc: 'A great customer review or testimonial', fields: ['review_text', 'customer_name', 'rating'] },
  { id: 'bts', icon: Clapperboard, label: 'Behind the scenes', desc: 'Show your team, process, or space', fields: ['what_to_show', 'description'] },
  { id: 'seasonal', icon: Snowflake, label: 'Seasonal or holiday', desc: 'Holiday greetings, seasonal specials', fields: ['occasion', 'message', 'offer'] },
  { id: 'educational', icon: Lightbulb, label: 'Share a tip', desc: 'Tips, how-tos, or useful info for customers', fields: ['topic', 'key_points'] },
  { id: 'general', icon: Sparkles, label: 'Something else', desc: 'Anything that doesn\'t fit above', fields: ['description'] },
] as const

const FIELD_LABELS: Record<string, { label: string; placeholder: string; type?: 'textarea' }> = {
  deal: { label: 'What\'s the deal?', placeholder: '20% off all appetizers' },
  end_date: { label: 'When does it end?', placeholder: 'This Sunday, April 20th' },
  promo_code: { label: 'Promo code? (if any)', placeholder: 'SPRING20' },
  product_name: { label: 'What is it?', placeholder: 'Our signature Korean BBQ platter' },
  description: { label: 'Tell us more', placeholder: 'Anything else we should know?', type: 'textarea' },
  price: { label: 'Price? (optional)', placeholder: '$29.99' },
  event_name: { label: 'What\'s the event?', placeholder: 'Live Jazz Night' },
  date: { label: 'When?', placeholder: 'Friday, April 25th at 7pm' },
  details: { label: 'Any details?', placeholder: 'Free entry, drink specials, local band' },
  review_text: { label: 'Paste the review', placeholder: '"Best sushi I\'ve ever had! Will definitely come back."', type: 'textarea' },
  customer_name: { label: 'Customer name', placeholder: 'Sarah M.' },
  rating: { label: 'Star rating', placeholder: '5' },
  what_to_show: { label: 'What should we show?', placeholder: 'The kitchen during prep, our barista making drinks' },
  occasion: { label: 'What occasion?', placeholder: 'Mother\'s Day' },
  message: { label: 'What\'s the message?', placeholder: 'Treat mom to something special' },
  offer: { label: 'Any special offer?', placeholder: 'Free dessert with every table of 4+' },
  topic: { label: 'What\'s the tip about?', placeholder: 'How to pick the perfect steak cut' },
  key_points: { label: 'Key points', placeholder: 'Marbling, thickness, cooking temp', type: 'textarea' },
}

interface Props {
  onBack: () => void
}

export default function RequestTemplates({ onBack }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const template = TEMPLATES.find(t => t.id === selected)

  async function handleSubmit() {
    if (!template) return
    const mainText = Object.values(formData).filter(Boolean).join('. ')
    if (!mainText.trim()) return

    setSubmitting(true)
    const result = await submitContentRequest({
      mode: 'template',
      description: mainText,
      templateType: template.id,
      detail: { ...formData, template: template.id, templateLabel: template.label },
    })
    setSubmitting(false)
    if (result.success) setDone(true)
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#4abd98' }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink, #111)' }}>Got it!</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-3, #888)' }}>
          We're on it. You'll see a draft soon.
        </p>
        <button onClick={onBack} className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white" style={{ background: '#4abd98' }}>
          Done
        </button>
      </div>
    )
  }

  // Template picker
  if (!selected) {
    return (
      <div className="space-y-5">
        <div>
          <button onClick={onBack} className="text-sm text-ink-3 hover:text-ink-2 mb-4">&larr; Back</button>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: 'var(--ink, #111)' }}>
            What kind of post?
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3, #888)' }}>
            Pick one and we'll ask a few quick questions.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => { setSelected(t.id); setFormData({}) }}
                className="text-left rounded-xl border border-ink-6 p-4 hover:border-brand hover:bg-brand-tint/30 transition-all"
              >
                <Icon className="w-5 h-5 mb-2" style={{ color: '#4abd98' }} />
                <div className="text-sm font-semibold" style={{ color: 'var(--ink, #111)' }}>{t.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3, #888)' }}>{t.desc}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Template form
  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setSelected(null)} className="text-sm text-ink-3 hover:text-ink-2 mb-4">&larr; Back</button>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold" style={{ color: 'var(--ink, #111)' }}>
          {template?.label}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-3, #888)' }}>
          Fill in what you know. Leave the rest blank.
        </p>
      </div>

      {template?.fields.map((fieldId) => {
        const field = FIELD_LABELS[fieldId]
        if (!field) return null
        return (
          <div key={fieldId}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3, #888)' }}>
              {field.label}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={formData[fieldId] || ''}
                onChange={(e) => setFormData({ ...formData, [fieldId]: e.target.value })}
                placeholder={field.placeholder}
                rows={3}
                className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
              />
            ) : (
              <input
                type="text"
                value={formData[fieldId] || ''}
                onChange={(e) => setFormData({ ...formData, [fieldId]: e.target.value })}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-ink-6 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            )}
          </div>
        )
      })}

      <button
        onClick={handleSubmit}
        disabled={submitting || !Object.values(formData).some(v => v.trim())}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40"
        style={{ background: '#4abd98' }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Sending...
          </span>
        ) : (
          'Send request'
        )}
      </button>
    </div>
  )
}
