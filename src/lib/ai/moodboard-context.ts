/**
 * Moodboard context loader. Used by bespoke-generate and
 * bespoke-compose-brief so persistent inspiration items per client
 * automatically flow into every Claude call.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface MoodboardItem {
  id: string
  url: string | null
  image_url: string | null
  title: string | null
  notes: string | null
  tags: string[] | null
  pinned: boolean
}

export async function loadMoodboard(clientId: string): Promise<MoodboardItem[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_moodboard_items')
    .select('id, url, image_url, title, notes, tags, pinned')
    .eq('client_id', clientId)
    .order('pinned', { ascending: false })
    .order('added_at', { ascending: false })
    .limit(20)
  return (data ?? []) as MoodboardItem[]
}

/**
 * Fetch text content for moodboard URL items. Pinned items get larger
 * extracts. Image-only items (no URL) are listed but not fetched.
 */
export async function moodboardPromptBlock(items: MoodboardItem[]): Promise<string> {
  if (!items.length) return ''

  const fetches = items
    .filter(i => i.url)
    .slice(0, 6)
    .map(async (item) => {
      try {
        const res = await fetch(item.url!, {
          headers: { 'User-Agent': 'Mozilla/5.0 Apnosh-Moodboard/1.0' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) return null
        const html = await res.text()
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, item.pinned ? 6_000 : 3_000)
        return { item, text }
      } catch {
        return null
      }
    })

  const fetched = (await Promise.all(fetches)).filter(Boolean) as { item: MoodboardItem; text: string }[]

  const imageOnly = items.filter(i => !i.url && i.image_url)

  const sections: string[] = []
  sections.push('## Persistent moodboard for this client (study these — they shape the visual + voice direction)')
  sections.push('')

  for (const { item, text } of fetched) {
    const tagPart = item.tags?.length ? ` [${item.tags.join(', ')}]` : ''
    const pinPart = item.pinned ? ' [PINNED — high priority]' : ''
    sections.push(`### ${item.title || item.url}${tagPart}${pinPart}`)
    sections.push(`URL: ${item.url}`)
    if (item.notes) sections.push(`Why it's here: ${item.notes}`)
    sections.push(text)
    sections.push('')
  }

  if (imageOnly.length) {
    sections.push('### Image-only references (described, not fetched)')
    for (const item of imageOnly) {
      const tagPart = item.tags?.length ? ` [${item.tags.join(', ')}]` : ''
      sections.push(`- ${item.title || 'Untitled'}${tagPart}${item.notes ? ` — ${item.notes}` : ''}`)
    }
    sections.push('')
  }

  return sections.join('\n')
}
