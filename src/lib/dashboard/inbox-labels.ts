/**
 * Synchronous helpers + types for the inbox.
 *
 * Lives outside get-inbox-threads.ts because that file is 'use server'
 * (server actions must export async only). Both server and client code
 * import the labels + types from here.
 */

import type { InboxThread } from './get-inbox-threads'

const CHANNEL_LABEL: Record<string, string> = {
  google: 'Google',
  yelp: 'Yelp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  email: 'Email',
}

export function channelLabel(platform: string): string {
  return CHANNEL_LABEL[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1)
}

export function severityCount(threads: InboxThread[], filter: 'needs' | 'handling' | 'all'): number {
  if (filter === 'all') return threads.length
  if (filter === 'handling') return threads.filter(t => t.severity === 'handled').length
  return threads.filter(t => t.severity === 'urgent' || t.severity === 'soon').length
}
