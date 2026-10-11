import { SyncError, codeForStatus, isRetryableStatus } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";
import { getGoogleAccessToken } from "./google-auth.ts";
import {
  GA4_METRICS,
  PREMIUM_COUNTRIES,
  normalizeGa4Rows,
  normalizePremiumSessions,
  type Ga4Report,
} from "./normalize.ts";
import { defaultRange, utcDateMinus } from "./range.ts";
import type { SyncAdapter } from "./sync-run.ts";

const DEFAULT_DAYS_BACK = 7;
// Premium-country sessions are re-fetched over at least this many days, so the
// first scheduled run after the column was added backfills the history the
// Journey tracker needs (30-day window plus forecast lead-in).
const PREMIUM_MIN_DAYS_BACK = 60;

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

  // Best-effort: a failure here must not lose the main aggregate above.
  let partial = false;
  try {
    const premiumStart =
      startDate < utcDateMinus(PREMIUM_MIN_DAYS_BACK)
        ? startDate
        : utcDateMinus(PREMIUM_MIN_DAYS_BACK);
    const premiumRes = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: premiumStart, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "country",
            inListFilter: { values: [...PREMIUM_COUNTRIES] },
          },
        },
        keepEmptyRows: false,
      }),
    });
    if (!premiumRes.ok) throw new Error(`HTTP ${premiumRes.status}`);
    const allPremiumRows = normalizePremiumSessions(
      (await premiumRes.json()) as Ga4Report,
      site.id,
      premiumStart,
      endDate,
      new Date().toISOString(),
    );
    // Only touch days that already have an aggregate row: inserting one here
    // would invent a zero-traffic day for dates before the site had any data.
    const { data: existing, error: existingError } = await admin
      .from("analytics_daily")
      .select("metric_date")
      .eq("site_id", site.id)
      .gte("metric_date", premiumStart)
      .lte("metric_date", endDate);
    if (existingError) throw existingError;
    const have = new Set(
      (existing ?? []).map((r: { metric_date: string }) => r.metric_date),
    );
    const premiumRows = allPremiumRows.filter((r) => have.has(r.metric_date));
    // A partial-column upsert on existing rows updates only those columns.
    if (premiumRows.length > 0) {
      const { error } = await admin
        .from("analytics_daily")
        .upsert(premiumRows, { onConflict: "site_id,metric_date" });
      if (error) throw error;
    }
  } catch {
    partial = true;
  }

  return {
    rowsFetched: report.rows?.length ?? 0,
    rowsWritten: rows.length,
    partial,
    rangeStart: startDate,
    rangeEnd: endDate,
    metadata: { provider: "ga4", premiumSessionsFailed: partial },
  };
};
