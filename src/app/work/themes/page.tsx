/**
 * /work/themes — editorial themes per client.
 *
 * Strategist sets the WHAT and WHY for a month: theme name, blurb,
 * pillars, key dates. AI later uses themes as the grounding for
 * generating post ideas (see /api/work/themes/[id]/generate-ideas
 * once E3 lands).
 */

import { requireCapability } from '@/lib/auth/require-capability'
import { getMyThemes } from '@/lib/work/get-themes'
import { createClient as createServerClient } from '@/lib/supabase/server'
import ThemesView from './themes-view'

export const dynamic = 'force-dynamic'

export default async function ThemesPage() {
  await requireCapability('strategist')

  const supabase = await createServerClient()
  const [themes, clientsRes] = await Promise.all([
    getMyThemes(),
    supabase.from('clients').select('id, name, slug').order('name'),
  ])

  return (
    <ThemesView
      initialThemes={themes}
      clients={(clientsRes.data ?? []) as Array<{ id: string; name: string; slug: string }>}
    />
  )
}
