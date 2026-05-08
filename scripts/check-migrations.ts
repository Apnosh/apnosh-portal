#!/usr/bin/env tsx
/**
 * Tenancy lint rule for new migrations.
 *
 * Per Phase 3 Decision 1 (consolidate on `clients`), no new migration
 * should add `business_id NOT NULL` columns or tables. Legacy tables
 * keep their constraints; new code must key on `client_id`.
 *
 * Escape hatch: include the literal comment `TENANCY OVERRIDE: <reason>`
 * in the migration file (anywhere) to acknowledge the exception.
 *
 * Run from CI:  npx tsx scripts/check-migrations.ts
 *
 * Exits non-zero if any migration > FREEZE_MIGRATION violates the rule
 * without an override.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Migrations at or before this number predate the freeze and are exempt.
// Bump if a wk 1 audit finds a number we missed.
const FREEZE_MIGRATION = 84

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

// Catches column definitions like:
//   business_id uuid not null references ...
//   business_id uuid not null,
// Restricted to a single line so SQL like "where business_id = b.id and
// b.client_id is not null" doesn't trip it. Won't catch a separate ALTER
// TABLE that adds NOT NULL later -- rare enough; tighten if it becomes a
// real escape route.
const NOT_NULL_BUSINESS_ID = /^[\s]*business_id\s+\w+(\s+\w+)*\s+not\s+null\b/im

const OVERRIDE_MARKER = /TENANCY OVERRIDE:/i

function migrationNumber(filename: string): number | null {
  const m = filename.match(/^(\d+)_/)
  return m ? parseInt(m[1], 10) : null
}

function main(): number {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const violations: string[] = []

  for (const file of files) {
    const num = migrationNumber(file)
    if (num === null || num <= FREEZE_MIGRATION) continue

    const path = join(MIGRATIONS_DIR, file)
    const raw = readFileSync(path, 'utf8')

    // Override marker can live in comments; check raw text for that.
    if (OVERRIDE_MARKER.test(raw)) continue

    // Strip line comments and block comments before pattern matching so
    // prose mentioning the words "business_id" and "not null" doesn't
    // trip the lint.
    const sql = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')

    if (!NOT_NULL_BUSINESS_ID.test(sql)) continue

    violations.push(file)
  }

  if (violations.length === 0) {
    console.log('✓ tenancy: no new business_id NOT NULL violations')
    return 0
  }

  console.error('✗ tenancy: new migrations add business_id NOT NULL without an override.')
  console.error('  Per Phase 3 Decision 1, new tables should key on client_id.')
  console.error('  If unavoidable, add a comment: -- TENANCY OVERRIDE: <reason>')
  console.error('')
  for (const v of violations) console.error(`    - ${v}`)
  return 1
}

process.exit(main())
