// Pure computation for the "export all data" feature's AI-agent-friendly
// bundle. Wires together already-tested engines (insights, forecast, decay)
// over the full retained history, rather than raw daily rows an agent would
// otherwise have to re-derive trends and forecasts from itself.
//
// Forecast summaries deliberately exclude the underlying observed series -
// that data already ships in the raw `tables` section of the export, so
// repeating it here would only bloat the file without adding information.

import { format } from "date-fns";
import { computeInsights, type InsightsResult } from "@/lib/insights";
import {
  combineAnalyticsAcrossSites,
  combineSearchAcrossSites,
  computePortfolioDecay,
  computeTrajectories,
  type PortfolioDecayRow,
  type TrajectoryMetricResult,
} from "@/lib/series";
import type { ForecastMethod } from "@/lib/forecast";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  SearchPageDaily,
  Site,
} from "@/types/database";

const TRAJECTORY_HORIZON_DAYS = 28;
const INSIGHTS_WINDOWS = [30, 90, 180] as const;

export interface TrimmedTrajectory {
  key: string;
  label: string;
  forecast: {
    method: ForecastMethod;
    horizon_days: number;
    horizon_total: number;
    trend_per_day: number;
    residual_std: number;
  } | null;
}

export interface SiteTrajectoryExport {
  site_id: string;
  site_name: string;
  trajectories: TrimmedTrajectory[];
}

export interface PortfolioExportComputed {
  insights: Record<`${(typeof INSIGHTS_WINDOWS)[number]}`, InsightsResult>;
  portfolio_trajectory: TrimmedTrajectory[];
  site_trajectories: SiteTrajectoryExport[];
  refresh_queue: PortfolioDecayRow[];
}

function trimTrajectory(t: TrajectoryMetricResult): TrimmedTrajectory {
  return {
    key: t.key,
    label: t.label,
    forecast: t.forecast
      ? {
          method: t.forecast.method,
          horizon_days: TRAJECTORY_HORIZON_DAYS,
          horizon_total: t.forecast.horizonTotal,
          trend_per_day: t.forecast.trendPerDay,
          residual_std: t.forecast.residualStd,
        }
      : null,
  };
}

export interface BuildExportComputedInput {
  sites: Site[];
  statuses: IntegrationStatus[];
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
  searchPage: SearchPageDaily[];
  now?: Date;
}

export function buildExportComputed(
  input: BuildExportComputedInput,
): PortfolioExportComputed {
  const now = input.now ?? new Date();
  const today = format(now, "yyyy-MM-dd");
  const activeSites = input.sites.filter((s) => s.is_active);

  const insights = Object.fromEntries(
    INSIGHTS_WINDOWS.map((days) => [
      String(days),
      computeInsights({
        sites: input.sites,
        statuses: input.statuses,
        analytics: input.analytics,
        search: input.search,
        days,
        now,
      }),
    ]),
  ) as PortfolioExportComputed["insights"];

  const portfolioTrajectory = computeTrajectories(
    combineAnalyticsAcrossSites(input.analytics),
    combineSearchAcrossSites(input.search),
    TRAJECTORY_HORIZON_DAYS,
  ).map(trimTrajectory);

  const analyticsBySite = new Map<string, AnalyticsDaily[]>();
  for (const row of input.analytics) {
    const list = analyticsBySite.get(row.site_id) ?? [];
    list.push(row);
    analyticsBySite.set(row.site_id, list);
  }
  const searchBySite = new Map<string, SearchDaily[]>();
  for (const row of input.search) {
    const list = searchBySite.get(row.site_id) ?? [];
    list.push(row);
    searchBySite.set(row.site_id, list);
  }

  const siteTrajectories: SiteTrajectoryExport[] = activeSites.map((site) => ({
    site_id: site.id,
    site_name: site.name,
    trajectories: computeTrajectories(
      analyticsBySite.get(site.id) ?? [],
      searchBySite.get(site.id) ?? [],
      TRAJECTORY_HORIZON_DAYS,
    ).map(trimTrajectory),
  }));

  const refreshQueue = computePortfolioDecay(
    input.searchPage,
    activeSites,
    today,
  );

  return {
    insights,
    portfolio_trajectory: portfolioTrajectory,
    site_trajectories: siteTrajectories,
    refresh_queue: refreshQueue,
  };
}
