/**
 * /work/web — shared surface for web_ops / web_designer / web_developer.
 *
 * Top: site health snapshot across the assigned book. Below: page
 * drafts in flight + recently shipped. Composer drafts new page copy
 * via AI grounded in the client's voice.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getWebData } from '@/lib/work/get-web-data'
import WebView from './web-view'

export const dynamic = 'force-dynamic'

export default async function WebPage() {
  await requireAnyCapability(['web_ops', 'web_designer', 'web_developer'])
  const data = await getWebData()
  return <WebView initialData={data} />
}
