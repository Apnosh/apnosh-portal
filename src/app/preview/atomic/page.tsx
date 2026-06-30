/**
 * DEV-ONLY preview of the internal atomic action catalog (the AI builder's palette).
 * Each atom renders as one configurable service (type + amount). Read-only, no auth,
 * no DB. Not reachable in production.
 */
import { notFound } from 'next/navigation'
import { ATOMIC_ACTIONS, RECIPES, expandRecipe, atomicCoverage } from '@/lib/campaigns/data/atomic-catalog'
import { AtomicCatalogView, type RecipeView, type Cov } from './atomic-catalog-view'

export const dynamic = 'force-dynamic'

export default async function AtomicCatalogPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  const c = atomicCoverage()
  const cov: Cov = {
    atoms: c.atoms,
    actionTypes: c.actionTypes,
    distinctSourceStrings: c.distinctSourceStrings,
    recipes: c.recipes,
    fitTally: c.fitTally,
    lossless: c.distinctSourceStrings === 178 && c.duplicates.length === 0 && c.unresolvedRecipeLines.length === 0,
  }
  const recipes: RecipeView[] = RECIPES.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    lines: expandRecipe(r).map((p) => ({ atomName: p.atom.name, typeLabel: p.type?.label, qty: p.qty, fit: p.fit })),
  }))
  return <AtomicCatalogView atoms={ATOMIC_ACTIONS} recipes={recipes} cov={cov} />
}
