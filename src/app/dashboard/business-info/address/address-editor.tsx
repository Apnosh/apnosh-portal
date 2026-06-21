'use client'

import { useState } from 'react'
import { saveBusinessInfo, type SaveResult, type BusinessAddress } from '../actions'
import { MvpEditorShell, EditorField } from '../editor-shell'

export default function AddressEditor({ initial, gbpConnected }: { initial: BusinessAddress; gbpConnected: boolean }) {
  const base = initial
  const [line1, setLine1] = useState(base.line1)
  const [city, setCity] = useState(base.city)
  const [state, setState] = useState(base.state)
  const [zip, setZip] = useState(base.zip)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const dirty = line1 !== base.line1 || city !== base.city || state !== base.state || zip !== base.zip

  const onSave = (sync: boolean) => {
    setSaving(true)
    saveBusinessInfo({ address: { line1, city, state, zip } }, { sync })
      .then(setResult)
      .finally(() => setSaving(false))
  }

  return (
    <MvpEditorShell
      title="Address"
      subtitle="Where customers find you. Updates Google and your website."
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      result={result}
      onEditAgain={() => setResult(null)}
    >
      <EditorField label="Street address" value={line1} onChange={setLine1} placeholder="123 Main St" hint="The address customers and delivery drivers are sent to." />
      <EditorField label="City" value={city} onChange={setCity} placeholder="Seattle" />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}><EditorField label="State" value={state} onChange={setState} placeholder="WA" /></div>
        <div style={{ flex: 1, minWidth: 0 }}><EditorField label="ZIP" value={zip} onChange={setZip} inputMode="numeric" placeholder="98101" /></div>
      </div>
      {gbpConnected && (
        <div style={{ background: '#fbf3e4', border: '0.5px solid #eed9b3', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, color: '#8a5a0c', lineHeight: 1.45 }}>
          Heads up: changing your address can make Google ask you to re-verify your listing. Only update it if you really moved or it&apos;s wrong.
        </div>
      )}
    </MvpEditorShell>
  )
}
