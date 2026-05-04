/**
 * Zod schema introspection — reads metadata off a Zod type so the form
 * renderer can decide which input to draw.
 *
 * Zod 4 stores metadata on `_def`. We unwrap optional/nullable wrappers
 * to find the underlying type. Description (set via .describe('...')) is
 * preserved through wrappers.
 */

import { z, type ZodTypeAny } from 'zod'

export type FieldKind =
  | 'string'
  | 'longString'      // multiline-friendly string
  | 'number'
  | 'boolean'
  | 'enum'
  | 'url'
  | 'color'
  | 'asset'           // string URL with image preview
  | 'object'
  | 'array'
  | 'unknown'

export interface FieldMeta {
  kind: FieldKind
  description?: string
  optional: boolean
  nullable: boolean
  enumOptions?: string[]
  innerType: ZodTypeAny
  arrayItemType?: ZodTypeAny
  objectShape?: Record<string, ZodTypeAny>
  maxChars?: number
  minChars?: number
}

// Narrow Zod 4 internal access. We tolerate any-cast since Zod doesn't
// publicly export its def shapes. eslint-disable-next-line is intentional.
/* eslint-disable @typescript-eslint/no-explicit-any */

function getDef(t: ZodTypeAny): any {
  return (t as any)._def
}

function getDescription(t: ZodTypeAny): string | undefined {
  // Zod 4: t.description is the canonical accessor.
  return (t as any).description
}

function unwrap(t: ZodTypeAny): { inner: ZodTypeAny; optional: boolean; nullable: boolean } {
  let inner = t
  let optional = false
  let nullable = false
  // Walk through ZodOptional / ZodNullable / ZodDefault wrappers
  for (let i = 0; i < 6; i++) {
    const def = getDef(inner)
    if (!def) break
    const typeName = def.typeName ?? def.type
    if (typeName === 'ZodOptional' || typeName === 'optional') { optional = true; inner = def.innerType; continue }
    if (typeName === 'ZodNullable' || typeName === 'nullable') { nullable = true; inner = def.innerType; continue }
    if (typeName === 'ZodDefault' || typeName === 'default') { inner = def.innerType; continue }
    if (typeName === 'ZodReadonly' || typeName === 'readonly') { inner = def.innerType; continue }
    break
  }
  return { inner, optional, nullable }
}

export function introspect(t: ZodTypeAny, fieldName?: string): FieldMeta {
  const description = getDescription(t)
  const { inner, optional, nullable } = unwrap(t)

  const def = getDef(inner)
  const typeName: string | undefined = def?.typeName ?? def?.type

  const base: Pick<FieldMeta, 'description' | 'optional' | 'nullable' | 'innerType'> = {
    description,
    optional,
    nullable,
    innerType: inner,
  }

  // String-like
  if (typeName === 'ZodString' || typeName === 'string') {
    const checks = def.checks ?? []
    let isUrl = false
    let maxChars: number | undefined
    let minChars: number | undefined
    for (const c of checks) {
      const kind = c.kind ?? c.format
      if (kind === 'url') isUrl = true
      if (kind === 'max') maxChars = c.value ?? c.maximum
      if (kind === 'min') minChars = c.value ?? c.minimum
    }
    // Heuristic for color
    const isColor = (description ?? '').toLowerCase().includes('hex color') ||
      (fieldName ?? '').toLowerCase().endsWith('color')

    // Heuristic for asset (image URL) — driven by description containing "URL" + "logo|photo|image|og"
    const lc = `${fieldName ?? ''} ${description ?? ''}`.toLowerCase()
    const isAsset = (lc.includes('logo') || lc.includes('photo') || lc.includes('image') || lc.includes('og image'))

    if (isColor) return { ...base, kind: 'color', maxChars, minChars }
    if (isAsset) return { ...base, kind: 'asset', maxChars, minChars }
    if (isUrl) return { ...base, kind: 'url', maxChars, minChars }
    if ((maxChars ?? 0) > 200) return { ...base, kind: 'longString', maxChars, minChars }
    return { ...base, kind: 'string', maxChars, minChars }
  }

  // Number
  if (typeName === 'ZodNumber' || typeName === 'number') {
    return { ...base, kind: 'number' }
  }

  // Boolean
  if (typeName === 'ZodBoolean' || typeName === 'boolean') {
    return { ...base, kind: 'boolean' }
  }

  // Enum
  if (typeName === 'ZodEnum' || typeName === 'enum') {
    const values = def.values ?? def.entries ?? []
    const opts = Array.isArray(values) ? values : Object.values(values)
    return { ...base, kind: 'enum', enumOptions: opts as string[] }
  }

  // Array
  if (typeName === 'ZodArray' || typeName === 'array') {
    const itemType = def.element ?? def.type
    return { ...base, kind: 'array', arrayItemType: itemType as ZodTypeAny }
  }

  // Object
  if (typeName === 'ZodObject' || typeName === 'object') {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape
    return { ...base, kind: 'object', objectShape: shape as Record<string, ZodTypeAny> }
  }

  // Coerce wrappers
  if (typeName === 'ZodPipe' || typeName === 'pipe' || typeName === 'ZodEffects' || typeName === 'effects') {
    const out = def.out ?? def.schema
    if (out) return introspect(out as ZodTypeAny, fieldName)
  }

  // Union / fallback: many union(URL, literal('')) patterns end up here.
  if (typeName === 'ZodUnion' || typeName === 'union') {
    // Treat as URL if any option has the url format
    const opts: ZodTypeAny[] = def.options ?? []
    for (const o of opts) {
      const innerCheck = introspect(o, fieldName)
      if (innerCheck.kind === 'url' || innerCheck.kind === 'asset') return innerCheck
    }
    return { ...base, kind: 'string' }
  }

  return { ...base, kind: 'unknown' }
}

export function humanizeFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase())
}

/**
 * Build an empty value for a Zod schema. Used when adding a new array item.
 */
export function emptyValueFor(t: ZodTypeAny): unknown {
  const { inner } = unwrap(t)
  const meta = introspect(inner)
  switch (meta.kind) {
    case 'string':
    case 'longString':
    case 'url':
    case 'asset':
    case 'color':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'enum':
      return meta.enumOptions?.[0] ?? ''
    case 'array':
      return []
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, sub] of Object.entries(meta.objectShape ?? {})) {
        out[k] = emptyValueFor(sub)
      }
      return out
    }
    default:
      return null
  }
}
