/**
 * Synchronous helpers + labels for the inbox.
 *
 * Lives outside get-inbox-threads.ts because that file is 'use server'
 * (server actions must export async only). Both server and client
 * code import the labels + types from here.
 */

import type { InboxThread, ThreadKind } from './get-inbox-threads'

const CHANNEL_LABEL: Record<string, string> = {
  google: 'Google',
  yelp: 'Yelp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  email: 'Email',
  content: 'Content',
}

export function channelLabel(platform: string): string {
  return CHANNEL_LABEL[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1)
}

/* What KIND of thread is this — surfaced as a label on each row so
   owners can scan the list and know what each item is at a glance. */
const KIND_LABEL: Record<ThreadKind, string> = {
  approval: 'Approval',
  review: 'Review',
  dm: 'DM',
  comment: 'Comment',
  mention: 'Mention',
}

export function kindLabel(kind: ThreadKind): string {
  return KIND_LABEL[kind]
}

export function kindEmoji(kind: ThreadKind): string {
  return ({
    approval: '📝',
    review: '⭐',
    dm: '💬',
    comment: '💭',
    mention: '@',
  } as const)[kind]
}

export function severityCount(threads: InboxThread[], filter: 'needs' | 'handling' | 'all'): number {
  if (filter === 'all') return threads.length
  if (filter === 'handling') return threads.filter(t => t.severity === 'handled').length
  return threads.filter(t => t.severity === 'urgent' || t.severity === 'soon').length
}

export function kindCount(threads: InboxThread[], kind: ThreadKind | 'all'): number {
  if (kind === 'all') return threads.length
  return threads.filter(t => t.kind === kind).length
}
