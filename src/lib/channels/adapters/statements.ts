/**
 * STATEMENTS ADAPTER — the honest floor (CHANNELS-PLAN: the upload lane).
 *
 * Every POS and delivery app on earth can export a statement. This lane covers all of
 * them, including the ones no aggregator ever will (Auto-Star precedent). Connections
 * use the EXISTING connection_type 'csv_import'; data is pushed by the owner's upload
 * (P2 UI), not pulled by cron — so sync() is a truthful no-op that reports freshness.
 *
 * The pure helpers here (dayKey, normalizeRow) are the idempotency contract for
 * pos_daily_sales and are golden-tested in scripts/sim/channels.ts.
 */

import type { ChannelAdapter, ChannelConnection, ConnectStart, SyncResult } from '../types'

/** The natural key of a daily-sales row. UNIQUE(client_id, source, day) in the DB;
 *  this helper is the single place that composes it. */
export const dayKey = (clientId: string, source: string, day: string): string =>
  `${clientId}|${source}|${day}`

/** A parsed statement line, normalized before upsert. Parsing itself lands in P2;
 *  the shape is fixed now so the DB key and the parser can never drift. */
export interface DailySalesRow {
  client_id: string
  source: string // 'statement:<app>' e.g. statement:doordash
  day: string // ISO date
  gross_cents: number
  orders: number
}

export const normalizeSource = (app: string): string =>
  `statement:${app.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export const statementsAdapter: ChannelAdapter = {
  id: 'statements',
  kind: 'upload',

  /** No env needed: the upload lane is always available. That is the point of a floor. */
  isConfigured() {
    return true
  },

  async connectStart(): Promise<ConnectStart> {
    return {
      url: null,
      instructions: 'Export a sales statement from the app and upload it here. We read the numbers, you keep the file.',
    }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    /* Upload-driven, not pull-driven: a cron sync has nothing to fetch. Reporting zero
     * items with a truthful note keeps the ledger honest without inventing failures. */
    const meta = (connection.metadata ?? {}) as { last_upload_at?: string }
    return {
      itemsWritten: 0,
      note: meta.last_upload_at ? `upload lane; last upload ${meta.last_upload_at}` : 'upload lane; no uploads yet',
    }
  },
}
