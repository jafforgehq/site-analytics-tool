import type { AnalyticsDaily, SearchDaily } from "@/types/database";

/**
 * Percentage change from previous → current. Returns null when the previous
 * value is zero (an undefined change), so the UI can show "-" rather than a
 * misleading ∞% or a divide-by-zero.
 */
export function percentageChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Aggregate (weighted) CTR = total clicks / total impressions. Never average
 * daily CTR values. Null when there are no impressions.
 */
export function weightedCtr(
  clicks: number,
  impressions: number,
): number | null {
  if (impressions <= 0) return null;
  return clicks / impressions;
}

/**
 * Impressions-weighted average position. Null when nothing has impressions or
 * no position data is present.
 */
export function weightedAveragePosition(
  rows: Array<Pick<SearchDaily, "impressions" | "average_position">>,
): number | null {
  let weighted = 0;
  let impressions = 0;
  for (const row of rows) {
    if (row.average_position == null || row.impressions <= 0) continue;
    weighted += row.average_position * row.impressions;
    impressions += row.impressions;
  }
  if (impressions === 0) return null;
  return weighted / impressions;
}

export function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/**
 * Split a chronologically-sorted list of daily rows into the current period
 * (most recent `days`) and the immediately preceding equal-length period, so
 * the UI can show a like-for-like comparison.
 */
export function splitPeriods<T extends { metric_date: string }>(
  rows: T[],
  days: number,
): { current: T[]; previous: T[] } {
  const sorted = [...rows].sort((a, b) =>
    a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0,
  );
  const current = sorted.slice(-days);
  const previous = sorted.slice(-days * 2, -days);
  return { current, previous };
}

export type AnalyticsMetricKey =
  | "active_users"
  | "total_users"
  | "sessions"
  | "screen_page_views"
  | "engaged_sessions";

export function sumAnalytics(
  rows: AnalyticsDaily[],
  key: AnalyticsMetricKey,
): number {
  return sumBy(rows, (row) => row[key]);
}
