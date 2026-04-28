'use client'

/**
 * Promotion form for the unified updates system.
 *
 * Promotions = time-bound offers: happy hour, BOGO, percent off, free
 * item with purchase. Drives real foot traffic; restaurants run them
 * constantly. The fanout pushes to IG / FB / GBP / website / email
 * subscribers so the offer is visible everywhere it matters.
 */

import type { PromotionPayload } from '@/lib/updates/types'

interface Props {
  payload: PromotionPayload
  onChange: (next: PromotionPayload) => void
}

const DISCOUNT_TYPE_LABELS: Record<PromotionPayload['discount_type'], string> = {
  percent: '% off',
  amount: '$ off',
  bogo: 'Buy one, get one',
  free_item: 'Free item with purchase',
  other: 'Other',
}

export default function PromotionForm({ payload, onChange }: Props) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-2">Promotion</label>

      {/* Name + Discount type */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Name</label>
          <input
            type="text"
            value={payload.name}
            placeholder="Happy Hour 4-6pm"
            onChange={e => onChange({ ...payload, name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Type</label>
          <select
            value={payload.discount_type}
            onChange={e => onChange({ ...payload, discount_type: e.target.value as PromotionPayload['discount_type'] })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          >
            {Object.entries(DISCOUNT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Discount value */}
      {(payload.discount_type === 'percent' || payload.discount_type === 'amount') && (
        <div className="mb-3">
          <label className="text-[10px] font-medium text-ink-3 block mb-1">
            {payload.discount_type === 'percent' ? 'Percent off' : 'Dollars off'}
          </label>
          <input
            type="number"
            step={payload.discount_type === 'percent' ? '1' : '0.01'}
            value={payload.discount_value
              ? payload.discount_type === 'percent'
                ? payload.discount_value
                : (payload.discount_value / 100).toFixed(2)
              : ''}
            placeholder={payload.discount_type === 'percent' ? '25' : '5.00'}
            onChange={e => {
              const raw = e.target.value
              if (!raw) {
                onChange({ ...payload, discount_value: undefined })
                return
              }
              const num = parseFloat(raw)
              onChange({
                ...payload,
                discount_value: payload.discount_type === 'percent' ? num : Math.round(num * 100),
              })
            }}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      )}

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Starts</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.valid_from)}
            onChange={e => onChange({ ...payload, valid_from: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Ends</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.valid_until)}
            onChange={e => onChange({ ...payload, valid_until: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Description</label>
        <textarea
          value={payload.description}
          placeholder="$5 off all cocktails and half-price oysters during happy hour..."
          rows={2}
          onChange={e => onChange({ ...payload, description: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg resize-none"
        />
      </div>

      {/* Code + Terms */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Promo code <span className="text-ink-4">(optional)</span></label>
          <input
            type="text"
            value={payload.code ?? ''}
            placeholder="HAPPY"
            onChange={e => onChange({ ...payload, code: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg uppercase"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Photo URL <span className="text-ink-4">(optional)</span></label>
          <input
            type="url"
            value={payload.photoUrl ?? ''}
            placeholder="https://..."
            onChange={e => onChange({ ...payload, photoUrl: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Terms */}
      <div>
        <label className="text-[10px] font-medium text-ink-3 block mb-1">Fine print <span className="text-ink-4">(optional)</span></label>
        <input
          type="text"
          value={payload.terms ?? ''}
          placeholder="Dine-in only. Not valid with other offers."
          onChange={e => onChange({ ...payload, terms: e.target.value || undefined })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
        />
      </div>
    </div>
  )
}

function toLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  if (isNaN(d.getTime())) return ''
  return d.toISOString()
}
