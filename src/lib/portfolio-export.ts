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
  clicksSeries,
  sessionsSeries,
  type PortfolioDecayRow,
  type TrajectoryMetricResult,
} from "@/lib/series";
import {
  projectGoal,
  type ForecastMethod,
  type GoalProjection,
} from "@/lib/forecast";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  SearchPageDaily,
  Site,
  SiteGoal,
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

export interface GoalProjectionExport {
  goal_id: string;
  site_id: string;
  site_name: string;
  metric: SiteGoal["metric"];
  target_value: number;
  target_date: string;
  note: string | null;
  projection: GoalProjection;
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
  goal_projections: GoalProjectionExport[];
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
  goals: SiteGoal[];
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

  const siteNameById = new Map(input.sites.map((s) => [s.id, s.name]));
  const goalProjections: GoalProjectionExport[] = input.goals.map((goal) => {
    const series =
      goal.metric === "sessions"
        ? sessionsSeries(analyticsBySite.get(goal.site_id) ?? [])
        : clicksSeries(searchBySite.get(goal.site_id) ?? []);
    return {
      goal_id: goal.id,
      site_id: goal.site_id,
      site_name: siteNameById.get(goal.site_id) ?? "Unknown site",
      metric: goal.metric,
      target_value: goal.target_value,
      target_date: goal.target_date,
      note: goal.note,
      projection: projectGoal(
        series,
        goal.target_value,
        goal.target_date,
        today,
      ),
    };
  });

  return {
    insights,
    portfolio_trajectory: portfolioTrajectory,
    site_trajectories: siteTrajectories,
    refresh_queue: refreshQueue,
    goal_projections: goalProjections,
  };
}
