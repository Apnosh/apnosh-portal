'use client'

import { useState } from 'react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { EditorHeader, SaveBar, SuccessScreen } from '../editor-shell'

interface ContactFields {
  name: string
  phone: string
  website: string
  description: string
}

export default function ContactEditor({ initial }: { initial: ContactFields | null }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const onSave = () => {
    setSaving(true)
    saveBusinessInfo({ name, phone, website, description })
      .then(setResult)
      .finally(() => setSaving(false))
  }

  if (result?.synced.saved) return <SuccessScreen result={result} onEditAgain={() => setResult(null)} />

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      <EditorHeader title="Contact" subtitle="Name, phone, website, and description" />
      <div className="px-4 py-5 space-y-4">
        <Field label="Restaurant name" value={name} onChange={setName} placeholder="Your restaurant name" />
        <Field label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="(206) 555-0123" />
        <Field label="Website" type="url" value={website} onChange={setWebsite} placeholder="https://yourrestaurant.com" />
        <div>
          <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="What makes your place special..."
            className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand resize-none touch-input"
          />
          <p className="text-[11px] text-ink-4 mt-1">{description.length} characters</p>
        </div>
      </div>
      <SaveBar saving={saving} onSave={onSave} />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-2 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-ink-6 rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-brand touch-input"
      />
    </div>
  )
}
