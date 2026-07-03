/**
 * gbp-apply/bindings — which service-playbook STEP maps to which Google Business Profile action.
 * Kept OUT of the step jsonb (derivable from serviceId + stepId), so the runtime work order stays
 * plain and the binding can change without a data migration. The dispatch engine (dispatch.ts) runs
 * the handler; the cockpit shows a button for steps that have one.
 *
 * kind:'read'  — a safe, non-mutating pull (check access, read the baseline, synthesize a link). No
 *                consent needed; auto-runnable; the pulled value IS the proof.
 * kind:'write' — mutates the LIVE profile. Google requires the owner's express consent per write and
 *                caps edits at 10/min/profile, so writes are operator-initiated + paced + logged. The
 *                write handlers are declared here now and turned on in Phase 1 (draft → review → push).
 */

export interface StepAction {
  kind: 'read' | 'write'
  /** dispatch key handled in dispatch.ts */
  handler: string
  /** what it pulls or writes, in plain words */
  label: string
  /** for writes: where the drafted value comes from (the data we already hold) */
  draftFrom?: string
}

export const STEP_ACTIONS: Record<string, Record<string, StepAction>> = {
  'gbp-setup': {
    'access-proof': { kind: 'read', handler: 'accessProbe', label: 'Check we can reach the profile' },
    'baseline': { kind: 'read', handler: 'baseline', label: 'Pull the last 30 days from Google' },
    'claim': { kind: 'read', handler: 'voiceOfMerchant', label: 'Check verification status' },
    'review-link': { kind: 'read', handler: 'reviewLink', label: 'Generate the review link' },
    'category': { kind: 'write', handler: 'categoryAttributes', label: 'Category and attributes', draftFrom: 'cuisine and service styles' },
    'content': { kind: 'write', handler: 'description', label: 'Description and services', draftFrom: 'business description and differentiators' },
    'coreinfo': { kind: 'write', handler: 'coreInfo', label: 'Hours, phone, website, menu link', draftFrom: 'onboarding hours and contact' },
    'menu': { kind: 'write', handler: 'menu', label: 'Structured menu', draftFrom: 'menu items and specials' },
    'photos': { kind: 'write', handler: 'photos', label: 'Photo set', draftFrom: 'brand-assets photos' },
  },
  'gbp-posts': {
    'publish': { kind: 'write', handler: 'gbpPosts', label: 'Publish the posts', draftFrom: "this month's menu and events" },
  },
}

export function actionFor(serviceId: string, stepId: string): StepAction | undefined {
  return STEP_ACTIONS[serviceId]?.[stepId]
}
