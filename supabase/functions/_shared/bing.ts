import { SyncError, codeForStatus, isRetryableStatus } from "./errors.ts";
import { fetchWithRetry } from "./http.ts";
import { normalizeBingRows, type BingApiRow } from "./bing-parse.ts";
import type { SyncAdapter } from "./sync-run.ts";

const ENDPOINT =
  "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats";

/**
 * Bing Webmaster daily traffic sync (single-owner API-key flow). The endpoint
 * returns a historical window in a `d` array; we upsert all valid rows. CTR and
 * average position are not supplied and remain null. All Bing specifics live
 * behind this adapter + bing-parse so the older API can be replaced in isolation.
 */
export const bingAdapter: SyncAdapter = async ({ admin, site }) => {
  if (!site.bing_site_url) {
    throw new SyncError(
      "config_missing",
      "No Bing site URL configured for this site",
    );
  }
  const apiKey = Deno.env.get("BING_WEBMASTER_API_KEY");
  if (!apiKey) {
    throw new SyncError("config_missing", "Missing BING_WEBMASTER_API_KEY");
  }

  const url = `${ENDPOINT}?siteUrl=${encodeURIComponent(
    site.bing_site_url,
  )}&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    // Never echo the URL - it carries the API key.
    throw new SyncError(
      codeForStatus(res.status),
      `Bing API returned HTTP ${res.status}`,
      { status: res.status, retryable: isRetryableStatus(res.status) },
    );
  }

  const data = (await res.json()) as { d?: BingApiRow[] };
  const rows = normalizeBingRows(data.d, site.id, new Date().toISOString());

  if (rows.length > 0) {
    const { error } = await admin
      .from("search_daily")
      .upsert(rows, { onConflict: "site_id,engine,metric_date" });
    if (error) throw error;
  }

  return {
    rowsFetched: data.d?.length ?? 0,
    rowsWritten: rows.length,
    metadata: { provider: "bing" },
  };
};
