/**
 * A place to put one photo or video, so a post can have one.
 * ==========================================================
 * POST { clientId, filename, contentType, size } → { uploadUrl, fileUrl }
 *
 * The browser then PUTs the file straight to uploadUrl and sends fileUrl with
 * the post. The file never passes through this server, which is what keeps a
 * 200MB video from having to survive a serverless request.
 *
 * This exists because the first composer was text only, and that is not a
 * limitation, it is broken: Instagram will not accept a post without media at
 * all, and neither will TikTok. Those are the two platforms this client's
 * audience actually lives on.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { presignMedia } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* What the platforms will actually take. Rejected here rather than by a vendor
   error the owner cannot read. */
const OK_TYPES = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime))$/
const MAX_BYTES = 300 * 1024 * 1024

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; filename?: string; contentType?: string; size?: number }
  const { clientId, filename, contentType, size } = body
  if (!clientId || !filename || !contentType) {
    return NextResponse.json({ error: 'clientId, filename and contentType required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  if (!OK_TYPES.test(contentType)) {
    return NextResponse.json({ error: 'That file type will not post. Use a JPG, PNG, GIF, WebP or an MP4 video.' }, { status: 400 })
  }
  if (typeof size === 'number' && size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is too large to post. Keep it under 300MB.' }, { status: 400 })
  }
  try {
    const r = await presignMedia(filename, contentType, size)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not prepare the upload' }, { status: 502 })
  }
}
