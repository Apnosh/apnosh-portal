/**
 * verify-i18n — proves two claims this move makes, without a browser or a database.
 *
 *   1. THE WORD MAP IS COMPLETE. Every English sentence src/lib/clients/shape-words.ts can
 *      produce for a truck, a delivery kitchen, two shops, a caterer or a season has a Spanish
 *      entry. A shape word that falls back to English is the exact failure the map exists to
 *      fix, and it would only ever be seen by the owner it was written for.
 *
 *   2. THE TRANSLATED SCREENS REALLY ARE TRANSLATED. Every key the screens in
 *      src/lib/i18n/keys.ts draw has an entry in es.ts, and every entry in es.ts is drawn by
 *      one of them. The first catches a screen we CLAIM is Spanish that still has English on
 *      it; the second catches a dictionary carrying words nothing shows any more.
 *
 * It also checks the fallback itself: t() with an unknown key must return the key (which is
 * the English copy), never a blank, and never the word "undefined" in front of an owner.
 *
 * Pure imports only — nothing here touches the network, Stripe, or Supabase.
 *
 *   npx tsx scripts/verify-i18n.ts
 */
import { ES } from '../src/lib/i18n/es'
import { SCREEN_KEYS, allScreenKeys } from '../src/lib/i18n/keys'
import { t, localeOf, money, num, DEFAULT_LANG, isLang, LANGS } from '../src/lib/i18n/t'
import { allShapeWords, stageSubFor, stageLabelFor, emptyLineFor, EMPTY_LINE_DEFAULT } from '../src/lib/clients/shape-words'
import { SHELF_SHAPES } from '../src/lib/clients/shape'
import { replyLine, oneBusinessDayAfter, waitLabel, askFrom } from '../src/lib/team/reply-line'

let failures = 0
function check(name: string, ok: boolean | (() => boolean), detail?: string) {
  if (typeof ok === 'function' ? ok() : ok) { console.log(`  ok   ${name}`); return }
  failures += 1
  console.log(`  FAIL ${name}${detail ? `  →  ${detail}` : ''}`)
}

console.log('\n1. The shape word map')
{
  const missing = allShapeWords().filter((w) => !ES[w])
  check('every shape word has Spanish', missing.length === 0, missing.join(' | '))

  // A shape with nothing to say must return today's word, character for character.
  check(
    'a storefront reads the fallback, untouched',
    stageSubFor('camein', 'storefront', 'walk-in orders from Google') === 'walk-in orders from Google'
      && stageLabelFor('camein', 'storefront', 'Orders') === 'Orders'
      && emptyLineFor('storefront') === EMPTY_LINE_DEFAULT,
  )
  check(
    'a client with no shape reads the fallback too',
    stageSubFor('camein', null, 'walk-in orders from Google') === 'walk-in orders from Google'
      && emptyLineFor(null) === EMPTY_LINE_DEFAULT,
  )
  // The whole point: nobody without a dining room is told about their walk-ins.
  const noWalkIns = (['truck', 'delivery_only'] as const).every(
    (sh) => !/walk-in/i.test(stageSubFor('camein', sh, 'walk-in orders from Google')),
  )
  check('a truck and a delivery kitchen are never told about walk-ins', noWalkIns)
  // Every shape must produce a non-empty line for every stage.
  const blanks: string[] = []
  for (const sh of SHELF_SHAPES) {
    for (const [k, w] of [['shown', 'Awareness'], ['engaged', 'Interest'], ['moved', 'Actions'], ['camein', 'Orders'], ['back', 'Retention']] as const) {
      if (!stageLabelFor(k, sh, w).trim()) blanks.push(`${sh}/${k}`)
    }
    if (!emptyLineFor(sh).trim()) blanks.push(`${sh}/empty`)
  }
  check('no shape blanks a stage name or the empty line', blanks.length === 0, blanks.join(' '))
}

console.log('\n2. The translated screens')
{
  const keys = allScreenKeys()
  const untranslated = keys.filter((k) => !ES[k])
  check(`every key on a translated screen has Spanish (${keys.length} keys)`, untranslated.length === 0, untranslated.join(' | '))

  const listed = new Set([...keys, ...allShapeWords()])
  const orphans = Object.keys(ES).filter((k) => !listed.has(k))
  check('no Spanish entry belongs to a screen nothing draws', orphans.length === 0, orphans.join(' | '))

  // A translation that is identical to its English key is almost always a forgotten line.
  // The exceptions are the words that really are the same in both languages.
  const SAME_IN_BOTH = new Set<string>([])
  const identical = Object.entries(ES).filter(([k, v]) => k === v && !SAME_IN_BOTH.has(k)).map(([k]) => k)
  check('no Spanish entry is just its English key', identical.length === 0, identical.join(' | '))

  // Placeholders must survive translation, or a number lands nowhere.
  const holes = Object.entries(ES)
    .filter(([k]) => /\{\w+\}/.test(k))
    .filter(([k, v]) => (k.match(/\{\w+\}/g) ?? []).some((h) => !v.includes(h)))
    .map(([k]) => k)
  check('every {placeholder} survives into the Spanish', holes.length === 0, holes.join(' | '))

  // Screens are listed one by one so a failure names the screen, not just the string.
  for (const [screen, list] of Object.entries(SCREEN_KEYS)) {
    const gaps = list.filter((k) => !ES[k])
    check(`  ${screen}: ${list.length} keys`, gaps.length === 0, gaps.join(' | '))
  }
}

console.log('\n3. The t() fallback')
{
  check('an unknown key renders its English', t('This has no translation yet', 'es') === 'This has no translation yet')
  check('English never looks anything up', t('Get help', 'en') === 'Get help')
  check('a null language is English', t('Get help', null) === 'Get help')
  check('Spanish resolves', t('Get help', 'es') === 'Pedir ayuda')
  check('placeholders fill', t('{n} more, once you raise it', 'en', { n: 3 }) === '3 more, once you raise it')
  check('an unfilled placeholder stays visible, not "undefined"', t('{n} more, once you raise it', 'en') === '{n} more, once you raise it')
  check('the default language is English', DEFAULT_LANG === 'en' && LANGS.length === 2)
  check('only en and es are languages', isLang('en') && isLang('es') && !isLang('fr') && !isLang(null))
  check('the locale is United States Spanish', localeOf('es') === 'es-US' && localeOf('en') === 'en-US')
  check('money stays dollars in both', money(1200, 'es').includes('1,200') && money(1200, 'en').includes('1,200'))
  check('numbers group in both', num(13700, 'es') === '13,700' && num(13700, 'en') === '13,700')
}

console.log('\n4. The reply clock')
{
  const tue = new Date('2026-09-08T15:10:00')
  const line = replyLine({ askedAt: tue.toISOString(), answeredAt: null })
  check('the promise carries a sent time and a due time', !!line && line.includes('Sent') && line.includes('due'), line ?? 'null')
  check('an answered thread says how long it took',
    replyLine({ askedAt: tue.toISOString(), answeredAt: new Date(tue.getTime() + (2 * 60 + 14) * 60_000).toISOString() }) === 'Answered in 2h 14m')
  check('nobody has asked yet means no clock', replyLine({ askedAt: null, answeredAt: null }) === null)
  check('a Friday question is owed Monday', oneBusinessDayAfter(new Date('2026-09-11T15:10:00')).getDay() === 1)
  check('a Saturday question is owed Monday', oneBusinessDayAfter(new Date('2026-09-12T09:00:00')).getDay() === 1)
  check('a Sunday question is owed Monday', oneBusinessDayAfter(new Date('2026-09-13T09:00:00')).getDay() === 1)
  check('a Tuesday question is owed Wednesday', oneBusinessDayAfter(new Date('2026-09-08T09:00:00')).getDay() === 3)
  check('a wait under an hour never reads 0m', waitLabel(20_000) === '1m')
  // WHICH exchange the clock is on (askFrom). The owner's newest message used to decide, so a
  // second ask reset the due date and made a late answer look on time.
  const at = (h: number, m = 0) => new Date(2026, 8, 8, h, m).toISOString()
  const owner = (h: number, m = 0) => ({ sender: 'owner' as const, createdAt: at(h, m) })
  const team = (h: number, m = 0) => ({ sender: 'team' as const, createdAt: at(h, m) })
  check('a nudge does not move the due date', askFrom([owner(9), owner(11)])?.askedAt === at(9))
  check('an answered exchange reads as answered', askFrom([owner(9), team(11)])?.answeredAt === at(11))
  check('the wait is measured to the FIRST reply', askFrom([owner(9), team(11), team(14)])?.answeredAt === at(11))
  check('the wait starts at the first ask, not the last', () => {
    const a = askFrom([owner(9), owner(10), team(12)])
    return a?.askedAt === at(9) && a?.answeredAt === at(12)
  })
  check('a thread with no owner line has no clock', askFrom([team(9)]) === null)
  check('the Spanish clock is one sentence, not two languages',
    (replyLine({ askedAt: tue.toISOString(), answeredAt: null }, {
      locale: 'es-US', promise: 'en un día hábil',
      words: { sent: 'Enviado', weAnswer: 'contestamos', due: 'para el', answeredIn: 'Contestado en' },
    }) ?? '').startsWith('Enviado'))
}

console.log(failures === 0 ? '\n✓ i18n verified\n' : `\n✗ ${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
