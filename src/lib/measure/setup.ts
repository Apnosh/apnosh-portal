/**
 * GET MEASURABLE — the setup plan for Search Console and Analytics, pure and I/O-free.
 *
 * This is the setup BEFORE the other setups. Every Google card we built assumes the client can
 * already be measured: Polish-your-profile, Smooth-out-ordering and Reply-to-reviews all quietly
 * assume the listing is connected, and none of them can prove they worked without Search Console
 * behind them. For a brand-new client none of that is true. This card fills that gap.
 *
 * What makes it different from the other setup cards, and better: the end state is CHECKABLE.
 * The listings card ends in the owner's word because we cannot see inside Yelp. Here, "done"
 * means a real connection that is delivering data, which the health cron proves every day by
 * reading the actual data path (connection-health.ts). So completion is server truth, not a
 * self-claim. We never say "connected" about a pipe that is not.
 *
 * Two tools, because an owner should know they are two different questions:
 *   Search Console   how people FIND you on Google (searches, clicks, position)
 *   Analytics (GA4)  what people DO once they reach your site (visits, pages, actions)
 *
 * The steps to set each up genuinely differ by who hosts the site, which is exactly what makes
 * the walk-through lane worth paying for. Wix has Search Console wired into its own SEO panel
 * and runs the DNS itself; Squarespace has a built-in Analytics field; GoDaddy sends you to the
 * registrar; WordPress usually means a plugin. Naming the right path for their host is the part
 * an owner cannot get from a generic help article.
 */

export type MeasureToolKey = 'search_console' | 'analytics'

/** Straight off channel_connections.status, which the health cron keeps honest. */
export type ToolStatus =
  /** A live pipe: the daily data-path probe is returning data. */
  | 'connected'
  /** A connection exists but its last probe failed. Usually the service account was never
   *  granted access, or a grant was removed. Recoverable, and we say how. */
  | 'attention'
  /** No connection at all. This is the from-scratch case a new client is in. */
  | 'missing'

export interface MeasureTool {
  key: MeasureToolKey
  label: string
  /** One plain sentence on what this tool answers. */
  answers: string
  status: ToolStatus
  /** When status is 'attention', the plain reason, already free of jargon where we can manage it. */
  attentionReason: string | null
}

/** The hosts we can give specific directions for. 'other' is honest about not knowing. */
export type HostKey = 'wix' | 'squarespace' | 'godaddy' | 'wordpress' | 'shopify' | 'weebly' | 'other'

export interface HostGuide {
  key: HostKey
  label: string
  /** True when the host also runs the domain's DNS, so verification stays in one dashboard.
   *  This is the single fact that most changes how hard setup is. */
  ownsDns: boolean
  /** The easiest way to prove you own the site to Search Console, on this host. */
  verifyWith: string
  /** The Search-Console verification gotcha for this host (a DNS quirk, a www-only trap).
   *  Null where there is nothing special. Kept separate from analyticsTag because a DNS note
   *  bleeding into a tag-install step is exactly the kind of wrong-but-plausible copy that
   *  makes an owner distrust the whole walkthrough. */
  verifyGotcha: string | null
  /** How the Analytics tag goes on THIS host. Some builders have a paste-the-tag field so you
   *  never touch code; null means use the generic fallback. */
  analyticsTag: string | null
}

const HOSTS: Record<HostKey, HostGuide> = {
  wix: {
    key: 'wix', label: 'Wix', ownsDns: true,
    verifyWith: 'Wix connects Search Console for you: SEO → the "Let Google find your site" step.',
    verifyGotcha: 'That built-in connect makes a www-only property. For one that covers every version of your address, add a Domain property in Search Console and paste the TXT record under Wix → Domains → DNS.',
    analyticsTag: 'Wix has a Google Analytics field under Marketing & SEO → Marketing Integrations, so you never touch code.',
  },
  squarespace: {
    key: 'squarespace', label: 'Squarespace', ownsDns: true,
    verifyWith: 'Add a Domain property in Search Console, then paste the TXT record under Settings → Domains → DNS Settings.',
    verifyGotcha: null,
    analyticsTag: 'Squarespace has a built-in Google Analytics field under Analytics → External API Keys. Use it instead of pasting the tag into code.',
  },
  godaddy: {
    key: 'godaddy', label: 'GoDaddy', ownsDns: true,
    verifyWith: 'Add a Domain property in Search Console, then add the TXT record in GoDaddy → Domains → DNS.',
    verifyGotcha: 'If a web person built the site, the domain and the site can live in two different GoDaddy accounts. The TXT record goes wherever the DNS is, which is the domain account.',
    analyticsTag: null,
  },
  wordpress: {
    key: 'wordpress', label: 'WordPress', ownsDns: false,
    verifyWith: 'A plugin like Site Kit by Google connects both tools in a few clicks, or verify by TXT record at whoever runs your DNS.',
    verifyGotcha: 'Where the DNS lives depends on your host (Bluehost, SiteGround, GoDaddy). The TXT record goes there, not in WordPress itself.',
    analyticsTag: 'The same Site Kit plugin drops in the Analytics tag for you, no code.',
  },
  shopify: {
    key: 'shopify', label: 'Shopify', ownsDns: false,
    verifyWith: 'Add a Domain property in Search Console and add the TXT record where your domain is managed.',
    verifyGotcha: null,
    analyticsTag: 'Shopify has a built-in Google Analytics field under Online Store → Preferences. Use it for the tag.',
  },
  weebly: {
    key: 'weebly', label: 'Weebly', ownsDns: true,
    verifyWith: 'Verify by the HTML tag method: Weebly has a spot for it under Settings → SEO → Header Code.',
    verifyGotcha: null,
    analyticsTag: 'The same Header Code box under Settings → SEO takes your Analytics tag too.',
  },
  other: {
    key: 'other', label: 'your website', ownsDns: false,
    verifyWith: 'The surest way that works anywhere is a TXT record at whoever runs your domain\'s DNS. It covers every version of your address and survives a site redesign.',
    verifyGotcha: 'If you are not sure who runs your DNS, it is usually whoever you pay for the domain each year.',
    analyticsTag: null,
  },
}

export function hostGuide(key: HostKey): HostGuide {
  return HOSTS[key]
}

/** Detect a host from a URL alone. The route can refine this with response headers, but a lot
 *  of hosts give themselves away in the address, especially before a custom domain is attached. */
export function hostFromUrl(url: string | null): HostKey {
  if (!url) return 'other'
  const u = url.toLowerCase()
  if (u.includes('wixsite.com') || u.includes('editorx')) return 'wix'
  if (u.includes('squarespace.com')) return 'squarespace'
  if (u.includes('godaddysites.com')) return 'godaddy'
  if (u.includes('wordpress.com') || u.includes('wp.com')) return 'wordpress'
  if (u.includes('myshopify.com')) return 'shopify'
  if (u.includes('weebly.com')) return 'weebly'
  return 'other'
}

export interface MeasureInput {
  tools: MeasureTool[]
  websiteUrl: string | null
  host: HostKey
  /** The service account address the owner grants read access to. Null if the backend has no
   *  service account configured, in which case the grant step is honestly hidden. */
  serviceAccountEmail: string | null
}

export interface MeasurePlan {
  tools: MeasureTool[]
  websiteUrl: string | null
  host: HostGuide
  serviceAccountEmail: string | null
  /** True when both tools are connected and delivering. The whole card is done here, and it is
   *  server truth: the daily probe proves it, so we are not taking anyone's word. */
  measured: boolean
  /** Tools not yet connected, worst first (missing before attention), so the walk-through opens
   *  on what is actually undone. */
  todo: MeasureTool[]
  headline: string
}

export function buildMeasurePlan(input: MeasureInput): MeasurePlan {
  const { tools, websiteUrl, host, serviceAccountEmail } = input

  // missing before attention: a tool that does not exist is more work than one that just needs
  // a grant, and the owner should see the bigger job first.
  const rank: Record<ToolStatus, number> = { missing: 0, attention: 1, connected: 2 }
  const todo = tools.filter((t) => t.status !== 'connected').sort((a, b) => rank[a.status] - rank[b.status])
  const connected = tools.filter((t) => t.status === 'connected')

  return {
    tools: [...tools].sort((a, b) => rank[a.status] - rank[b.status]),
    websiteUrl,
    host: HOSTS[host],
    serviceAccountEmail,
    measured: todo.length === 0,
    todo,
    headline: headlineFor(connected.length, tools),
  }
}

/** Counted from real connection status, so it is safe to state plainly. */
export function headlineFor(connectedCount: number, tools: MeasureTool[]): string {
  const total = tools.length
  if (connectedCount === total) return 'You can measure everything the other campaigns do.'
  const attention = tools.filter((t) => t.status === 'attention')
  if (attention.length > 0) {
    const names = attention.map((t) => t.label)
    return `${joinWords(names)} stopped sending data. A quick fix, not a rebuild.`
  }
  if (connectedCount === 0) return 'Set up the two tools that show whether any of this is working.';
  const missing = tools.filter((t) => t.status === 'missing').map((t) => t.label)
  return `${joinWords(missing)} ${missing.length === 1 ? 'is' : 'are'} not set up yet. Without ${missing.length === 1 ? 'it' : 'them'} you are flying blind.`
}

/** The ordered steps to stand up ONE tool on a given host. This is the walk-through's spine,
 *  and every line is a real action, not an explanation. */
export function stepsFor(tool: MeasureToolKey, host: HostGuide, serviceAccountEmail: string | null): string[] {
  const grant = serviceAccountEmail
    ? (tool === 'search_console'
        ? `Add ${serviceAccountEmail} as a Full user (Settings → Users and permissions), so this dashboard can read it`
        : `Add ${serviceAccountEmail} as a Viewer (Admin → Property access management), so this dashboard can read it`)
    : null

  if (tool === 'search_console') {
    return [
      'Sign in to Search Console with your business Google account, not a staff member\'s',
      'Add your site: choose Domain if you can, it covers every version of your address',
      host.verifyWith,
      ...(grant ? [grant] : []),
    ]
  }
  return [
    'Sign in to Google Analytics with the same business Google account',
    'Create a GA4 property for your restaurant',
    `Put the measurement tag on your site. ${host.analyticsTag ?? 'Most site builders have a spot to paste it without touching code, usually under settings or SEO.'}`,
    ...(grant ? [grant] : []),
  ]
}

/** "Search Console and Analytics", "name, address and phone". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
