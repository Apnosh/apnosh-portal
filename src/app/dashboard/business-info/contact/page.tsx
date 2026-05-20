import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo } from '../actions'
import ContactEditor from './contact-editor'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  const loaded = await loadBusinessInfo()
  return (
    <ContactEditor
      initial={loaded.info ? {
        name: loaded.info.name,
        phone: loaded.info.phone,
        website: loaded.info.website,
        description: loaded.info.description,
      } : null}
    />
  )
}
