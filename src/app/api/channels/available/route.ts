/**
 * /api/channels/available — which connections can actually be made right now.
 *
 * Built because the connect step kept lying in both directions on the same night. Google
 * Business showed "Coming soon" while a working OAuth route sat there unused, and every other
 * chip's availability was a hand-maintained constant in a component that no one updates when a
 * key is added to Vercel or an adapter is written.
 *
 * A channel is available when its adapter says its keys are set. That is the only thing that
 * decides whether a Connect button can succeed, so it is the only thing the UI should ask.
 * Nothing here reveals a key or a value — just a boolean per channel.
 */

import { NextResponse } from 'next/server'
import { CHANNEL_IDS, CHANNELS, activeSocialAdapter } from '@/lib/channels/registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const channels: Record<string, boolean> = {}
  for (const id of CHANNEL_IDS) {
    try { channels[id] = CHANNELS[id]?.isConfigured?.() === true } catch { channels[id] = false }
  }

  /* The social lane is whichever adapter is active, and they differ in an important way: the
   * Zernio lane connects ONE named platform at a time, while the Ayrshare fallback ignores the
   * platform argument and links everything at once. A per-platform button is only honest under
   * Zernio, so the UI is told which lane it is on rather than having to infer it. */
  let social = false
  let perPlatform = false
  try {
    const a = activeSocialAdapter()
    social = a.isConfigured?.() === true
    perPlatform = social && a.id === 'zernio'
  } catch { /* leave both false: no social connect offered rather than a dead button */ }

  return NextResponse.json(
    { channels, social, socialPerPlatform: perPlatform },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
