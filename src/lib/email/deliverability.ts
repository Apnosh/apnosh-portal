/**
 * EMAIL DELIVERABILITY — reading the three records that decide whether your email lands, pure and
 * I/O-free.
 *
 * WHY THIS CARD CAN BE HONEST. Every other setup card needs the owner to grant us something before
 * we can see anything. This one needs nothing: SPF and DMARC live in public DNS, so we can read the
 * real state of any restaurant's domain from a cold start, before they are a client, without a
 * password. That is the strongest read position we have anywhere, and it is why every lane here
 * proves itself by probe.
 *
 * ── THE LIMITATION THAT SHAPES THE WHOLE CARD ──────────────────────────────────────────────────
 *
 * DKIM IS NOT LOOKUPABLE THE WAY THE OTHER TWO ARE.
 *
 * SPF sits at the domain. DMARC sits at _dmarc.<domain>. Both are at known, fixed names, so a
 * lookup that comes back empty genuinely means "not set up".
 *
 * DKIM sits at <selector>._domainkey.<domain>, and the SELECTOR is chosen by whoever sends the
 * mail. Google uses `google`. Mailchimp uses `k1`. There is no way to enumerate them: DNS will not
 * list what is under a name you have not guessed.
 *
 * So a DKIM miss is NOT proof of absence, and this module refuses to report it as one. It reports
 * `unknown`, and the copy says we looked under the common names and did not find one. Saying "you
 * have no DKIM" to an owner who set it up under a selector we did not guess would be the exact
 * wrong-but-plausible claim that makes an owner stop trusting every other number we show them.
 *
 * CLIENT-SAFE: pure. The DNS calls live in the API route.
 */

export type RecordKey = 'spf' | 'dkim' | 'dmarc'

export type RecordState =
  /** Found, and it says something sane. */
  | 'good'
  /** Found, but it will not do the job it is there to do. */
  | 'weak'
  /** Looked at a known, fixed name and found nothing. Real absence. */
  | 'missing'
  /** We cannot answer this from a lookup. Today: DKIM only. Never rendered as a failure. */
  | 'unknown'

export interface RecordFinding {
  key: RecordKey
  /** What it is, in the owner's words. No acronym as a headline. */
  label: string
  /** One plain sentence on what this record does for them. */
  answers: string
  state: RecordState
  /** The raw record we found, for the owner to compare. Null when there was nothing. */
  found: string | null
  /** Plain sentence on what is wrong, when something is. */
  problem: string | null
}

/** The common DKIM selectors, by who put them there. Checked in this order; the first hit wins.
 *  This list is the entire reason a DKIM answer can ever be better than 'unknown', and it is also
 *  why a miss can never be worse than 'unknown'. */
export const DKIM_SELECTORS: readonly { selector: string; who: string }[] = [
  { selector: 'google', who: 'Google Workspace' },
  { selector: 'k1', who: 'Mailchimp' },
  { selector: 'k2', who: 'Mailchimp' },
  { selector: 's1', who: 'SendGrid or Klaviyo' },
  { selector: 's2', who: 'SendGrid or Klaviyo' },
  { selector: 'resend', who: 'Resend' },
  { selector: 'mandrill', who: 'Mailchimp Transactional' },
  { selector: 'dkim', who: 'a self-hosted mail server' },
  { selector: 'selector1', who: 'Microsoft 365' },
  { selector: 'selector2', who: 'Microsoft 365' },
  { selector: 'sm', who: 'Squarespace' },
  { selector: 'zoho', who: 'Zoho Mail' },
]

/** What the API hands back after doing the lookups. All strings are raw DNS answers. */
export interface DnsAnswers {
  domain: string
  /** Every TXT record at the apex, unfiltered. */
  apexTxt: string[]
  /** Every TXT record at _dmarc.<domain>. */
  dmarcTxt: string[]
  /** The first DKIM selector that answered, with its record. Null when none of the known ones did. */
  dkim: { selector: string; who: string; record: string } | null
  /** True when the domain itself did not resolve at all: a typo, or a domain that is not registered.
   *  Everything else is meaningless if this is true, so it is reported on its own. */
  domainResolves: boolean
}

/* ── reading each record ─────────────────────────────────────────────────────────────────────── */

/** SPF says which servers are allowed to send as you. */
export function readSpf(apexTxt: string[]): RecordFinding {
  const base = {
    key: 'spf' as const,
    label: 'Who is allowed to send as you',
    answers: 'Stops other people sending email that looks like it came from your restaurant.',
  }
  const records = apexTxt.filter((t) => t.toLowerCase().startsWith('v=spf1'))

  if (!records.length) {
    return { ...base, state: 'missing', found: null, problem: 'Nothing is saying which servers may send as you, so anyone can.' }
  }
  // More than one SPF record is a real, common, silent failure: the spec says a domain with two is
  // invalid, and receivers treat it as a permanent error rather than picking one.
  if (records.length > 1) {
    return { ...base, state: 'weak', found: records.join(' | '), problem: `There are ${records.length} of these. The rule is one, and two makes the whole check fail.` }
  }

  const rec = records[0]
  // "?all" (neutral) and "+all" (pass anything) are the two that make the record decorative.
  if (/[?+]all\b/i.test(rec)) {
    return { ...base, state: 'weak', found: rec, problem: 'It ends in a way that tells receivers to allow anyone, which is the same as having none.' }
  }
  return { ...base, state: 'good', found: rec, problem: null }
}

/** DMARC says what a receiver should DO when a message fails the checks above. */
export function readDmarc(dmarcTxt: string[]): RecordFinding {
  const base = {
    key: 'dmarc' as const,
    label: 'What happens to fakes',
    answers: 'Tells Gmail and the rest what to do with email that is pretending to be you.',
  }
  const rec = dmarcTxt.find((t) => t.toLowerCase().startsWith('v=dmarc1')) ?? null
  if (!rec) {
    return { ...base, state: 'missing', found: null, problem: 'Nobody is told what to do with fake email from your name, so it gets delivered.' }
  }
  const policy = /\bp=(none|quarantine|reject)\b/i.exec(rec)?.[1]?.toLowerCase()
  if (policy === 'none') {
    return { ...base, state: 'weak', found: rec, problem: 'It is set to watch only. Fakes still get delivered while it watches.' }
  }
  if (!policy) {
    return { ...base, state: 'weak', found: rec, problem: 'It does not say what to do with a fake, so receivers fall back to doing nothing.' }
  }
  return { ...base, state: 'good', found: rec, problem: null }
}

/** DKIM signs each message so a receiver can tell it was really you and was not changed.
 *  See the header: a miss here is 'unknown', never 'missing'. */
export function readDkim(dkim: DnsAnswers['dkim']): RecordFinding {
  const base = {
    key: 'dkim' as const,
    label: 'Your signature on each message',
    answers: 'Proves a message really came from you and nobody edited it on the way.',
  }
  if (!dkim) {
    return {
      ...base,
      state: 'unknown',
      found: null,
      problem: `We looked under the ${DKIM_SELECTORS.length} most common names and did not find one. It may still be there under a name only your email provider knows.`,
    }
  }
  return { ...base, state: 'good', found: `${dkim.selector}._domainkey (${dkim.who})`, problem: null }
}

export interface DeliverabilityReport {
  domain: string
  domainResolves: boolean
  findings: RecordFinding[]
  /** How many are genuinely wrong. `unknown` is deliberately not counted: we will not put a number
   *  on the owner's screen that includes a thing we could not check. */
  problems: number
  /** True when nothing we can see is wrong. Never claims DKIM is fine when it is unknown. */
  clean: boolean
  headline: string
}

export function buildReport(a: DnsAnswers): DeliverabilityReport {
  /* A domain that does not resolve has no records to be missing. Reporting "2 things are wrong" for
   * a typo'd domain is a lie in the owner's favour and against their trust: they would go and add
   * records to a domain they do not own. When we cannot find the domain, we say only that. */
  if (!a.domainResolves) {
    const findings = [readSpf([]), readDkim(null), readDmarc([])].map((f) => ({
      ...f, state: 'unknown' as RecordState, problem: null,
    }))
    return {
      domain: a.domain, domainResolves: false, findings, problems: 0, clean: false,
      headline: headlineFor(0, true, false),
    }
  }

  const findings = [readSpf(a.apexTxt), readDkim(a.dkim), readDmarc(a.dmarcTxt)]
  const problems = findings.filter((f) => f.state === 'missing' || f.state === 'weak').length
  const anyUnknown = findings.some((f) => f.state === 'unknown')

  return {
    domain: a.domain,
    domainResolves: a.domainResolves,
    findings,
    problems,
    clean: problems === 0,
    headline: headlineFor(problems, anyUnknown, a.domainResolves),
  }
}

export function headlineFor(problems: number, anyUnknown: boolean, resolves: boolean): string {
  if (!resolves) return 'We could not find that domain at all. Check the spelling.'
  if (problems === 0) {
    return anyUnknown
      ? 'The two we can check both look right.'
      : 'All three look right. Your email has the best chance of landing.'
  }
  if (problems === 1) return 'One thing is wrong, and it is why some of your email goes to spam.'
  return `${problems} things are wrong, which is why your email goes to spam.`
}

/* ── where the owner actually goes to fix it ─────────────────────────────────────────────────── */

/** Whoever runs the domain's DNS is where every fix happens, and it is usually NOT where the
 *  website is. This is the single most confusing part of the job for an owner, so the card names
 *  the place rather than saying "your DNS provider". */
export type RegistrarKey = 'godaddy' | 'namecheap' | 'squarespace' | 'wix' | 'cloudflare' | 'google' | 'other'

export interface RegistrarGuide {
  key: RegistrarKey
  label: string
  /** The path to the record editor, in that product's own words. */
  where: string
  /** The thing that trips people up on this one. Null when there is nothing special. */
  gotcha: string | null
}

const REGISTRARS: Record<RegistrarKey, RegistrarGuide> = {
  godaddy: {
    key: 'godaddy', label: 'GoDaddy',
    where: 'My Products, then DNS next to your domain, then Add under Records.',
    gotcha: 'GoDaddy wants the Name field left as @ for SPF, and _dmarc for the DMARC one. Typing the full domain there makes a record that never matches.',
  },
  namecheap: {
    key: 'namecheap', label: 'Namecheap',
    where: 'Domain List, Manage, then the Advanced DNS tab.',
    gotcha: 'Pick TXT Record from the type list, not the SPF option. Namecheap keeps a legacy SPF type that most receivers ignore.',
  },
  squarespace: {
    key: 'squarespace', label: 'Squarespace',
    where: 'Settings, Domains, your domain, then DNS Settings.',
    gotcha: 'Squarespace shows its own preset records above yours. Add a new custom record rather than editing a preset one.',
  },
  wix: {
    key: 'wix', label: 'Wix',
    where: 'Domains, the three dots next to your domain, then Manage DNS Records.',
    gotcha: 'If the domain was bought elsewhere and only pointed at Wix, the records have to be changed where you bought it instead.',
  },
  cloudflare: {
    key: 'cloudflare', label: 'Cloudflare',
    where: 'Your domain, then the DNS tab, then Add record.',
    gotcha: 'Leave the proxy toggle off for TXT records. Cloudflare will not let you proxy one, but the setting confuses people arriving from an A record.',
  },
  google: {
    key: 'google', label: 'Google Domains or Squarespace Domains',
    where: 'Your domain, then DNS, then Manage custom records.',
    gotcha: 'Google Domains moved to Squarespace, so an old bookmark may land you somewhere read-only.',
  },
  other: {
    key: 'other', label: 'Somewhere else',
    where: 'Look for DNS, Name Servers, or Advanced DNS wherever you bought the domain.',
    gotcha: 'If your website host is not where you bought the domain, the records almost always belong at the place you bought it.',
  },
}

export function registrarGuide(key: RegistrarKey): RegistrarGuide {
  return REGISTRARS[key] ?? REGISTRARS.other
}

export const REGISTRAR_KEYS = Object.keys(REGISTRARS) as RegistrarKey[]

/**
 * The exact record to add, for one finding.
 *
 * SPF and DMARC we can write for them, because a correct starting value is the same for everyone.
 * DKIM we cannot: the value is a public key their own email provider generates, so the honest
 * instruction is to go and get it rather than a box to copy.
 */
export interface Fix {
  key: RecordKey
  /** The DNS record type to choose. Always TXT for these three. */
  type: 'TXT'
  /** What goes in the Name/Host box. */
  name: string
  /** What goes in the Value box, or null when only their provider can produce it. */
  value: string | null
  /** Why this value and not another. */
  because: string
}

export function fixFor(f: RecordFinding, domain: string): Fix | null {
  if (f.state === 'good') return null

  if (f.key === 'spf') {
    return {
      key: 'spf', type: 'TXT', name: '@',
      value: 'v=spf1 include:_spf.google.com ~all',
      because: 'This says Google may send as you and everything else is suspicious. If you send through someone other than Google, swap that middle part for the one your provider gives you.',
    }
  }
  if (f.key === 'dmarc') {
    return {
      key: 'dmarc', type: 'TXT', name: '_dmarc',
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      because: 'Quarantine sends fakes to spam rather than the inbox. Reports come to that address, so use one you can actually read.',
    }
  }
  return {
    key: 'dkim', type: 'TXT', name: 'the name your email provider gives you',
    value: null,
    because: 'This one is a key your email provider generates, so nobody else can write it for you. In Google Workspace it is Apps, Google Workspace, Gmail, Authenticate email.',
  }
}
