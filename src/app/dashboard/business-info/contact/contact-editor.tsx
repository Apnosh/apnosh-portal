'use client'

import { useState } from 'react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { MvpEditorShell, EditorField, EditorTextArea } from '../editor-shell'

interface ContactFields {
  name: string
  phone: string
  website: string
  description: string
}

export default function ContactEditor({ initial }: { initial: ContactFields | null }) {
  const base: ContactFields = {
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    website: initial?.website ?? '',
    description: initial?.description ?? '',
  }
  const [name, setName] = useState(base.name)
  const [phone, setPhone] = useState(base.phone)
  const [website, setWebsite] = useState(base.website)
  const [description, setDescription] = useState(base.description)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const dirty = name !== base.name || phone !== base.phone || website !== base.website || description !== base.description

  function onSave(sync: boolean) {
    setSaving(true)
    saveBusinessInfo({ name, phone, website, description }, { sync })
      .then(setResult)
      .finally(() => setSaving(false))
  }

  return (
    <MvpEditorShell
      title="Contact details"
      subtitle="Name, phone, website, description"
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      result={result}
      onEditAgain={() => setResult(null)}
    >
      <EditorField
        label="Restaurant name"
        value={name}
        onChange={setName}
        placeholder="Your restaurant name"
        hint="Your name in Apnosh. Google locks listing names, so this won't rename your Google listing."
      />
      <EditorField
        label="Phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={setPhone}
        placeholder="(206) 555-0123"
        hint="Updates Google and your website."
      />
      <EditorField
        label="Website"
        type="url"
        inputMode="url"
        value={website}
        onChange={setWebsite}
        placeholder="https://yourrestaurant.com"
        hint="Updates Google and your website."
      />
      <EditorTextArea
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="What makes your place special..."
        rows={5}
        hint={`Updates Google and your website. ${description.length} characters.`}
      />
    </MvpEditorShell>
  )
}
