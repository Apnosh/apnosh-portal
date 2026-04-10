import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /r/[code]
 *
 * Public redirect route for tracked links.
 * Increments click count and redirects to original URL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: link } = await supabase
    .from('tracked_links')
    .select('original_url, click_count')
    .eq('short_code', code)
    .single()

  if (!link) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/not-found`)
  }

  // Increment click count (fire and forget)
  supabase
    .from('tracked_links')
    .update({ click_count: (link.click_count || 0) + 1 })
    .eq('short_code', code)
    .then(() => {})

  return NextResponse.redirect(link.original_url)
}
