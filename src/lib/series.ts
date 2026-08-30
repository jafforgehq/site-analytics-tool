// Row → series adapters, multi-metric trajectory computation, and
// portfolio-level aggregation - kept out of component files (react-refresh)
// and reusable from the report/briefing code.

import {
  forecastSeries,
  type Forecast,
  type SeriesPoint,
} from "@/lib/forecast";
import { computeDecayingPages, type DecayRow } from "@/lib/decay";
import type { AnalyticsMetricKey } from "@/lib/metrics";
import type {
  AnalyticsDaily,
  SearchDaily,
  SearchEngine,
  SearchPageDaily,
  Site,
} from "@/types/database";

export function analyticsSeries(
  rows: AnalyticsDaily[],
  key: AnalyticsMetricKey,
): SeriesPoint[] {
  return rows.map((r) => ({ date: r.metric_date, value: r[key] }));
}

export function searchMetricSeries(
  rows: SearchDaily[],
  engine: SearchEngine,
  metric: "clicks" | "impressions",
): SeriesPoint[] {
  return rows
    .filter((r) => r.engine === engine)
    .map((r) => ({ date: r.metric_date, value: r[metric] }));
}

export function sessionsSeries(rows: AnalyticsDaily[]): SeriesPoint[] {
  return analyticsSeries(rows, "sessions");
}

export function clicksSeries(rows: SearchDaily[]): SeriesPoint[] {
  return searchMetricSeries(rows, "google", "clicks");
}

// ---------------------------------------------------------------------------
// Multi-metric trajectories: every volumetric metric worth forecasting -
// sessions, users, page views, engaged sessions, and clicks/impressions per
// engine. Ratio metrics (CTR, average position) are deliberately excluded:
// they aren't sums, and clamping a forecast at zero (the traffic-can't-be-
// negative rule in forecastSeries) doesn't make sense for a percentage.
// ---------------------------------------------------------------------------
export interface TrajectoryMetricResult {
  key: string;
  label: string;
  series: SeriesPoint[];
  forecast: Forecast | null;
}

interface TrajectoryMetricDef {
  key: string;
  label: string;
  build: (analytics: AnalyticsDaily[], search: SearchDaily[]) => SeriesPoint[];
}

const TRAJECTORY_METRICS: TrajectoryMetricDef[] = [
  {
    key: "sessions",
    label: "Sessions",
    build: (a) => analyticsSeries(a, "sessions"),
  },
  {
    key: "active_users",
    label: "Active users",
    build: (a) => analyticsSeries(a, "active_users"),
  },
  {
    key: "screen_page_views",
    label: "Page views",
    build: (a) => analyticsSeries(a, "screen_page_views"),
  },
  {
    key: "engaged_sessions",
    label: "Engaged sessions",
    build: (a) => analyticsSeries(a, "engaged_sessions"),
  },
  {
    key: "google_clicks",
    label: "Google clicks",
    build: (_a, s) => searchMetricSeries(s, "google", "clicks"),
  },
  {
    key: "google_impressions",
    label: "Google impressions",
    build: (_a, s) => searchMetricSeries(s, "google", "impressions"),
  },
  {
    key: "bing_clicks",
    label: "Bing clicks",
    build: (_a, s) => searchMetricSeries(s, "bing", "clicks"),
  },
  {
    key: "bing_impressions",
    label: "Bing impressions",
    build: (_a, s) => searchMetricSeries(s, "bing", "impressions"),
  },
];

const TRAJECTORY_HORIZON_DAYS = 28;

export function computeTrajectories(
  analytics: AnalyticsDaily[],
  search: SearchDaily[],
  horizonDays: number = TRAJECTORY_HORIZON_DAYS,
): TrajectoryMetricResult[] {
  return TRAJECTORY_METRICS.map((def) => {
    const series = def.build(analytics, search);
    return {
      key: def.key,
      label: def.label,
      series,
      forecast: forecastSeries(series, horizonDays),
    };
  });
}

// ---------------------------------------------------------------------------
// Portfolio-wide aggregation: sum every active site's daily rows into a
// single combined series per date (per engine, for search), so the same
// forecasting machinery can produce a portfolio-level trajectory alongside
// each site's own. CTR/average position are dropped on combined rows - not
// meaningfully summable across sites.
// ---------------------------------------------------------------------------
export function combineAnalyticsAcrossSites(
  rows: AnalyticsDaily[],
): AnalyticsDaily[] {
  const byDate = new Map<string, AnalyticsDaily>();
  for (const row of rows) {
    const existing = byDate.get(row.metric_date);
    if (existing) {
      byDate.set(row.metric_date, {
        ...existing,
        active_users: existing.active_users + row.active_users,
        total_users: existing.total_users + row.total_users,
        sessions: existing.sessions + row.sessions,
        screen_page_views: existing.screen_page_views + row.screen_page_views,
        engaged_sessions: existing.engaged_sessions + row.engaged_sessions,
      });
    } else {
      byDate.set(row.metric_date, { ...row, site_id: "combined" });
    }
  }
  return [...byDate.values()].sort((a, b) =>
    a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0,
  );
}

export function combineSearchAcrossSites(rows: SearchDaily[]): SearchDaily[] {
  const byKey = new Map<string, SearchDaily>();
  for (const row of rows) {
    const key = `${row.engine}:${row.metric_date}`;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        clicks: existing.clicks + row.clicks,
        impressions: existing.impressions + row.impressions,
        ctr: null,
        average_position: null,
      });
    } else {
      byKey.set(key, {
        ...row,
        site_id: "combined",
        ctr: null,
        average_position: null,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0,
  );
}

export interface PortfolioDecayRow extends DecayRow {
  siteId: string;
  siteName: string;
}

const DECAY_WINDOW_DAYS = 28;
const DECAY_TOP_N = 10;

export function computePortfolioDecay(
  rows: SearchPageDaily[],
  sites: Pick<Site, "id" | "name">[],
  today: string,
): PortfolioDecayRow[] {
  const bySite = new Map<string, SearchPageDaily[]>();
  for (const row of rows) {
    const list = bySite.get(row.site_id) ?? [];
    list.push(row);
    bySite.set(row.site_id, list);
  }
  const out: PortfolioDecayRow[] = [];
  for (const site of sites) {
    const siteRows = bySite.get(site.id);
    if (!siteRows) continue;
    for (const decay of computeDecayingPages(
      siteRows,
      DECAY_WINDOW_DAYS,
      today,
      DECAY_TOP_N,
    )) {
      out.push({ ...decay, siteId: site.id, siteName: site.name });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, DECAY_TOP_N);
}
