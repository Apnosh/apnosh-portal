/**
 * scan-screen — reads a screen's SOURCE and returns the English it draws that nobody translated.
 *
 * The manifest check (scripts/verify-i18n.ts section 2) can only see the strings somebody
 * LISTED. It cannot see a literal the screen actually draws that nobody listed, which is how
 * Home passed while rendering 'Real · Google' and 'Getting your numbers' in the middle of a
 * Spanish page. This is the other half: it reads the file.
 *
 * It is a regex pass, not a parser, and it is meant to be tightened every time something slips
 * through it. What it looks at:
 *
 *   · text between tags, INCLUDING a run that ends at a nested element or an expression —
 *     `Real · <b>Google</b>` and `{n} people walked past` both used to be invisible to it;
 *   · every quoted attribute on a JSX tag except the ones that are never owner copy (className,
 *     style, href…), so a prop nobody thought to list is still caught;
 *   · quoted strings and template literals in a value position — after `{`, `[`, `(`, `,` or
 *     `?` — which is arrays, ternaries, expression containers and function arguments;
 *   · the key inside t('…') or T("…"), single or double quoted, because a key that is not in
 *     the dictionary renders its English and nothing would have said so.
 *
 * Missing something is fine. Passing a screen with plain English literals on it is not.
 *
 * Pure: no fs, no network, no React. The caller reads the file and owns the manifest.
 */

/** Not owner copy: a proper noun, a symbol, or a word that is the same in both languages. */
const NOT_COPY = new Set(['Google', 'Apnosh', 'TikTok', 'Yelp', 'Instagram', 'Facebook', 'Free'])

/** Attributes that are never words an owner reads. Everything else on a tag is checked. */
const NOT_COPY_ATTR = new Set([
  'className', 'class', 'style', 'key', 'id', 'href', 'src', 'srcSet', 'rel', 'target', 'ref',
  'type', 'role', 'name', 'value', 'defaultValue', 'htmlFor', 'method', 'action', 'accept',
  'xmlns', 'viewBox', 'fill', 'stroke', 'strokeLinecap', 'strokeLinejoin', 'd', 'points',
  'width', 'height', 'size', 'color', 'hue', 'autoComplete', 'inputMode', 'enterKeyHint',
  'pattern', 'sizes', 'loading', 'decoding', 'dir', 'lang', 'as', 'variant', 'align', 'kind',
  'preserveAspectRatio', 'transform', 'gradientUnits', 'offset', 'stopColor', 'filter',
])

/** Words that only ever turn up because this is a regex pass over TypeScript, not a parser. */
const CODE_WORD = new Set(['catch', 'else', 'try', 'finally', 'of', 'in', 'as', 'do', 'return', 'await', 'Promise', 'void', 'null', 'undefined'])

/** A value that is plainly not a sentence: css, a colour, a font stack, a selector, a column
 *  list out of a select(). Everything here would otherwise be reported forever. */
function looksLikeCode(v: string): boolean {
  if (/\d+(px|rem|em|vh|dvh|%)\b/.test(v)) return true          // 10px 0, 100dvh
  if (/\d+(\.\d+)?s\b/.test(v)) return true                    // goalCounterPulse .35s ease
  if (/rgba?\(|#[0-9a-fA-F]{3,8}\b|sans-serif|@media|@keyframes|!important/.test(v)) return true
  if (/prefers-reduced-motion|min-width|max-width/.test(v)) return true
  if (/^[.#@(]/.test(v)) return true                            // .mrise, #fff, @media, (a query)
  if (/^\[[a-z][\w-]*\]/.test(v)) return true                  // [onboarding] a console.warn
  if (/^[A-Za-z_$][\w$]*(\.[\w$]+)+$/.test(v)) return true      // tr.orb, a property read
  if (/[,_]/.test(v) && /^[a-z_, ]+$/.test(v)) return true      // id, subject, last_message_at
  if (CSS_SHORTHAND.test(v)) return true                        // 0 0 auto (flex), 1fr auto (grid)
  return false
}
/** A value made only of sizes and css keywords, with nothing to read in it. */
const CSS_SHORTHAND = /^(?:[\d.]+(?:px|rem|em|fr|%|vh|vw|dvh|s|ms)?|auto|none|min-content|max-content|inherit|initial)(?:\s+(?:[\d.]+(?:px|rem|em|fr|%|vh|vw|dvh|s|ms)?|auto|none|min-content|max-content|inherit|initial))+$/

/** Drop comments: a note to a reader is not copy on a screen. Block comments, whole comment
 *  lines, and a trailing // — never the // in a URL, which is why the lookbehind is there. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/(?<![:'"`\\])\/\/.*$/, ''))
    .join('\n')
}

/** Blank out the props that are never copy but whose VALUE is an expression: className={…},
 *  style={{…}}. Left in, a css class in a template reads exactly like a sentence. */
function dropCodeProps(src: string): string {
  const names = [...NOT_COPY_ATTR].join('|')
  return src.replace(new RegExp(`\\b(?:${names})=\\{(?:[^{}\`]|\`[^\`]*\`|\\{[^{}]*\\})*\\}`, 'g'), '')
}

/** A template's holes emptied: `${n} took a step` is English copy, `${a} · ${b}` is two values
 *  with a dot between them and nothing to translate. Braces nest — `${T('a', { n })}` is one
 *  hole, not one and a half — so this counts them instead of stopping at the first `}`. */
function holes(v: string): string {
  let out = ''
  for (let i = 0; i < v.length; i += 1) {
    if (v[i] === '$' && v[i + 1] === '{') {
      let depth = 0
      let j = i + 1
      for (; j < v.length; j += 1) {
        if (v[j] === '{') depth += 1
        else if (v[j] === '}') { depth -= 1; if (depth === 0) break }
      }
      i = j
      continue
    }
    out += v[i]
  }
  return out
}
const CODEY = /[(){}=;]/
const isCopy = (v: string) => /[A-Za-z]{2}/.test(v) && !NOT_COPY.has(v) && !CODE_WORD.has(v) && !looksLikeCode(v)
/** A bare string in a value position is only copy when it is a PHRASE. One word there is far
 *  more often a css value, a status or an id ('flex-end', 'tmp-', 'quoted') than a sentence,
 *  and single words an owner reads go through t(), which is checked separately. */
const isPhrase = (v: string) => v.includes(' ') && isCopy(v)

/** A run of text between tags. It may END at a nested element or at an expression, and it may
 *  START after one: `Real · <b>Google</b>` and `{n} people walked past` were both invisible
 *  while this only looked for `>…</`. Quotes and operators mean we are reading code, not copy. */
const TEXT = /[>}]([^<>{}\n'"`|&?=;]{1,400})[<{]/g
const JSX_TAG = /<[A-Za-z][A-Za-z0-9.]*\s[^<>]*?\/?>/g
const TAG_ATTR = /([A-Za-z][A-Za-z0-9-]*)\s*=\s*(['"])([^'"]*)\2/g
const OBJ_PROP = /\b(label|sub|title|tag|conv|message|placeholder|aria-label|alt|blurb|subtitle|hint)\s*[:=]\s*(?:\{\s*)?(['"`])([^'"`]*)\2/g
const STR_VAL = /(?:[{[(,?]|\breturn)\s*(['"])((?:[^'"\\\n]|\\.)*)\1/g
const TPL_VAL = /(?:[{[(,?]|\breturn)\s*`([^`]*)`/g
/** the else half of `x ? 'a' : 'b'` — a bare `:` cannot be a value position (every css rule in
 *  the file is one), but the `:` of a ternary whose then-half is a string can. */
const TERNARY_ELSE = /\?\s*(['"])(?:[^'"]*)\1\s*:\s*(['"])([^'"]*)\2/g
const TKEY = /\b[tT]\(\s*(['"])([^'"]+)\1/g
/**
 * A string sitting behind a colon in an object literal: `{ veryLow: 'very low', low: 'low' }`.
 *
 * This is how the funnel's band words got onto a Spanish page. They are a Record, they are drawn
 * straight into the canvas, and every other pattern here needs a `{ [ ( , ?` immediately before
 * the quote — which a `key:` is not. Safe to add because dropCodeProps has already blanked every
 * `style={{…}}`, and looksLikeCode throws out what is left of css (`'0 6px 20px rgba(…)'`,
 * `'saturate(180%) blur(16px)'`). A one-word value is still skipped, same as everywhere else.
 */
const OBJ_VAL = /[{,]\s*(?:'[^'\n]+'|"[^"\n]+"|\[[^\]\n]+\]|[A-Za-z_$][\w$]*)\s*:\s*(['"])([^'"\n]*)\1/g

/**
 * Every string this source draws that the manifest does not carry, in the order found.
 * `listed` is the set of keys the dictionary is proved against (allScreenKeys + shape words).
 */
export function looseStringsIn(source: string, listed: Set<string>): string[] {
  const src = dropCodeProps(stripComments(source))
  const seen = new Set<string>()

  // text between tags — a run may end at a nested element or at an expression, not only at </.
  // Template literals are read on their own below and blanked here, so a <style> block's css
  // and the halves of `a ${b} c` are not mistaken for text on the page.
  // `=>` is not a tag: the > of an arrow function used to open a "text node" that ran to the
  // next <, so `(r) => Partial<X>` reported the word Partial as English on the screen.
  // Quoted strings and templates are read on their own below and blanked here: their INSIDES
  // are not text on the page, and `t('Google {g} · Social {s}')` would otherwise report the
  // "· Social" between its two holes as a loose English text node.
  const jsx = src.replace(/=>/g, '  ').replace(/`[^`]*`/g, '``').replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""')
  for (const m of jsx.matchAll(TEXT)) { const v = m[1].trim(); if (!/^[:,.|&]/.test(v) && !CODEY.test(v) && isCopy(v)) seen.add(v) }
  // every quoted attribute on a JSX tag, minus the ones that are never copy
  for (const tag of src.matchAll(JSX_TAG)) {
    for (const a of tag[0].matchAll(TAG_ATTR)) {
      if (NOT_COPY_ATTR.has(a[1])) continue
      const v = a[3].trim()
      if (isPhrase(holes(v))) seen.add(v)
    }
  }
  // label: 'x' and friends in a plain object (the shelf's cards, the tiles)
  for (const m of src.matchAll(OBJ_PROP)) { const v = holes(m[3]).trim(); if (isCopy(v)) seen.add(m[3].trim()) }
  // a string or a template in a value position: {…}, an array, a ternary, an argument
  for (const m of src.matchAll(STR_VAL)) { const v = m[2].trim(); if (isPhrase(holes(v))) seen.add(v) }
  for (const m of src.matchAll(TPL_VAL)) { const v = m[1].trim(); if (isPhrase(holes(v))) seen.add(v) }
  for (const m of src.matchAll(TERNARY_ELSE)) { const v = m[3].trim(); if (isPhrase(holes(v))) seen.add(v) }
  // a Record's values: { veryLow: 'very low' } — behind a colon, which nothing above reaches
  for (const m of src.matchAll(OBJ_VAL)) { const v = m[2].trim(); if (isPhrase(holes(v))) seen.add(v) }
  // the key inside t('…') / T("…"), whichever quote it was written with
  for (const m of src.matchAll(TKEY)) seen.add(m[2])

  return [...seen].filter((v) => !listed.has(v))
}
