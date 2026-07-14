import { SyncError, codeForStatus, isRetryableStatus } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";
import { getGoogleAccessToken } from "./google-auth.ts";
import {
  normalizeGscRows,
  normalizeGscBreakdown,
  type GscApiRow,
} from "./normalize.ts";
import { defaultRange } from "./range.ts";
import type { SupabaseClient } from "./database.ts";
import type { SyncAdapter } from "./sync-run.ts";

// Re-fetch a rolling recent window by default so late-finalized GSC values
// overwrite earlier ones (brief §15).
const DEFAULT_DAYS_BACK = 10;
const BREAKDOWN_ROW_LIMIT = 5000;

async function queryGsc(
  token: string,
  property: string,
  body: Record<string, unknown>,
): Promise<GscApiRow[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/searchAnalytics/query`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SyncError(
      codeForStatus(res.status),
      `GSC API returned HTTP ${res.status}`,
      { status: res.status, retryable: isRetryableStatus(res.status) },
    );
  }
  const data = (await res.json()) as { rows?: GscApiRow[] };
  return data.rows ?? [];
}

/**
 * Google Search Console sync: daily aggregate (search_daily) plus the top
 * queries and pages per day (search_query_daily / search_page_daily). The
 * aggregate is required; the breakdowns are best-effort - if one fails the run
 * is marked `partial` rather than losing the aggregate.
 */
export const gscAdapter: SyncAdapter = async ({
  admin,
  site,
  rangeStart,
  rangeEnd,
}) => {
  if (!site.gsc_property) {
    throw new SyncError(
      "config_missing",
      "No GSC property configured for this site",
    );
  }
  const property = site.gsc_property;

  const { startDate, endDate } =
    rangeStart && rangeEnd
      ? { startDate: rangeStart, endDate: rangeEnd }
      : defaultRange(DEFAULT_DAYS_BACK);

  const token = await getGoogleAccessToken();
  const updatedAt = new Date().toISOString();

  // --- Required: daily aggregate ---
  const aggregate = await queryGsc(token, property, {
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 25000,
  });
  const aggRows = normalizeGscRows(aggregate, site.id, updatedAt);
  if (aggRows.length > 0) {
    const { error } = await admin
      .from("search_daily")
      .upsert(aggRows, { onConflict: "site_id,engine,metric_date" });
    if (error) throw error;
  }

  let rowsFetched = aggregate.length;
  let rowsWritten = aggRows.length;
  const failed: string[] = [];

  // --- Best-effort: top queries ---
  try {
    const written = await syncBreakdown(
      admin,
      "search_query_daily",
      "query",
      await queryGsc(token, property, {
        startDate,
        endDate,
        dimensions: ["date", "query"],
        rowLimit: BREAKDOWN_ROW_LIMIT,
      }),
      site.id,
      updatedAt,
    );
    rowsFetched += written.fetched;
    rowsWritten += written.written;
  } catch {
    failed.push("query");
  }

  // --- Best-effort: top pages ---
  try {
    const written = await syncBreakdown(
      admin,
      "search_page_daily",
      "page",
      await queryGsc(token, property, {
        startDate,
        endDate,
        dimensions: ["date", "page"],
        rowLimit: BREAKDOWN_ROW_LIMIT,
      }),
      site.id,
      updatedAt,
    );
    rowsFetched += written.fetched;
    rowsWritten += written.written;
  } catch {
    failed.push("page");
  }

  return {
    rowsFetched,
    rowsWritten,
    partial: failed.length > 0,
    rangeStart: startDate,
    rangeEnd: endDate,
    metadata: { provider: "gsc", failedBreakdowns: failed },
  };
};

async function syncBreakdown(
  admin: SupabaseClient,
  table: "search_query_daily" | "search_page_daily",
  keyColumn: "query" | "page",
  apiRows: GscApiRow[],
  siteId: string,
  updatedAt: string,
): Promise<{ fetched: number; written: number }> {
  const rows = normalizeGscBreakdown(apiRows, BREAKDOWN_ROW_LIMIT).map((r) => ({
    site_id: siteId,
    engine: "google" as const,
    metric_date: r.metric_date,
    [keyColumn]: r.key,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    average_position: r.average_position,
    updated_at: updatedAt,
  }));

  if (rows.length > 0) {
    const { error } = await admin
      .from(table)
      .upsert(rows, { onConflict: `site_id,engine,metric_date,${keyColumn}` });
    if (error) throw error;
  }
  return { fetched: apiRows.length, written: rows.length };
}
