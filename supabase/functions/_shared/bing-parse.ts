// Pure Bing parsing - isolated here so the older Bing API format can be swapped
// without touching the rest of the system. No Deno/npm imports → unit-testable.

const MS_DATE_RE = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//;

function toInt(value: unknown): number {
  const n =
    typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string | null {
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Parse Bing's Microsoft JSON date, e.g. "/Date(1718841600000+0000)/", into a
 * UTC "YYYY-MM-DD". The epoch milliseconds are absolute, so the trailing offset
 * is ignored. Also tolerates a plain ISO date if Bing ever returns one. Returns
 * null for anything unparseable.
 */
export function parseMicrosoftDate(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const m = value.match(MS_DATE_RE);
  if (m) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? isoDate(new Date(ms)) : null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return isoDate(new Date(value));
  }
  return null;
}

export interface BingApiRow {
  Date?: string;
  Clicks?: number;
  Impressions?: number;
}

export interface BingDailyRow {
  site_id: string;
  engine: "bing";
  metric_date: string;
  clicks: number;
  impressions: number;
  ctr: null;
  average_position: null;
  updated_at: string;
}

/**
 * Map Bing's `d` array into search_daily rows. CTR and average position are not
 * provided by this endpoint, so they stay null (the UI renders "-", never 0).
 * Rows are deduped by date (a duplicate would break the upsert) and capped to
 * bound an unreasonable payload.
 */
export function normalizeBingRows(
  rows: BingApiRow[] | undefined,
  siteId: string,
  updatedAt: string,
  maxRows = 1000,
): BingDailyRow[] {
  const byDate = new Map<string, BingDailyRow>();
  for (const r of rows ?? []) {
    const metric_date = parseMicrosoftDate(r.Date);
    if (!metric_date) continue;
    byDate.set(metric_date, {
      site_id: siteId,
      engine: "bing",
      metric_date,
      clicks: toInt(r.Clicks),
      impressions: toInt(r.Impressions),
      ctr: null,
      average_position: null,
      updated_at: updatedAt,
    });
  }
  return [...byDate.values()].slice(0, maxRows);
}
