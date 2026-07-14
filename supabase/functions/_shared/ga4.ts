import { SyncError, codeForStatus, isRetryableStatus } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";
import { getGoogleAccessToken } from "./google-auth.ts";
import { GA4_METRICS, normalizeGa4Rows, type Ga4Report } from "./normalize.ts";
import { defaultRange } from "./range.ts";
import type { SyncAdapter } from "./sync-run.ts";

const DEFAULT_DAYS_BACK = 7;

/**
 * Google Analytics 4 daily aggregate sync. Upserts one row per date into
 * analytics_daily. Metric values are read by header name, never by blind array
 * position.
 */
export const ga4Adapter: SyncAdapter = async ({
  admin,
  site,
  rangeStart,
  rangeEnd,
}) => {
  if (!site.ga4_property_id) {
    throw new SyncError(
      "config_missing",
      "No GA4 property configured for this site",
    );
  }

  const { startDate, endDate } =
    rangeStart && rangeEnd
      ? { startDate: rangeStart, endDate: rangeEnd }
      : defaultRange(DEFAULT_DAYS_BACK);

  const token = await getGoogleAccessToken();
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
    site.ga4_property_id,
  )}:runReport`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: GA4_METRICS.map((name) => ({ name })),
      keepEmptyRows: false,
    }),
  });

  if (!res.ok) {
    throw new SyncError(
      codeForStatus(res.status),
      `GA4 API returned HTTP ${res.status}`,
      { status: res.status, retryable: isRetryableStatus(res.status) },
    );
  }

  const report = (await res.json()) as Ga4Report;
  const rows = normalizeGa4Rows(report, site.id, new Date().toISOString());

  if (rows.length > 0) {
    const { error } = await admin
      .from("analytics_daily")
      .upsert(rows, { onConflict: "site_id,metric_date" });
    if (error) throw error;
  }

  return {
    rowsFetched: report.rows?.length ?? 0,
    rowsWritten: rows.length,
    rangeStart: startDate,
    rangeEnd: endDate,
    metadata: { provider: "ga4" },
  };
};
