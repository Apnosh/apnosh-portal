/**
 * Verify the Microsoft Clarity tracking snippet is actually installed
 * on a client's website. The Apnosh setup flow lets owners paste a
 * Clarity project ID, but that ID is useless until the corresponding
 * <script> tag is live on the site. This module bridges the gap:
 *   - fetches the live site (server-side)
 *   - greps for the project ID (or a sentinel substring of the snippet)
 *   - persists the result so the UI can show "snippet not detected"
 *     banners + accurate setup status
 */

'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'

interface ClientRow {
  id: string
  website: string | null
  clarity_project_id: string | null
}

export interface VerifyResult {
  verified: boolean
  reason: 'detected' | 'no_project_id' | 'no_website' | 'fetch_failed' | 'snippet_missing'
  details?: string
}

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Generate the exact <script> tag a client needs to paste into their
 * site's <head>. Two-line format keeps it short enough that owners
 * can scan it and confirm it matches what Clarity gave them.
 */
export async function clarityScriptSnippet(projectId: string): Promise<string> {
  return `<script type="text/javascript">
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)
  })(window, document, "clarity", "script", "${projectId}");
</script>`
}

/**
 * Fetch the homepage and check for the Clarity snippet. Persists
 * the result to clients.clarity_install_verified + checked_at so
 * downstream pages can show banners.
 */
export async function verifyClarityInstallation(clientId: string): Promise<VerifyResult> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('clients')
    .select('id, website, clarity_project_id')
    .eq('id', clientId)
    .maybeSingle() as { data: ClientRow | null }

  const writeResult = async (verified: boolean) => {
    await admin
      .from('clients')
      .update({
        clarity_install_verified: verified,
        clarity_install_checked_at: new Date().toISOString(),
      })
      .eq('id', clientId)
  }

  if (!data?.clarity_project_id) {
    return { verified: false, reason: 'no_project_id' }
  }
  if (!data.website) {
    await writeResult(false)
    return { verified: false, reason: 'no_website' }
  }

  /* Normalize the URL — accept "shop.com", "https://shop.com", etc. */
  let url = data.website.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  let html = ''
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        /* Some sites gate bot UAs; pretend to be a normal browser. */
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      /* 8 s timeout. Owner pages can be slow but this is a UI-bound check. */
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      await writeResult(false)
      return { verified: false, reason: 'fetch_failed', details: `HTTP ${res.status}` }
    }
    html = await res.text()
  } catch (err) {
    await writeResult(false)
    return { verified: false, reason: 'fetch_failed', details: (err as Error).message }
  }

  /* Look for the project ID. Clarity scripts inject "clarity.ms/tag/<id>"
     so checking both the project ID alone AND the URL substring catches
     all common install patterns (snippet copy-paste, GTM, Squarespace
     code injection, WordPress plugin). */
  const projectId = data.clarity_project_id
  const found =
    html.includes(`clarity.ms/tag/${projectId}`)
    || html.includes(`"${projectId}"`)
    || html.includes(`'${projectId}'`)

  await writeResult(found)
  return found
    ? { verified: true, reason: 'detected' }
    : { verified: false, reason: 'snippet_missing' }
}
