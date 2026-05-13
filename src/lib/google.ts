/**
 * Google OAuth + Google Analytics 4 helpers
 * Pattern mirrors src/lib/instagram.ts
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

// Read-only scope for GA4 (covers both Data API and Admin API for listing)
export const GA4_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
] as const

// Read-only scope for Search Console
export const GSC_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
] as const

// Scope for Google Business Profile.
// userinfo.email is added so callbacks can capture which Google
// account granted access (useful when the agency Google account
// differs from the portal admin email).
export const GBP_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
] as const

// Read-only scope for Google Drive. Includes docs.readonly so we can
// pull the text content of Google Docs for AI extraction in phase 3.
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
] as const

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

export function getGoogleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GA4_SCOPES.join(' '),
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent', // force consent so we always get a refresh_token
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function getGSCOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-search-console/callback`
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GSC_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGSCCode(code: string): Promise<GoogleTokens> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-search-console/callback`
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange GSC code')
  }
  return data as GoogleTokens
}

export function getGBPOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-business/callback`
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GBP_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// ── Drive OAuth ──────────────────────────────────────────────────────
export function getDriveOAuthUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-drive/callback`
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeDriveCode(code: string): Promise<GoogleTokens> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-drive/callback`
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Failed to exchange Drive code')
  return data as GoogleTokens
}

export async function exchangeGBPCode(code: string): Promise<GoogleTokens> {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-business/callback`
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange GBP code')
  }
  return data as GoogleTokens
}

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Google code')
  }
  return data as GoogleTokens
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh Google token')
  }
  return data as GoogleTokens
}

// ---------------------------------------------------------------------------
// GA4 Admin API -- list properties the user has access to
// ---------------------------------------------------------------------------

export interface GA4Property {
  propertyId: string       // e.g. "properties/123456"
  propertyName: string     // "My Website"
  accountName: string      // parent account
  timeZone: string
  currencyCode: string
}

export async function listGA4Properties(accessToken: string): Promise<GA4Property[]> {
  // Step 1: list accounts the user has access to
  const accountsRes = await fetch(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const accountsData = await accountsRes.json()

  if (!accountsRes.ok) {
    throw new Error(accountsData.error?.message || 'Failed to list GA4 accounts')
  }

  const properties: GA4Property[] = []
  const summaries = (accountsData.accountSummaries || []) as Array<{
    name: string
    displayName: string
    propertySummaries?: Array<{ property: string; displayName: string }>
  }>

  for (const acct of summaries) {
    const propSummaries = acct.propertySummaries || []
    for (const p of propSummaries) {
      // Fetch full property details (timezone, currency)
      try {
        const detailRes = await fetch(
          `https://analyticsadmin.googleapis.com/v1beta/${p.property}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const detail = await detailRes.json()
        properties.push({
          propertyId: p.property, // "properties/123456"
          propertyName: p.displayName,
          accountName: acct.displayName,
          timeZone: detail.timeZone || 'America/Los_Angeles',
          currencyCode: detail.currencyCode || 'USD',
        })
      } catch {
        properties.push({
          propertyId: p.property,
          propertyName: p.displayName,
          accountName: acct.displayName,
          timeZone: 'America/Los_Angeles',
          currencyCode: 'USD',
        })
      }
    }
  }

  return properties
}

// ---------------------------------------------------------------------------
// GA4 Data API -- run reports
// ---------------------------------------------------------------------------

export interface GA4DailyMetrics {
  date: string              // YYYY-MM-DD
  visitors: number          // activeUsers
  sessions: number
  pageViews: number         // screenPageViews
  bounceRate: number        // 0..1
  avgSessionDuration: number // seconds
  mobilePct: number         // 0..100
  trafficSources: Record<string, number> // { direct: 500, organic: 300, ... }
  topPages: Array<{ path: string; views: number }>
}

/**
 * Pulls all the metrics we need for one day in a single batch call.
 * propertyId format: "properties/123456"
 */
export async function runGA4DailyReport(
  propertyId: string,
  accessToken: string,
  date: string // YYYY-MM-DD
): Promise<GA4DailyMetrics> {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  // Parallel requests: core metrics + traffic sources + top pages + device breakdown
  const [coreRes, sourceRes, pagesRes, deviceRes] = await Promise.all([
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
      }),
    }),
  ])

  const [core, sources, pages, devices] = await Promise.all([
    coreRes.json(), sourceRes.json(), pagesRes.json(), deviceRes.json(),
  ])

  if (core.error) throw new Error(core.error.message)

  const coreRow = core.rows?.[0]?.metricValues || []
  const visitors = Number(coreRow[0]?.value || 0)
  const sessions = Number(coreRow[1]?.value || 0)
  const pageViews = Number(coreRow[2]?.value || 0)
  const bounceRate = Number(coreRow[3]?.value || 0)
  const avgSessionDuration = Math.round(Number(coreRow[4]?.value || 0))

  const trafficSources: Record<string, number> = {}
  for (const row of sources.rows || []) {
    const channel = row.dimensionValues?.[0]?.value || 'unknown'
    trafficSources[channel.toLowerCase()] = Number(row.metricValues?.[0]?.value || 0)
  }

  const topPages = (pages.rows || []).map((row: {
    dimensionValues?: Array<{ value: string }>
    metricValues?: Array<{ value: string }>
  }) => ({
    path: row.dimensionValues?.[0]?.value || '/',
    views: Number(row.metricValues?.[0]?.value || 0),
  }))

  let mobileSessions = 0
  let totalSessions = 0
  for (const row of devices.rows || []) {
    const device = row.dimensionValues?.[0]?.value || ''
    const s = Number(row.metricValues?.[0]?.value || 0)
    totalSessions += s
    if (device === 'mobile') mobileSessions = s
  }
  const mobilePct = totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0

  return {
    date,
    visitors,
    sessions,
    pageViews,
    bounceRate,
    avgSessionDuration,
    mobilePct,
    trafficSources,
    topPages,
  }
}

// ---------------------------------------------------------------------------
// Google Search Console -- list sites + run queries
// ---------------------------------------------------------------------------

export interface GSCSite {
  siteUrl: string           // e.g. "sc-domain:apnosh.com" or "https://apnosh.com/"
  permissionLevel: string   // siteOwner | siteFullUser | siteRestrictedUser | siteUnverifiedUser
}

export async function listGSCSites(accessToken: string): Promise<GSCSite[]> {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to list GSC sites')
  }
  const sites = (data.siteEntry || []) as Array<{ siteUrl: string; permissionLevel: string }>
  // Filter to verified sites only (can query data from these)
  return sites
    .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }))
}

export interface GSCDailyMetrics {
  date: string
  totalImpressions: number
  totalClicks: number
  avgCtr: number
  avgPosition: number
  topQueries: Array<{ query: string; impressions: number; clicks: number; ctr: number; position: number }>
  topPages: Array<{ page: string; impressions: number; clicks: number; ctr: number; position: number }>
}

export async function runGSCDailyQuery(
  siteUrl: string,
  accessToken: string,
  date: string // YYYY-MM-DD
): Promise<GSCDailyMetrics> {
  const encodedSite = encodeURIComponent(siteUrl)
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  // Two queries in parallel: top queries + top pages (same day)
  const [queriesRes, pagesRes, totalsRes] = await Promise.all([
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
        dimensions: ['query'],
        rowLimit: 25,
      }),
    }),
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
        dimensions: ['page'],
        rowLimit: 25,
      }),
    }),
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
        // No dimensions = returns single aggregate row for the date
      }),
    }),
  ])

  const [queries, pages, totals] = await Promise.all([
    queriesRes.json(), pagesRes.json(), totalsRes.json(),
  ])

  if (totals.error) throw new Error(totals.error.message)

  const totalsRow = (totals.rows && totals.rows[0]) || { clicks: 0, impressions: 0, ctr: 0, position: 0 }

  const topQueries = (queries.rows || []).map((row: {
    keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number
  }) => ({
    query: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))

  const topPages = (pages.rows || []).map((row: {
    keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number
  }) => ({
    page: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))

  return {
    date,
    totalImpressions: totalsRow.impressions || 0,
    totalClicks: totalsRow.clicks || 0,
    avgCtr: totalsRow.ctr || 0,
    avgPosition: totalsRow.position || 0,
    topQueries,
    topPages,
  }
}

// ---------------------------------------------------------------------------
// Google Business Profile -- list accounts, locations, run performance reports
// ---------------------------------------------------------------------------

export interface GBPAccount {
  name: string          // "accounts/123456"
  accountName: string   // display name
  type: string          // PERSONAL | LOCATION_GROUP | USER_GROUP | ORGANIZATION
  role: string          // OWNER | CO_OWNER | MANAGER | etc.
}

export interface GBPLocation {
  name: string          // "locations/789012"
  title: string         // display name
  storeCode?: string
  addressLines?: string[]
  locality?: string     // city
  regionCode?: string   // state/region
  postalCode?: string
  primaryPhone?: string
  websiteUri?: string
  primaryCategory?: string
}

export async function listGBPAccounts(accessToken: string): Promise<GBPAccount[]> {
  const res = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=50',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to list GBP accounts')
  }
  const accounts = (data.accounts || []) as Array<{
    name: string; accountName: string; type: string; role: string
  }>
  return accounts.map((a) => ({
    name: a.name,
    accountName: a.accountName || a.name,
    type: a.type,
    role: a.role,
  }))
}

export async function listGBPLocations(
  accessToken: string,
  accountName: string // "accounts/123456"
): Promise<GBPLocation[]> {
  const readMask = 'name,title,storeCode,phoneNumbers,websiteUri,categories,storefrontAddress'
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to list GBP locations')
  }

  const locations = (data.locations || []) as Array<{
    name: string
    title?: string
    storeCode?: string
    phoneNumbers?: { primaryPhone?: string }
    websiteUri?: string
    categories?: { primaryCategory?: { displayName?: string } }
    storefrontAddress?: {
      addressLines?: string[]
      locality?: string
      administrativeArea?: string
      postalCode?: string
      regionCode?: string
    }
  }>

  return locations.map((l) => ({
    name: l.name,
    title: l.title || '',
    storeCode: l.storeCode,
    addressLines: l.storefrontAddress?.addressLines,
    locality: l.storefrontAddress?.locality,
    regionCode: l.storefrontAddress?.administrativeArea,
    postalCode: l.storefrontAddress?.postalCode,
    primaryPhone: l.phoneNumbers?.primaryPhone,
    websiteUri: l.websiteUri,
    primaryCategory: l.categories?.primaryCategory?.displayName,
  }))
}

export interface GBPDailyMetrics {
  date: string
  businessImpressionsMobileMaps: number
  businessImpressionsMobileSearch: number
  businessImpressionsDesktopMaps: number
  businessImpressionsDesktopSearch: number
  businessDirectionRequests: number
  callClicks: number
  websiteClicks: number
}

/**
 * Pulls daily Business Profile Performance metrics for a location.
 * Requires approved access to the Performance API.
 * locationName format: "locations/123456"
 */
export async function runGBPDailyMetrics(
  locationName: string,
  accessToken: string,
  date: string // YYYY-MM-DD
): Promise<GBPDailyMetrics> {
  const [year, month, day] = date.split('-')

  const metrics = [
    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_DIRECTION_REQUESTS',
    'CALL_CLICKS',
    'WEBSITE_CLICKS',
  ]

  const params = new URLSearchParams()
  metrics.forEach((m) => params.append('dailyMetrics', m))
  params.set('dailyRange.startDate.year', year)
  params.set('dailyRange.startDate.month', String(parseInt(month, 10)))
  params.set('dailyRange.startDate.day', String(parseInt(day, 10)))
  params.set('dailyRange.endDate.year', year)
  params.set('dailyRange.endDate.month', String(parseInt(month, 10)))
  params.set('dailyRange.endDate.day', String(parseInt(day, 10)))

  const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()

  if (!res.ok) {
    const msg = data.error?.message || 'Failed to fetch GBP metrics'
    throw new Error(msg)
  }

  const result: GBPDailyMetrics = {
    date,
    businessImpressionsMobileMaps: 0,
    businessImpressionsMobileSearch: 0,
    businessImpressionsDesktopMaps: 0,
    businessImpressionsDesktopSearch: 0,
    businessDirectionRequests: 0,
    callClicks: 0,
    websiteClicks: 0,
  }

  /* Google's actual response shape: multiDailyMetricTimeSeries is an
     array; each entry has dailyMetricTimeSeries that is ALSO an array
     of {dailyMetric, timeSeries} per requested metric. The previous
     parser treated the inner field as a single object, so every metric
     came back as 0 even when the API returned real data. */
  type MetricSeries = {
    dailyMetric?: string
    timeSeries?: {
      datedValues?: Array<{ date: { year: number; month: number; day: number }; value?: string }>
    }
  }
  type Outer = { dailyMetricTimeSeries?: MetricSeries[] | MetricSeries }

  const series = (data.multiDailyMetricTimeSeries || []) as Outer[]
  const flat: MetricSeries[] = []
  for (const o of series) {
    const inner = o.dailyMetricTimeSeries
    if (!inner) continue
    if (Array.isArray(inner)) flat.push(...inner)
    else flat.push(inner)
  }

  for (const s of flat) {
    const metric = s.dailyMetric
    const values = s.timeSeries?.datedValues || []
    const value = values.length > 0 ? Number(values[0].value || 0) : 0

    switch (metric) {
      case 'BUSINESS_IMPRESSIONS_MOBILE_MAPS': result.businessImpressionsMobileMaps = value; break
      case 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH': result.businessImpressionsMobileSearch = value; break
      case 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS': result.businessImpressionsDesktopMaps = value; break
      case 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH': result.businessImpressionsDesktopSearch = value; break
      case 'BUSINESS_DIRECTION_REQUESTS': result.businessDirectionRequests = value; break
      case 'CALL_CLICKS': result.callClicks = value; break
      case 'WEBSITE_CLICKS': result.websiteClicks = value; break
    }
  }

  return result
}
