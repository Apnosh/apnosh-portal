/**
 * Dashboard feature flags. Lives outside the 'use server' actions file
 * because Next.js requires server-action modules to export only async
 * functions.
 *
 * Each feature corresponds to a tile in the manage-site hub + an editor
 * sub-page. The customer site declares which ones to expose via the
 * `features` array in apnosh-content.json.
 *
 * Adding a new feature:
 *   1. Add the literal here.
 *   2. Add a tile case in /dashboard/website/manage/page.tsx.
 *   3. Build the editor sub-page under /dashboard/website/manage/<feature>.
 *   4. Document in docs/INTEGRATION-PLAYBOOK.md.
 */
export type DashboardFeature = 'menu' | 'specials' | 'copy' | 'photos'

export const ALL_FEATURES: DashboardFeature[] = ['menu', 'specials', 'copy', 'photos']
