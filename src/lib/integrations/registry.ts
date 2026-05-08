/**
 * Connector registry. Maps channel keys to their Connector implementation.
 *
 * Crons walk this map (instead of hard-coding per-provider routes), and
 * admin tooling renders one row per registered connector with whatever
 * lifecycle methods it implements.
 *
 * Adding a provider = one line here + one Connector module. Q2 brings
 * Klaviyo + Meta Ads, Q3 brings Toast.
 */
import type { Connector, ConnectorChannel } from './types'
import { metaFacebookConnector, metaInstagramConnector } from './meta-connector'

export const connectorRegistry: Partial<Record<ConnectorChannel, Connector>> = {
  instagram: metaInstagramConnector,
  facebook: metaFacebookConnector,
  // tiktok, linkedin, google_business_profile, google_analytics,
  // google_search_console -- migrate one at a time per Q1 plan wk 3+.
}

export function getConnector(channel: string): Connector | undefined {
  return connectorRegistry[channel as ConnectorChannel]
}

export function listConnectors(): Connector[] {
  return Object.values(connectorRegistry).filter(Boolean) as Connector[]
}
