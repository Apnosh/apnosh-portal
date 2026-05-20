import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { loadBusinessInfo } from '../actions'
import { EMPTY_LINKS } from '../constants'
import LinksEditor from './links-editor'

export const dynamic = 'force-dynamic'

export default async function LinksPage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  const loaded = await loadBusinessInfo()
  return <LinksEditor initial={loaded.info?.links ?? EMPTY_LINKS} />
}
